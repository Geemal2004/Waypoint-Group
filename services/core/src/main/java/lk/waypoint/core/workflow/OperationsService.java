package lk.waypoint.core.workflow;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lk.waypoint.core.identity.Account;
import static lk.waypoint.core.workflow.WorkflowRules.*;

@Service
public class OperationsService {
    private static final ZoneId COLOMBO=ZoneId.of("Asia/Colombo");
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public OperationsService(JdbcTemplate jdbc,Clock clock) { this.jdbc=jdbc; this.clock=clock; }

    public Map<String,Object> catalog(Account account) {
        var outlets=jdbc.queryForList("select o.* from outlets o where o.depot_code=? and (? <> 'MANAGER' or exists(select 1 from account_outlets s where s.outlet_id=o.id and s.account_id=?)) order by o.id",account.depot(),account.role(),account.id());
        var products=jdbc.queryForList("select p.* from products p where exists(select 1 from outlets o where o.brand_code=p.brand_code and o.depot_code=? and (? <> 'MANAGER' or exists(select 1 from account_outlets s where s.outlet_id=o.id and s.account_id=?))) order by p.id",account.depot(),account.role(),account.id());
        return Map.of("outlets",outlets,"products",products,"operatingDays",jdbc.queryForList("select * from operating_days order by day"),"source","MIXED_REVIEWED_PROJECTIONS");
    }
    public List<Map<String,Object>> vehicles(Account account) {
        role(account,"DISPATCHER");
        return jdbc.queryForList("select v.*,a.display_name driver_name from vehicles v join accounts a on a.id=v.driver_id where v.depot_code=? order by v.id",account.depot());
    }
    public List<Map<String,Object>> orders(Account account) {
        var ids=jdbc.queryForList("select o.id from orders o join outlets t on t.id=o.outlet_id left join runs r on r.order_id=o.id left join vehicles v on v.id=r.vehicle_id where t.depot_code=? and ((?='MANAGER' and exists(select 1 from account_outlets s where s.outlet_id=t.id and s.account_id=?)) or ?='DISPATCHER' or (?='LOADER' and r.loader_id=?) or (?='DRIVER' and v.driver_id=?)) order by o.created_at desc",
            account.depot(),account.role(),account.id(),account.role(),account.role(),account.id(),account.role(),account.id());
        return ids.stream().map(row -> detail(account,(UUID)row.get("id"))).toList();
    }
    public Map<String,Object> detail(Account account,UUID id) {
        var order=accessible(account,id,false);
        var result=new LinkedHashMap<>(order);
        result.put("lines",lines(id));
        result.put("run",jdbc.queryForList("select r.*,v.name vehicle_name,v.weight_kg capacity_kg,v.volume_m3 capacity_m3,a.display_name driver_name,s.id stop_id,s.sequence stop_sequence,s.loading_sequence,s.arrival_at planned_arrival,s.service_start_at,s.service_end_at,t.plan_id from runs r join vehicles v on v.id=r.vehicle_id join accounts a on a.id=v.driver_id left join route_stops s on s.run_id=r.id left join route_trips t on t.id=r.route_trip_id where r.order_id=?",id).stream().findFirst().orElse(null));
        result.put("tripStops",jdbc.queryForList("select s.id stop_id,s.order_id,s.sequence,s.loading_sequence,o.outlet_id,o.reference,o.source_ref,t.name outlet_name,o.status,r.plan_version from route_stops s join orders o on o.id=s.order_id join outlets t on t.id=o.outlet_id join runs r on r.id=s.run_id where s.route_trip_id=(select route_trip_id from runs where order_id=?) and (? <> 'MANAGER' or exists(select 1 from account_outlets a where a.account_id=? and a.outlet_id=o.outlet_id)) order by s.sequence",id,account.role(),account.id()));
        result.put("rescheduledTo",jdbc.queryForList("select id,reference,day from orders where rescheduled_from=?",id));
        result.put("loadingIssues",jdbc.queryForList("select i.* from loading_issues i join runs r on r.id=i.run_id where r.order_id=?",id));
        result.put("proof",jdbc.queryForList("select id,content_type,captured_at,accepted_at,notes from proofs where order_id=?",id).stream().findFirst().orElse(null));
        result.put("receipt",jdbc.queryForList("select * from receipts where order_id=?",id).stream().findFirst().orElse(null));
        result.put("deferrals",jdbc.queryForList("with recursive lineage as (select id,rescheduled_from from orders where id=? union all select o.id,o.rescheduled_from from orders o join lineage l on o.id=l.rescheduled_from) select d.* from deferrals d join lineage l on l.id=d.order_id order by d.decision_at",id));
        result.put("consecutive_skips",consecutiveSkips(id));
        result.put("timeline",jdbc.queryForList("select event,details,accepted_at from audit_events where order_id=? order by id",id));
        return result;
    }

