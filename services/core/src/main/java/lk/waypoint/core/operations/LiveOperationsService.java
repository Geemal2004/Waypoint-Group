package lk.waypoint.core.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.*;
import lk.waypoint.core.planning.RoutingAdapter;
import static lk.waypoint.core.workflow.WorkflowRules.require;

@Service
public class LiveOperationsService {
 private final JdbcTemplate db; private final OperationsService operations; private final StringRedisTemplate redis; private final ObjectMapper json; private final Clock clock;private final RoutingAdapter routing;
 @Value("${waypoint.demo-seed:false}") private boolean demoEnabled;
 public LiveOperationsService(JdbcTemplate db, OperationsService operations, StringRedisTemplate redis, ObjectMapper json, Clock clock,RoutingAdapter routing){this.db=db;this.operations=operations;this.redis=redis;this.json=json;this.clock=clock;this.routing=routing;}
 public void dispatcher(Account a){if(!a.role().equals("DISPATCHER"))throw new ApiException(403,"ROLE_REQUIRED","Dispatcher access required.");}
 public boolean allNetwork(Account a){return Boolean.TRUE.equals(db.queryForObject("select network_read_all from accounts where id=?",Boolean.class,a.id()));}
 private String encode(Object o){try{return json.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException(e);}}
 private Map<String,Object> location(String vehicle){
  try {String value=redis.opsForValue().get("waypoint:location:"+vehicle);if(value==null)return Map.of();@SuppressWarnings("unchecked") Map<String,Object> result=json.readValue(value,Map.class);var copy=new LinkedHashMap<>(result);Instant captured=Instant.parse(result.get("capturedAt").toString());copy.put("stale",captured.plusSeconds(90).isBefore(clock.instant()));return copy;}
  catch(Exception e){return Map.of("unavailable",true,"message","Location service unavailable; no position is inferred.");}
 }
 public Map<String,Object> network(Account a,LocalDate day){
  dispatcher(a);boolean all=allNetwork(a);
  var outlets=db.queryForList("select o.*,p.longitude,p.latitude,p.supplemental,p.provenance coordinate_provenance from outlets o left join routing_points p on p.point_id=o.id where (? or o.depot_code=?) order by o.id",all,a.depot());
  var depots=db.queryForList("select d.*,p.longitude,p.latitude,p.supplemental from depots d left join routing_points p on p.point_id=d.code where (? or d.code=?) order by d.code",all,a.depot());
  var vehicles=db.queryForList("select v.*,a.display_name driver_name,a.phone driver_phone,a.enabled driver_enabled from vehicles v join accounts a on a.id=v.driver_id where (? or v.depot_code=?) order by v.id",all,a.depot());
  var scenarios=db.queryForList("select distinct scenario from orders where day=? and scenario is not null",String.class,day);
  if(scenarios.size()==1)for(var v:vehicles)if(!Boolean.TRUE.equals(v.get("demo"))){var status=db.queryForList("select status from scenario_fleet where scenario=? and vehicle_id=?",String.class,scenarios.getFirst(),v.get("id"));String fleetState=status.isEmpty()?"not_in_scenario":status.getFirst();v.put("scenario_status",fleetState);if(!fleetState.equals("available"))v.put("available",false);}
  var trips=db.queryForList("select t.*,r.version plan_version from route_trips t join vehicles v on v.id=t.vehicle_id join plan_revisions r on r.id=t.plan_id where t.day=? and (? or v.depot_code=?) order by t.vehicle_id,t.trip",day,all,a.depot());
  for(var t:trips){t.put("geometry",decode(t.get("geometry").toString()));t.put("stops",stops(t.get("id")));t.putAll(db.queryForList("select coalesce(sum(l.ordered*p.weight_kg),0) weight_kg,coalesce(sum(l.ordered*p.volume_m3),0) volume_m3 from route_stops s join order_lines l on l.order_id=s.order_id join products p on p.id=l.product_id where s.route_trip_id=?",t.get("id")).getFirst());}
  LocalDate monday=day.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
  for(var v:vehicles){v.put("location",location(v.get("id").toString()));v.put("reserved_fuel_l",db.queryForObject("select coalesce(sum(fuel),0) from (select fuel_l fuel from route_trips where vehicle_id=? and day between ? and ? union all select estimated_fuel_l fuel from runs where vehicle_id=? and day between ? and ? and route_trip_id is null) q",Double.class,v.get("id"),monday,monday.plusDays(6),v.get("id"),monday,monday.plusDays(6)));}
  for(var t:trips){@SuppressWarnings("unchecked") var ss=(List<Map<String,Object>>)t.get("stops");var v=vehicles.stream().filter(row->row.get("id").equals(t.get("vehicle_id"))).findFirst().orElseThrow();@SuppressWarnings("unchecked") var p=(Map<String,Object>)v.get("location");t.put("timing",estimate(day,ss,p));}
  return Map.of("outlets",outlets,"depots",depots,"vehicles",vehicles,"trips",trips,"day",day,"serverTime",clock.instant(),"locationRetentionMinutes",15,"staleAfterSeconds",90);
 }
 private Object decode(String s){try{return json.readValue(s,Object.class);}catch(Exception e){throw new IllegalStateException("Invalid persisted geometry",e);}}
 private List<Map<String,Object>> stops(Object id){return db.queryForList("select s.*,o.outlet_id,o.reference,o.source_ref,o.status,o.temperature,o.version,o.day,t.name outlet_name,t.access,t.window_start,t.window_end,p.longitude,p.latitude,p.supplemental from route_stops s join orders o on o.id=s.order_id join outlets t on t.id=o.outlet_id left join routing_points p on p.point_id=t.id where s.route_trip_id=? order by s.sequence",id);}
 public Map<String,Object> journey(Account a,UUID order){
  var detail=operations.detail(a,order);@SuppressWarnings("unchecked") var run=(Map<String,Object>)detail.get("run");
  if(run==null)throw new ApiException(422,"RUN_REQUIRED","This order has no assigned journey.");
  var point=db.queryForList("select p.*,t.window_start,t.window_end,t.access from outlets t left join routing_points p on p.point_id=t.id where t.id=?",detail.get("outlet_id")).getFirst();
  var result=new LinkedHashMap<String,Object>();result.put("destination",point);result.put("location",location(run.get("vehicle_id").toString()));result.put("vehicleId",run.get("vehicle_id"));
  result.put("driverPhone",db.queryForList("select a.phone from vehicles v join accounts a on a.id=v.driver_id where v.id=?",run.get("vehicle_id")).getFirst().get("phone"));result.put("judgeSimulatorEnabled",demoEnabled&&Boolean.TRUE.equals(db.queryForObject("select demo from accounts where id=?",Boolean.class,a.id())));
  if(run.get("route_trip_id")!=null){var trip=db.queryForList("select t.*,p.version plan_version from route_trips t join plan_revisions p on p.id=t.plan_id where t.id=?",run.get("route_trip_id")).getFirst();trip.put("geometry",decode(trip.get("geometry").toString()));result.put("trip",trip);result.put("stops",stops(trip.get("id")).stream().filter(s->!a.role().equals("MANAGER")||db.queryForObject("select count(*) from account_outlets where account_id=? and outlet_id=?",Integer.class,a.id(),s.get("outlet_id"))==1).toList());}else{result.put("trip",Map.of());result.put("stops",List.of());}
  @SuppressWarnings("unchecked") var journeyStops=(List<Map<String,Object>>)result.get("stops");result.put("timing",estimate(((java.sql.Date)detail.get("day")).toLocalDate(),journeyStops,location(run.get("vehicle_id").toString())));result.put("serverTime",clock.instant());return result;
 }
 private Map<String,Object> estimate(LocalDate day,List<Map<String,Object>> stops,Map<String,Object> position){
  var next=stops.stream().filter(s->Set.of("RELEASED","IN_TRANSIT","ARRIVED").contains(s.get("status"))).findFirst();if(next.isEmpty())return Map.of("state","NO_ACTIVE_STOP","message","No active checkpoint to estimate.");var s=next.get();
  if(!day.equals(clock.instant().atZone(ZoneId.of("Asia/Colombo")).toLocalDate()))return Map.of("state","PLANNED_DAY","message","Replay or future operating day: displayed stop times are planned, not a live arrival estimate.");
  if(position.get("capturedAt")==null||Boolean.TRUE.equals(position.get("stale"))||Boolean.TRUE.equals(position.get("poorAccuracy"))||s.get("longitude")==null||s.get("latitude")==null)return Map.of("state","POSITION_REQUIRED","message","A fresh accurate position and destination are required for a road arrival estimate.");
  try{
   var route=routing.route(List.of(new RoutingAdapter.Point("reported",((Number)position.get("longitude")).doubleValue(),((Number)position.get("latitude")).doubleValue(),"Driver capture",false),new RoutingAdapter.Point(s.get("outlet_id").toString(),((Number)s.get("longitude")).doubleValue(),((Number)s.get("latitude")).doubleValue(),"Configured waypoint",Boolean.TRUE.equals(s.get("supplemental")))));var leg=route.legs().getFirst();Instant arrival=clock.instant().plusMillis(Math.round(leg.seconds()*1000));Instant opening=day.atTime(((java.sql.Time)s.get("window_start")).toLocalTime()).atZone(ZoneId.of("Asia/Colombo")).toInstant();Instant close=day.atTime(((java.sql.Time)s.get("window_end")).toLocalTime()).atZone(ZoneId.of("Asia/Colombo")).toInstant();Instant service=arrival.isBefore(opening)?opening:arrival;Instant end=service.plusSeconds(Math.round(((Number)s.get("service_minutes")).doubleValue()*60));
   return Map.of("state",end.isAfter(close)?"WINDOW_RISK":"ROAD_ESTIMATE","estimatedArrival",arrival,"serviceEnd",end,"roadKm",leg.metres()/1000,"generatedAt",clock.instant(),"message","OSRM car-profile estimate from the last accepted location; no live traffic or certified outlet geography.");
  }catch(Exception e){return Map.of("state","ROUTING_UNAVAILABLE","message","Road arrival estimate unavailable. Retain planned times; no straight-line estimate is substituted.");}
 }
 public record Position(UUID orderId,String vehicleId,double longitude,double latitude,double accuracy,Instant capturedAt,boolean simulated){}
 public Map<String,Object> report(Account a,Position q){
  if(!a.role().equals("DRIVER"))throw new ApiException(403,"ROLE_REQUIRED","Only the assigned driver can report journey location.");
  require(q.orderId()!=null&&q.vehicleId()!=null&&q.capturedAt()!=null,"LOCATION_FIELDS","Order, vehicle and capture time are required.");
  require(Double.isFinite(q.longitude())&&Double.isFinite(q.latitude())&&q.longitude()>=-180&&q.longitude()<=180&&q.latitude()>=-90&&q.latitude()<=90&&Double.isFinite(q.accuracy())&&q.accuracy()>0&&q.accuracy()<=100000,"LOCATION_RANGE","Coordinates and accuracy are invalid.");
  require(!q.capturedAt().isAfter(clock.instant().plusSeconds(30))&&!q.capturedAt().isBefore(clock.instant().minusSeconds(900)),"LOCATION_EXPIRED","Only the last 15 minutes of captured reporting can be uploaded.");
  var detail=operations.detail(a,q.orderId());@SuppressWarnings("unchecked") var run=(Map<String,Object>)detail.get("run");
  require(run!=null&&q.vehicleId().equals(run.get("vehicle_id"))&&Set.of("IN_TRANSIT","ARRIVED").contains(detail.get("status")),"ACTIVE_JOURNEY_REQUIRED","Location reporting requires this driver's active vehicle journey.");
  if(q.simulated())require(demoEnabled&&Boolean.TRUE.equals(db.queryForObject("select demo from accounts where id=?",Boolean.class,a.id())),"SIMULATOR_DISABLED","Simulation is restricted to enabled judge environments.");
  Map<String,Object> result=Map.ofEntries(Map.entry("vehicleId",q.vehicleId()),Map.entry("orderId",q.orderId()),Map.entry("longitude",q.longitude()),Map.entry("latitude",q.latitude()),Map.entry("accuracy",q.accuracy()),Map.entry("capturedAt",q.capturedAt()),Map.entry("capturedEpochMs",q.capturedAt().toEpochMilli()),Map.entry("receivedAt",clock.instant()),Map.entry("simulated",q.simulated()),Map.entry("poorAccuracy",q.accuracy()>100));
  try {String saved=redis.execute(new DefaultRedisScript<String>("local old=redis.call('GET',KEYS[1]); if old then local p=cjson.decode(old); if tonumber(p.capturedEpochMs)>tonumber(ARGV[2]) then return old end end; redis.call('SETEX',KEYS[1],900,ARGV[1]); return ARGV[1]",String.class),List.of("waypoint:location:"+q.vehicleId()),encode(result),Long.toString(q.capturedAt().toEpochMilli()));@SuppressWarnings("unchecked") Map<String,Object> accepted=json.readValue(saved,Map.class);return accepted;}catch(Exception e){throw new ApiException(503,"LOCATION_UNAVAILABLE","Location could not be accepted. Keep it queued locally and retry.");}
 }
 public List<Map<String,Object>> messages(Account a,UUID id){operations.detail(a,id);return db.queryForList("select m.id,m.order_id,m.category,m.body,m.created_at,a.display_name sender,a.role sender_role from issue_messages m join accounts a on a.id=m.account_id where m.order_id=? order by m.created_at,m.id",id);}
 public record Message(UUID commandId,String category,String body){}
 @Transactional public Map<String,Object> message(Account a,UUID id,Message q){
  operations.detail(a,id);require(q.commandId()!=null&&q.category()!=null&&q.body()!=null&&q.body().trim().length()>0&&q.body().length()<=1000&&Set.of("GENERAL","DELAY","ACCESS","DAMAGE","TEMPERATURE","SHORTAGE").contains(q.category()),"MESSAGE_INVALID","Choose an issue category and enter up to 1000 characters.");
  db.queryForObject("select pg_advisory_xact_lock(hashtext(?))",Object.class,q.commandId().toString());
  var prior=db.queryForList("select * from issue_messages where command_id=?",q.commandId());
  if(!prior.isEmpty()){var old=prior.getFirst();if(!old.get("account_id").equals(a.id())||!old.get("order_id").equals(id)||!old.get("body").equals(q.body().trim())||!old.get("category").equals(q.category()))throw new ApiException(409,"COMMAND_REUSED","This message ID already carries different content.");return old;}
  UUID message=UUID.randomUUID();db.update("insert into issue_messages(id,order_id,account_id,command_id,category,body) values(?,?,?,?,?,?)",message,id,a.id(),q.commandId(),q.category(),q.body().trim());
  db.update("insert into audit_events(account_id,order_id,event,details) values(?,?,'ISSUE_MESSAGE',?)",a.id(),id,q.category()+": "+q.body().trim());
  return db.queryForList("select * from issue_messages where id=?",message).getFirst();
 }
 public Map<String,Object> updates(Account a,long after){
  active(a);
  var events=db.queryForList("select e.id,e.order_id,e.event,e.accepted_at,o.reference,o.source_ref from audit_events e join orders o on o.id=e.order_id join outlets t on t.id=o.outlet_id where e.id>? and ((?='DISPATCHER' and (? or t.depot_code=?)) or (?='MANAGER' and exists(select 1 from account_outlets x where x.account_id=? and x.outlet_id=o.outlet_id)) or (?='LOADER' and exists(select 1 from runs r where r.order_id=o.id and r.loader_id=?)) or (?='DRIVER' and exists(select 1 from runs r join vehicles v on v.id=r.vehicle_id where r.order_id=o.id and v.driver_id=?))) order by e.id limit 200",after,a.role(),allNetwork(a),a.depot(),a.role(),a.id(),a.role(),a.id(),a.role(),a.id());
  return Map.of("events",events,"cursor",events.isEmpty()?after:events.getLast().get("id"),"serverTime",clock.instant(),"networkRevision",a.role().equals("DISPATCHER")?db.queryForObject("select coalesce(max(id),0) from operational_audit",Long.class):0);
 }
 private void active(Account a){if(db.queryForObject("select count(*) from accounts where id=? and enabled and role=? and depot_code=?",Integer.class,a.id(),a.role(),a.depot())!=1)throw new ApiException(401,"SESSION_REVOKED","Your account changed. Sign in again.");}
 public List<Map<String,Object>> locations(Account a){
  active(a);List<Map<String,Object>> vehicles;
  if(a.role().equals("DISPATCHER"))vehicles=db.queryForList("select id from vehicles where (? or depot_code=?)",allNetwork(a),a.depot());
  else if(a.role().equals("DRIVER"))vehicles=db.queryForList("select id from vehicles where driver_id=? and depot_code=?",a.id(),a.depot());
  else return List.of();
  var result=new ArrayList<Map<String,Object>>();for(var v:vehicles){var location=location(v.get("id").toString());if(!location.isEmpty())result.add(location);}return result;
 }
}
