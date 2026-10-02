# Data model

Implemented tables: `brands(code, name, outlet_count)` and `depots(code, name)`. Spatial extension enabled. Counts are reference totals from the brief, not imported outlet rows.

Target model (not yet migrated):

| Entity | Relationships / important fields |
| --- | --- |
| Account | Role; depot/outlet scope; password hash |
| Outlet | Brand, depot, location, access, windows, district |
| Vehicle | Depot, weight/volume limits, temperature capabilities, fuel budget |
| Order | Outlet, operating date, temperature class, cutoff status; lines |
| Run | Vehicle, operating date, trip number, brand, district, plan version |
| Stop | Run, sequence, outlet, order assignments, arrival/service estimates |
| Loading check | Stop/order line, loaded quantity, damage/shortfall evidence |
| Delivery attempt | Stop, plan version, delivered quantities, local capture/server timestamps |
| Receipt | Delivery attempt, received quantities and discrepancies |
| Deferral | Order, reason, decision owner, next eligible date, history |
| Sync action | Unique action ID, account, expected version, recorded result |

Ordered, loaded, delivered and received quantities remain distinct. Temperature setpoints must be compatible across the load; a refrigerated label alone is insufficient. Depot and outlet geometry must come from validated source data. Physical constraints and user-selected Fresh-only/separate-load policies are explicitly distinguished.