    public int consecutiveSkips(UUID id) {
        return jdbc.queryForObject("with recursive lineage as (select id,rescheduled_from,deferred_yesterday from orders where id=? union all select o.id,o.rescheduled_from,o.deferred_yesterday from orders o join lineage l on o.id=l.rescheduled_from) select greatest(coalesce(max(d.consecutive_skips),0),coalesce(max(case when l.deferred_yesterday then 1 else 0 end),0)) from lineage l left join deferrals d on d.order_id=l.id",Integer.class,id);
    }

    @Transactional public Map<String,Object> create(Account account,Contracts.CreateOrder request) {
        role(account,"MANAGER");
        var outlet=row("select * from outlets where id=? and exists(select 1 from account_outlets where account_id=? and outlet_id=outlets.id)",request.outletId(),account.id());
        require(Boolean.TRUE.equals(outlet.get("demo")),"SOURCE_DATA_REQUIRED","Real orders require an audited source calendar and schedule.");
        var unique=new HashSet<String>();
        String temperature=null;
        for(var item:request.items()) {
            require(unique.add(item.productId()),"DUPLICATE_PRODUCT","Combine repeated products into one line.");
            var product=row("select * from products where id=?",item.productId());
            require(Boolean.TRUE.equals(product.get("demo")),"SOURCE_AGGREGATE_ONLY","Source aggregate units belong to their imported orders; select a demo catalogue product for this fixture order.");
            require(product.get("brand_code").equals(outlet.get("brand_code")),"BRAND_MISMATCH","Products must belong to the outlet brand.");
            String next=(String)product.get("temperature");
            if(temperature==null) temperature=next;
            require(temperature.equals(next),"SEPARATE_TEMPERATURE_LOADS","Submit ambient, chilled and frozen products as separate orders.");
        }
        var earliest=CalendarPolicy.earliest(request.day(),clock.instant());
        boolean style="STYLE".equals(outlet.get("brand_code"));
        var days=jdbc.queryForList("select day from operating_days where day>=? and demo=true order by day",LocalDate.class,earliest);
        var day=CalendarPolicy.next(days,style);
        String explanation=day.equals(request.day())?"Received for requested synthetic operating day.":"Moved to "+day+" using the 16:00 Asia/Colombo cutoff, synthetic calendar and demo Monday Style schedule.";
        UUID id=UUID.randomUUID();
        jdbc.update("insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason) values(?,?,?,?,?,'RECEIVED',true,?)",id,request.outletId(),account.id(),day,temperature,explanation);
        for(var item:request.items()) jdbc.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",UUID.randomUUID(),id,item.productId(),item.quantity());
        audit(account,id,"ORDER_RECEIVED",explanation);
        return detail(account,id);
    }

