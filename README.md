# Waypoint Group

The first online delivery milestone connects four authenticated roles to persisted PostgreSQL operations: order, assigned publication, loading check and approved partial release, driver arrival/photo, and distinct store receipt. The React PWA also retains account-scoped driver proof offline and sends same-stop conflicts for dispatcher review. This is a synthetic judge environment; operational routing and Datathon model integration remain pending. See [implementation status](docs/implementation-status.md).

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

Source data is optional for the executable synthetic walkthrough. The user supplied the booklet and dataset locally and deferred ML integration to the separate Datathon phase. Competition files and generated import SQL are gitignored. To prepare the seven GeneralData CSVs privately:

```powershell
./tools/prepare-data.ps1 -SourceDirectory 'C:\Users\lakit\Downloads\data-20260928T081315Z-1-001\data'
docker compose restart core
```

The startup importer validates a SHA-256 digest and imports once transactionally. Source driver identities are disabled. Supplied operating dates end in June 2026; October 2026 demo dates/products/setpoints are explicitly synthetic. Source publication stays blocked until coordinates, cold ranges and road feasibility are verified. See [dataset audit](docs/dataset-audit.md) and [policies](docs/constraints-and-policies.md).

## Judge walkthrough

Use separate browser profiles for each account. At phone size use approximately 390 px for loader and driver.

1. Manager: select Demo Fresh, New order, an unused October operating date, Ambient, and 10 rice cartons. Review and place. The server applies the 16:00 Colombo cutoff and explains any date change.
2. Dispatcher: select that order, choose Demo Dry truck, declare a 05:30–07:30 Colombo reservation, 10 L, trip 1, and a reason. Publish the assigned load. Both capacities, cold compatibility, access, weekly fuel and trip reservations are checked server-side. These times do not claim a road ETA.
3. Loader: select the assignment, count 8 of 10, choose Missing stock, and acknowledge/save. Release is held. Dispatcher approves the partial release with a reason; loader then releases it.
4. Driver: acknowledge the released plan/start, confirm arrival while safely stopped, select a real JPEG/PNG photo, and save proof. The screen distinguishes local save from server acceptance.
5. Manager: open the delivered order, view proof and confirm 8 received. Ordered 10, loaded 8, delivered 8 and received 8 remain distinct. The two known missing cartons do not become a new receiving discrepancy.
6. Offline branch: prepare a second assignment using Demo Van on that date. Start/arrive while online, reload once online so the PWA controls the page, disconnect and reload. Save a photo. “Saved on device · pending sync” survives another reload. Dispatcher defers **that same stop** with a reason/next day. Reconnect the driver. Both records are preserved for review; dispatcher views evidence and accepts verified delivery or keeps the server decision. Acceptance creates a receipt task and retains deferral history.
7. Tech branch: place a television order, complete its handoffs, and record Damaged packaging or Damaged product at receipt. The issue is persisted separately from driver proof. Receipt-specific photo capture is pending.

A used vehicle/date may already have reservations; choose another date or the explicit reset below. Style uses demo Monday delivery days and van-only mall access. Full mall-window recovery comparison is pending road integration.

## Explicit demo reset

This deletes **demo order history and evidence** from the selected Compose project; it retains accounts and source network/imports. Stop active role actions first. Never use it on an operational database.

```powershell
Get-Content tools/reset-demo.sql -Raw | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose restart core
```

Restart creates the six stable scenario orders again. Browser evidence remains scoped to its original account; use fresh browser profiles after a server reset to avoid replaying old fixture actions.

## Development and checks

React/TypeScript/Vite, Tailwind, shadcn-style Button/CVA, TanStack Query, Workbox and Dexie; Spring Boot/Java 21; FastAPI with OR-Tools/LightGBM dependencies; PostgreSQL/PostGIS, Redis and optional OSRM. Kafka is deferred.

Frontend: `cd apps/web; npm ci; npm run dev` proxies `/api` to port 8081. Backend: Java 21/Maven, `cd services/core; mvn verify -Pintegration` uses disposable Testcontainers PostgreSQL (Docker required). Planning: Python 3.12, install requirements then `python -m pytest`.

With the stack running, `node tools/online-walkthrough.mjs` verifies HTTP security/handoffs/replay/recovery. `cd apps/web; npx playwright install chromium; npm run test:e2e` exercises actual four-role UI, phone layouts and offline reload. These add synthetic orders. Use `WAYPOINT_URL` for a different local endpoint. See [verification](docs/verification.md) for actual results, [architecture](docs/architecture.md), [schema](docs/data-model.md), and [API walkthrough](docs/api-walkthrough.md).

## Design and submission

[Figma reference](https://www.figma.com/design/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-?node-id=2303-146). Role screens/tokens/rationales were inspected through the connected Figma account. The interface uses the submitted DM Sans typography, brand identity, day/night tokens and product/quantity handoffs, with a phone loader adaptation. Significant scope and fidelity departures are recorded in [design departures](docs/design-departures.md).

Automatic allocation, editable multi-stop plans, OSRM maps, live GPS, forecasting and full mall recovery remain pending. Planning deliberately returns unavailable rather than invented solver results. OSRM requires a prepared licensed Sri Lanka extract in data/osrm; enabling the routing profile alone does not prepare it.

Public HTTPS hosting, team naming, repository URL confirmation and the human-recorded unlisted 5–8 minute video remain submission actions. Keep the existing repository name until TeamName is supplied. See [submission guide](docs/submission-guide.md).
