# Physical constraints and selected policies

| Constraint | Meaning | Current enforcement |
| --- | --- | --- |
| Capacity | Weight kg AND volume m³ | Exact source aggregates summed independently per trip; whole orders only |
| Temperature | Cold products need a compatible entire-load/vehicle setpoint | Entire load intersection checked; judge 2–5°C declarations labelled supplemental |
| Access | van_only needs van; mall windows fixed | Vehicle type and OSRM arrival + waiting + source unloading must fit the window |
| Depot | Vehicle serves its assigned depot | Server scope and assignment checks |
| Fuel | Road km / km-per-litre consumes weekly litres | Road-derived parent trip reservations plus legacy reservations, counted once per Monday–Sunday week |
| Trips | Maximum two non-overlapping daily trips | Serialized combined brand reservations; road depot return plus configured 30-minute supplemental reload allowance |
| Calendar/cutoff | Eligible days; next-day orders close 16:00 Asia/Colombo | Source calendar imported; explicit October demo calendar; boundary tests |

Selected policies remain separate from physical capability: refrigerated vehicles are reserved for Fresh when FRESH_ONLY_REEFERS=true; dry vehicles are shared. Each trip has one brand/district and temperature class. Fresh dry/chilled source orders remain separate. Ambient Fresh may physically use a reefer. Python proposes these rules, and Spring independently checks them. Scenario workshop status, enabled driver/loader and depot ownership are also required.

Source data labels reefer without setpoints/frozen certification. Unprovisioned source capabilities remain null. The authorised S1 judge supplement declares 2–5°C ranges and town road waypoints, with provenance. It does not establish real cold certification or actual outlet geolocation.

## Verified booklet budget interpretation

Booklet pp20–21 defines Datathon Task 2B: outbound district time + inter-stop time × (orders−1) + handling allowances. Return travel is excluded because the budgets already allow for it. Across at most two daily trips, Fresh uses 270 minutes (03:30–08:00), while Style and Tech share 480 minutes in a separate window. These are daily category budgets.

Operational scheduling calculates road travel, waits, source service, return and turnaround. Do not double-count returns in Task 2B or omit them in overlap/fuel accounting. Fresh starts no earlier than 03:30 and unloading finishes by 08:00. Booklet category totals apply across both daily trips. Legacy single-order publication stays restricted to DEMO fixtures; source publication uses the road-backed planning endpoint.

## Deferrals and remaining limits

RECEIVED is unallocated. DEFERRED requires a persisted reason, owner and next eligible date. Consecutive skips propagate by outlet/temperature across preceding eligible dates, without double-counting same-day orders. Receipt/recovered delivery clears deferred status, retaining history. Replanning a deferred order remains pending.

Manual reasons never bypass physical checks. OSRM must be reachable; missing mappings, unreachable destinations and routing failure explicitly block publication. No straight-line substitute is represented as road routing. The car profile has no live traffic, vehicle dimensions or truck-specific restrictions. Historical judge dates replay source orders; capture/audit timestamps are actual demonstration timestamps.

Routing contract: [OSRM v5.27.1 HTTP API](https://github.com/Project-OSRM/osrm-backend/blob/v5.27.1/docs/http.md). Extract provider: [Geofabrik Sri Lanka](https://download.geofabrik.de/asia/sri-lanka.html). Preparation pins the dated extract and records its checksums and the resolved image digest privately.
