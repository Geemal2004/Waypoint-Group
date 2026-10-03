# Waypoint Group

Waypoint connects four authenticated roles to PostgreSQL operations, with dataset-backed multi-stop planning, local OSRM road routes, Spring validation, versioned publication, approved shortages, driver proof and distinct store receipts. Python proposes whole-order allocations; Spring checks every constraint again before publishing. Driver proof survives offline reload and same-stop conflict review. ML remains deferred to the Datathon. See [implementation status](docs/implementation-status.md).

## Start locally

Install Docker Desktop with Compose v2, then from the repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait
```

Open **http://localhost:8080**. Flyway applies migrations and creates the four demo accounts and six repeatable scenario orders. PostgreSQL data persists across restarts. Core readiness: http://localhost:8081/actuator/health/readiness. Planning health/docs: http://localhost:8000/health and http://localhost:8000/docs.

| Role | Username | Password |
| --- | --- | --- |
| Store manager | manager | WaypointDemo!2026 |
| Dispatcher | dispatcher | WaypointDemo!2026 |
| Loader | loader | WaypointDemo!2026 |
| Driver | driver | WaypointDemo!2026 |

These are synthetic judge accounts at Peliyagoda, with server-enforced scopes and BCrypt passwords. Default bindings are local only. The application has no public deployment yet.

## Private challenge reference

The dataset judge walkthrough requires the supplied private files. Competition files, derived order rows, waypoint mappings and generated SQL stay gitignored. From the repository root, with Docker Desktop running:

```powershell
./tools/prepare-data.ps1 -SourceDirectory 'C:\private\challenge\data'
./tools/prepare-routing.ps1
docker compose --profile routing up -d osrm
./tools/prepare-planning-data.ps1 -SourceDirectory 'C:\private\challenge\data'
docker compose --profile routing up --build -d --wait
```

Preparation imports the seven General Data files and all 85 Task 2B S1 orders with their source IDs, aggregate units/kg/m³, windows and previous-day history; 38 scenario vehicle statuses are retained. The source has no outlet coordinates, SKU breakdown or refrigerated setpoints. The user authorised **labelled supplemental judge road waypoints and cold capabilities**: town road points are snapped by local OSRM, and chilled requirements/capabilities are declared 2–5°C. These do not claim actual outlet locations or certified fleet ranges. Each source order is one aggregate source-unit line, not an invented SKU catalogue. Source driver accounts remain disabled; the existing judge driver login represents the provisioned source fleet for role demonstrations.

S1 is undated. Its consistent planning simulation date is **8 January 2026**, a supplied operating day; deferrals use 9 January. All trips use Asia/Colombo. Proof capture and audit timestamps report the actual demonstration time separately. The dated Sri Lanka OSM extract and OSRM image digest/checksums are recorded privately in `data/osrm/provenance.json`. This is a replay scenario, not a live historical traffic reconstruction. See [dataset audit](docs/dataset-audit.md) and [policies](docs/constraints-and-policies.md).

## Judge walkthrough

1. Dispatcher: open **Dataset multi-stop planning**, day `2026-01-08`, and choose **Propose judge scenario** on fresh/reset state. This selects the multi-stop Fresh dry, separate chilled, mall and excess-demand cases. The queue shows source orders, kg/m³, unloading/windows and skip history. You can also select other compatible orders or propose all demand. Review actual road timing, both capacity bars, fuel litres, violations and deferred reasons before publishing.
2. For a focused reproducible scenario, `node tools/dataset-walkthrough.mjs` publishes two feasible multi-stop trips plus a separate chilled trip, including the same Fresh outlet's dry/chilled orders, van-only access, a fixed mall window and a genuine excess-volume deferral. It also checks competing/stale publication and completes the dry trip through all four roles, with shortage and retained-proof recovery. Run after the explicit judge reset; it deliberately rejects already-used scenario state.
3. Loader: select a source assignment. Follow the displayed reverse loading sequence; count every stop, record a shortage if necessary, obtain dispatcher approval and release every stop. Driver departure is held until the complete trip is released.
4. Driver: acknowledge the trip once, then follow the published stop sequence. Arrive, capture a JPEG/PNG and save proof. Store manager confirms actual received quantities separately. A known approved shortage remains part of that order.
5. Offline branch: at an arrived source stop, reload once online, disconnect/reload, then capture proof. A dispatcher deferral of that same stop creates a retained conflict on reconnect; authorised review recovers delivery without erasing the deferral. Existing proof action UUIDs and per-order versions remain stable across the trip.
6. Manual adjustments use the same server validator. Untouched published manifests can be reordered or retimed with a new plan version; a manifest is locked as soon as loading begins. Moving whole orders between proposed trips invalidates prior validation until checked again.

OSRM failure blocks proposals and publication with `ROUTING_UNAVAILABLE`; unreachable roads return `ROUTING_UNREACHABLE`. Repair the mapping/service and retry. There is no straight-line fallback. OSRM uses its car road profile, without live traffic, truck height/weight restrictions or certified cold-chain telemetry.

## Legacy workflow regression

Use separate browser profiles for each account. At phone size use approximately 390 px for loader and driver.

1. Manager: select Demo Fresh, New order, an unused October operating date, Ambient, and 10 rice cartons. Review and place. The server applies the 16:00 Colombo cutoff and explains any date change.
2. Dispatcher: select that order, choose Demo Dry truck, declare a 05:30–07:30 Colombo reservation, 10 L, trip 1, and a reason. Publish the assigned load. Both capacities, cold compatibility, access, weekly fuel and trip reservations are checked server-side. These times do not claim a road ETA.
3. Loader: select the assignment, count 8 of 10, choose Missing stock, and acknowledge/save. Release is held. Dispatcher approves the partial release with a reason; loader then releases it.
4. Driver: acknowledge the released plan/start, confirm arrival while safely stopped, select a real JPEG/PNG photo, and save proof. The screen distinguishes local save from server acceptance.
5. Manager: open the delivered order, view proof and confirm 8 received. Ordered 10, loaded 8, delivered 8 and received 8 remain distinct. The two known missing cartons do not become a new receiving discrepancy.
6. Offline branch: prepare a second assignment using Demo Van on that date. Start/arrive while online, reload once online so the PWA controls the page, disconnect and reload. Save a photo. “Saved on device · pending sync” survives another reload. Dispatcher defers **that same stop** with a reason/next day. Reconnect the driver. Both records are preserved for review; dispatcher views evidence and accepts verified delivery or keeps the server decision. Acceptance creates a receipt task and retains deferral history.
7. Tech branch: place a television order, complete its handoffs, and record Damaged packaging or Damaged product at receipt. The issue is persisted separately from driver proof. Receipt-specific photo capture is pending.

A used vehicle/date may already have reservations; choose another date or the explicit reset below. Style uses Mondays only in legacy DEMO fixtures; source Style orders use source operating days. Comparing alternative mall recovery plans remains future work.

## Explicit demo reset

This deletes **DEMO and imported S1 judge order history/evidence and their plans** from the selected Compose project; it retains accounts, source network, raw source records, waypoint mappings and unrelated operational orders. Stop active role actions first. Never use it on an operational database.

```powershell
Get-Content tools/reset-demo.sql -Raw | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose restart core
```

Restart restores the six legacy fixtures and 85 S1 orders when the private planning import is present. Browser evidence remains account scoped; use fresh profiles after a server reset to avoid replaying old actions.

## Development and checks

React/TypeScript/Vite, Tailwind, shadcn-style Button/CVA, TanStack Query, Workbox and Dexie; Spring Boot/Java 21; FastAPI assisted insertion; PostgreSQL/PostGIS, Redis and OSRM. ML dependencies remain deferred with ML integration; Kafka is absent.

Frontend: `cd apps/web; npm ci; npm run dev` proxies `/api` to port 8081. Backend: Java 21/Maven, `cd services/core; mvn verify -Pintegration` uses disposable Testcontainers PostgreSQL (Docker required). Planning: Python 3.12, install requirements then `python -m pytest`.

With the stack running, `node tools/online-walkthrough.mjs` verifies HTTP security/handoffs/replay/recovery using legacy fixtures. `cd apps/web; npx playwright install chromium; npm run test:e2e` exercises source multi-stop planning, four-role UI, phone layouts and offline reload, plus two legacy regressions. The source browser scenario requires fresh/reset S1 state and explicitly skips if private inputs are absent; the legacy scenarios create synthetic regression orders. Use `WAYPOINT_URL` for a different local endpoint. See [verification](docs/verification.md) for actual results, [architecture](docs/architecture.md), [schema](docs/data-model.md), and [API walkthrough](docs/api-walkthrough.md).

## Design and submission

[Figma reference](https://www.figma.com/design/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-?node-id=2303-146). Role screens/tokens/rationales were inspected through the connected Figma account. The interface uses the submitted DM Sans typography, brand identity, day/night tokens and product/quantity handoffs, with a phone loader adaptation. Significant scope and fidelity departures are recorded in [design departures](docs/design-departures.md).

Allocation uses deterministic feasible insertion, without claiming optimality. Deferred orders retain a next-day commitment; later replacement orders remain manual. Published manifest membership/vehicle changes, map rendering, live GPS, forecasting and alternative mall recovery comparisons remain future work. OSRM requires the prepared extract; enabling its profile alone does not prepare it.

Public HTTPS hosting, team naming, repository URL confirmation and the human-recorded unlisted 5–8 minute video remain submission actions. Keep the existing repository name until TeamName is supplied. See [submission guide](docs/submission-guide.md).
