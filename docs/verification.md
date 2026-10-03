# Verification

Multi-stop milestone checks on 3 October 2026:

- Spring final suite: **13 unit + 30 PostgreSQL integration tests passed**. OSRM HTTP tests reject failures, unreachable/null matrices and fallback cells. Allocation tests cover all constraints, whole-source aggregates, stale publication, source skip baseline, shared trip release/stop order, immutable manual reorder, stable identifiers, locking after loading and parent-trip fuel/slot reservations. The original concurrent publication, online and offline backend scenarios pass. Log: `tmp/planning-final-tests.log`.
- Python: 11 allocation/API tests passed, including whole-order multi-stop capacity, separate cold loads, delivery/service windows, fuel, daily trip limits and missing/unreachable road input.
- `node tools/dataset-walkthrough.mjs` passed on the main and fresh isolated projects with private S1 input and local OSRM. It verifies feasible source multi-stop routes, actual road geometry/timing/fuel, separate Fresh dry/chilled, van-only and mall access, genuine excess deferral, competing/stale publication, reverse loading, four roles, an approved shortage, immutable proof replay and same-stop recovery.
- A proposal for all remaining source demand passed Spring validation: 61 orders in 25 trips, 16 recorded deferrals. This is a heuristic proposal, not an optimality claim.
- Fresh private installation and isolated reset passed: **91 judge orders, zero trips/revisions/proof actions and 12,692 retained source records** after restart. All six Compose services are healthy with the final images; main application history was preserved.
- **All three browser scenarios passed in separate runs against the upgraded app**: the two original workflow regressions, and the source multi-stop scenario on the final images (1.8 minutes; 2.3 minutes including setup/cleanup). Source coverage includes manual road validation/publication, capacity bars, reverse loading, approved one-unit shortage, ordered trip handoff, both receipts, durable offline reload, retained same-stop conflict and authorised recovery. Exact control labels, source outlet selection and waits for receipt completion were corrected. An earlier run reached every assertion but timed out during sequential context cleanup; the final source run uses parallel cleanup and a five-minute allowance. Final source log: `tmp/dataset-browser-final.log`.
- The local C: drive filled during a repeated image build. Regenerable artifacts/cache were cleared; one truncated uncommitted test file was restored and source integrity checked. Docker's stuck WSL disk was recovered without a factory reset; application containers and volumes remained present. Final reset testing uses a separate project, preserving main history.

Historical results below describe the preceding online/offline milestone. Reproduce current dataset startup from README. Run the dataset API walkthrough and browser suite on separate fresh/reset judge states; each mutates source assignments. Without private inputs, the dataset browser test explicitly skips; CI cannot publish restricted challenge files.

Actually executed locally on 3 October 2026:

- `mvn -B -o -Dmaven.repo.local=.m2 verify -Pintegration`, Java 21 and Docker Desktop: **9 unit + 13 PostgreSQL integration tests passed**. Tests cover Colombo cutoff, quantity/transitions, both capacities, cold/setpoint/reservation policy, access/depot, fuel, overlap/max-two trips, scopes/CSRF, persisted deferrals/consecutive skips, stale and concurrent publication. Latest log: tmp/core-final-validation.log.
- Production frontend TypeScript/Vite builds passed locally and in the Docker image. PWA assets are generated with Workbox; fonts/design assets are served locally. Dependency audit reported zero vulnerabilities at installation.
- Planning `python -m pytest` in the Docker service: **2 tests passed**. These verify health and explicit unavailable allocation; no functioning solver is claimed.
- Fresh `docker compose up --build -d --wait`: **database, Redis, planning, core and web healthy**. Migrations V1–V4 applied; source import and demo fixtures persisted. PostgreSQL had 120 supplied outlets/60 vehicles and 12,607 source records.
- `node tools/online-walkthrough.mjs`: **passed** through nginx and separately against an isolated core. Four authenticated accounts complete a 10→8 known-shortage handoff. Missing CSRF, role/scope, stale/invalid-transition checks pass. Duplicate immutable proof replay is stable; changed payload rejected; same-stop deferral retains evidence, resolves to delivery and then receipt.
- Playwright Chromium against the actual Compose app: **2 end-to-end scenarios passed** (1.0 minute on the final fresh default stack). UI creates/publishes/checks/approves/releases/starts/arrives/saves proof/confirms receipt. Offline proof survives reload, same-stop deferral conflicts and authorised review recovers into receipt. Loader/driver 390 px widths have no horizontal overflow; manager night theme is checked. The second scenario verifies Style Monday scheduling, a persisted Tech receiving issue, sign-out/account isolation, and cross-tab account/CSRF recovery. Screenshots inspected locally in tmp/browser-results. Final log: tmp/browser-default-stack.log.
- Explicit reset on the isolated waypoint-reset volume: starting with 8 orders/2 processed actions and 12,607 source records, reset removes demo history; restart restores **6 orders/0 actions**, retaining **12,607 source records**. The previous waypoint-online verification data was preserved in its stopped volume; the standard waypoint project now serves the app.

To reproduce from the repository root:

```powershell
docker compose up --build -d --wait
node tools/online-walkthrough.mjs
Set-Location apps/web
npm ci
npx playwright install chromium
npm run test:e2e
```

Backend: from services/core run `mvn verify -Pintegration` with Java 21/Maven and Docker. Testcontainers creates its own PostgreSQL. Python: install requirements with Python 3.12 and run `python -m pytest` in services/planning. Windows Docker Desktop may require `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine` in the Maven shell. The local .m2 cache flag is optional and gitignored.

Both walkthroughs add synthetic orders and select an unused demo date. They never reset existing judge data automatically. The demo calendar is fixed October 2026; later deployments need an explicitly reviewed fixture calendar. Reset is opt-in and documented in README.

At the preceding milestone these were unverified: source routing/allocation, ML, live GPS, design/degradation screens, real mobile hardware, public HTTPS and remote CI. The current checks above now verify judge road routing and assisted allocation; production geolocation/cold certification, truck-specific or live-traffic accuracy, ML, GPS, full design acceptance, actual camera hardware, public HTTPS and remote CI remain unverified. Test screenshots, traces, detailed data audits, generated import SQL and source records remain gitignored/private.
