package lk.waypoint.core.planning;

import java.util.*;
public interface RoutingAdapter {
    record Point(String id,double longitude,double latitude,String provenance,boolean supplemental) {}
    record Leg(double seconds,double metres) {}
    record RoadRoute(List<Leg> legs,Object geometry,Map<String,Object> metadata) {}
    RoadRoute route(List<Point> points);
    Map<String,Object> matrix(List<Point> points);
}
