package lk.waypoint.core.planning;

import java.time.*;
import java.util.*;
import java.sql.Timestamp;
import java.net.URI;
import java.net.http.*;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.*;
import static lk.waypoint.core.workflow.WorkflowRules.require;
import static lk.waypoint.core.planning.PlanningContracts.*;

@Service
public class PlanningService {
    private static final ZoneId ZONE=ZoneId.of("Asia/Colombo");
    private final JdbcTemplate db;
    private final RoutingAdapter routing;
    private final ObjectMapper json;
    private final OperationsService operations;
    @Value("${waypoint.planning-url:http://planning:8000}") private String planningUrl;
    @Value("${waypoint.fresh-only-reefers:true}") private boolean freshOnlyReefers=true;
    @Value("${waypoint.turnaround-minutes:30}") private int turnaroundMinutes=30;
    public PlanningService(JdbcTemplate db,RoutingAdapter routing,ObjectMapper json,OperationsService operations) {
        this.db=db;this.routing=routing;this.json=json;this.operations=operations;
    }
    private void dispatcher(Account a) { if(!a.role().equals("DISPATCHER"))throw new ApiException(403,"ROLE_REQUIRED","Dispatcher access required."); }
    private Map<String,Object> one(String sql,Object... args) {
        var rows=db.queryForList(sql,args);
        require(rows.size()==1,"PLANNING_DATA_MISSING","Required planning data is absent or outside your depot.");
        return rows.getFirst();
    }
    private double n(Map<String,Object> m,String key) { return ((Number)m.get(key)).doubleValue(); }
    private RoutingAdapter.Point point(String id) {
        var p=one("select * from routing_points where point_id=?",id);
        return new RoutingAdapter.Point(id,n(p,"longitude"),n(p,"latitude"),(String)p.get("provenance"),(Boolean)p.get("supplemental"));
    }
    private Map<String,Object> order(Account a,UUID id) {
        return one("select o.*,t.brand_code,t.depot_code,t.district,t.access,t.window_start,t.window_end,t.dock_type from orders o join outlets t on t.id=o.outlet_id where o.id=? and t.depot_code=?",id,a.depot());
    }
    private double service(Map<String,Object> o) {
        return n(one("select (payload->>'service_allowance_min')::numeric minutes from source_records where file='service_allowance.csv' and upper(payload->>'brand')=? and payload->>'dock_type'=?",o.get("brand_code"),o.get("dock_type")),"minutes");
    }
    private double weight(Map<String,Object> o,String key) {
        if(o.get("source_"+key)!=null) return n(o,"source_"+key);
        return db.queryForObject("select sum(l.ordered*p."+key+") from order_lines l join products p on p.id=l.product_id where l.order_id=?",Double.class,o.get("id"));
    }
    public Map<String,Object> context(Account a,LocalDate day) {
        dispatcher(a);
        var orders=db.queryForList("select o.*,t.name outlet_name,t.brand_code,t.district,t.access,t.window_start,t.window_end,t.dock_type,p.longitude,p.latitude,p.supplemental from orders o join outlets t on t.id=o.outlet_id left join routing_points p on p.point_id=t.id where t.depot_code=? and o.day=? order by o.deferred_yesterday desc,o.days_since_last_served desc,o.source_ref",a.depot(),day);
        for(var o:orders) { o.put("weight_kg",weight(o,"weight_kg"));o.put("volume_m3",weight(o,"volume_m3"));o.put("service_minutes",service(o));o.put("consecutive_skips",operations.consecutiveSkips((UUID)o.get("id"))); }
        var versions=db.queryForList("select version from planning_days where depot_code=? and day=?",a.depot(),day);
        LocalDate monday=day.with(DayOfWeek.MONDAY);
        var vehicles=db.queryForList("select v.*,a.enabled driver_enabled,coalesce((select sum(t.fuel_l) from route_trips t where t.vehicle_id=v.id and t.day between ? and ?),0)+coalesce((select sum(r.estimated_fuel_l) from runs r where r.vehicle_id=v.id and r.day between ? and ? and r.route_trip_id is null),0) reserved_fuel_l from vehicles v join accounts a on a.id=v.driver_id where v.depot_code=? order by v.id",monday,monday.plusDays(6),monday,monday.plusDays(6),a.depot());
        var trips=db.queryForList("select t.id,t.vehicle_id,t.trip,t.loader_id,t.departure_at,t.return_at,t.booklet_minutes,t.brand_code,t.fuel_l from route_trips t join vehicles v on v.id=t.vehicle_id where v.depot_code=? and t.day=? order by t.vehicle_id,t.trip",a.depot(),day);
        for(var t:trips)t.put("stops",db.queryForList("select s.order_id,o.version,s.sequence,s.loading_sequence,o.status from route_stops s join orders o on o.id=s.order_id where s.route_trip_id=? order by s.sequence",t.get("id")));
        return Map.of("day",day,"version",versions.isEmpty()?0:versions.getFirst().get("version"),"orders",orders,
            "vehicles",vehicles,
            "trips",trips,
            "coordinatePolicy","Labelled supplemental judge road waypoints; not actual outlet locations.");
    }
    public Map<String,Object> propose(Account a,Propose request) {
        dispatcher(a);
        var payload=new LinkedHashMap<>(context(a,request.day()));
        @SuppressWarnings("unchecked") var all=(List<Map<String,Object>>)payload.get("orders");
        var selected=all.stream().filter(o->"RECEIVED".equals(o.get("status"))&&(!Boolean.TRUE.equals(o.get("confirmation_required"))||o.get("confirmed_at")!=null)&&(request.orderIds().isEmpty()||request.orderIds().contains(o.get("id")))).toList();
        require(selected.size()<=98,"MATRIX_LIMIT","Select at most 98 orders per proposal.");
        require(!selected.isEmpty(),"EMPTY_PLAN","Select unallocated orders.");
        var points=new ArrayList<RoutingAdapter.Point>();points.add(point(a.depot()));
        selected.forEach(o->points.add(point((String)o.get("outlet_id"))));
        payload.put("orders",selected);payload.put("matrix",routing.matrix(points));
        payload.put("fleetStatus",db.queryForList("select * from scenario_fleet"));
        payload.put("districtBudgets",db.queryForList("select payload->>'district' district,(payload->>'depot_to_district_freeflow_min')::numeric outbound,(payload->>'inter_stop_freeflow_min')::numeric inter from source_records where file='district_travel.csv'"));
        payload.put("loaderId",one("select id from accounts where role='LOADER' and enabled and depot_code=? order by demo desc,id limit 1",a.depot()).get("id"));
        Object nextDay=one("select min(day) as next_day from operating_days where day>? and demo=?",request.day(),selected.getFirst().get("demo")).get("next_day");
        require(nextDay!=null,"CALENDAR_EXHAUSTED","No later source operating date is available for deferrals. Extend the audited calendar first.");
        payload.put("nextDay",nextDay);
        payload.put("freshOnlyReefers",freshOnlyReefers);payload.put("turnaroundMinutes",turnaroundMinutes);
        try {
            var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
            var response=http.send(HttpRequest.newBuilder(URI.create(planningUrl+"/v1/plans")).timeout(Duration.ofSeconds(60)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(encode(payload))).build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)throw new ApiException(503,"PLANNING_UNAVAILABLE","Proposal service failed. Manual planning remains available when OSRM is healthy.");
            var plan=json.readValue(response.body(),Plan.class);
            return Map.of("plan",plan,"validation",validate(a,plan));
        }catch(ApiException e){throw e;}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(503,"PLANNING_UNAVAILABLE","Proposal interrupted.");}catch(Exception e){throw new ApiException(503,"PLANNING_UNAVAILABLE","Cannot obtain a proposal. No assignments were published.");}
    }
    private void fail(List<Map<String,Object>> f,boolean condition,String code,String message,Object id) {
        if(!condition) f.add(Map.of("code",code,"message",message,"subject",String.valueOf(id)));
    }
    private Instant at(LocalDate day,Object time) { return day.atTime(LocalTime.parse(time.toString())).atZone(ZONE).toInstant(); }
    private String encode(Object v) { try{return json.writeValueAsString(v);}catch(Exception e){throw new IllegalStateException(e);} }
    public Map<String,Object> validate(Account a,Plan plan) {
        dispatcher(a);
        var failures=new ArrayList<Map<String,Object>>();
        var computed=new ArrayList<Map<String,Object>>();
        var assigned=new HashSet<UUID>();
        var slots=new HashSet<String>();
        for(var trip:plan.trips()) {
            fail(failures,trip.trip()>=1&&trip.trip()<=2,"TRIP_LIMIT","Daily trip numbers must be 1 or 2.",trip.vehicleId());
            var v=one("select v.*,a.enabled driver_enabled from vehicles v join accounts a on a.id=v.driver_id where v.id=?",trip.vehicleId());
            fail(failures,a.depot().equals(v.get("depot_code")),"DEPOT_MISMATCH","Use a vehicle owned by this depot.",trip.vehicleId());
            fail(failures,Boolean.TRUE.equals(v.get("available"))&&Boolean.TRUE.equals(v.get("driver_enabled")),"VEHICLE_UNAVAILABLE","Vehicle and its assigned driver must be available.",trip.vehicleId());
            fail(failures,db.queryForObject("select count(*) from accounts where id=? and depot_code=? and role='LOADER' and enabled",Integer.class,trip.loaderId(),a.depot())==1,"LOADER_SCOPE","Select an enabled loader in this depot.",trip.loaderId());
            fail(failures,slots.add(trip.vehicleId()+":"+trip.trip()),"TRIP_LIMIT","A vehicle has only two distinct daily trip slots.",trip.vehicleId());
            var stopOrders=new ArrayList<Map<String,Object>>();
            double kg=0,m3=0,allowance=0,coldMin=Double.NEGATIVE_INFINITY,coldMax=Double.POSITIVE_INFINITY;
            String brand=null,district=null,temperature=null;
            for(var stop:trip.stops()) {
                var o=order(a,stop.orderId());stopOrders.add(o);
                fail(failures,assigned.add(stop.orderId()),"DOUBLE_ASSIGNMENT","An order can appear only once in a plan.",stop.orderId());
                fail(failures,((Number)o.get("version")).intValue()==stop.expectedVersion(),"STALE_ORDER","Refresh this order before planning.",stop.orderId());
                fail(failures,plan.day().equals(((java.sql.Date)o.get("day")).toLocalDate()),"ORDER_DAY","Order and trip must use the same operating day.",stop.orderId());
                fail(failures,(trip.existingTripId()==null?"RECEIVED":"SCHEDULED").equals(o.get("status")),"MANIFEST_LOCKED","Only unallocated orders or untouched scheduled manifests can be adjusted.",stop.orderId());
                fail(failures,!Boolean.TRUE.equals(o.get("confirmation_required"))||o.get("confirmed_at")!=null,"ORDER_UNCONFIRMED","Confirm the reviewed store submission before allocation.",stop.orderId());
                if(brand==null) { brand=(String)o.get("brand_code");district=(String)o.get("district");temperature=(String)o.get("temperature"); }
                fail(failures,brand.equals(o.get("brand_code"))&&district.equals(o.get("district")),"BRAND_DISTRICT","Each trip must contain one brand and district.",stop.orderId());
                fail(failures,temperature.equals(o.get("temperature")),"SEPARATE_TEMPERATURE_LOADS","Fresh dry and chilled orders require separate trips.",stop.orderId());
                fail(failures,!"VAN_ONLY".equals(o.get("access"))||"VAN".equals(v.get("kind")),"VAN_ONLY_ACCESS","Assign a van to this outlet.",stop.orderId());
                boolean cold=!"AMBIENT".equals(o.get("temperature"));
                fail(failures,!cold||Boolean.TRUE.equals(v.get("refrigerated")),"COLD_REQUIRED","This load needs refrigeration.",stop.orderId());
                if(cold) {
                    var range=one("select max(p.min_c) minimum,min(p.max_c) maximum from order_lines l join products p on p.id=l.product_id where l.order_id=?",stop.orderId());
                    if(range.get("minimum")!=null&&range.get("maximum")!=null){coldMin=Math.max(coldMin,n(range,"minimum"));coldMax=Math.min(coldMax,n(range,"maximum"));}
                    fail(failures,v.get("min_c")!=null&&v.get("max_c")!=null&&range.get("minimum")!=null&&range.get("maximum")!=null&&Math.max(n(v,"min_c"),n(range,"minimum"))<=Math.min(n(v,"max_c"),n(range,"maximum")),"TEMPERATURE_RANGE","Declare a compatible vehicle setpoint range.",stop.orderId());
                }
                fail(failures,!freshOnlyReefers||!Boolean.TRUE.equals(v.get("refrigerated"))||"FRESH".equals(o.get("brand_code")),"FRESH_ONLY_POLICY","Refrigerated fleet is reserved for Fresh.",stop.orderId());
                if(o.get("scenario")!=null) fail(failures,db.queryForObject("select count(*) from scenario_fleet where scenario=? and vehicle_id=? and status='available'",Integer.class,o.get("scenario"),trip.vehicleId())==1,"SCENARIO_FLEET","This vehicle is unavailable in the source scenario.",trip.vehicleId());
                kg+=weight(o,"weight_kg");m3+=weight(o,"volume_m3");allowance+=service(o);
            }
            fail(failures,kg<=n(v,"weight_kg"),"WEIGHT_LIMIT","Reduce load weight or select a larger vehicle.",trip.vehicleId());
            fail(failures,m3<=n(v,"volume_m3"),"VOLUME_LIMIT","Reduce load volume or select a larger vehicle.",trip.vehicleId());
            fail(failures,coldMin<=coldMax,"TEMPERATURE_RANGE","All cold orders must share a compatible setpoint.",trip.vehicleId());
            if(trip.existingTripId()!=null) {
                var old=one("select * from route_trips where id=?",trip.existingTripId());
                var ids=new HashSet<>(db.queryForList("select order_id from route_stops where route_trip_id=?",UUID.class,trip.existingTripId()));
                fail(failures,old.get("vehicle_id").equals(trip.vehicleId())&&((Number)old.get("trip")).intValue()==trip.trip()&&((java.sql.Date)old.get("day")).toLocalDate().equals(plan.day())&&ids.equals(new HashSet<>(trip.stops().stream().map(Stop::orderId).toList())),"MANIFEST_IDENTITY","An existing manifest may be reordered; changing its vehicle or membership requires a new allocation workflow.",trip.existingTripId());
            }
            var points=new ArrayList<RoutingAdapter.Point>();points.add(point(a.depot()));
            for(var o:stopOrders) points.add(point((String)o.get("outlet_id")));
            points.add(point(a.depot()));
            var road=routing.route(points);
            var stops=new ArrayList<Map<String,Object>>();
            Instant cursor=trip.departureAt();
            fail(failures,cursor.atZone(ZONE).toLocalDate().equals(plan.day()),"DEPARTURE_DAY","Departure must be on the operating day.",trip.vehicleId());
            if("FRESH".equals(brand)) fail(failures,!cursor.isBefore(at(plan.day(),"03:30:00")),"FRESH_START","Fresh departures start at 03:30.",trip.vehicleId());
            double km=0;
            for(int i=0;i<stopOrders.size();i++) {
                var o=stopOrders.get(i);var leg=road.legs().get(i);km+=leg.metres()/1000;
                Instant arrival=cursor.plusMillis((long)Math.ceil(leg.seconds()*1000));
                Instant open=at(plan.day(),o.get("window_start")),close=at(plan.day(),o.get("window_end"));
                Instant start=arrival.isBefore(open)?open:arrival;
                cursor=start.plusSeconds((long)Math.ceil(service(o)*60));
                fail(failures,!cursor.isAfter(close),"DELIVERY_WINDOW","Travel, waiting and unloading must fit the outlet window.",o.get("id"));
                if("FRESH".equals(brand)) fail(failures,!cursor.isAfter(at(plan.day(),"08:00:00")),"FRESH_DEADLINE","Fresh unloading must finish by 08:00.",o.get("id"));
                stops.add(Map.of("orderId",o.get("id"),"sequence",i+1,"loadingSequence",stopOrders.size()-i,"arrivalAt",arrival,"serviceStart",start,"serviceEnd",cursor,"serviceMinutes",service(o),"travelSeconds",leg.seconds(),"distanceKm",leg.metres()/1000));
            }
            var last=road.legs().getLast();km+=last.metres()/1000;
            Instant end=cursor.plusMillis((long)Math.ceil(last.seconds()*1000));
            fail(failures,end.atZone(ZONE).toLocalDate().equals(plan.day()),"RETURN_DAY","The vehicle must return on the operating day.",trip.vehicleId());
            var districtRow=one("select (payload->>'depot_to_district_freeflow_min')::numeric outbound,(payload->>'inter_stop_freeflow_min')::numeric inter from source_records where file='district_travel.csv' and payload->>'district'=?",district);
            double budget=n(districtRow,"outbound")+n(districtRow,"inter")*(stopOrders.size()-1)+allowance;
            double efficiency=v.get("km_per_l")==null?0:n(v,"km_per_l");
            fail(failures,efficiency>0,"FUEL_UNITS","Source km per litre is required to calculate weekly fuel impact.",trip.vehicleId());
            var result=new LinkedHashMap<String,Object>();
            result.put("vehicleId",trip.vehicleId());result.put("trip",trip.trip());result.put("departureAt",trip.departureAt());result.put("returnAt",end);
            result.put("weightKg",kg);result.put("volumeM3",m3);result.put("capacityKg",v.get("weight_kg"));result.put("capacityM3",v.get("volume_m3"));
            result.put("fuelL",efficiency>0?km/efficiency:0);result.put("distanceKm",km);result.put("bookletMinutes",budget);result.put("brand",brand);result.put("district",district);
            result.put("geometry",road.geometry());result.put("routing",road.metadata());result.put("stops",stops);computed.add(result);
        }
        validateReservations(plan,computed,failures);
        for(var d:plan.deferred()) {
            var o=order(a,d.orderId());
            fail(failures,plan.day().equals(((java.sql.Date)o.get("day")).toLocalDate()),"ORDER_DAY","Deferred orders must belong to this plan's operating day.",d.orderId());
            fail(failures,assigned.add(d.orderId()),"DOUBLE_ASSIGNMENT","Do not defer an assigned order.",d.orderId());
            fail(failures,((Number)o.get("version")).intValue()==d.expectedVersion()&&"RECEIVED".equals(o.get("status")),"STALE_ORDER","Only current unallocated orders can be deferred in a plan.",d.orderId());
            fail(failures,d.nextDay().isAfter(plan.day())&&db.queryForObject("select count(*) from operating_days where day=? and demo=?",Integer.class,d.nextDay(),o.get("demo"))==1,"DEFERRAL_DAY","Select a later operating day from the same audited calendar.",d.orderId());
        }
        return Map.of("valid",failures.isEmpty(),"failures",failures,"trips",computed,"routingPolicy","OSRM road routes only; no estimated fallback.");
    }
    private void validateReservations(Plan plan,List<Map<String,Object>> computed,List<Map<String,Object>> failures) {
        var replacing=plan.trips().stream().map(Trip::existingTripId).filter(Objects::nonNull).toList();
        for(String vehicle:computed.stream().map(m->(String)m.get("vehicleId")).distinct().toList()) {
            var daily=new ArrayList<Map<String,Object>>();
            for(var t:db.queryForList("select id,trip,departure_at,return_at,booklet_minutes,brand_code,fuel_l from route_trips where vehicle_id=? and day=?",vehicle,plan.day())) {
                if(replacing.contains(t.get("id"))) continue;
                daily.add(Map.of("trip",t.get("trip"),"departureAt",((Timestamp)t.get("departure_at")).toInstant(),"returnAt",((Timestamp)t.get("return_at")).toInstant(),"bookletMinutes",t.get("booklet_minutes"),"brand",t.get("brand_code")));
            }
            for(var t:db.queryForList("select trip,departure_at,return_at from runs where vehicle_id=? and day=? and route_trip_id is null",vehicle,plan.day())) daily.add(Map.of("trip",t.get("trip"),"departureAt",((Timestamp)t.get("departure_at")).toInstant(),"returnAt",((Timestamp)t.get("return_at")).toInstant(),"bookletMinutes",0,"brand","LEGACY"));
            daily.addAll(computed.stream().filter(m->vehicle.equals(m.get("vehicleId"))).toList());
            fail(failures,daily.size()<=2&&daily.stream().map(m->m.get("trip")).distinct().count()==daily.size(),"TRIP_LIMIT","Maximum two routes per vehicle per operating day.",vehicle);
            daily.sort(Comparator.comparingInt(t->((Number)t.get("trip")).intValue()));
            for(int i=1;i<daily.size();i++) fail(failures,!((Instant)daily.get(i).get("departureAt")).isBefore(((Instant)daily.get(i-1).get("returnAt")).plusSeconds(turnaroundMinutes*60L)),"TRIP_TURNAROUND","Allow depot return and "+turnaroundMinutes+" minutes to reload before the next trip.",vehicle);
            double fresh=0,trading=0;
            for(var t:daily) {if("FRESH".equals(t.get("brand")))fresh+=n(t,"bookletMinutes");else trading+=n(t,"bookletMinutes");}
            fail(failures,fresh<=270&&trading<=480,"TRIP_BUDGET","Daily booklet budgets: Fresh 270 minutes; Style and Tech combined 480 minutes.",vehicle);
            LocalDate monday=plan.day().with(java.time.DayOfWeek.MONDAY);
            double used=0;
            for(var t:db.queryForList("select id,fuel_l from route_trips where vehicle_id=? and day between ? and ?",vehicle,monday,monday.plusDays(6))) if(!replacing.contains(t.get("id")))used+=n(t,"fuel_l");
            used+=db.queryForObject("select coalesce(sum(estimated_fuel_l),0) from runs where vehicle_id=? and day between ? and ? and route_trip_id is null",Double.class,vehicle,monday,monday.plusDays(6));
            for(var t:computed) if(vehicle.equals(t.get("vehicleId")))used+=n(t,"fuelL");
            double allowed=db.queryForObject("select weekly_fuel_l from vehicles where id=?",Double.class,vehicle);
            fail(failures,used<=allowed,"WEEKLY_FUEL","Road kilometres divided by source km/L exceed this week's litre allowance.",vehicle);
        }
    }
    /** Internal automatic republication of one owned amendment; preserve the real actor in audit. */
    @Transactional public Map<String,Object> publishStoreAmendment(Account actor,UUID amendedOrder,Plan plan) {
        if(!actor.role().equals("MANAGER"))throw new ApiException(403,"ROLE_REQUIRED","Store manager access required.");
        operations.scopedOrder(actor,amendedOrder);
        require(plan.trips().size()==1&&plan.deferred().isEmpty(),"AMENDMENT_SCOPE","An amendment republishes its existing trip only.");
        var t=one("select t.* from route_trips t join route_stops s on s.route_trip_id=t.id where s.order_id=?",amendedOrder);
        var trip=plan.trips().getFirst();
        require(t.get("id").equals(trip.existingTripId())&&t.get("vehicle_id").equals(trip.vehicleId())&&t.get("loader_id").equals(trip.loaderId())&&((Timestamp)t.get("departure_at")).toInstant().equals(trip.departureAt())&&((java.sql.Date)t.get("day")).toLocalDate().equals(plan.day())&&((Number)t.get("trip")).intValue()==trip.trip(),"AMENDMENT_SCOPE","Store amendments cannot change vehicle, membership, loading owner, departure or day.");
        // The validator remains the same; this scoped internal delegation retains the manager ID.
        return publish(new Account(actor.id(),actor.username(),actor.displayName(),actor.password(),"DISPATCHER",actor.depot(),actor.enabled()),plan);
    }
    @Transactional public Map<String,Object> publish(Account a,Plan plan) {
        dispatcher(a);
        require(!plan.trips().isEmpty()||!plan.deferred().isEmpty(),"EMPTY_PLAN","Select orders to allocate or defer.");
        db.queryForList("select pg_advisory_xact_lock(hashtext(?))",a.depot()+":"+plan.day());
        db.update("insert into planning_days(depot_code,day) values(?,?) on conflict do nothing",a.depot(),plan.day());
        int version=db.queryForObject("select version from planning_days where depot_code=? and day=? for update",Integer.class,a.depot(),plan.day());
        if(version!=plan.expectedPlanVersion())throw new ApiException(409,"STALE_PLAN","A newer plan was published. Refresh and validate again.");
        for(String vehicle:plan.trips().stream().map(Trip::vehicleId).distinct().sorted().toList()) one("select id from vehicles where id=? for update",vehicle);
        for(UUID trip:plan.trips().stream().map(Trip::existingTripId).filter(Objects::nonNull).distinct().sorted().toList()) one("select id from route_trips where id=? for update",trip);
        var ids=new TreeSet<UUID>();plan.trips().forEach(t->t.stops().forEach(s->ids.add(s.orderId())));plan.deferred().forEach(d->ids.add(d.orderId()));
        for(UUID id:ids) one("select id from orders where id=? for update",id);
        var checked=validate(a,plan);
        if(!Boolean.TRUE.equals(checked.get("valid")))throw new ApiException(422,"PLAN_CONSTRAINTS",encode(checked.get("failures")));
        UUID revision=UUID.randomUUID();int next=version+1;
        db.update("insert into plan_revisions(id,depot_code,day,version,request,validation,created_by) values(?,?,?,?,?::jsonb,?::jsonb,?)",revision,a.depot(),plan.day(),next,encode(plan),encode(checked),a.id());
        @SuppressWarnings("unchecked") var metrics=(List<Map<String,Object>>)checked.get("trips");
        for(int i=0;i<plan.trips().size();i++) {
            var trip=plan.trips().get(i);var metric=metrics.get(i);UUID parent=trip.existingTripId()==null?UUID.randomUUID():trip.existingTripId();
            if(trip.existingTripId()==null) db.update("insert into route_trips(id,plan_id,vehicle_id,day,trip,loader_id,departure_at,return_at,fuel_l,distance_km,booklet_minutes,brand_code,district,geometry,routing_metadata) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb)",parent,revision,trip.vehicleId(),plan.day(),trip.trip(),trip.loaderId(),Timestamp.from(trip.departureAt()),Timestamp.from((Instant)metric.get("returnAt")),metric.get("fuelL"),metric.get("distanceKm"),metric.get("bookletMinutes"),metric.get("brand"),metric.get("district"),encode(metric.get("geometry")),encode(metric.get("routing")));
            else {
                db.update("update route_trips set plan_id=?,loader_id=?,departure_at=?,return_at=?,fuel_l=?,distance_km=?,booklet_minutes=?,geometry=?::jsonb,routing_metadata=?::jsonb where id=?",revision,trip.loaderId(),Timestamp.from(trip.departureAt()),Timestamp.from((Instant)metric.get("returnAt")),metric.get("fuelL"),metric.get("distanceKm"),metric.get("bookletMinutes"),encode(metric.get("geometry")),encode(metric.get("routing")),parent);
                db.update("delete from route_stops where route_trip_id=?",parent);
            }
            @SuppressWarnings("unchecked") var stops=(List<Map<String,Object>>)metric.get("stops");
            for(int j=0;j<trip.stops().size();j++) {
                var stop=trip.stops().get(j);var schedule=stops.get(j);UUID run;
                if(trip.existingTripId()==null) {
                    run=UUID.randomUUID();
                    db.update("insert into runs(id,order_id,vehicle_id,day,trip,loader_id,plan_version,departure_at,return_at,estimated_fuel_l,override_reason,route_trip_id) values(?,?,?,?,?,?,?,?,?,?,?,?)",run,stop.orderId(),trip.vehicleId(),plan.day(),trip.trip(),trip.loaderId(),next,Timestamp.from(trip.departureAt()),Timestamp.from((Instant)metric.get("returnAt")),metric.get("fuelL"),plan.reason(),parent);
                } else {
                    run=(UUID)one("select id from runs where order_id=? and route_trip_id=?",stop.orderId(),parent).get("id");
                    db.update("update runs set loader_id=?,plan_version=?,departure_at=?,return_at=?,estimated_fuel_l=?,override_reason=? where id=?",trip.loaderId(),next,Timestamp.from(trip.departureAt()),Timestamp.from((Instant)metric.get("returnAt")),metric.get("fuelL"),plan.reason(),run);
                }
                UUID stopId=UUID.nameUUIDFromBytes((parent+":"+stop.orderId()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                db.update("insert into route_stops(id,route_trip_id,order_id,run_id,sequence,loading_sequence,arrival_at,service_start_at,service_end_at,travel_seconds,distance_km,service_minutes) values(?,?,?,?,?,?,?,?,?,?,?,?)",stopId,parent,stop.orderId(),run,schedule.get("sequence"),schedule.get("loadingSequence"),Timestamp.from((Instant)schedule.get("arrivalAt")),Timestamp.from((Instant)schedule.get("serviceStart")),Timestamp.from((Instant)schedule.get("serviceEnd")),schedule.get("travelSeconds"),schedule.get("distanceKm"),schedule.get("serviceMinutes"));
                db.update("update orders set status='SCHEDULED',version=version+1,updated_at=now() where id=?",stop.orderId());
                db.update("insert into audit_events(account_id,order_id,event,details) values(?,?,'MULTI_STOP_PLAN_PUBLISHED',?)",a.id(),stop.orderId(),"Plan "+revision+" v"+next+"; trip "+parent+"; stop "+stopId+"; "+plan.reason());
            }
        }
        for(var d:plan.deferred())operations.defer(a,d.orderId(),new Contracts.Defer(d.expectedVersion(),d.reason(),d.nextDay()));
        db.update("update planning_days set version=? where depot_code=? and day=?",next,a.depot(),plan.day());
        return Map.of("planId",revision,"version",next,"validation",checked);
    }
}
