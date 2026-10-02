# Dataset audit — 3 October 2026

Inspected the user-supplied Challenge Booklet.pdf (33 pages; text extraction and visual review of Task 2B budget pages) and every CSV under the supplied data folder. The repository originally contained no shared files or AGENTS.md. V1 brand totals are counts, not outlet records.

## Files, rows and identifiers

| File | Rows | Primary/join identifiers |
| --- | ---: | --- |
| General Data/calendar.csv | 910 | date |
| General Data/district_travel.csv | 12 | district; depot |
| General Data/outlets.csv | 120 | outlet_id; brand/district/depot |
| General Data/road_conditions.csv | 10,920 | district + date |
| General Data/service_allowance.csv | 9 | brand + dock_type |
| General Data/traffic_speed.csv | 576 | district + hour + monsoon |
| General Data/vehicles.csv | 60 | vehicle_id; depot |
| Training Data/deliveries_train.csv | 92,307 | delivery_id; route_id + seq_in_route → route leg |
| Training Data/route_legs_train.csv | 91,894 | leg_id; route_id + seq |
| Test Data/route_legs_test.csv | 5,014 | leg_id; route_id + seq |
| Test Data/task1_test_inputs.csv | 5,014 | delivery_id; route_id + seq_in_route |
| Test Data/task2a_test_inputs.csv | 60 | row_id; depot + brand + iso_year + iso_week |
| Test Data/task2b_peak_day_fleet.csv | 38 | scenario + vehicle_id |
| Test Data/task2b_peak_day_scenarios.csv | 85 | scenario + order_ref (outlet_id repeats) |
| Submission Templates/submission_task1.csv | 5,014 | delivery_id |
| Submission Templates/submission_task2a.csv | 60 | row_id |
| Submission Templates/submission_task2b.csv | 85 | scenario + order_ref |

The read-only auditor records exact headers, SHA256, row counts, blanks, duplicate rows and ranges in private local data/private/dataset-audit.json. No malformed or exact duplicate rows were found. Training/test delivery IDs and route join keys are unique. Outlet IDs, vehicle IDs, order calendar references and dispatched-order-to-leg outlet/date joins passed with zero relationship errors.

Training statuses: 90,351 attempted, 1,543 deferred, 413 not_run. The 413 not_run records correctly have blank dispatch/route/vehicle/arrival fields. Blank mall windows (108 outlets; 83 scenario orders) mean non-mall access. Blank festival names (892 calendar rows) mean no named festival. Prediction templates intentionally have empty answers; Task 2B contains placeholders.

## Headers and units

- **Outlets:** outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time. Access values include normal, van_only and mall_dock. Windows are HH:MM; mall_window is HH:MM-HH:MM.
- **Vehicles:** vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot. kg, m³, km/litre and litres are explicit (booklet p28). There are 16 reefers including four vans.
- **Calendar:** date, dow, dow_name, is_weekend, iso_year, iso_week, is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating. ISO dates span 2024-01-01 through 2026-06-28. Monday is dow=0. Use is_operating rather than weekday assumptions. There are no supplied October 2026 dates.
- **District travel:** district, depot, road_class, free_flow_kmh, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min. Units are km/h, km and minutes (p29). These are district references, not an outlet-specific OSRM matrix.
- **Service allowance:** brand, dock_type, service_allowance_min. Minutes; a planning allowance rather than an observed duration (p30).
- **Traffic:** district, hour, monsoon, speed_index. Hour 0–23; relative speed, 100=clear conditions. **Road conditions:** district, date, disruption_index; 100=clear, lower=disrupted. Neither supplies live traffic.
- **Order history / Task 1 test:** delivery_id, order_date, dispatch_date, dispatch_status, outlet_id, brand, district, depot, temp_requirement, order_units, order_weight_kg, order_volume_m3, route_id, seq_in_route, vehicle_id, vehicle_type, vehicle_temp, planned_arrival_time, window_open_time, window_close_time. Units mean items/cases, not a product catalogue. Weights and volumes are order aggregates.
- **Training legs:** leg_id, date, route_id, depot, vehicle_id, vehicle_type, vehicle_temp, brand, district, seq, from_point, to_outlet, distance_km, planned_depart_time, planned_travel_duration_min, planned_arrival_time, actual_depart_time, actual_travel_duration_min, arrival_time, leave_outlet_time, monsoon, dow. Test legs omit the four actual-time fields. Clock times are HH:MM; durations are minutes. Dates/times represent Sri Lanka operations.
- **Task 2A:** row_id, depot, brand, iso_year, iso_week. Ten future weeks × two depots × three brands; targets total/chilled volume in m³. Chilled is zero for Style and Tech (p17).
- **Task 2B:** scenario, order_ref, outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time, temp_requirement, order_units, order_weight_kg, order_volume_m3, deferred_yesterday, days_since_last_served. Fleet: scenario, vehicle_id, status. Only listed available S1 vehicles may be allocated.
- **Templates:** Task 1 delivery_id/pred_service_min/pred_late_prob; Task 2A row_id/pred_total_volume_m3/pred_chilled_volume_m3; Task 2B scenario/order_ref/outlet_id/decision/vehicle_id/trip_id.

There are no coordinates, outlet names, product names, dimensions, currency/prices, contacts or chilled/frozen setpoint ranges. Source labels derive from brand + district + ID; they are not claimed source names. Imported setpoints remain null. Source driver identities are disabled, labelled unprovisioned and cannot sign in. Production publication remains blocked on verified capabilities and road routing.

## Budget interpretation

Booklet pp20–21 specifies Task 2B: outbound district travel + (orders−1) inter-stop travel + per-stop handling allowance. Exclude return travel because these budgets already allow for it. The 270 Fresh minutes and 480 combined Style/Tech minutes apply per vehicle per day, across its maximum two trips in separate windows, rather than per run.

Hackathon road scheduling must explicitly include return and turnaround. Do not use the Task 2B exclusion in road scheduling, or imply the district formula proves outlet-window feasibility.

## Import, fixture and future ML

tools/import_network.py validates seven General Data files and generates private SQL. Source fields/IDs remain in source_records; outlets, vehicles and eligible dates project into operational tables. Spring imports transactionally after Flyway, records the digest and does not overwrite operational rows. History/test answers are not imported as live orders.

The booklet describes all competition data as synthetic. Supplied competition records remain distinct from our DEMO-* entities and six judge orders. Demo products have declared kg/m³/setpoints. The October calendar and Monday Style schedule are explicit fixture assumptions. No road ETA is asserted.

History supports later service-time/lateness labels and weekly demand modelling. Service time subtracts early waiting: leave time − max(actual arrival, window open). Lateness compares actual arrival with close. Handle overnight chronology explicitly; use time-based splits; keep actual times out of inference features. No model metrics or training are claimed. Booklet p15 makes Datathon integration optional for Hackathon; the user's latest clarification keeps that integration for Datathon.

Booklet p22 restricts data publication. Raw files, generated SQL, detailed audits and PDF extracts stay gitignored and are not embedded in public images. Fresh clones need privately supplied network files prepared locally.

Figma calls returned Unknown tool(figma.get_design_context); browser access also failed. Role screens/rationales/tokens have not been inspected. Exported references are still required for product UI implementation.