    @Transactional public Map<String,Object> publish(Account account,UUID id,Contracts.Publish request) {
        role(account,"DISPATCHER");
        accessible(account,id,false);
        // Match multi-stop publication's vehicle-before-order lock order.
        var vehicle=row("select * from vehicles where id=? for update",request.vehicleId());
        var order=editable(account,id,request.expectedVersion());
        transition((String)order.get("status"),"SCHEDULED");
        // Serialize all trip/fuel reservations for a vehicle, not just this order.
        validateAssignment(account,order,vehicle,request);
        jdbc.update("insert into runs(id,order_id,vehicle_id,day,trip,loader_id,plan_version,departure_at,return_at,estimated_fuel_l,override_reason) values(?,?,?,?,?,?,1,?,?,?,?)",
            UUID.randomUUID(),id,request.vehicleId(),order.get("day"),request.trip(),request.loaderId(),java.sql.Timestamp.from(request.departureAt()),java.sql.Timestamp.from(request.returnAt()),request.estimatedFuelL(),request.reason());
        update(id,"SCHEDULED");
        audit(account,id,"PLAN_PUBLISHED","Synthetic one-stop plan v1. "+request.reason());
        return detail(account,id);
    }

    private void validateAssignment(Account account,Map<String,Object> order,Map<String,Object> vehicle,Contracts.Publish request) {
        require(Boolean.TRUE.equals(order.get("demo")) && Boolean.TRUE.equals(vehicle.get("demo")) && !Boolean.TRUE.equals(order.get("confirmation_required")) && jdbc.queryForObject("select demo from outlets where id=?",Boolean.class,order.get("outlet_id")),"ROUTING_VALIDATION_REQUIRED","Operational orders require road-backed planning. This endpoint is reserved for legacy supplemental workflow fixtures.");
        require(vehicle.get("depot_code").equals(account.depot()) && vehicle.get("depot_code").equals(order.get("depot_code")),"DEPOT_MISMATCH","Vehicle must operate from the outlet's depot.");
        require(Boolean.TRUE.equals(vehicle.get("available")),"VEHICLE_UNAVAILABLE","Vehicle is unavailable.");
        require(jdbc.queryForObject("select count(*) from accounts where id=? and role='LOADER' and depot_code=?",Integer.class,request.loaderId(),account.depot())==1,"LOADER_SCOPE","Select a loader from this depot.");
        boolean cold=Boolean.TRUE.equals(vehicle.get("refrigerated"));
        require(!cold || "FRESH".equals(order.get("brand_code")),"FRESH_ONLY_POLICY","Refrigerated vehicles are reserved for Fresh.");
        require(!"VAN_ONLY".equals(order.get("access")) || "VAN".equals(vehicle.get("kind")),"VAN_ONLY_ACCESS","This outlet requires a van.");
        double kg=0,m3=0,min=Double.NEGATIVE_INFINITY,max=Double.POSITIVE_INFINITY;
        for(var line:lines((UUID)order.get("id"))) {
            int qty=number(line,"ordered").intValue();
            kg+=number(line,"weight_kg").doubleValue()*qty;
            m3+=number(line,"volume_m3").doubleValue()*qty;
            if(!"AMBIENT".equals(line.get("temperature"))) {
                require(cold,"REFRIGERATION_REQUIRED","Ambient vehicles cannot carry chilled/frozen products.");
                min=Math.max(min,number(line,"min_c").doubleValue()); max=Math.min(max,number(line,"max_c").doubleValue());
            }
        }
        require(kg<=number(vehicle,"weight_kg").doubleValue()+0.000001,"WEIGHT_CAPACITY","Order exceeds vehicle weight capacity in kg.");
        require(m3<=number(vehicle,"volume_m3").doubleValue()+0.000001,"VOLUME_CAPACITY","Order exceeds vehicle volume capacity in m³.");
        if(cold && !"AMBIENT".equals(order.get("temperature"))) {
            require(Math.max(min,number(vehicle,"min_c").doubleValue())<=Math.min(max,number(vehicle,"max_c").doubleValue()),"TEMPERATURE_INCOMPATIBLE","The entire load and vehicle must share a compatible setpoint.");
        }
        var day=((java.sql.Date)order.get("day")).toLocalDate();
        var depart=request.departureAt().atZone(COLOMBO); var back=request.returnAt().atZone(COLOMBO);
        require(depart.toLocalDate().equals(day) && back.toLocalDate().equals(day) && back.isAfter(depart),"INVALID_TRIP_TIMES","Departure and depot return must be on the operating day in Asia/Colombo.");
        var windowStart=((java.sql.Time)order.get("window_start")).toLocalTime();
        var windowEnd=((java.sql.Time)order.get("window_end")).toLocalTime();
        // Synthetic fixture only: a supplied schedule must reserve some time inside the receiving window.
        require(depart.toLocalTime().isBefore(windowEnd) && back.toLocalTime().isAfter(windowStart),"WINDOW_MISSED","The trip does not intersect the outlet receiving window. No road ETA is implied.");
        if("FRESH".equals(order.get("brand_code"))) require(depart.toLocalTime().isBefore(LocalTime.of(8,0)),"FRESH_OPENING","Fresh must depart before 08:00. Actual arrival feasibility still requires road routing.");
        var scheduled=jdbc.queryForList("select distinct on (coalesce(route_trip_id,id)) * from runs where vehicle_id=? and day=?",request.vehicleId(),day);
        require(scheduled.size()<2,"TRIP_LIMIT","At most two trips per vehicle and day.");
        for(var run:scheduled) {
            Instant start=((java.sql.Timestamp)run.get("departure_at")).toInstant(); Instant end=((java.sql.Timestamp)run.get("return_at")).toInstant();
            require(!request.departureAt().isBefore(end.plusSeconds(1800)) || !request.returnAt().plusSeconds(1800).isAfter(start),"TRIP_OVERLAP","Trips require non-overlap and a declared synthetic 30-minute reloading allowance.");
        }
        var week=day.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        double fuel=jdbc.queryForObject("select coalesce(sum(fuel_l),0) from (select estimated_fuel_l fuel_l from runs where vehicle_id=? and day>=? and day<? and route_trip_id is null union all select fuel_l from route_trips where vehicle_id=? and day>=? and day<?) reservations",Double.class,request.vehicleId(),week,week.plusDays(7),request.vehicleId(),week,week.plusDays(7));
        require(fuel+request.estimatedFuelL()<=number(vehicle,"weekly_fuel_l").doubleValue(),"WEEKLY_FUEL_EXCEEDED","Combined reserved weekly fuel exceeds the fixture allowance in litres.");
    }

