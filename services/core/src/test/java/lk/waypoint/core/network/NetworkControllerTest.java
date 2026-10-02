package lk.waypoint.core.network;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class NetworkControllerTest {
    @Test
    @SuppressWarnings("unchecked")
    void usesDatabaseReferenceData() {
        var jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
        when(jdbc.query(eq("select code, name, outlet_count from brands order by code"), any(RowMapper.class)))
            .thenReturn(List.of(new NetworkController.Brand("FRESH", "Waypoint Fresh", 80)));
        when(jdbc.queryForObject("select count(*) from depots", Integer.class)).thenReturn(2);
        var result = new NetworkController(jdbc).network();
        assertThat(result.brands()).hasSize(1);
        assertThat(result.depots()).isEqualTo(2);
    }
}
