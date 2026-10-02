package lk.waypoint.core.workflow;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.*;
import java.util.*;
import lk.waypoint.core.identity.Account;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(properties={"waypoint.demo-seed=true","waypoint.network-import=/not-present/shared-network.sql"})
@AutoConfigureMockMvc
@Testcontainers
@Transactional
class OperationsIT {
    @Container static PostgreSQLContainer<?> db=new PostgreSQLContainer<>(DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",db::getJdbcUrl); r.add("spring.datasource.username",db::getUsername); r.add("spring.datasource.password",db::getPassword);
    }
    @TestConfiguration static class Time {
        @Bean @Primary Clock testClock() { return Clock.fixed(Instant.parse("2026-10-03T08:00:00Z"),ZoneOffset.UTC); }
    }
    @Autowired OperationsService operations;
    @Autowired UserDetailsService users;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    private Account account(String username) { return (Account)users.loadUserByUsername(username); }
    private UUID order(String outlet,String product,int quantity) {
        return (UUID)operations.create(account("manager"),new Contracts.CreateOrder(outlet,LocalDate.of(2026,10,5),List.of(new Contracts.Item(product,quantity)))).get("id");
    }
    private Contracts.Publish plan(String vehicle,double fuel) {
        return new Contracts.Publish(0,vehicle,"DEMO-LOADER",1,Instant.parse("2026-10-05T00:00:00Z"),Instant.parse("2026-10-05T02:00:00Z"),fuel,"Synthetic integration test; no road feasibility claim.");
    }
    private void fails(UUID id,Contracts.Publish plan,String code) {
        assertThatThrownBy(() -> operations.publish(account("dispatcher"),id,plan)).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.code).isEqualTo(code));
    }
    @Test void bothCapacitiesAreEnforced() {
        fails(order("DEMO-FRESH","DEMO-RICE",51),plan("DEMO-DRY",10),"WEIGHT_CAPACITY");
        fails(order("DEMO-STYLE","DEMO-GARMENTS",21),plan("DEMO-VAN",10),"VOLUME_CAPACITY");
    }
    @Test void temperaturePolicyAndAccessAreSeparate() {
        fails(order("DEMO-FRESH","DEMO-MILK",1),plan("DEMO-DRY",10),"REFRIGERATION_REQUIRED");
        fails(order("DEMO-TECH","DEMO-TV",1),plan("DEMO-COLD",10),"FRESH_ONLY_POLICY");
        fails(order("DEMO-STYLE","DEMO-GARMENTS",1),plan("DEMO-DRY",10),"VAN_ONLY_ACCESS");
    }
    @Test void refrigeratedLabelDoesNotBypassSetpointCompatibility() {
        jdbc.update("update vehicles set min_c=-25,max_c=-18 where id='DEMO-COLD'");
        fails(order("DEMO-FRESH","DEMO-MILK",1),plan("DEMO-COLD",10),"TEMPERATURE_INCOMPATIBLE");
    }
    @Test void depotAndAvailabilityAreHardChecks() {
        UUID id=order("DEMO-FRESH","DEMO-RICE",1);
        jdbc.update("update vehicles set depot_code='KANDY' where id='DEMO-DRY'");
        fails(id,plan("DEMO-DRY",10),"DEPOT_MISMATCH");
        jdbc.update("update vehicles set depot_code='PELIYAGODA',available=false where id='DEMO-DRY'");
        fails(id,plan("DEMO-DRY",10),"VEHICLE_UNAVAILABLE");
    }
    @Test void weeklyFuelAndWindowIntersectionAreEnforcedForFixture() {
        UUID id=order("DEMO-FRESH","DEMO-RICE",1);
        fails(id,plan("DEMO-DRY",121),"WEEKLY_FUEL_EXCEEDED");
        fails(id,new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",1,Instant.parse("2026-10-05T03:00:00Z"),Instant.parse("2026-10-05T05:00:00Z"),10,"Test late trip"),"WINDOW_MISSED");
    }
    @Test void overlappingTripsCannotReserveSameVehicle() {
        operations.publish(account("dispatcher"),order("DEMO-FRESH","DEMO-RICE",1),plan("DEMO-DRY",10));
        var second=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",2,Instant.parse("2026-10-05T01:00:00Z"),Instant.parse("2026-10-05T02:10:00Z"),10,"Overlapping fixture");
        fails(order("DEMO-FRESH","DEMO-RICE",1),second,"TRIP_OVERLAP");
    }
    @Test void allTripFuelCountsAndThirdTripIsRejected() {
        var first=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",1,Instant.parse("2026-10-04T22:30:00Z"),Instant.parse("2026-10-04T23:45:00Z"),60,"Early synthetic run");
        operations.publish(account("dispatcher"),order("DEMO-FRESH","DEMO-RICE",1),first);
        var second=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",2,Instant.parse("2026-10-05T00:15:00Z"),Instant.parse("2026-10-05T01:15:00Z"),61,"Second synthetic run");
        fails(order("DEMO-FRESH","DEMO-RICE",1),second,"WEEKLY_FUEL_EXCEEDED");
        second=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",2,second.departureAt(),second.returnAt(),60,second.reason());
        operations.publish(account("dispatcher"),order("DEMO-FRESH","DEMO-RICE",1),second);
        fails(order("DEMO-FRESH","DEMO-RICE",1),plan("DEMO-DRY",1),"TRIP_LIMIT");
    }
    @Test void restrictedScopesAndStalePublicationAreRejected() {
        assertThatThrownBy(() -> operations.create(account("manager"),new Contracts.CreateOrder("DEMO-OUTSIDE",LocalDate.of(2026,10,5),List.of(new Contracts.Item("DEMO-TV",1))))).isInstanceOf(ApiException.class);
        UUID id=order("DEMO-FRESH","DEMO-RICE",1);
        assertThatThrownBy(() -> operations.publish(account("manager"),id,plan("DEMO-DRY",10))).isInstanceOf(ApiException.class);
        operations.publish(account("dispatcher"),id,plan("DEMO-DRY",10));
        fails(id,plan("DEMO-DRY",10),"STALE_VERSION");
    }
    @Test void csrfProtectsLoginAndUnauthenticatedRequestsFail() throws Exception {
        mvc.perform(get("/api/v1/orders")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").param("username","manager").param("password","WaypointDemo!2026")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }
    @Test void recoveredProofStillRequiresAnExplanationForNewShortage() {
        UUID id=order("DEMO-FRESH","DEMO-RICE",2);
        var current=operations.publish(account("dispatcher"),id,plan("DEMO-DRY",10));
        UUID line=(UUID)((Map<?,?>)((List<?>)current.get("lines")).getFirst()).get("id");
        current=operations.loading(account("loader"),id,new Contracts.Quantities(1,List.of(new Contracts.Quantity(line,2)),"NONE"));
        current=operations.release(account("loader"),id,((Number)current.get("version")).intValue());
        current=operations.start(account("driver"),id,((Number)current.get("version")).intValue());
        int version=((Number)current.get("version")).intValue();
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
        var unexplained=new Contracts.Receive(version,List.of(new Contracts.Quantity(line,1)),"");
        assertThatThrownBy(() -> operations.acceptRecoveredProof(account("dispatcher"),id,version,unexplained,"image/png",png,Instant.now()))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.code).isEqualTo("DELIVERY_ISSUE_REQUIRED"));
        assertThat(operations.detail(account("dispatcher"),id).get("status")).isEqualTo("IN_TRANSIT");
    }
    @Test void deferralsHaveOwnerReasonAndNextEligibleDate() {
        UUID id=order("DEMO-FRESH","DEMO-RICE",1000);
        var result=operations.defer(account("dispatcher"),id,new Contracts.Defer(0,"All demo vehicles fail weight capacity",LocalDate.of(2026,10,6)));
        assertThat(result.get("status")).isEqualTo("DEFERRED");
        var decisions=(List<?>)result.get("deferrals");
        assertThat(decisions).hasSize(1);
        assertThat(((Map<?,?>)decisions.getFirst()).get("owner_id")).isEqualTo("DEMO-DISPATCHER");
    }
    @Test void consecutiveDeferralsCarryHistoryAcrossOperatingDays() {
        UUID first=order("DEMO-FRESH","DEMO-RICE",1000);
        operations.defer(account("dispatcher"),first,new Contracts.Defer(0,"Weight exceeds demo fleet",LocalDate.of(2026,10,6)));
        UUID next=(UUID)operations.create(account("manager"),new Contracts.CreateOrder("DEMO-FRESH",LocalDate.of(2026,10,6),List.of(new Contracts.Item("DEMO-RICE",1000)))).get("id");
        var result=operations.defer(account("dispatcher"),next,new Contracts.Defer(0,"Still exceeds fleet",LocalDate.of(2026,10,7)));
        assertThat(((Map<?,?>)((List<?>)result.get("deferrals")).getFirst()).get("consecutive_skips")).isEqualTo(2);
    }
    @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentPublishersCannotBothCommit() throws Exception {
        UUID id=(UUID)operations.create(account("manager"),new Contracts.CreateOrder("DEMO-FRESH",LocalDate.of(2026,10,19),List.of(new Contracts.Item("DEMO-RICE",1)))).get("id");
        var plan=new Contracts.Publish(0,"DEMO-DRY","DEMO-LOADER",1,Instant.parse("2026-10-19T00:00:00Z"),Instant.parse("2026-10-19T02:00:00Z"),10,"Concurrent test on a separate fixture week");
        Account dispatcher=account("dispatcher");
        var gate=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> publish=() -> {
                gate.await();
                try { operations.publish(dispatcher,id,plan); return "COMMITTED"; }
                catch(ApiException e) { return e.code; }
            };
            var a=pool.submit(publish); var b=pool.submit(publish); gate.countDown();
            assertThat(List.of(a.get(15,java.util.concurrent.TimeUnit.SECONDS),b.get(15,java.util.concurrent.TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("COMMITTED","STALE_VERSION");
        }
        assertThat(jdbc.queryForObject("select count(*) from runs where order_id=?",Integer.class,id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_events where order_id=? and event='PLAN_PUBLISHED'",Integer.class,id)).isEqualTo(1);
    }
}
