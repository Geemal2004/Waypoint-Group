# Waypoint Group

Waypoint connects four authenticated roles to PostgreSQL operations, with dataset-backed multi-stop planning, local OSRM road routes, Spring validation, versioned publication, approved shortages, driver proof and distinct store receipts. Python proposes whole-order allocations; Spring checks every constraint again before publishing. Driver proof survives offline reload and same-stop conflict review. ML remains deferred to the Datathon. See [capability status](docs/product-capabilities.md) and [implementation status](docs/implementation-status.md).

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

These are synthetic judge accounts at Peliyagoda, with server-enforced scopes and BCrypt passwords. Default bindings are local only. The competition deployment is **https://18-138-29-235.sslip.io**; its four usernames are the same, with a private competition password in ignored `data/private/lightsail-credentials.json`. The passwords above apply only to local development.

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

1. Dispatcher: open **Planning**, day `2026-01-08`, and choose **Propose judge scenario** on fresh/reset state. This selects the multi-stop Fresh dry, separate chilled, mall and excess-demand cases. The queue shows source orders, kg/m³, unloading/windows and skip history. You can also select other compatible orders or propose all demand. Review actual road timing, both capacity bars, fuel litres, violations and deferred reasons before publishing.
2. For a focused reproducible scenario, `node tools/dataset-walkthrough.mjs` publishes two feasible multi-stop trips plus a separate chilled trip, including the same Fresh outlet's dry/chilled orders, van-only access, a fixed mall window and a genuine excess-volume deferral. It also checks competing/stale publication and completes the dry trip through all four roles, with shortage and retained-proof recovery. Run after the explicit judge reset; it deliberately rejects already-used scenario state.
3. Loader: select a source assignment. Follow the displayed reverse loading sequence; count every stop, record a shortage if necessary, obtain dispatcher approval and release every stop. Driver departure is held until the complete trip is released.
4. Driver: acknowledge the trip once, then follow the published stop sequence. Arrive, capture a JPEG/PNG and save proof. Store manager confirms actual received quantities separately. A known approved shortage remains part of that order.
5. Offline branch: at an arrived source stop, reload once online, disconnect/reload, then capture proof. A dispatcher deferral of that same stop creates a retained conflict on reconnect; authorised review recovers delivery without erasing the deferral. Existing proof action UUIDs and per-order versions remain stable across the trip.
6. Manual adjustments use the same server validator. Untouched published manifests can be reordered or retimed with a new plan version; a manifest is locked as soon as loading begins. Moving whole orders between proposed trips invalidates prior validation until checked again.

OSRM failure blocks proposals and publication with `ROUTING_UNAVAILABLE`; unreachable roads return `ROUTING_UNREACHABLE`. Repair the mapping/service and retry. There is no straight-line fallback. OSRM uses its car road profile, without live traffic, truck height/weight restrictions or certified cold-chain telemetry.

## Product workflow

Use separate profiles for all four accounts. Select the same **Operating day** in every role; active work uses that date, while History retains earlier records.

1. Store: select an authorized outlet and open New order. Count selectable catalogue units in separate Dry/Chilled/Frozen orders, save/resume a draft, then review and submit. Fresh, Style and Tech have distinct surfaces and receiving guidance. Judge SKUs are explicitly supplemental; source files supply aggregate demand rather than retail SKU details or prices.
2. Dispatcher: review submissions in Orders and confirm quantities. Planning offers confirmed orders for assisted or manual multi-stop allocation. Review both capacities, access, road timing, windows, fuel and failures before publication. The source judge scenario uses the January replay; new catalogue orders use reviewed October dates.
3. Loader: select the assigned load for that day, follow reverse delivery order, count physical units and record shortages. Dispatch approves partial release through Orders. Release every stop before departure.
4. Driver: Journey shows ordered checkpoints, actual road geometry and released quantities. Start the trip once, follow stop order, arrive while safely stopped, then count/preview/save a JPEG/PNG in Stop proof. Sync distinguishes local save, acceptance, rejection and conflict. Evidence survives offline reload and remains account scoped after sign-out.
5. Store: track the delivery and confirm received quantities separately. Approved shortages remain visible. Tech receiving issues persist; receipt-specific damage attachments and signatures remain pending.
6. Store amendments before loading independently recalculate the whole published trip and publish a new revision only if feasible. Cancellation is available before allocation. Dispatch records whole-order deferral and explicitly creates one linked replacement on a later reviewed date. Original demand, evidence and consecutive skip history remain intact.
7. Location sharing requires permission and explicit Start/Stop. Capture/receipt times, accuracy, denied permission, poor accuracy, stale and offline states are visible. A foreground queue keeps only the latest position for up to 15 minutes; background tracking is not promised. The separately labelled judge simulator never claims physical GPS or confirms arrival.
8. Dispatcher Live network/Fleet includes both depots, 120 source outlets and 60 vehicles. Maps cluster configured coordinates and show vehicles only with accepted reports. Current-day arrival estimates require fresh accurate location and OSRM; replay times remain planned. Durable scoped issues arrive through server updates. Phone links appear only for authorized provisioned numbers.
9. Administration requires an explicit permission. Catalogue, outlets, fleet/drivers/accounts, windows, cold capabilities, waypoints and dates use reviewed reasons, provenance, revision checks and audit. Active assignments protect constraints. JSON imports preview every row and apply atomically after validation. Raw source records are preserved.