    @Transactional public Map<String,Object> loading(Account account,UUID id,Contracts.Quantities request) {
        role(account,"LOADER"); var order=editable(account,id,request.expectedVersion());
        transition((String)order.get("status"),"LOADING");
        var selected=checkedQuantities(id,request.lines(),"ordered");
        UUID runId=(UUID)row("select id from runs where order_id=?",id).get("id");
        for(var line:lines(id)) {
            UUID lineId=(UUID)line.get("id"); int loaded=selected.get(lineId); int shortage=number(line,"ordered").intValue()-loaded;
            require(shortage==0 || !request.reason().equals("NONE"),"LOADING_REASON_REQUIRED","Choose shortage or damage for a reduced load.");
            jdbc.update("update order_lines set loaded=? where id=?",loaded,lineId);
            if(shortage>0) jdbc.update("insert into loading_issues values(?,?,?,?,?,?,now())",UUID.randomUUID(),lineId,runId,shortage,request.reason(),account.id());
        }
        jdbc.update("update runs set acknowledged_loader=true where id=?",runId);
        update(id,"LOADING"); audit(account,id,"LOADING_CHECKED","Plan v1 acknowledged; dispatcher can see all shortages/damage.");
        return detail(account,id);
    }
    @Transactional public Map<String,Object> approvePartial(Account account,UUID id,Contracts.Approval request) {
        role(account,"DISPATCHER"); var order=editable(account,id,request.expectedVersion());
        require("LOADING".equals(order.get("status")),"NOT_LOADING","Partial release approval is available during loading.");
        require(jdbc.queryForObject("select count(*) from order_lines where order_id=? and loaded<ordered",Integer.class,id)>0,"NO_SHORTAGE","There is no reduced load to approve.");
        require(jdbc.queryForObject("select coalesce(sum(loaded),0) from order_lines where order_id=?",Integer.class,id)>0,"EMPTY_LOAD","An empty load cannot be released.");
        jdbc.update("update runs set partial_approved_by=?,partial_reason=? where order_id=?",account.id(),request.reason(),id);
        jdbc.update("update orders set version=version+1,updated_at=now() where id=?",id);
        audit(account,id,"PARTIAL_RELEASE_APPROVED",request.reason()); return detail(account,id);
    }
    @Transactional public Map<String,Object> release(Account account,UUID id,int version) {
        role(account,"LOADER"); var order=editable(account,id,version); transition((String)order.get("status"),"RELEASED");
        var run=row("select * from runs where order_id=?",id);
        require(Boolean.TRUE.equals(run.get("acknowledged_loader")),"PLAN_ACK_REQUIRED","Acknowledge the current plan during the loading check.");
        boolean shortage=jdbc.queryForObject("select count(*) from order_lines where order_id=? and loaded<ordered",Integer.class,id)>0;
        require(!shortage || run.get("partial_approved_by")!=null,"PARTIAL_APPROVAL_REQUIRED","Dispatcher approval is required for a reduced load.");
        jdbc.update("update runs set released_at=now() where order_id=?",id);
        update(id,"RELEASED"); audit(account,id,"LOAD_RELEASED","Final release check passed. Known shortages carry forward."); return detail(account,id);
    }
    @Transactional public Map<String,Object> start(Account account,UUID id,int version) {
        role(account,"DRIVER");
        accessible(account,id,false);
        var parent=jdbc.queryForList("select route_trip_id from runs where order_id=?",id);
        if(!parent.isEmpty() && parent.getFirst().get("route_trip_id")!=null) {
            UUID tripId=(UUID)parent.getFirst().get("route_trip_id");
            row("select id from route_trips where id=? for update",tripId);
            var manifest=jdbc.queryForList("select o.id,o.status,r.released_at from orders o join runs r on r.order_id=o.id where r.route_trip_id=? order by o.id for update of o",tripId);
            editable(account,id,version);
            require(manifest.stream().allMatch(o->"RELEASED".equals(o.get("status"))&&o.get("released_at")!=null),"LOAD_NOT_RELEASED","Loader must release every stop before the trip starts.");
            jdbc.update("update runs set acknowledged_driver=true,started_at=now() where route_trip_id=?",tripId);
            for(var stop:manifest) { UUID orderId=(UUID)stop.get("id");update(orderId,"IN_TRANSIT");audit(account,orderId,"RUN_STARTED","Driver acknowledged multi-stop trip "+tripId); }
            return detail(account,id);
        }
        var order=editable(account,id,version); transition((String)order.get("status"),"IN_TRANSIT");
        var run=row("select * from runs where order_id=?",id);
        require(run.get("released_at")!=null,"LOAD_NOT_RELEASED","Loader must release this load first.");
        jdbc.update("update runs set acknowledged_driver=true,started_at=now() where order_id=?",id);
        update(id,"IN_TRANSIT"); audit(account,id,"RUN_STARTED","Driver acknowledged released plan v1."); return detail(account,id);
    }
    @Transactional public Map<String,Object> arrive(Account account,UUID id,int version) {
        role(account,"DRIVER"); var order=editable(account,id,version); transition((String)order.get("status"),"ARRIVED");
        require(jdbc.queryForObject("select count(*) from route_stops current join route_stops previous on previous.route_trip_id=current.route_trip_id and previous.sequence<current.sequence join orders o on o.id=previous.order_id where current.order_id=? and o.status not in ('DELIVERED','RECEIVED_AT_STORE','DEFERRED')",Integer.class,id)==0,"STOP_ORDER","Complete or explicitly defer earlier stops before arriving here.");
        jdbc.update("update runs set arrived_at=now() where order_id=?",id);
        update(id,"ARRIVED"); audit(account,id,"STOP_ARRIVED","Driver confirmed arrival while safely stopped."); return detail(account,id);
    }
    @Transactional public Map<String,Object> deliver(Account account,UUID id,Contracts.Receive request,Instant capturedAt,String contentType,byte[] bytes) {
        role(account,"DRIVER"); var order=editable(account,id,request.expectedVersion()); transition((String)order.get("status"),"DELIVERED");
        validateImage(contentType,bytes);
        var selected=checkedQuantities(id,request.lines(),"loaded");
        boolean shortfall=lines(id).stream().anyMatch(l -> selected.get((UUID)l.get("id"))<number(l,"loaded").intValue());
        require(!shortfall || !request.issue().isBlank(),"DELIVERY_ISSUE_REQUIRED","Explain quantities below the released load.");
        for(var entry:selected.entrySet()) jdbc.update("update order_lines set delivered=? where id=?",entry.getValue(),entry.getKey());
        jdbc.update("insert into proofs values(?,?,?,?,?,?,now(),?)",UUID.randomUUID(),id,account.id(),contentType,bytes,java.sql.Timestamp.from(capturedAt),request.issue());
        update(id,"DELIVERED"); audit(account,id,"DELIVERY_PROOF_ACCEPTED","Manager receipt task created; capture time is device-reported."); return detail(account,id);
    }
    @Transactional public Map<String,Object> receive(Account account,UUID id,Contracts.Receive request) {
        role(account,"MANAGER"); var order=editable(account,id,request.expectedVersion()); transition((String)order.get("status"),"RECEIVED_AT_STORE");
        var selected=checkedQuantities(id,request.lines(),"delivered");
        boolean discrepancy=lines(id).stream().anyMatch(l -> selected.get((UUID)l.get("id"))<number(l,"delivered").intValue());
        require(!discrepancy || !request.issue().isBlank(),"RECEIVING_ISSUE_REQUIRED","Describe the discrepancy against delivered quantities. Known loading shortages are already recorded.");
        for(var entry:selected.entrySet()) jdbc.update("update order_lines set received=? where id=?",entry.getValue(),entry.getKey());
        jdbc.update("insert into receipts values(?,?,?,?,now())",UUID.randomUUID(),id,account.id(),request.issue());
        update(id,"RECEIVED_AT_STORE"); audit(account,id,"STORE_RECEIPT_ACCEPTED",request.issue().isBlank()?"Received delivered quantities; no new discrepancy.":request.issue()); return detail(account,id);
    }
    @Transactional public Map<String,Object> defer(Account account,UUID id,Contracts.Defer request) {
        role(account,"DISPATCHER"); var order=editable(account,id,request.expectedVersion()); transition((String)order.get("status"),"DEFERRED");
        LocalDate day=((java.sql.Date)order.get("day")).toLocalDate();
        require(request.nextDay().isAfter(day),"INVALID_NEXT_DAY","Next eligible run must follow the original date.");
        require(jdbc.queryForObject("select count(*) from operating_days where day=? and demo=?",Integer.class,request.nextDay(),order.get("demo"))==1,"INELIGIBLE_DAY","Choose a persisted operating day from the same calendar.");
        require(!Boolean.TRUE.equals(order.get("demo")) || !"STYLE".equals(order.get("brand_code")) || request.nextDay().getDayOfWeek()==DayOfWeek.MONDAY,"STYLE_SCHEDULE","The synthetic Style schedule is Mondays.");
        LocalDate previous=jdbc.queryForObject("select max(day) from operating_days where day<? and demo=?",LocalDate.class,day,order.get("demo"));
        Integer sameDaySkips=jdbc.queryForObject("select coalesce(max(d.consecutive_skips),0) from deferrals d join orders o on o.id=d.order_id where o.outlet_id=? and o.temperature=? and o.day=? and o.status='DEFERRED'",Integer.class,order.get("outlet_id"),order.get("temperature"),day);
        Integer previousSkips=previous==null?0:jdbc.queryForObject("select coalesce(max(d.consecutive_skips),0) from deferrals d join orders o on o.id=d.order_id where o.outlet_id=? and o.temperature=? and o.day=? and o.status='DEFERRED'",Integer.class,order.get("outlet_id"),order.get("temperature"),previous);
        int baseline=consecutiveSkips(id);
        int skips=Math.max(sameDaySkips,Math.max(previousSkips,baseline)+1);
        jdbc.update("insert into deferrals values(?,?,?,?,now(),?,?)",UUID.randomUUID(),id,account.id(),request.reason(),request.nextDay(),skips);
        update(id,"DEFERRED"); audit(account,id,"ORDER_DEFERRED",request.reason()+" · next eligible "+request.nextDay()); return detail(account,id);
    }
    public Map<String,Object> proof(Account account,UUID id) {
        accessible(account,id,false);
        return row("select content_type,bytes from proofs where order_id=?",id);
    }

