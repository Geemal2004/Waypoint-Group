# Physical constraints and selected policies

| Constraint | Meaning | Current enforcement |
| --- | --- | --- |
| Capacity | Weight kg AND volume m³ | Independent fixture publication checks |
| Temperature | Cold products need a compatible entire-load/vehicle setpoint | Demo ranges checked; source unknown, source publication disabled |
| Access | van_only needs van; mall windows fixed | Vehicle type and fixture schedule/window intersection; road arrival feasibility pending |
| Depot | Vehicle serves its assigned depot | Server scope and assignment checks |
| Fuel | Road km / km-per-litre consumes weekly litres | Combined declared fixture reservations; road-derived fuel pending |
| Trips | Maximum two non-overlapping daily trips | Serialized vehicle reservations; declared synthetic 30-minute turnaround |
| Calendar/cutoff | Eligible days; next-day orders close 16:00 Asia/Colombo | Source calendar imported; explicit October demo calendar; boundary tests |

Selected policies remain separate from physical capability: all refrigerated vehicles reserved for Fresh; dry vehicles shared; one brand/district per run; no ambient/cold mixing. The API checks Fresh-only reservation independently of refrigeration. Ambient Fresh can physically use a reefer under this policy. Single-stop fixture runs satisfy brand/district grouping; multi-stop validation remains pending.

Source data labels reefer without setpoints/frozen certification. Unknown capabilities remain null. Demo ranges and products are declared fixture assumptions.

## Verified booklet budget interpretation

Booklet pp20–21 defines Datathon Task 2B: outbound district time + inter-stop time × (orders−1) + handling allowances. Return travel is excluded because the budgets already allow for it. Across at most two daily trips, Fresh uses 270 minutes (03:30–08:00), while Style and Tech share 480 minutes in a separate window. These are daily category budgets.

Operational road scheduling must explicitly calculate travel, waits, service, return and turnaround. Do not double-count returns in Task 2B or omit them in operational overlap/fuel accounting. The fixture endpoint does not prove road/budget feasibility; non-demo publication is rejected.

## Deferrals and remaining limits

RECEIVED is unallocated. DEFERRED requires a persisted reason, owner and next eligible date. Consecutive skips propagate by outlet/temperature across preceding eligible dates, without double-counting same-day orders. Receipt/recovered delivery clears deferred status, retaining history. Replanning a deferred order remains pending.

Manual reasons never bypass physical checks. Source routing requires missing coordinates and prepared OSRM data. No straight-line substitute is represented as road routing.
