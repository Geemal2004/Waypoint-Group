package lk.waypoint.core.planning;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.utility.DockerImageName;
import static lk.waypoint.core.planning.PlanningContracts.*;

@SpringBootTest(properties={"waypoint.demo-seed=true","waypoint.network-import=/absent","waypoint.planning-import=/absent"})
@Testcontainers
@Transactional
class PlanningIT {
    @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);}
    @Autowired PlanningService planner;
    @Autowired OperationsService operations;
    @Autowired JdbcTemplate db;
    @Autowired UserDetailsService users;
    @MockitoBean RoutingAdapter routing;
    private final LocalDate day=LocalDate.of(2026,10,5);
    private Account account(String name){return (Account)users.loadUserByUsername(name);}
    private UUID order(String outlet,String temperature,String product,int units){
        UUID id=UUID.randomUUID();
        db.update("insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason) values(?,?,'DEMO-MANAGER',?,?,'RECEIVED',true,'Isolated test fixture')",id,outlet,day,temperature);
        db.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",UUID.randomUUID(),id,product,units);return id;
    }
    private Trip trip(String vehicle,int slot,String departure,UUID... ids){return new Trip(null,vehicle,slot,"DEMO-LOADER",Instant.parse(departure),Arrays.stream(ids).map(id->new Stop(id,0)).toList());}
    private Plan plan(Trip... trips){return new Plan(day,0,List.of(trips),List.of(),"Isolated integration fixture");}
    private List<String> codes(Plan p){
        @SuppressWarnings("unchecked") var f=(List<Map<String,Object>>)planner.validate(account("dispatcher"),p).get("failures");
        return f.stream().map(m->(String)m.get("code")).toList();
    }
    @BeforeEach void fixtures(){
        db.update("update vehicles set km_per_l=10 where demo=true");db.update("update outlets set dock_type='street' where demo=true");
        db.update("insert into source_records values('district_travel.csv','Colombo','{\"district\":\"Colombo\",\"depot_to_district_freeflow_min\":20,\"inter_stop_freeflow_min\":5}'::jsonb)");
        for(String brand:List.of("Fresh","Style","Tech"))db.update("insert into source_records values('service_allowance.csv',?,?::jsonb)",brand+"|street","{\"brand\":\""+brand+"\",\"dock_type\":\"street\",\"service_allowance_min\":16}");
        for(String id:List.of("PELIYAGODA","DEMO-FRESH","DEMO-TECH","DEMO-STYLE"))db.update("insert into routing_points(point_id,longitude,latitude,provenance,supplemental) values(?,79.9,6.9,'Isolated routing fixture',true)",id);
        when(routing.route(anyList())).thenAnswer(invocation->{List<?> points=invocation.getArgument(0);return new RoutingAdapter.RoadRoute(java.util.stream.IntStream.range(1,points.size()).mapToObj(i->new RoutingAdapter.Leg(300,1000)).toList(),Map.of("type","LineString","coordinates",List.of(List.of(79.9,6.9),List.of(79.91,6.91))),Map.of("provider","OSRM test double"));});
    }
    @Test void multiStopPublicationPreservesIdentitiesAndRequiresAllReleasedLoads(){
        UUID first=order("DEMO-FRESH","AMBIENT","DEMO-RICE",10),second=order("DEMO-FRESH","AMBIENT","DEMO-RICE",5);
        var p=plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",first,second));
        assertThat(codes(p)).isEmpty();planner.publish(account("dispatcher"),p);
        assertThat(db.queryForObject("select count(*) from route_trips",Integer.class)).isEqualTo(1);
        assertThat(db.queryForList("select order_id from route_stops order by sequence",UUID.class)).containsExactly(first,second);
        assertThat(db.queryForList("select loading_sequence from route_stops order by sequence",Integer.class)).containsExactly(2,1);
        assertThatThrownBy(()->planner.publish(account("dispatcher"),p)).hasMessageContaining("newer plan");
        assertThatThrownBy(()->operations.start(account("driver"),first,1)).hasMessageContaining("every stop");
        for(UUID id:List.of(first,second)){
            UUID line=db.queryForObject("select id from order_lines where order_id=?",UUID.class,id);
            int units=db.queryForObject("select ordered from order_lines where id=?",Integer.class,line);
            operations.loading(account("loader"),id,new Contracts.Quantities(1,List.of(new Contracts.Quantity(line,units)),"NONE"));operations.release(account("loader"),id,2);
        }
        operations.start(account("driver"),first,3);
        assertThat(db.queryForList("select status from orders where id in (?,?)",String.class,first,second)).containsOnly("IN_TRANSIT");
        assertThatThrownBy(()->operations.arrive(account("driver"),second,4)).hasMessageContaining("earlier stops");
    }
    @ParameterizedTest @ValueSource(strings={"WEIGHT_LIMIT","VOLUME_LIMIT","DEPOT_MISMATCH","VAN_ONLY_ACCESS","VEHICLE_UNAVAILABLE","DELIVERY_WINDOW","WEEKLY_FUEL","TRIP_BUDGET"})
    void constraintsRejectInfeasibleManifest(String code){
        UUID id=order("DEMO-FRESH","AMBIENT","DEMO-RICE",10);
        switch(code){
            case "WEIGHT_LIMIT" -> db.update("update vehicles set weight_kg=1 where id='DEMO-DRY'");
            case "VOLUME_LIMIT" -> db.update("update vehicles set volume_m3=.01 where id='DEMO-DRY'");
            case "DEPOT_MISMATCH" -> db.update("update vehicles set depot_code='KANDY' where id='DEMO-DRY'");
            case "VAN_ONLY_ACCESS" -> db.update("update outlets set access='VAN_ONLY' where id='DEMO-FRESH'");
            case "VEHICLE_UNAVAILABLE" -> db.update("update vehicles set available=false where id='DEMO-DRY'");
            case "DELIVERY_WINDOW" -> db.update("update outlets set window_end='05:10' where id='DEMO-FRESH'");
            case "WEEKLY_FUEL" -> db.update("update vehicles set weekly_fuel_l=.01 where id='DEMO-DRY'");
            case "TRIP_BUDGET" -> db.update("update source_records set payload=jsonb_set(payload,'{depot_to_district_freeflow_min}','300') where file='district_travel.csv'");
        }
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",id)))).contains(code);
    }
    @Test void coldCompatibilityAndSeparateOrders(){
        UUID dry=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1),cold=order("DEMO-FRESH","CHILLED","DEMO-MILK",1);
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",cold)))).contains("COLD_REQUIRED");
        assertThat(codes(plan(trip("DEMO-COLD",1,"2026-10-04T22:00:00Z",dry,cold)))).contains("SEPARATE_TEMPERATURE_LOADS");
        db.update("update vehicles set min_c=-25,max_c=-18 where id='DEMO-COLD'");
        assertThat(codes(plan(trip("DEMO-COLD",1,"2026-10-04T22:00:00Z",cold)))).contains("TEMPERATURE_RANGE");
    }
    @Test void groupingFreshPolicyDuplicatesAndInterTripTiming(){
        UUID dry=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1),tech=order("DEMO-TECH","AMBIENT","DEMO-TV",1);
        assertThat(codes(plan(trip("DEMO-COLD",1,"2026-10-05T03:30:00Z",tech)))).contains("FRESH_ONLY_POLICY");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",dry,tech)))).contains("BRAND_DISTRICT");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",dry),trip("DEMO-DRY",2,"2026-10-04T22:00:00Z",dry)))).contains("DOUBLE_ASSIGNMENT","TRIP_TURNAROUND");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",dry),trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",dry)))).contains("TRIP_LIMIT");
    }
    @Test void routingFailurePublishesNothing(){
        UUID id=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1);
        when(routing.route(anyList())).thenThrow(new ApiException(503,"ROUTING_UNAVAILABLE","OSRM offline; no fallback"));
        assertThatThrownBy(()->planner.publish(account("dispatcher"),plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",id)))).hasMessageContaining("no fallback");
        assertThat(db.queryForObject("select count(*) from route_trips",Integer.class)).isZero();
        assertThat(db.queryForObject("select status from orders where id=?",String.class,id)).isEqualTo("RECEIVED");
    }
    @Test void sourceAggregatesAvailabilityAndSkipBaselineAreAuthoritative(){
        UUID id=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1);
        db.update("update orders set source_weight_kg=5000,source_volume_m3=20,scenario='TEST',deferred_yesterday=true where id=?",id);
        db.update("insert into scenario_fleet values('TEST','DEMO-DRY','in_workshop')");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",id)))).contains("WEIGHT_LIMIT","VOLUME_LIMIT","SCENARIO_FLEET");
        planner.publish(account("dispatcher"),new Plan(day,0,List.of(),List.of(new Deferred(id,0,"Arrange whole-order capacity",day.plusDays(1))),"Recorded excess demand"));
        assertThat(db.queryForObject("select consecutive_skips from deferrals where order_id=?",Integer.class,id)).isEqualTo(2);
    }
    @Test void districtGroupingAndFreshBoundaries(){
        UUID first=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1),other=order("DEMO-TECH","AMBIENT","DEMO-TV",1);
        db.update("update outlets set district='Other district',brand_code='FRESH' where id='DEMO-TECH'");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",first,other)))).contains("BRAND_DISTRICT");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-04T21:59:00Z",first)))).contains("FRESH_START");
        assertThat(codes(plan(trip("DEMO-DRY",1,"2026-10-05T02:25:00Z",first)))).contains("FRESH_DEADLINE");
    }
    @Test void manualRevisionPreservesIdsAndLocksAfterLoading(){
        UUID first=order("DEMO-FRESH","AMBIENT","DEMO-RICE",2),second=order("DEMO-FRESH","AMBIENT","DEMO-RICE",2);
        planner.publish(account("dispatcher"),plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",first,second)));
        UUID parent=db.queryForObject("select id from route_trips",UUID.class);
        UUID run=db.queryForObject("select id from runs where order_id=?",UUID.class,second);
        UUID stop=db.queryForObject("select id from route_stops where order_id=?",UUID.class,second);
        planner.publish(account("dispatcher"),new Plan(day,1,List.of(new Trip(parent,"DEMO-DRY",1,"DEMO-LOADER",Instant.parse("2026-10-04T22:05:00Z"),List.of(new Stop(second,1),new Stop(first,1)))),List.of(),"Manual reorder"));
        assertThat(db.queryForObject("select count(*) from plan_revisions",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("select request->'trips'->0->'stops'->0->>'orderId' from plan_revisions where version=1",String.class)).isEqualTo(first.toString());
        assertThat(db.queryForObject("select id from runs where order_id=?",UUID.class,second)).isEqualTo(run);
        assertThat(db.queryForObject("select id from route_stops where order_id=?",UUID.class,second)).isEqualTo(stop);
        assertThat(db.queryForObject("select sequence from route_stops where order_id=?",Integer.class,second)).isEqualTo(1);
        UUID line=db.queryForObject("select id from order_lines where order_id=?",UUID.class,second);
        operations.loading(account("loader"),second,new Contracts.Quantities(2,List.of(new Contracts.Quantity(line,1)),"SHORTAGE"));
        var locked=new Plan(day,2,List.of(new Trip(parent,"DEMO-DRY",1,"DEMO-LOADER",Instant.parse("2026-10-04T22:05:00Z"),List.of(new Stop(second,3),new Stop(first,2)))),List.of(),"Do not overwrite shortage");
        assertThatThrownBy(()->planner.publish(account("dispatcher"),locked)).hasMessageContaining("MANIFEST_LOCKED");
        assertThat(db.queryForObject("select loaded from order_lines where id=?",Integer.class,line)).isEqualTo(1);
    }
    @Test void sourceStyleUsesTradingCalendar(){
        UUID id=order("DEMO-STYLE","AMBIENT","DEMO-GARMENTS",1);
        db.update("update orders set demo=false where id=?",id);db.update("update operating_days set demo=false where day=?",day.plusDays(1));
        assertThat(operations.defer(account("dispatcher"),id,new Contracts.Defer(0,"Source trading-day deferral",day.plusDays(1))).get("status")).isEqualTo("DEFERRED");
    }
    @Test void legacyReservationsCountParentTripFuelAndSlotsOnce(){
        UUID first=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1),second=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1),next=order("DEMO-FRESH","AMBIENT","DEMO-RICE",1);
        planner.publish(account("dispatcher"),plan(trip("DEMO-DRY",1,"2026-10-04T22:00:00Z",first,second)));
        db.update("update vehicles set weekly_fuel_l=1.3 where id='DEMO-DRY'");
        var legacy=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",2,Instant.parse("2026-10-05T01:00:00Z"),Instant.parse("2026-10-05T02:00:00Z"),1,"Isolated legacy reservation after one multi-stop trip");
        assertThat(operations.publish(account("dispatcher"),next,legacy).get("status")).isEqualTo("SCHEDULED");
        assertThat(db.queryForObject("select count(*) from runs where vehicle_id='DEMO-DRY'",Integer.class)).isEqualTo(3);
    }
}