    public Map<String,Object> scopedOrder(Account account,UUID id) { return accessible(account,id,false); }

    @Transactional public void acceptRecoveredProof(Account dispatcher,UUID id,int version,Contracts.Receive request,String type,byte[] bytes,Instant capturedAt) {
        role(dispatcher,"DISPATCHER");
        var order=editable(dispatcher,id,version);
        require(Set.of("DEFERRED","ARRIVED","IN_TRANSIT").contains(order.get("status")),"CONFLICT_NOT_RECOVERABLE","Review the current order state before accepting this recovered delivery.");
        var proofAccount=row("select v.driver_id from runs r join vehicles v on v.id=r.vehicle_id where r.order_id=?",id).get("driver_id");
        validateImage(type,bytes);
        var selected=checkedQuantities(id,request.lines(),"loaded");
        boolean shortfall=lines(id).stream().anyMatch(l -> selected.get((UUID)l.get("id"))<number(l,"loaded").intValue());
        require(!shortfall || !request.issue().isBlank(),"DELIVERY_ISSUE_REQUIRED","Explain quantities below the released load.");
        for(var entry:selected.entrySet()) jdbc.update("update order_lines set delivered=? where id=?",entry.getValue(),entry.getKey());
        jdbc.update("insert into proofs values(?,?,?,?,?,?,now(),?)",UUID.randomUUID(),id,proofAccount,type,bytes,java.sql.Timestamp.from(capturedAt),request.issue());
        update(id,"DELIVERED");
        audit(dispatcher,id,"OFFLINE_DELIVERY_RECOVERED","Dispatcher resolved conflict; prior deferral retained. Manager receipt task created.");
    }

