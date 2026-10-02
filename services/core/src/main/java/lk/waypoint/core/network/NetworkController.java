package lk.waypoint.core.network;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NetworkController {
    private final JdbcTemplate jdbc;

    public NetworkController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/api/v1/network")
    public NetworkSummary network() {
        var brands = jdbc.query("select code, name, outlet_count from brands order by code",
            (row, index) -> new Brand(row.getString("code"), row.getString("name"), row.getInt("outlet_count")));
        return new NetworkSummary("Waypoint Group", "foundation", brands,
            jdbc.queryForObject("select count(*) from depots", Integer.class));
    }

    public record Brand(String code, String name, int outletCount) {}
    public record NetworkSummary(String name, String implementationStage, List<Brand> brands, int depots) {}
}
