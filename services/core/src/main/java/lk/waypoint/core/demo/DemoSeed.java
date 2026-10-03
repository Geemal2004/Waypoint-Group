package lk.waypoint.core.demo;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.transaction.annotation.Transactional;

@Component
@Order(0)
@ConditionalOnProperty(name="waypoint.demo-seed", havingValue="true")
public class DemoSeed implements CommandLineRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    public DemoSeed(JdbcTemplate jdbc, PasswordEncoder passwords) { this.jdbc=jdbc; this.passwords=passwords; }
    @Override @Transactional public void run(String... args) {
        for (var role: Map.of("manager","MANAGER","dispatcher","DISPATCHER","loader","LOADER","driver","DRIVER").entrySet()) {
            jdbc.update("insert into accounts(id,username,display_name,password_hash,role,depot_code,demo) values(?,?,?,?,?,'PELIYAGODA',true) on conflict(id) do nothing",
                "DEMO-"+role.getValue(),role.getKey(),"Demo "+role.getKey(),passwords.encode("WaypointDemo!2026"),role.getValue());
        }
        outlet("DEMO-FRESH","Demo Fresh · Kelaniya","FRESH","ANY","05:00","08:00");
        outlet("DEMO-STYLE","Demo Style · Mall access","STYLE","VAN_ONLY","10:00","12:00");
        outlet("DEMO-TECH","Demo Tech · Protected receiving","TECH","ANY","09:00","16:00");
        outlet("DEMO-OUTSIDE","Demo outside manager scope","TECH","ANY","09:00","16:00");
        for(String id: new String[]{"DEMO-FRESH","DEMO-STYLE","DEMO-TECH"}) jdbc.update("insert into account_outlets values('DEMO-MANAGER',?) on conflict do nothing",id);
        product("DEMO-RICE","Rice cartons","FRESH","carton",20,0.04,"AMBIENT",null,null,"Keep dry");
        product("DEMO-MILK","Chilled milk crates","FRESH","crate",12,0.03,"CHILLED",2.0,5.0,"Keep chilled 2–5°C");
        product("DEMO-FROZEN","Frozen vegetable cartons","FRESH","carton",10,0.035,"FROZEN",-22.0,-18.0,"Keep frozen −22 to −18°C; separate from chilled");
        product("DEMO-GARMENTS","Hanging garment cartons","STYLE","carton",8,0.15,"AMBIENT",null,null,"Upright; mall receiving 10:00–12:00");
        product("DEMO-TV","55-inch television","TECH","unit",18,0.25,"AMBIENT",null,null,"Fragile / high value · keep upright; inspect packaging");
        product("DEMO-WASHER","Washing machine","TECH","unit",65,0.5,"AMBIENT",null,null,"Heavy / protected handling · two-person receiving");
        vehicle("DEMO-DRY","Demo dry-box truck","TRUCK",false,null,null,1000,8,120);
        vehicle("DEMO-VAN","Demo dry van","VAN",false,null,null,300,3,80);
        vehicle("DEMO-COLD","Demo refrigerated truck","TRUCK",true,-25.0,8.0,900,7,120);
        // Explicit fixture calendar: not an inferred source calendar. Fixed dates make reset reproducible.
        for(LocalDate day=LocalDate.of(2026,10,5); !day.isAfter(LocalDate.of(2026,10,31)); day=day.plusDays(1)) {
            if(day.getDayOfWeek()!=java.time.DayOfWeek.SUNDAY) jdbc.update("insert into operating_days(day,demo) values(?,true) on conflict do nothing",day);
        }
        order("ambient","DEMO-FRESH","AMBIENT","DEMO-RICE",10);
        order("chilled","DEMO-FRESH","CHILLED","DEMO-MILK",20);
        order("mall","DEMO-STYLE","AMBIENT","DEMO-GARMENTS",10);
        order("protected","DEMO-TECH","AMBIENT","DEMO-TV",2);
        order("excess","DEMO-FRESH","AMBIENT","DEMO-RICE",1000);
        order("offline","DEMO-FRESH","AMBIENT","DEMO-RICE",4);
    }
    private void outlet(String id,String name,String brand,String access,String start,String end) {
        jdbc.update("insert into outlets(id,name,brand_code,depot_code,district,access,window_start,window_end,demo) values(?,?,?,'PELIYAGODA','Colombo',?,cast(? as time),cast(? as time),true) on conflict(id) do nothing",id,name,brand,access,start,end);
    }
    private void product(String id,String name,String brand,String unit,double kg,double m3,String temp,Double min,Double max,String handling) {
        jdbc.update("insert into products values(?,?,?,?,?,?,?,?,?,?,true) on conflict(id) do nothing",id,name,brand,unit,kg,m3,temp,min,max,handling);
    }
    private void vehicle(String id,String name,String kind,boolean cold,Double min,Double max,double kg,double m3,double fuel) {
        jdbc.update("insert into vehicles(id,name,depot_code,kind,refrigerated,min_c,max_c,weight_kg,volume_m3,weekly_fuel_l,driver_id,available,demo) values(?,?,'PELIYAGODA',?,?,?,?,?,?,?,'DEMO-DRIVER',true,true) on conflict(id) do nothing",id,name,kind,cold,min,max,kg,m3,fuel);
    }
    private void order(String scenario,String outlet,String temperature,String product,int quantity) {
        var id=java.util.UUID.nameUUIDFromBytes(("waypoint-demo-"+scenario).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        int inserted=jdbc.update("insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason) values(?,?,'DEMO-MANAGER','2026-10-05',?,'RECEIVED',true,?) on conflict(id) do nothing",id,outlet,temperature,"Synthetic judge scenario: "+scenario+". Demo calendar; source calendar ends June 2026.");
        if(inserted>0) {
            jdbc.update("insert into order_lines(id,order_id,product_id,ordered) values(?,?,?,?)",java.util.UUID.nameUUIDFromBytes(("waypoint-demo-line-"+scenario).getBytes(java.nio.charset.StandardCharsets.UTF_8)),id,product,quantity);
            jdbc.update("insert into audit_events(account_id,order_id,event,details) values('DEMO-MANAGER',?,'DEMO_ORDER_SEEDED',?)",id,"Synthetic "+scenario+" order; supplied records are retained separately.");
        }
    }
}