    private Map<String,Object> editable(Account account,UUID id,int expectedVersion) {
        var order=accessible(account,id,true);
        if(number(order,"version").intValue()!=expectedVersion) throw new ApiException(409,"STALE_VERSION","This order changed. Reload its current version before acting.");
        return order;
    }
    private Map<String,Object> accessible(Account account,UUID id,boolean lock) {
        var order=row("select o.*,t.brand_code,t.depot_code,t.name outlet_name,t.access,t.window_start,t.window_end,t.district from orders o join outlets t on t.id=o.outlet_id where o.id=?"+(lock?" for update of o":""),id);
        boolean allowed=Objects.equals(account.depot(),order.get("depot_code"));
        if(account.role().equals("MANAGER")) allowed &= jdbc.queryForObject("select count(*) from account_outlets where account_id=? and outlet_id=?",Integer.class,account.id(),order.get("outlet_id"))==1;
        else if(account.role().equals("LOADER")) allowed &= jdbc.queryForObject("select count(*) from runs where order_id=? and loader_id=?",Integer.class,id,account.id())==1;
        else if(account.role().equals("DRIVER")) allowed &= jdbc.queryForObject("select count(*) from runs r join vehicles v on v.id=r.vehicle_id where r.order_id=? and v.driver_id=?",Integer.class,id,account.id())==1;
        else allowed &= account.role().equals("DISPATCHER");
        if(!allowed) throw new ApiException(403,"SCOPE_DENIED","This order is outside your assigned scope.");
        return order;
    }
    private List<Map<String,Object>> lines(UUID id) {
        return jdbc.queryForList("select l.*,p.name,p.unit,p.weight_kg,p.volume_m3,p.temperature,p.min_c,p.max_c,p.handling,coalesce(l.delivered,l.loaded,l.ordered) expected_receiving from order_lines l join products p on p.id=l.product_id where l.order_id=? order by l.id",id);
    }
    private Map<UUID,Integer> checkedQuantities(UUID id,List<Contracts.Quantity> quantities,String maximumField) {
        var expected=lines(id); var selected=new HashMap<UUID,Integer>();
        for(var quantity:quantities) require(selected.put(quantity.lineId(),quantity.quantity())==null,"DUPLICATE_LINE","Submit each line exactly once.");
        require(selected.keySet().equals(expected.stream().map(l -> (UUID)l.get("id")).collect(java.util.stream.Collectors.toSet())),"LINE_SET_MISMATCH","Submit all and only the lines belonging to this order.");
        for(var line:expected) { require(line.get(maximumField)!=null,"PREVIOUS_QUANTITY_REQUIRED","Previous handoff quantity is missing."); quantity(selected.get((UUID)line.get("id")),number(line,maximumField).intValue()); }
        return selected;
    }
    private Map<String,Object> row(String sql,Object... parameters) {
        return jdbc.queryForList(sql,parameters).stream().findFirst().orElseThrow(() -> new ApiException(404,"NOT_FOUND","Record not found in the permitted context."));
    }
    private static Number number(Map<String,Object> row,String field) { return (Number)row.get(field); }
    private static void role(Account account,String role) { if(!account.role().equals(role)) throw new ApiException(403,"ROLE_DENIED","This action requires the "+role+" role."); }
    private void update(UUID id,String status) { jdbc.update("update orders set status=?,version=version+1,updated_at=now() where id=?",status,id); }
    private void audit(Account account,UUID id,String event,String details) { jdbc.update("insert into audit_events(account_id,order_id,event,details) values(?,?,?,?)",account.id(),id,event,details); }
    static void validateImage(String contentType,byte[] bytes) {
        require(bytes.length>0 && bytes.length<=5*1024*1024,"PROOF_SIZE","Use a non-empty image no larger than 5 MiB.");
        require(Set.of("image/jpeg","image/png").contains(contentType),"PROOF_TYPE","Only JPEG or PNG evidence is accepted.");
        try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers=ImageIO.getImageReaders(stream);
            require(readers.hasNext(),"INVALID_IMAGE","Evidence must be a readable image.");
            var reader=readers.next();
            try {
                reader.setInput(stream); String format=reader.getFormatName();
                require((contentType.equals("image/png") && format.equalsIgnoreCase("png")) || (contentType.equals("image/jpeg") && format.equalsIgnoreCase("jpeg")),"PROOF_TYPE_MISMATCH","The evidence content does not match its media type.");
                require((long)reader.getWidth(0)*reader.getHeight(0)<=20_000_000,"IMAGE_TOO_LARGE","Use an image no larger than 20 megapixels.");
                require(reader.read(0)!=null,"INVALID_IMAGE","Evidence must be a readable image.");
            } finally { reader.dispose(); }
        } catch(IOException | IllegalArgumentException e) { throw new ApiException(422,"INVALID_IMAGE","Evidence must be a readable JPEG or PNG image."); }
    }
}