Legacy one-stop reservation APIs remain limited to isolated DEMO regression fixtures and are absent from product planning. ML remains deferred; Kafka is absent.

## Explicit demo reset

This deletes **DEMO and imported S1 judge order history/evidence and their plans** from the selected Compose project; it retains accounts, source network, raw source records, waypoint mappings and unrelated operational orders. Stop active role actions first. Never use it on an operational database.

```powershell
Get-Content tools/reset-demo.sql -Raw | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose restart core
```

Restart restores the six legacy fixtures and 85 S1 orders when the private planning import is present. Browser evidence remains account scoped; use fresh profiles after a server reset to avoid replaying old actions.

## Development and checks

The [development priorities](docs/development-priorities.md) track ongoing improvements. Driver proof drafts retain quantities, issue and photo locally before submission; validated plans show a publication review for all handoffs.

If a stop changes, review the retained draft against the current released load to keep its photo. If dispatch deferred the stop, open Sync and save the retained draft for dispatcher review; the original version, quantities and photo are preserved in the conflict workflow. Publication requires a nonblank reason of at most 500 characters.

[GitHub Actions CI/CD](docs/ci-cd.md) checks pushes and pull requests and deploys successful `main` revisions to the competition Lightsail environment. Deployment requires the environment SSH secrets; private datasets stay on the server.

React/TypeScript/Vite, Tailwind, shadcn-style Button/CVA, TanStack Query, Workbox and Dexie; Spring Boot/Java 21; FastAPI assisted insertion; PostgreSQL/PostGIS, Redis and OSRM. ML dependencies remain deferred with ML integration; Kafka is absent.

Frontend: `cd apps/web; npm ci; npm run dev` proxies `/api` to port 8081. Backend: Java 21/Maven, `cd services/core; mvn verify -Pintegration` uses disposable Testcontainers PostgreSQL (Docker required). Planning: Python 3.12, install requirements then `python -m pytest`.

With the stack running, `node tools/online-walkthrough.mjs` verifies HTTP security/handoffs/replay/recovery using legacy fixtures. `cd apps/web; npx playwright install chromium; npm run test:e2e` exercises source multi-stop planning, four-role UI, phone layouts and offline reload, plus lifecycle/rescheduling and receipt/account-isolation regression coverage. The source browser scenario requires fresh/reset S1 state and explicitly skips if private inputs are absent; the legacy scenarios create synthetic regression orders. Use `WAYPOINT_URL` for a different local endpoint. After the dataset API walkthrough on an isolated judge project, `node tools/location-walkthrough.mjs` exercises explicitly emulated browser permission/accuracy/offline location behavior and phone proof layout; it loads/starts the untouched Tech trip. See [verification](docs/verification.md) for actual results, [architecture](docs/architecture.md), [schema](docs/data-model.md), and [API walkthrough](docs/api-walkthrough.md).

## Deployment and recovery

See [deployment instructions](docs/deployment.md) for isolated HTTPS configuration, administrator provisioning, backup and disposable restore. Production disables judge seeding/simulation and requires private credentials, reviewed imports and certificates. Production acceptance remains pending.

The Lightsail competition server uses [its own deployment configuration](docs/aws-deployment.md), keeping labelled judge inputs and persistent cloud data. Continue development locally, commit a reviewed change, then run `./tools/deploy-lightsail.ps1 -Revision HEAD`. The update takes a database backup and preserves cloud accounts, plans, proof and certificate volumes. Private data and SSH keys stay outside Git; future source releases reuse the approved server imports.

## Design and submission

[Figma reference](https://www.figma.com/design/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-?node-id=2303-146). Role screens/tokens/rationales were inspected through the connected Figma account. The interface uses the submitted DM Sans typography, brand identity, day/night tokens and product/quantity handoffs, with a phone loader adaptation. Significant scope and fidelity departures are recorded in [design departures](docs/design-departures.md).

Allocation uses deterministic feasible insertion without claiming optimality. Explicit linked rescheduling works; automatic rolling rescheduling and ranked mall recovery remain pending. Published membership/vehicle reassignment remains restricted. Physical GPS/camera/background behavior, certified geography/cold ranges and traffic/truck routing require deployment validation. OSRM requires the prepared extract; enabling its profile alone does not prepare it.

Competition HTTPS hosting is deployed. Team naming, repository URL confirmation and the human-recorded unlisted 5–8 minute video remain submission actions. Keep the existing repository name until TeamName is supplied. See [submission guide](docs/submission-guide.md).
