package lk.waypoint.core.workflow;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class Contracts {
    private Contracts() {}
    public record Item(@NotBlank String productId,@Min(1) @Max(100000) int quantity) {}
    public record CreateOrder(@NotBlank String outletId,@NotNull LocalDate day,@NotEmpty @Size(max=100) List<@Valid Item> items) {}
    public record Publish(@Min(0) int expectedVersion,@NotBlank String vehicleId,@NotBlank String loaderId,
        @Min(1) @Max(2) int trip,@NotNull Instant departureAt,@NotNull Instant returnAt,
        @Positive double estimatedFuelL,@NotBlank @Size(max=500) String reason) {}
    public record Quantity(@NotNull UUID lineId,@Min(0) int quantity) {}
    public record Quantities(@Min(0) int expectedVersion,@NotEmpty @Size(max=100) List<@Valid Quantity> lines,
        @NotBlank @Pattern(regexp="SHORTAGE|DAMAGE|NONE") String reason) {}
    public record Version(@Min(0) int expectedVersion) {}
    public record Approval(@Min(0) int expectedVersion,@NotBlank @Size(max=500) String reason) {}
    public record Receive(@Min(0) int expectedVersion,@NotEmpty @Size(max=100) List<@Valid Quantity> lines,@NotNull @Size(max=500) String issue) {}
    public record Defer(@Min(0) int expectedVersion,@NotBlank @Size(max=500) String reason,@NotNull LocalDate nextDay) {}
    public record SyncDelivery(@NotNull UUID actionId,@NotBlank @Size(max=80) String deviceId,@NotNull Instant capturedAt,@Valid @NotNull Receive delivery) {}
    public record ResolveConflict(@Min(0) int expectedVersion,boolean acceptDelivery,@NotBlank @Size(max=500) String reason) {}
}
