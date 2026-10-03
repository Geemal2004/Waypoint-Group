package lk.waypoint.core.operations;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import java.time.*;
import java.util.*;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.planning.*;
import lk.waypoint.core.workflow.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(properties={"waypoint.demo-seed=true","waypoint.network-import=/absent","waypoint.planning-import=/absent"})
@AutoConfigureMockMvc @Testcontainers @Transactional
class ProductOperationsIT {
 @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
 @Container static GenericContainer<?> redis=new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);r.add("spring.data.redis.host",redis::getHost);r.add("spring.data.redis.port",()->redis.getMappedPort(6379));}
 static class AdjustableClock extends Clock {Instant now=Instant.parse("2026-10-03T08:00:00Z");public Instant instant(){return now;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return Clock.fixed(now,zone);}}
 @TestConfiguration static class Time {@Bean @Primary Clock clock(){return new AdjustableClock();}}
 @Autowired OrderLifecycleService lifecycle;@Autowired AdministrationService administration;@Autowired LiveOperationsService live;@Autowired OperationsService ops;@Autowired PlanningService planner;@Autowired JdbcTemplate db;@Autowired UserDetailsService users;@Autowired MockMvc mvc;
 @MockitoBean RoutingAdapter routing;
 @Autowired org.springframework.data.redis.core.StringRedisTemplate locations;
 @Autowired Clock clock;
 private Account account(String name){return (Account)users.loadUserByUsername(name);}
 private final LocalDate day=LocalDate.of(2026,10,5);
 private UUID draft(String product,int units){return (UUID)lifecycle.saveDraft(account("manager"),new OrderLifecycleService.Draft(null,0,"DEMO-FRESH",day,List.of(new Contracts.Item(product,units)))).get("id");}
 private UUID submitted(){return (UUID)lifecycle.submit(account("manager"),draft("DEMO-RICE",4),0).get("id");}
 private OrderLifecycleService.Command command(String operation,int version,String reason){return new OrderLifecycleService.Command(UUID.randomUUID(),version,operation,reason,null,null);}
 @BeforeEach void fixtures(){
  ((AdjustableClock)clock).now=Instant.parse("2026-10-03T08:00:00Z");
  locations.delete("waypoint:location:DEMO-DRY");
  db.update("update vehicles set km_per_l=10 where demo");db.update("update outlets set dock_type='street' where demo");
  db.update("insert into source_records values('district_travel.csv','Colombo','{\"district\":\"Colombo\",\"depot_to_district_freeflow_min\":20,\"inter_stop_freeflow_min\":5}')");
  db.update("insert into source_records values('service_allowance.csv','Fresh|street','{\"brand\":\"Fresh\",\"dock_type\":\"street\",\"service_allowance_min\":16}')");
  for(String id:List.of("PELIYAGODA","DEMO-FRESH"))db.update("insert into routing_points(point_id,longitude,latitude,provenance,supplemental) values(?,79.9,6.9,'Test supplemental waypoint',true)",id);
  when(routing.route(anyList())).thenAnswer(i->{List<?> points=i.getArgument(0);return new RoutingAdapter.RoadRoute(java.util.stream.IntStream.range(1,points.size()).mapToObj(n->new RoutingAdapter.Leg(300,1000)).toList(),Map.of("type","LineString","coordinates",List.of(List.of(79.9,6.9),List.of(79.91,6.91))),Map.of("provider","OSRM test double"));});
 }
 @Test void draftsAreScopedVersionedAndSubmissionIsIdempotent(){UUID d=draft("DEMO-RICE",4);assertThat(lifecycle.drafts(account("manager"))).hasSize(1);assertThatThrownBy(()->lifecycle.saveDraft(account("manager"),new OrderLifecycleService.Draft(d,99,"DEMO-FRESH",day,List.of()))).hasMessageContaining("changed");var first=lifecycle.submit(account("manager"),d,0);assertThat(first.get("reference")).asString().startsWith("WP-");assertThat(lifecycle.submit(account("manager"),d,0).get("id")).isEqualTo(first.get("id"));assertThatThrownBy(()->lifecycle.drafts(account("driver"))).isInstanceOf(ApiException.class);}
 @Test void submittedOrdersNeedConfirmationAndCommandsCannotBeRebound(){UUID id=submitted();var trip=new PlanningContracts.Trip(null,"DEMO-DRY",1,"DEMO-LOADER",Instant.parse("2026-10-04T22:00:00Z"),List.of(new PlanningContracts.Stop(id,0)));var plan=new PlanningContracts.Plan(day,0,List.of(trip),List.of(),"Reviewed test allocation");assertThat(planner.validate(account("dispatcher"),plan).toString()).contains("ORDER_UNCONFIRMED");var q=command("CONFIRM",0,"Reviewed quantities and window");lifecycle.command(account("dispatcher"),id,q);lifecycle.command(account("dispatcher"),id,q);assertThat(db.queryForObject("select version from orders where id=?",Integer.class,id)).isEqualTo(1);assertThatThrownBy(()->lifecycle.command(account("dispatcher"),id,new OrderLifecycleService.Command(q.commandId(),0,"CONFIRM","Different payload",null,null))).hasMessageContaining("different content");assertThatThrownBy(()->lifecycle.command(account("manager"),id,command("CONFIRM",1,"Not a dispatcher"))).isInstanceOf(ApiException.class);}
 @Test void storeAmendmentClearsReviewAndCancellationRetainsEvidence(){UUID id=submitted();lifecycle.command(account("dispatcher"),id,command("CONFIRM",0,"Reviewed"));lifecycle.command(account("manager"),id,new OrderLifecycleService.Command(UUID.randomUUID(),1,"AMEND","Stock demand changed",day,List.of(new Contracts.Item("DEMO-RICE",6))));var changed=ops.detail(account("manager"),id);assertThat(changed.get("confirmed_at")).isNull();assertThat(changed.get("version")).isEqualTo(2);lifecycle.command(account("manager"),id,command("CANCEL",2,"Store no longer needs this delivery"));assertThat(ops.detail(account("manager"),id).get("status")).isEqualTo("CANCELLED");assertThat(db.queryForObject("select count(*) from order_lines where order_id=?",Integer.class,id)).isEqualTo(1);}
 @Test void linkedReschedulePreservesOriginalDemandAndPreventsDuplicateReplacement(){UUID id=submitted();ops.defer(account("dispatcher"),id,new Contracts.Defer(0,"Vehicle capacity unavailable",LocalDate.of(2026,10,6)));var q=new OrderLifecycleService.Command(UUID.randomUUID(),1,"RESCHEDULE","Approved next day delivery",LocalDate.of(2026,10,6),null);lifecycle.command(account("dispatcher"),id,q);assertThat(ops.detail(account("dispatcher"),id).get("status")).isEqualTo("DEFERRED");assertThat(db.queryForObject("select count(*) from orders where rescheduled_from=?",Integer.class,id)).isEqualTo(1);UUID replacement=db.queryForObject("select id from orders where rescheduled_from=?",UUID.class,id);assertThat(ops.consecutiveSkips(replacement)).isEqualTo(1);ops.defer(account("dispatcher"),replacement,new Contracts.Defer(0,"Capacity still unavailable",LocalDate.of(2026,10,7)));assertThat(ops.consecutiveSkips(replacement)).isEqualTo(2);assertThat(ops.detail(account("dispatcher"),replacement).get("deferrals").toString()).contains("Vehicle capacity unavailable","Capacity still unavailable");assertThatThrownBy(()->lifecycle.command(account("dispatcher"),id,new OrderLifecycleService.Command(UUID.randomUUID(),2,"RESCHEDULE",q.reason(),q.day(),null))).hasMessageContaining("already");}
 private void underway(UUID id){ops.publish(account("dispatcher"),id,new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",1,Instant.parse("2026-10-05T00:00:00Z"),Instant.parse("2026-10-05T02:00:00Z"),2,"Legacy isolated workflow test"));UUID line=db.queryForObject("select id from order_lines where order_id=?",UUID.class,id);ops.loading(account("loader"),id,new Contracts.Quantities(1,List.of(new Contracts.Quantity(line,4)),"NONE"));ops.release(account("loader"),id,2);ops.start(account("driver"),id,3);}
 @Test void gpsChecksScopeFreshnessAccuracyAndMonotonicCapture(){UUID id=(UUID)ops.create(account("manager"),new Contracts.CreateOrder("DEMO-FRESH",day,List.of(new Contracts.Item("DEMO-RICE",4)))).get("id");underway(id);Instant now=Instant.parse("2026-10-03T08:00:00Z");var p=new LiveOperationsService.Position(id,"DEMO-DRY",79.9,6.9,150,now,true);assertThat(live.report(account("driver"),p).get("poorAccuracy")).isEqualTo(true);var older=new LiveOperationsService.Position(id,"DEMO-DRY",80,7,20,now.minusSeconds(30),true);assertThat(live.report(account("driver"),older).get("longitude")).isEqualTo(79.9);assertThatThrownBy(()->live.report(account("manager"),p)).isInstanceOf(ApiException.class);assertThatThrownBy(()->live.report(account("driver"),new LiveOperationsService.Position(id,"DEMO-VAN",79,6,20,now,true))).hasMessageContaining("active vehicle");assertThatThrownBy(()->live.report(account("driver"),new LiveOperationsService.Position(id,"DEMO-DRY",79,6,20,now.minusSeconds(901),true))).hasMessageContaining("15 minutes");}
 @Test void messagesAreDurableIdempotentAndScoped(){UUID id=submitted();var q=new LiveOperationsService.Message(UUID.randomUUID(),"DELAY","Receiving bay occupied");live.message(account("manager"),id,q);live.message(account("manager"),id,q);assertThat(live.messages(account("dispatcher"),id)).hasSize(1);assertThatThrownBy(()->live.message(account("manager"),id,new LiveOperationsService.Message(q.commandId(),"DELAY","Changed issue"))).hasMessageContaining("different content");assertThatThrownBy(()->live.messages(account("driver"),id)).isInstanceOf(ApiException.class);assertThat(live.updates(account("dispatcher"),0).toString()).contains("ISSUE_MESSAGE");}
 @Test void administrationNeedsExplicitPermissionAndRejectsStaleRecords(){var q=new AdministrationService.Change("DEMO-RICE",0,Map.of("name","Reviewed rice cartons"),"Operator catalogue review",null);assertThatThrownBy(()->administration.change(account("manager"),"products",q)).isInstanceOf(ApiException.class);administration.change(account("dispatcher"),"products",q);assertThatThrownBy(()->administration.change(account("dispatcher"),"products",q)).hasMessageContaining("changed");assertThat(administration.data(account("dispatcher")).toString()).doesNotContain("password_hash");}
 @Test void importPreviewRollsBackAndRejectsEveryInvalidBatch(){var good=new AdministrationService.Change("DEMO-RICE",0,Map.of("name","Import preview only"),"Import review",null);var bad=new AdministrationService.Change("DEMO-MILK",0,Map.of("weight_kg",-1),"Bad capacity",null);var batch=new AdministrationService.ImportBatch(List.of(good,bad));var report=administration.preview(account("dispatcher"),"products",batch);assertThat(report.get("valid")).isEqualTo(false);assertThat(report.get("errors").toString()).contains("Row".toLowerCase(),"positive");assertThatThrownBy(()->administration.importRecords(account("dispatcher"),"products",batch)).hasMessageContaining("Import rejected");assertThat(db.queryForObject("select name from products where id='DEMO-RICE'",String.class)).isEqualTo("Rice cartons");}
 @Test void disablingAnAccountRevokesItsNextAuthenticatedRequest()throws Exception{var a=account("driver");db.update("update accounts set enabled=false where id=?",a.id());mvc.perform(get("/api/v1/orders").with(user(a))).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SESSION_REVOKED"));}
 @Test void liveRoadEstimatesRequireFreshAccuracyAndNeverFallbackOnRoutingFailure(){
  UUID id=(UUID)ops.create(account("manager"),new Contracts.CreateOrder("DEMO-FRESH",day,List.of(new Contracts.Item("DEMO-RICE",4)))).get("id");
  var trip=new PlanningContracts.Trip(null,"DEMO-DRY",1,"DEMO-LOADER",Instant.parse("2026-10-04T22:00:00Z"),List.of(new PlanningContracts.Stop(id,0)));planner.publish(account("dispatcher"),new PlanningContracts.Plan(day,0,List.of(trip),List.of(),"Road estimate test"));UUID line=db.queryForObject("select id from order_lines where order_id=?",UUID.class,id);ops.loading(account("loader"),id,new Contracts.Quantities(1,List.of(new Contracts.Quantity(line,4)),"NONE"));ops.release(account("loader"),id,2);ops.start(account("driver"),id,3);
  Instant now=Instant.parse("2026-10-05T00:00:00Z");((AdjustableClock)clock).now=now;live.report(account("driver"),new LiveOperationsService.Position(id,"DEMO-DRY",79.9,6.9,20,now.minusSeconds(100),true));assertThat(live.journey(account("driver"),id).get("timing").toString()).contains("POSITION_REQUIRED");live.report(account("driver"),new LiveOperationsService.Position(id,"DEMO-DRY",79.9,6.9,20,now,true));assertThat(live.journey(account("driver"),id).get("timing").toString()).contains("ROAD_ESTIMATE");when(routing.route(anyList())).thenThrow(new ApiException(503,"ROUTING_UNAVAILABLE","OSRM unavailable"));assertThat(live.journey(account("driver"),id).get("timing").toString()).contains("ROUTING_UNAVAILABLE","no straight-line");
 }
}
