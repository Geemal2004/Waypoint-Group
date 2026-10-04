package lk.waypoint.core.planning;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.LocalDate;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lk.waypoint.core.identity.Account;
import lk.waypoint.core.workflow.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class PlanningDataTest {
    private final JdbcTemplate db=mock(JdbcTemplate.class);
    private final PlanningService planner=new PlanningService(db,mock(RoutingAdapter.class),new ObjectMapper(),mock(OperationsService.class));
    private final Account dispatcher=new Account("dispatcher","dispatcher","Dispatcher","","DISPATCHER","PELIYAGODA",true);

    private Map<String,Object> order() {
        var order=new HashMap<String,Object>();
        order.put("id",UUID.randomUUID());order.put("outlet_id","DEMO-FRESH");
        order.put("brand_code","FRESH");order.put("source_weight_kg",20);order.put("source_volume_m3",0.04);
        when(db.queryForList(startsWith("select o.*"),eq("PELIYAGODA"),any(LocalDate.class))).thenReturn(List.of(order));
        return order;
    }
    @Test void missingDockIdentifiesTheOutlet() {
        order();
        assertThatThrownBy(()->planner.context(dispatcher,LocalDate.of(2026,10,5)))
            .isInstanceOf(ApiException.class).hasMessageContaining("Dock type is missing for outlet DEMO-FRESH");
    }
    @Test void missingAllowanceIdentifiesTheBrandAndDock() {
        order().put("dock_type","street");
        assertThatThrownBy(()->planner.context(dispatcher,LocalDate.of(2026,10,5)))
            .isInstanceOf(ApiException.class).hasMessageContaining("FRESH / street").hasMessageContaining("service allowance import");
    }
}
