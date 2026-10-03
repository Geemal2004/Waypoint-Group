package lk.waypoint.core.planning;
import static org.assertj.core.api.Assertions.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import lk.waypoint.core.workflow.ApiException;
class OsrmRoutingAdapterTest {
    private HttpServer server;
    private OsrmRoutingAdapter adapter;
    private String response;
    private final List<RoutingAdapter.Point> points=List.of(new RoutingAdapter.Point("depot",79.9,6.9,"test",true),new RoutingAdapter.Point("outlet",79.91,6.91,"test",true));
    @BeforeEach void start()throws Exception{
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{assertThat(exchange.getRequestURI().toString()).doesNotContain("fallback_speed=");byte[] body=response.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});
        server.start();adapter=new OsrmRoutingAdapter("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
    }
    @AfterEach void stop(){server.stop(0);}
    @Test void preservesRoadUnitsAndGeometry(){
        response="{\"code\":\"Ok\",\"waypoints\":[{\"distance\":1},{\"distance\":2}],\"routes\":[{\"legs\":[{\"duration\":120,\"distance\":1000}],\"geometry\":{\"type\":\"LineString\",\"coordinates\":[[79.9,6.9],[79.91,6.91]]}}]}";
        var road=adapter.route(points);assertThat(road.legs()).containsExactly(new RoutingAdapter.Leg(120,1000));assertThat(road.metadata().get("provider")).isEqualTo("OSRM");
    }
    @Test void unreachableRoutesNeverBecomeEstimates(){
        response="{\"code\":\"NoRoute\"}";
        assertThatThrownBy(()->adapter.route(points)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("ROUTING_UNREACHABLE"));
    }
    @Test void rejectsNullMatrixCellsAndFallbackCells(){
        response="{\"code\":\"Ok\",\"durations\":[[0,null],[1,0]],\"distances\":[[0,1],[1,0]]}";
        assertThatThrownBy(()->adapter.matrix(points)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("ROUTING_UNREACHABLE"));
        response="{\"code\":\"Ok\",\"fallback_speed_cells\":[[0,1]]}";
        assertThatThrownBy(()->adapter.matrix(points)).hasMessageContaining("straight-line");
    }
    @Test void serviceFailureBlocksRouting(){server.stop(0);assertThatThrownBy(()->adapter.route(points)).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("ROUTING_UNAVAILABLE"));}
}
