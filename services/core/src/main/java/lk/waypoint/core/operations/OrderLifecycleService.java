package lk.waypoint.core.operations;

import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.planning.*;
import lk.waypoint.core.workflow.*;
import static lk.waypoint.core.workflow.WorkflowRules.require;

@Service
public class OrderLifecycleService {
 private final JdbcTemplate db;private final OperationsService operations;private final PlanningService planning;private final ObjectMapper json;private final Clock clock;
 @Value("${waypoint.demo-seed:false}") private boolean demoEnabled;
 public OrderLifecycleService(JdbcTemplate db,OperationsService operations,PlanningService planning,ObjectMapper json,Clock clock){this.db=db;this.operations=operations;this.planning=planning;this.json=json;this.clock=clock;}
 public record Draft(UUID id,int expectedVersion,String outletId,LocalDate day,List<Contracts.Item> items){}
 public record Command(UUID commandId,int expectedVersion,String operation,String reason,LocalDate day,List<Contracts.Item> items){}
 private void role(Account a,String role){if(!a.role().equals(role))throw new ApiException(403,"ROLE_REQUIRED",role+" access required.");}
 private Map<String,Object> outlet(Account a,String id){var rows=db.queryForList("select t.* from outlets t where t.id=? and t.depot_code=? and exists(select 1 from account_outlets s where s.account_id=? and s.outlet_id=t.id)",id,a.depot(),a.id());if(rows.size()!=1)throw new ApiException(403,"SCOPE_DENIED","This outlet is outside your assigned store scope.");return rows.getFirst();}
 private String encode(Object o){try{return json.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException(e);}}
 private void audit(Account a,UUID id,String event,String reason){db.update("insert into audit_events(account_id,order_id,event,details) values(?,?,?,?)",a.id(),id,event,reason);}
 private List<Contracts.Item> decodeItems(Object value){try{return Arrays.asList(json.readValue(value.toString(),Contracts.Item[].class));}catch(Exception e){throw new IllegalStateException(e);}}
 private String items(Map<String,Object> outlet,List<Contracts.Item> items,boolean emptyAllowed){
  require(items!=null&&items.size()<=100&&(emptyAllowed||!items.isEmpty()),"ITEMS_REQUIRED","Choose between one and 100 products.");
  String temperature=null;var unique=new HashSet<String>();
  for(var item:items){require(item!=null&&item.productId()!=null&&item.quantity()>0&&item.quantity()<=100000&&unique.add(item.productId()),"ITEM_INVALID","Combine repeated products and enter positive whole quantities.");var rows=db.queryForList("select * from products where id=? and catalog_enabled",item.productId());require(rows.size()==1,"CATALOG_PRODUCT_REQUIRED","Imported aggregate units cannot be ordered as catalogue SKUs.");var p=rows.getFirst();require(p.get("brand_code").equals(outlet.get("brand_code")),"BRAND_MISMATCH","Products must belong to the selected store brand.");if(temperature==null)temperature=p.get("temperature").toString();require(temperature.equals(p.get("temperature")),"SEPARATE_TEMPERATURE_LOADS","Fresh dry, chilled and frozen orders must stay separate.");}
  return temperature;
 }
 private LocalDate eligible(LocalDate requested,boolean demoStyle,boolean historical){
  require(requested!=null,"DAY_REQUIRED","Choose a delivery date.");LocalDate earliest=historical?requested:CalendarPolicy.earliest(requested,clock.instant());var days=db.queryForList("select day from operating_days where day>=? order by day",LocalDate.class,earliest);return CalendarPolicy.next(days,demoStyle);
 }
 public List<Map<String,Object>> drafts(Account a){role(a,"MANAGER");var result=db.queryForList("select d.*,t.name outlet_name,t.brand_code from order_drafts d join outlets t on t.id=d.outlet_id join account_outlets x on x.outlet_id=t.id and x.account_id=d.account_id where d.account_id=? and d.submitted_order_id is null and t.depot_code=? order by d.updated_at desc",a.id(),a.depot());for(var r:result)r.put("items",decodeItems(r.get("items")));return result;}
 @Transactional public Map<String,Object> saveDraft(Account a,Draft q){
  role(a,"MANAGER");var outlet=outlet(a,q.outletId());require(q.day()!=null,"DAY_REQUIRED","Choose a delivery date.");items(outlet,q.items(),true);UUID id=q.id()==null?UUID.randomUUID():q.id();
  if(q.id()==null){require(q.expectedVersion()==0,"STALE_DRAFT","A new draft starts at version zero.");db.update("insert into order_drafts(id,account_id,outlet_id,day,items) values(?,?,?,?,?::jsonb)",id,a.id(),q.outletId(),q.day(),encode(q.items()));}
  else{var old=db.queryForList("select * from order_drafts where id=? and account_id=? for update",id,a.id());if(old.size()!=1)throw new ApiException(403,"SCOPE_DENIED","This draft is outside your account.");var d=old.getFirst();if(((Number)d.get("version")).intValue()!=q.expectedVersion())throw new ApiException(409,"STALE_DRAFT","The draft changed. Reload before saving.");require(d.get("submitted_order_id")==null,"DRAFT_SUBMITTED","This draft has already been submitted.");db.update("update order_drafts set outlet_id=?,day=?,items=?::jsonb,version=version+1,updated_at=now() where id=?",q.outletId(),q.day(),encode(q.items()),id);}
  var result=db.queryForList("select * from order_drafts where id=?",id).getFirst();result.put("items",decodeItems(result.get("items")));return result;
 }
 @Transactional public Map<String,Object> submit(Account a,UUID id,int expectedVersion){
  role(a,"MANAGER");var rows=db.queryForList("select * from order_drafts where id=? and account_id=? for update",id,a.id());if(rows.size()!=1)throw new ApiException(403,"SCOPE_DENIED","This draft is outside your account.");var draft=rows.getFirst();outlet(a,draft.get("outlet_id").toString());if(draft.get("submitted_order_id")!=null)return operations.detail(a,(UUID)draft.get("submitted_order_id"));if(((Number)draft.get("version")).intValue()!=expectedVersion)throw new ApiException(409,"STALE_DRAFT","Review the current draft before submitting.");
  var outlet=outlet(a,draft.get("outlet_id").toString());var chosen=decodeItems(draft.get("items"));String temperature=items(outlet,chosen,false);LocalDate requested=((java.sql.Date)draft.get("day")).toLocalDate(),day=eligible(requested,Boolean.TRUE.equals(outlet.get("demo"))&&"STYLE".equals(outlet.get("brand_code")),false);
  boolean calendarDemo=db.queryForObject("select demo from operating_days where day=?",Boolean.class,day);UUID order=UUID.randomUUID();String reason=day.equals(requested)?"Store submitted the reviewed delivery request.":"Requested "+requested+"; moved to the next eligible day "+day+" under the 16:00 Colombo cutoff.";
  db.update("insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason,confirmation_required) values(?,?,?,?,?,'RECEIVED',?,?,true)",order,outlet.get("id"),a.id(),day,temperature,calendarDemo,reason);
  for(var item:chosen)db.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",UUID.randomUUID(),order,item.productId(),item.quantity());
  db.update("update order_drafts set submitted_order_id=?,version=version+1,updated_at=now() where id=?",order,id);audit(a,order,"ORDER_SUBMITTED",reason);return operations.detail(a,order);
 }
 @Transactional public Map<String,Object> command(Account a,UUID id,Command q){
  require(q.commandId()!=null&&q.operation()!=null&&q.reason()!=null&&!q.reason().isBlank()&&q.reason().length()<=500&&q.expectedVersion()>=0,"COMMAND_INVALID","A command ID, version and reason (up to 500 characters) are required.");operations.scopedOrder(a,id);
  db.queryForObject("select pg_advisory_xact_lock(hashtext(?))",Object.class,q.commandId().toString());String digest;
  try{digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(encode(q).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
  var prior=db.queryForList("select * from order_commands where command_id=?",q.commandId());if(!prior.isEmpty()){var p=prior.getFirst();if(!p.get("account_id").equals(a.id())||!p.get("order_id").equals(id)||!p.get("payload_digest").equals(digest))throw new ApiException(409,"COMMAND_REUSED","This command ID is already bound to different content.");try{@SuppressWarnings("unchecked") Map<String,Object> saved=json.readValue(p.get("result").toString(),Map.class);return saved;}catch(Exception e){throw new IllegalStateException(e);}}
  var initial=operations.scopedOrder(a,id);UUID parent=null;String vehicle=null;
  var runs=db.queryForList("select route_trip_id,vehicle_id from runs where order_id=?",id);
  if(!runs.isEmpty()){parent=(UUID)runs.getFirst().get("route_trip_id");vehicle=runs.getFirst().get("vehicle_id").toString();}
  if(parent!=null){db.queryForObject("select pg_advisory_xact_lock(hashtext(?))",Object.class,a.depot()+":"+initial.get("day"));db.queryForList("select id from vehicles where id=? for update",vehicle);db.queryForList("select o.id from orders o join route_stops s on s.order_id=o.id where s.route_trip_id=? order by o.id for update of o",parent);}
  else if(vehicle!=null)db.queryForList("select id from vehicles where id=? for update",vehicle);
  var order=db.queryForList("select * from orders where id=? for update",id).getFirst();if(((Number)order.get("version")).intValue()!=q.expectedVersion())throw new ApiException(409,"STALE_VERSION","The order changed. Review its latest state before acting.");
  switch(q.operation()){
   case "CONFIRM" -> {role(a,"DISPATCHER");require("RECEIVED".equals(order.get("status")),"CONFIRM_STATE","Only a submitted, unallocated order can be confirmed.");db.update("update orders set confirmed_at=now(),version=version+1,updated_at=now() where id=?",id);audit(a,id,"ORDER_CONFIRMED",q.reason());}
   case "CANCEL" -> {role(a,"MANAGER");require("RECEIVED".equals(order.get("status")),"CANCEL_STATE","Cancellation is available before allocation. Ask dispatch to review a published or loaded order.");require(order.get("source_weight_kg")==null,"SOURCE_ORDER_IMMUTABLE","Imported aggregate scenario demand is preserved; record a deferral instead.");db.update("update orders set status='CANCELLED',cancelled_at=now(),version=version+1,updated_at=now() where id=?",id);audit(a,id,"ORDER_CANCELLED",q.reason());}
   case "AMEND" -> {
    role(a,"MANAGER");require(Set.of("RECEIVED","SCHEDULED").contains(order.get("status")),"AMEND_STATE","Physical loading has started; request an operational exception rather than changing quantities.");require(order.get("source_weight_kg")==null,"SOURCE_ORDER_IMMUTABLE","Source aggregate orders retain their original units and mass.");var outlet=outlet(a,order.get("outlet_id").toString());String temp=items(outlet,q.items(),false);LocalDate oldDay=((java.sql.Date)order.get("day")).toLocalDate(),newDay=q.day()==null||q.day().equals(oldDay)?oldDay:eligible(q.day(),Boolean.TRUE.equals(outlet.get("demo"))&&"STYLE".equals(outlet.get("brand_code")),false);
    if("SCHEDULED".equals(order.get("status"))){require(parent!=null,"ROAD_PLAN_REQUIRED","This legacy fixture reservation cannot be amended after publication. Use a new road-backed order.");require(newDay.equals(oldDay),"PUBLISHED_DAY_FIXED","A published delivery date requires explicit dispatcher deferral/rescheduling.");require(db.queryForObject("select count(*) from orders o join route_stops s on s.order_id=o.id where s.route_trip_id=? and o.status<>'SCHEDULED'",Integer.class,parent)==0,"MANIFEST_LOCKED","Loading has begun elsewhere in this trip; the manifest is locked.");}
    var wanted=new HashSet<String>();for(var item:q.items()){wanted.add(item.productId());int count=db.update("update order_lines set ordered=? where order_id=? and product_id=?",item.quantity(),id,item.productId());if(count==0)db.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",UUID.randomUUID(),id,item.productId(),item.quantity());}
    for(var line:db.queryForList("select id,product_id from order_lines where order_id=?",id))if(!wanted.contains(line.get("product_id")))db.update("delete from order_lines where id=?",line.get("id"));
    db.update("update orders set day=?,temperature=?,version=version+1,updated_at=now(),confirmed_at=case when status='RECEIVED' then null else confirmed_at end where id=?",newDay,temp,id);
    if(parent!=null){var t=db.queryForList("select * from route_trips where id=?",parent).getFirst();var stops=db.query("select o.id,o.version from orders o join route_stops s on s.order_id=o.id where s.route_trip_id=? order by s.sequence",(r,i)->new PlanningContracts.Stop(r.getObject("id",UUID.class),r.getInt("version")),parent);int version=db.queryForObject("select version from planning_days where depot_code=? and day=?",Integer.class,a.depot(),oldDay);planning.publishStoreAmendment(a,id,new PlanningContracts.Plan(oldDay,version,List.of(new PlanningContracts.Trip(parent,vehicle,((Number)t.get("trip")).intValue(),t.get("loader_id").toString(),((Timestamp)t.get("departure_at")).toInstant(),stops)),List.of(),"Store amendment revalidated before republication: "+q.reason()));audit(a,id,"PUBLISHED_ORDER_AMENDED",q.reason()+"; Spring independently recalculated and published a new plan revision.");}
    else audit(a,id,"ORDER_AMENDED",q.reason()+"; dispatcher confirmation is required again.");
   }
   case "RESCHEDULE" -> {
    role(a,"DISPATCHER");require("DEFERRED".equals(order.get("status")),"RESCHEDULE_STATE","Only a recorded deferral can be explicitly rescheduled.");require(db.queryForObject("select count(*) from sync_conflicts where order_id=? and state='OPEN'",Integer.class,id)==0,"PROOF_REVIEW_REQUIRED","Resolve the retained offline proof before creating replacement demand.");require(db.queryForObject("select count(*) from orders where rescheduled_from=?",Integer.class,id)==0,"ALREADY_RESCHEDULED","This deferral already has a linked replacement order.");LocalDate oldDay=((java.sql.Date)order.get("day")).toLocalDate();require(q.day()!=null&&q.day().isAfter(oldDay),"RESCHEDULE_DATE","Choose a later eligible delivery date.");boolean historical=demoEnabled&&"S1".equals(order.get("scenario"));LocalDate next=eligible(q.day(),Boolean.TRUE.equals(order.get("demo"))&&"STYLE".equals(initial.get("brand_code")),historical);require(next.equals(q.day()),"RESCHEDULE_DATE","The selected date is not eligible under the calendar/cutoff. Choose "+next+".");UUID replacement=UUID.randomUUID();boolean demo=db.queryForObject("select demo from operating_days where day=?",Boolean.class,next);
    db.update("insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason,confirmation_required,confirmed_at,rescheduled_from,source_weight_kg,source_volume_m3,scenario,deferred_yesterday,days_since_last_served) values(?,?,?,?,?,'RECEIVED',?,?,true,now(),?,?,?,?,true,?)",replacement,order.get("outlet_id"),order.get("created_by"),next,order.get("temperature"),demo,"Explicit reschedule: "+q.reason(),id,order.get("source_weight_kg"),order.get("source_volume_m3"),order.get("scenario"),order.get("days_since_last_served"));
    db.update("update orders set source_ref=? where id=?",order.get("source_ref"),replacement);
    for(var line:db.queryForList("select * from order_lines where order_id=?",id))db.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",UUID.randomUUID(),replacement,line.get("product_id"),line.get("ordered"));db.update("update orders set version=version+1,updated_at=now() where id=?",id);audit(a,id,"ORDER_RESCHEDULED",q.reason()+"; replacement "+db.queryForObject("select reference from orders where id=?",String.class,replacement)+" on "+next+". Original deferral and evidence retained.");audit(a,replacement,"RESCHEDULE_CONFIRMED",q.reason());
   }
   default -> throw new ApiException(422,"COMMAND_UNKNOWN","Choose confirm, amend, cancel or reschedule.");
  }
  var result=operations.detail(a,id);db.update("insert into order_commands(command_id,account_id,order_id,operation,payload_digest,result) values(?,?,?,?,?,?::jsonb)",q.commandId(),a.id(),id,q.operation(),digest,encode(result));return result;
 }

}
