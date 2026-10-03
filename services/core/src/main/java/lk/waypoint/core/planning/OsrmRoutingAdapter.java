package lk.waypoint.core.planning;

import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import lk.waypoint.core.workflow.ApiException;

@Component
public class OsrmRoutingAdapter implements RoutingAdapter {
    private final String base;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    public OsrmRoutingAdapter(@Value("${waypoint.osrm-url:http://osrm:5000}") String base,ObjectMapper json) { this.base=base.replaceAll("/$","");this.json=json; }
    private JsonNode request(String service,List<Point> points,String options) {
        String coordinates=points.stream().map(p -> p.longitude()+","+p.latitude()).collect(Collectors.joining(";"));
        String radiuses=points.stream().map(p -> "250").collect(Collectors.joining(";"));
        try {
            var response=http.send(HttpRequest.newBuilder(URI.create(base+"/"+service+"/v1/driving/"+coordinates+"?radiuses="+radiuses+"&"+options)).timeout(Duration.ofSeconds(20)).GET().build(),HttpResponse.BodyHandlers.ofString());
            JsonNode data=json.readTree(response.body());
            String code=data.path("code").asText();
            if(Set.of("NoRoute","NoSegment","NoTable").contains(code)) throw new ApiException(422,"ROUTING_UNREACHABLE","OSRM cannot reach or snap one of these destinations. Check the private coordinate mapping.");
            if(response.statusCode()!=200 || !"Ok".equals(code)) throw new ApiException(503,"ROUTING_UNAVAILABLE","OSRM returned an invalid routing response. Publication is blocked; retry or repair routing.");
            for(String key:List.of("waypoints","sources","destinations")) for(JsonNode waypoint:data.path(key)) {
                if(!waypoint.has("distance") || waypoint.path("distance").asDouble()>250) throw new ApiException(422,"ROUTING_SNAP_DISTANCE","A destination is more than 250 m from a routable road.");
            }
            if(data.has("fallback_speed_cells")) throw new ApiException(503,"ROUTING_FALLBACK_REJECTED","Estimated straight-line cells are not operational road routes.");
            return data;
        } catch(ApiException e) {throw e;}
        catch(InterruptedException e) {Thread.currentThread().interrupt();throw new ApiException(503,"ROUTING_UNAVAILABLE","Routing was interrupted. No route was published.");}
        catch(Exception e) {throw new ApiException(503,"ROUTING_UNAVAILABLE","Cannot reach OSRM. No straight-line fallback is used; publication is blocked.");}
    }
    public RoadRoute route(List<Point> points) {
        var data=request("route",points,"overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=false");
        var result=data.path("routes").path(0);
        List<Leg> legs=new ArrayList<>();
        for(var leg:result.path("legs")) {
            double seconds=leg.path("duration").asDouble(-1),metres=leg.path("distance").asDouble(-1);
            if(!Double.isFinite(seconds)||!Double.isFinite(metres)||seconds<0||metres<0) throw new ApiException(503,"ROUTING_INVALID","OSRM returned invalid road metrics.");
            legs.add(new Leg(seconds,metres));
        }
        if(legs.size()!=points.size()-1 || !"LineString".equals(result.path("geometry").path("type").asText())) throw new ApiException(503,"ROUTING_INVALID","OSRM did not return all legs and route geometry.");
        return new RoadRoute(legs,json.convertValue(result.get("geometry"),Object.class),Map.of("provider","OSRM","profile","car","dataVersion",data.path("data_version").asText("not supplied"),"units","seconds/metres","liveTraffic",false,"coordinatesSupplemental",points.stream().anyMatch(Point::supplemental)));
    }
    public Map<String,Object> matrix(List<Point> points) {
        var data=request("table",points,"annotations=duration,distance");
        for(String key:List.of("durations","distances")) {
            var rows=data.path(key);
            if(rows.size()!=points.size()) throw new ApiException(503,"ROUTING_INVALID","Incomplete OSRM matrix.");
            for(var row:rows) {
                if(row.size()!=points.size()) throw new ApiException(503,"ROUTING_INVALID","Incomplete OSRM matrix row.");
                for(var cell:row) if(cell.isNull() || !cell.isNumber() || cell.asDouble()<0 || !Double.isFinite(cell.asDouble())) throw new ApiException(422,"ROUTING_UNREACHABLE","An OSRM matrix destination is unreachable. No estimated fallback is used.");
            }
        }
        return Map.of("durations",json.convertValue(data.get("durations"),Object.class),"distances",json.convertValue(data.get("distances"),Object.class),"pointIds",points.stream().map(Point::id).toList(),"provider","OSRM");
    }
}
