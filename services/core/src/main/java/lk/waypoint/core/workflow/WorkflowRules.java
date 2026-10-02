package lk.waypoint.core.workflow;

import java.util.Map;
import java.util.Set;

public final class WorkflowRules {
    private WorkflowRules() {}
    private static final Map<String,Set<String>> NEXT = Map.of(
        "RECEIVED",Set.of("SCHEDULED","DEFERRED"), "SCHEDULED",Set.of("LOADING","DEFERRED"),
        "LOADING",Set.of("RELEASED","DEFERRED"), "RELEASED",Set.of("IN_TRANSIT"),
        "IN_TRANSIT",Set.of("ARRIVED","DEFERRED"), "ARRIVED",Set.of("DELIVERED","DEFERRED"), "DELIVERED",Set.of("RECEIVED_AT_STORE"));
    public static void transition(String from, String to) {
        if (!NEXT.getOrDefault(from,Set.of()).contains(to)) throw new ApiException(409,"INVALID_TRANSITION","Cannot move " + from + " to " + to + ".");
    }
    public static void quantity(int quantity, int maximum) {
        if (quantity<0 || quantity>maximum) throw new ApiException(422,"INVALID_QUANTITY","Quantity must be between zero and " + maximum + ".");
    }
    public static void require(boolean condition, String code, String message) { if (!condition) throw new ApiException(422,code,message); }
}
