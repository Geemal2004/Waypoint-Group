# Implemented data model

Flyway V1–V5 run automatically. PostgreSQL constraints enforce identity, quantity bounds and relationships. Timestamps are UTC; operating dates/windows use Asia/Colombo. Device capture and server acceptance times remain separate.

| Table | Relationships and fields |
| --- | --- |
| brands / depots | Reference keys; brands include brief outlet totals |
| accounts | Unique username, BCrypt hash, enabled, role, depot, demo marker |
| account_outlets | Manager account → explicitly permitted outlets |
| outlets | Source ID, derived/display name, brand/depot/district, access, windows, dock/mall metadata |
| products | Demo catalogue; unit, kg/m³, handling, temperature class/range |
| operating_days | Eligible supplied dates plus separately marked October demo dates |
| vehicles | Depot, driver identity, both capacities, availability, fuel litres/km-per-litre, optional setpoints |
| orders | Outlet, creator, date, temperature, status, optimistic version, schedule explanation, source boundary |
| order_lines | Unique product per order; distinct ordered/loaded/delivered/received quantities |
| runs | Stable per-order handoff; optional parent route_trip_id, versioned plan, loader, releases/shortage approval/proof state |
| planning_days / plan_revisions | Locked depot/date version; immutable submitted and validated snapshots and author/time |
| route_trips | Unique vehicle/date/slot 1–2; plan revision, loader, road geometry/metrics, return, fuel and booklet minutes |
| route_stops | Unique order/run; ordered delivery and reverse loading sequence, arrival/wait/service, stable stop UUID |
| routing_points | Private coordinates with provenance and mandatory supplemental flag |
| scenario_fleet | Source scenario vehicle availability; workshop vehicles cannot be proposed/published |
| loading_issues | Line/run shortage or damage, quantity, creator/time |
| proofs | Accepted order proof, driver, validated image bytes/type, capture/acceptance times |
| receipts | Order/account, receiving issue, acceptance time |
| deferrals | Owner, reason, next eligible date, consecutive skips by outlet/temperature/operating day |
| audit_events | Order/account/event/details and acceptance time |
| processed_sync_actions | Global action UUID, account/device/entity, expected version, payload/evidence digest, immutable outcome/result |
| sync_conflicts | Action/order, quantities/evidence, capture/acceptance times, decision owner/reason/state |
| source_records | Exact validated source JSONB keyed by file and original ID |
| seed_imports | Import digest/time; suppresses repeated import on restart |

Indexes cover order outlet/day/status, audit order/time, loading run, vehicle/day, sync account/time and conflict order/state. Trip numbers are 1 or 2 and unique per vehicle/day. The fixture validator checks capacities, temperature, access, depot, overlap and combined weekly fuel reservations.

Progression: RECEIVED → SCHEDULED → LOADING → RELEASED → IN_TRANSIT → ARRIVED → DELIVERED → RECEIVED_AT_STORE. Deferral is permitted before release and at an in-transit/arrived stop. Deferred offline proof enters conflict review. Approved recovery creates a manager receipt task while retaining deferral history.

Expected receipt quantity derives from delivered, then loaded, then ordered. A known loading shortage does not itself become a new receiving discrepancy. Further delivery/receiving shortfalls require reasons.

Source orders retain source_ref, scenario, exact aggregate kg/m³, days since service and previous-day skip flag. Source-unit product lines preserve aggregate quantities; they do not claim source SKU detail. Supplemental judge cold ranges and private road points carry explicit provenance. Trip starts atomically move every released handoff into transit; arrival respects earlier stops. Deferrals retain owner/reason/next day and source skip baseline. Published membership stays fixed; untouched stop order/timing may be revised. Planning jobs, live locations, receipt damage attachments and full deferred-order rescheduling remain future work.
