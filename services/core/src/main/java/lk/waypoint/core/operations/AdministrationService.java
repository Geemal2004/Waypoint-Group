package lk.waypoint.core.operations;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.*;
import static lk.waypoint.core.workflow.WorkflowRules.require;

@Service
public class AdministrationService {
 private final JdbcTemplate db;private final ObjectMapper json;private final PasswordEncoder passwords;private final TransactionTemplate previewTransaction;
 public AdministrationService(JdbcTemplate db,ObjectMapper json,PasswordEncoder passwords,PlatformTransactionManager transactions){this.db=db;this.json=json;this.passwords=passwords;this.previewTransaction=new TransactionTemplate(transactions);previewTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);}
 private record Entity(String table,String key,List<String> fields){}
 private static final Map<String,Entity> ENTITIES=Map.of(
  "waypoints",new Entity("routing_points","point_id",List.of("longitude","latitude","provenance","supplemental")),
  "outlets",new Entity("outlets","id",List.of("name","brand_code","depot_code","district","access","window_start","window_end","dock_type","mall_window","record_provenance")),
  "products",new Entity("products","id",List.of("name","brand_code","unit","weight_kg","volume_m3","temperature","min_c","max_c","handling","catalog_enabled","provenance")),
  "vehicles",new Entity("vehicles","id",List.of("name","depot_code","kind","refrigerated","min_c","max_c","weight_kg","volume_m3","weekly_fuel_l","km_per_l","driver_id","available","cold_capability_source","record_provenance")),
  "depots",new Entity("depots","code",List.of("name","record_provenance")),
  "accounts",new Entity("accounts","id",List.of("username","display_name","role","depot_code","enabled","phone"))
 );
 public void authorized(Account a){if(!a.role().equals("DISPATCHER")||!Boolean.TRUE.equals(db.queryForObject("select administration_enabled from accounts where id=?",Boolean.class,a.id())))throw new ApiException(403,"ADMINISTRATION_REQUIRED","Explicit operational administration permission is required.");}
 private Entity entity(String type){var e=ENTITIES.get(type);require(e!=null,"ENTITY_TYPE","Choose outlets, products, vehicles, depots or accounts.");return e;}
 public Map<String,Object> data(Account a){authorized(a);var result=new LinkedHashMap<String,Object>();for(var item:ENTITIES.entrySet()){var e=item.getValue();result.put(item.getKey(),db.queryForList("select "+e.key()+",revision,"+String.join(",",e.fields())+" from "+e.table()+" order by "+e.key()));}result.put("calendar",db.queryForList("select * from operating_days order by day"));result.put("audit",db.queryForList("select e.id,e.entity_type,e.entity_id,e.event,e.reason,e.accepted_at,a.display_name actor from operational_audit e join accounts a on a.id=e.account_id order by e.id desc limit 100"));return result;}
 public record Change(String id,int expectedRevision,Map<String,Object> fields,String reason,String initialPassword){}
 public record ImportBatch(List<Change> records){}
 public Map<String,Object> preview(Account a,String type,ImportBatch batch){
  authorized(a);entity(type);require(batch.records()!=null&&!batch.records().isEmpty()&&batch.records().size()<=200,"IMPORT_SIZE","Import between one and 200 reviewed records at a time.");var seen=new HashSet<String>();var errors=new ArrayList<Map<String,Object>>();
  for(int index=0;index<batch.records().size();index++){var row=batch.records().get(index);if(row==null||row.id()==null||!seen.add(row.id())){errors.add(Map.of("row",index+1,"message","Missing or duplicate record reference."));continue;}try{previewTransaction.execute(status->{try{return change(a,type,row);}finally{status.setRollbackOnly();}});}catch(ApiException e){errors.add(Map.of("row",index+1,"reference",row.id(),"message",e.getMessage()));}catch(org.springframework.dao.DataAccessException e){errors.add(Map.of("row",index+1,"reference",row.id(),"message","Record conflicts with database constraints or an existing unique reference. No data was imported."));}}
  return Map.of("valid",errors.isEmpty(),"records",batch.records().size(),"errors",errors,"previewOnly",true);
 }
 @Transactional public Map<String,Object> importRecords(Account a,String type,ImportBatch batch){var report=preview(a,type,batch);require(Boolean.TRUE.equals(report.get("valid")),"IMPORT_REJECTED","Import rejected. Review every row in the validation report; no records were changed.");var accepted=new ArrayList<Map<String,Object>>();for(var row:batch.records().stream().sorted(Comparator.comparing(Change::id)).toList())accepted.add(change(a,type,row));return Map.of("accepted",accepted,"count",accepted.size());}
 @Transactional public Map<String,Object> change(Account a,String type,Change q){
  authorized(a);var e=entity(type);require(q.id()!=null&&q.id().matches("[A-Za-z0-9_-]{1,32}")&&q.fields()!=null&&q.reason()!=null&&!q.reason().isBlank()&&q.reason().length()<=500,"ADMIN_INPUT","Use a readable reference and a reason up to 500 characters.");require(q.fields().keySet().stream().allMatch(e.fields()::contains),"ADMIN_FIELD","This request contains unsupported fields.");
  var oldRows=db.queryForList("select * from "+e.table()+" where "+e.key()+"=? for update",q.id());boolean create=oldRows.isEmpty();var values=new LinkedHashMap<String,Object>();if(!create)values.putAll(oldRows.getFirst());values.putAll(q.fields());
  if(!create&&((Number)values.get("revision")).intValue()!=q.expectedRevision())throw new ApiException(409,"STALE_RECORD","This operational record changed. Reload before saving.");require(!create||q.expectedRevision()==0,"STALE_RECORD","New records start at revision zero.");
  if(type.equals("accounts")){
   require(!q.id().equals(a.id()),"SELF_ADMINISTRATION","Another authorized administrator must change your own account.");
   if(!create)require(!q.fields().containsKey("role")||q.fields().get("role").equals(oldRows.getFirst().get("role")),"ACCOUNT_ROLE_FIXED","Role changes require explicit account reprovisioning; sessions cannot silently gain privileges.");
   text(values,"username",80);text(values,"display_name",120);choice(values,"role",Set.of("DRIVER","LOADER","MANAGER","DISPATCHER"));booleanValue(values,"enabled");foreign(values,"depot_code","depots","code");Object phone=values.get("phone");if(phone!=null&&!phone.toString().isBlank())require(phone.toString().matches("\\+?[0-9 ()-]{7,32}"),"PHONE_INVALID","Enter an authorized telephone number, or leave contact unavailable.");else values.put("phone",null);
   if(create)require(q.initialPassword()!=null&&q.initialPassword().length()>=12&&q.initialPassword().getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=72,"PASSWORD_REQUIRED","Provision a password of at least 12 characters and at most 72 UTF-8 bytes. It is never returned or audited.");
   if(!create)require(db.queryForObject("select count(*) from runs r join vehicles v on v.id=r.vehicle_id join orders o on o.id=r.order_id where (v.driver_id=? or r.loader_id=?) and o.status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')",Integer.class,q.id(),q.id())==0,"ACTIVE_ASSIGNMENT","Finish or explicitly defer assigned work before changing this account.");
  }else if(type.equals("waypoints")){
   double longitude=number(values,"longitude"),latitude=number(values,"latitude");require(longitude>=-180&&longitude<=180&&latitude>=-90&&latitude<=90,"COORDINATE_RANGE","Enter valid longitude and latitude.");text(values,"provenance",500);booleanValue(values,"supplemental");
   require(db.queryForObject("select (select count(*) from outlets where id=?)+(select count(*) from depots where code=?)",Integer.class,q.id(),q.id())==1,"WAYPOINT_REFERENCE","A waypoint must reference one existing outlet or depot.");
   require(db.queryForObject("select count(*) from orders o join outlets t on t.id=o.outlet_id where (t.id=? or t.depot_code=?) and o.status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')",Integer.class,q.id(),q.id())==0,"ACTIVE_PLAN_DATA","Finish or explicitly defer published work before changing its waypoint.");values.put("longitude",longitude);values.put("latitude",latitude);
  }else{
   text(values,"name",type.equals("products")?160:120);
   if(type.equals("outlets")||type.equals("vehicles"))foreign(values,"depot_code","depots","code");
   if(type.equals("outlets")||type.equals("products"))foreign(values,"brand_code","brands","code");
   if(type.equals("products")||type.equals("vehicles")){
    positive(values,"weight_kg");positive(values,"volume_m3");
    boolean cold=type.equals("products")?!"AMBIENT".equals(values.get("temperature")):booleanValue(values,"refrigerated");
    if(cold){double min=number(values,"min_c"),max=number(values,"max_c");require(min>=-80&&max<=60&&min<=max,"COLD_RANGE","Declare a valid cold range between -80°C and 60°C.");}else{values.put("min_c",null);values.put("max_c",null);}
   }
   if(type.equals("outlets")){text(values,"district",80);choice(values,"access",Set.of("ANY","VAN_ONLY"));choice(values,"dock_type",Set.of("rear_dock","street","mall_bay"));LocalTime start=localTime(values,"window_start"),end=localTime(values,"window_end");require(start.isBefore(end),"WINDOW_INVALID","Delivery window must close after opening.");booleanValue(values,"mall_window");}
   if(type.equals("products")){text(values,"unit",32);text(values,"handling",200);text(values,"provenance",500);choice(values,"temperature",Set.of("AMBIENT","CHILLED","FROZEN"));booleanValue(values,"catalog_enabled");}
   if(type.equals("vehicles")){choice(values,"kind",Set.of("VAN","TRUCK"));positive(values,"weekly_fuel_l");positive(values,"km_per_l");booleanValue(values,"available");foreign(values,"driver_id","accounts","id");require(db.queryForObject("select count(*) from accounts where id=? and role='DRIVER' and depot_code=? and enabled",Integer.class,values.get("driver_id"),values.get("depot_code"))==1,"DRIVER_SCOPE","Assign an enabled driver from this depot.");if(Boolean.TRUE.equals(values.get("refrigerated")))text(values,"cold_capability_source",500);}
   if(!type.equals("products"))text(values,"record_provenance",500);
   if(!create){String blocker=switch(type){case "vehicles"->"select count(*) from orders o join runs r on r.order_id=o.id where r.vehicle_id=? and o.status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')";case "outlets"->"select count(*) from orders where outlet_id=? and status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')";case "products"->"select count(*) from orders o join order_lines l on l.order_id=o.id where l.product_id=? and o.status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')";default->"select count(*) from vehicles v join runs r on r.vehicle_id=v.id join orders o on o.id=r.order_id where v.depot_code=? and o.status in ('SCHEDULED','LOADING','RELEASED','IN_TRANSIT','ARRIVED')";};require(db.queryForObject(blocker,Integer.class,q.id())==0,"ACTIVE_PLAN_DATA","This record affects an active published plan. Finish or explicitly defer its work before changing operational constraints.");}
  }
  var fields=e.fields().stream().filter(values::containsKey).toList();var args=new ArrayList<Object>();
  if(create){var columns=new ArrayList<>(fields);columns.add(e.key());fields.forEach(f->args.add(sqlValue(f,values.get(f))));args.add(q.id());if(type.equals("accounts")){columns.add("password_hash");args.add(passwords.encode(q.initialPassword()));}db.update("insert into "+e.table()+"("+String.join(",",columns)+") values("+String.join(",",Collections.nCopies(columns.size(),"?"))+")",args.toArray());}
  else{fields.forEach(f->args.add(sqlValue(f,values.get(f))));args.add(q.id());db.update("update "+e.table()+" set "+String.join(",",fields.stream().map(f->f+"=?").toList())+",revision=revision+1 where "+e.key()+"=?",args.toArray());}
  var changes=new LinkedHashMap<String,Object>();for(var f:fields)if(create||!Objects.equals(oldRows.getFirst().get(f),values.get(f)))changes.put(f,values.get(f));
  // The projection is explicitly an operator revision; immutable source_records remain the source evidence.
  if(!type.equals("accounts")&&!changes.isEmpty()){String provenance=type.equals("products")||type.equals("waypoints")?"provenance":"record_provenance";String label="Operator revision "+(create?0:((Number)oldRows.getFirst().get("revision")).intValue()+1)+": "+q.reason();if(label.length()>500)label=label.substring(0,500);db.update("update "+e.table()+" set "+provenance+"=? where "+e.key()+"=?",label,q.id());changes.put(provenance,label);}
  db.update("insert into operational_audit(account_id,entity_type,entity_id,event,reason,changes) values(?,?,?, ?,?,?::jsonb)",a.id(),type,q.id(),create?"RECORD_CREATED":"RECORD_UPDATED",q.reason(),encode(changes));return db.queryForList("select "+e.key()+",revision,"+String.join(",",e.fields())+" from "+e.table()+" where "+e.key()+"=?",q.id()).getFirst();
 }
 @Transactional public Map<String,Object> calendar(Account a,LocalDate day,String reason){authorized(a);require(day!=null&&reason!=null&&!reason.isBlank()&&reason.length()<=500,"CALENDAR_INPUT","Date and a review reason are required.");db.update("insert into operating_days(day,demo) values(?,false) on conflict do nothing",day);db.update("insert into operational_audit(account_id,entity_type,entity_id,event,reason,changes) values(?,'calendar',?,'OPERATING_DAY_REVIEWED',?,'{}')",a.id(),day.toString(),reason);return Map.of("day",day,"reason",reason);}
 @Transactional public Map<String,Object> grantOutlet(Account a,String manager,String outlet,String reason){authorized(a);require(reason!=null&&!reason.isBlank()&&reason.length()<=500,"REASON_REQUIRED","Record why this outlet access is authorized.");require(db.queryForObject("select count(*) from accounts a join outlets t on t.depot_code=a.depot_code where a.id=? and a.role='MANAGER' and t.id=? and a.enabled",Integer.class,manager,outlet)==1,"MANAGER_SCOPE","Choose an enabled manager and outlet in the same depot.");db.update("insert into account_outlets values(?,?) on conflict do nothing",manager,outlet);db.update("insert into operational_audit(account_id,entity_type,entity_id,event,reason,changes) values(?,'scope',?,'OUTLET_ACCESS_GRANTED',?,?::jsonb)",a.id(),manager,reason,encode(Map.of("outlet",outlet)));return Map.of("manager",manager,"outlet",outlet);}
 private String encode(Object o){try{return json.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException(e);}}
 private void text(Map<String,Object> m,String k,int max){require(m.get(k)!=null&&!m.get(k).toString().isBlank()&&m.get(k).toString().length()<=max,"FIELD_INVALID","Enter "+k.replace('_',' ')+" (up to "+max+" characters).");}
 private void choice(Map<String,Object> m,String k,Set<String> options){require(m.get(k)!=null&&options.contains(m.get(k).toString()),"FIELD_INVALID","Invalid "+k.replace('_',' ')+".");}
 private double number(Map<String,Object> m,String k){try{double n=Double.parseDouble(String.valueOf(m.get(k)));require(Double.isFinite(n),"NUMBER_INVALID","Enter a finite "+k+".");return n;}catch(NumberFormatException e){throw new ApiException(422,"NUMBER_INVALID","Enter a number for "+k+".");}}
 private void positive(Map<String,Object> m,String k){double n=number(m,k);require(n>0,"NUMBER_INVALID",k+" must be positive.");m.put(k,n);}
 private boolean booleanValue(Map<String,Object> m,String k){require(m.get(k) instanceof Boolean,"BOOLEAN_INVALID","Choose a value for "+k+".");return Boolean.TRUE.equals(m.get(k));}
 private void foreign(Map<String,Object> m,String k,String table,String key){require(m.get(k)!=null&&db.queryForObject("select count(*) from "+table+" where "+key+"=?",Integer.class,m.get(k))==1,"REFERENCE_INVALID","Choose an existing "+k+".");}
 private LocalTime localTime(Map<String,Object> m,String k){try{return LocalTime.parse(m.get(k).toString());}catch(Exception e){throw new ApiException(422,"WINDOW_INVALID","Enter a valid "+k+" time.");}}
 private Object sqlValue(String field,Object value){if(value==null)return null;if(field.startsWith("window_"))return java.sql.Time.valueOf(LocalTime.parse(value.toString()));if(Set.of("longitude","latitude","min_c","max_c","weight_kg","volume_m3","weekly_fuel_l","km_per_l").contains(field))return Double.parseDouble(value.toString());return value;}
}
