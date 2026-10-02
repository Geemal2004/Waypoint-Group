# Waypoint Group

Hackathon implementation of the Waypoint Designathon submission.

## Current status

Foundation scaffold, not a completed submission. The web application calls the Spring API, which reads seeded brand/depot reference data from PostgreSQL. The Python service exposes health and explicitly returns HTTP 501 for unimplemented planning. No role authentication, allocation, delivery workflow, trained ML model, live tracking or offline synchronisation exists yet.

## Stack

React / TypeScript / Vite, Tailwind and shadcn/ui configuration; TanStack Query; Workbox PWA and Dexie schema; Java 21 / Spring Boot; Python / FastAPI / OR-Tools / LightGBM; PostgreSQL / PostGIS; Redis; optional OSRM profile. Kafka is deferred until a concrete use case requires it.

## Setup

Install Docker with Compose v2. From the repository root run:

```sh
cp .env.example .env
docker compose up --build
```

Open http://localhost:8080. Core health: http://localhost:8081/actuator/health. Planning health/docs: http://localhost:8000/health and http://localhost:8000/docs. Flyway applies schema and reference data automatically. Database data persists in the named volume.

Defaults are for local development only. Do not expose the unauthenticated scaffold publicly. Public deployment requires authentication, new credentials, HTTPS, restricted service access and account isolation for offline data.

## Development

Frontend: `cd apps/web && npm ci && npm run dev` (proxies `/api` to port 8081).

Core: Java 21 and Maven 3.9; `cd services/core && mvn test && mvn spring-boot:run`. Configure `DB_URL`, `DB_USER`, `DB_PASSWORD`, `REDIS_HOST` and `PLANNING_URL` as needed.

Planning: `cd services/planning`, create/activate a Python 3.12 virtual environment, then `pip install -r requirements.txt`, `python -m pytest`, and `uvicorn app.main:app --reload`.

## Routing data

OSRM is optional during the foundation milestone: `docker compose --profile routing up --build`. First prepare a licensed Sri Lanka OSM extract using the OSRM image's `osrm-extract -p /opt/car.lua`, `osrm-partition` and `osrm-customize` commands, with their outputs in `data/osrm/` and base filename `sri-lanka.osrm`. The routing profile cannot start without these files. Reproducible data acquisition, attribution and routing verification are pending. OSRM estimates are not live traffic predictions.

## Seeded accounts and judge walkthrough

Accounts are not implemented yet. The required final fixture will contain one account per role and shared challenge data.
The following is the target walkthrough, not currently executable:

1. Store manager places separate Fresh dry and chilled orders for an eligible operating day.
2. Dispatcher closes orders, reviews allocation, validates both capacities and publishes a run; excess demand is deferred with reasons.
3. Loader verifies reverse-stop loading, flags a shortage and receives dispatcher-approved release.
4. Driver starts the assigned journey, records arrival and delivery proof.
5. Store manager confirms receipt and the dispatcher sees the closed commitment.
6. Repeat an offline delivery while the dispatcher defers the same stop; reconnect and reconcile preserved evidence.

## Design specification and departures

[Figma prototype](https://www.figma.com/proto/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-?node-id=2303-146&starting-point-node-id=2303%3A146).
Driver and loader must both work on phone-sized screens. The submitted loader tablet design will therefore gain a phone layout. The foundation landing page is a developer status screen, not a fidelity-complete product screen. See `docs/design-departures.md`.

## Submission naming

The supplied repository is `Waypoint-Group`. The brief requires `TeamName_SolutionName`; rename after the actual team name is confirmed. Deployed URL, final credentials and the new 5–8 minute hackathon video are pending.
