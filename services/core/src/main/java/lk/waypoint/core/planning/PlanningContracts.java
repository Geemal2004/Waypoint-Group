package lk.waypoint.core.planning;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class PlanningContracts {
    private PlanningContracts() {}
    public record Stop(@NotNull UUID orderId,@Min(0) int expectedVersion) {}
    public record Trip(UUID existingTripId,@NotBlank String vehicleId,@Min(1) @Max(2) int trip,
        @NotBlank String loaderId,@NotNull Instant departureAt,@NotEmpty @Size(max=50) List<@Valid Stop> stops) {}
    public record Deferred(@NotNull UUID orderId,@Min(0) int expectedVersion,@NotBlank @Size(max=500) String reason,@NotNull LocalDate nextDay) {}
    public record Plan(@NotNull LocalDate day,@Min(0) int expectedPlanVersion,
        @NotNull @Size(max=60) List<@Valid Trip> trips,@NotNull @Size(max=500) List<@Valid Deferred> deferred,
        @NotBlank @Size(max=500) String reason) {}
    public record Propose(@NotNull LocalDate day,@NotNull @Size(max=500) List<UUID> orderIds) {}
}
