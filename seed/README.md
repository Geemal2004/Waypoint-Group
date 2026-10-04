# Source imports and local video campaign

Private challenge import SQL lives in ignored `data/private/shared-network.sql` and `planning-scenario.sql`. The app retains original source records, imports the network and restores 85 S1 orders when prepared. See the repository README for preparation. Never commit private inputs or generated source SQL.

`video-campaign.json` describes supplemental retail demo demand for all four personas. It preserves the separate January replay and six legacy fixtures. The campaign has 37 orders, six drafts, five active trips/16 stops and nine completed historical receipts. The operating day is Monday, October 12, 2026. Source unloading allowances are used unchanged: the Style trip has one 10:00–12:00 mall bay and two 09:00–16:00 rear docks.

Start the regular local Compose stack. Existing orders and trips are preserved; the campaign uses five dedicated vehicles:

```powershell
docker compose --profile routing up -d --build --wait
node tools/seed-video-demo.mjs
node tools/verify-video-demo.mjs
node tools/prepare-video-browsers.mjs
node tools/backup-video-demo.mjs
node tools/verify-video-backup.mjs
```

Open http://localhost:8080 and use the role picker. Select **2026-10-12** in each role, **Demo Fresh · Kelaniya** for the manager, and the journey truck's arrived stop for the driver. For four independent prepared recording windows:

```powershell
node tools/prepare-video-browsers.mjs --open
```

Each window has a separate persistent profile under ignored `data/private/video-demo-local/profiles`. Session data, photos, screenshots, the actual WP reference cue sheet in `report.json`, and backups stay private. The scripted baseline image explicitly says **staged demo evidence**; capture your own sample packaging photograph for live recording.

The runner inserts only initial fixture demand/reference data directly, to support historical baseline dates without weakening the product cutoff. Confirmation, actual OSRM validation/publication, loading, release, trip start, arrival, accepted proof, receipt, deferral, rescheduling, drafts and issues use the existing APIs. It never fabricates a published route or completed status. A seed rerun verifies an unchanged baseline and does not rewind work.

Rehearsal deliberately consumes the arrived A22 stop. Use disposable browser contexts, then explicitly reset only the campaign and regenerate its cue sheet:

```powershell
node tools/prepare-video-browsers.mjs --rehearse
node tools/seed-video-demo.mjs --reset
node tools/prepare-video-browsers.mjs
node tools/backup-video-demo.mjs
node tools/verify-video-backup.mjs
```

The targeted reset uses registered campaign membership and refuses mixed manifests. It preserves S1, legacy and unrelated demand. It cannot erase server evidence belonging to other campaigns. Old browser outbox/proof state is separate; do not replay a rehearsal profile into a reset server. `--open` creates recording profiles, while verification/rehearsal uses ephemeral contexts.

If Docker Desktop's Windows proxy stalls, the runner can use Docker's own bundled CLI over its direct local WSL engine socket. Set `$env:VIDEO_DOCKER_DIRECT='1'` to select that fallback immediately. This does not restart Docker or other services. If the video web port did not register, build `apps/web` and run `node tools/video-preview.mjs`; it serves the current build at port 8180 and proxies only to the isolated backend at 8181.

Use `tools/reset-demo.sql` only for its original broad judge reset; it is not the video campaign reset. Cloud campaign seeding supports only the existing judge deployment, with hosted reset disabled. See the deployment commands below. See `docs/demo-seed-plan.md` for the intended scenes and readiness gates.

## Isolated alternative and hosted deployment

For an isolated recording database, start `docker compose -p waypoint-video -f compose.yaml -f compose.video.yaml --profile routing up -d --build --wait`, then set `$env:VIDEO_PROJECT='waypoint-video'` before running the tools. This uses localhost:8180 and the separate `data/private/video-demo` report directory. Remove that environment variable to return to regular local Compose. On Windows, if port 8000 is excluded, set `PLANNING_PORT=18000` in the ignored local `.env`.

Deploy committed source with `./tools/deploy-lightsail.ps1`. It backs up hosted PostgreSQL and preserves volumes, private imports and credentials. Then take a fresh pre-campaign backup and seed only the supplemental campaign:

```powershell
ssh -i "$env:USERPROFILE/Downloads/waypoint-key.pem" ubuntu@18.138.29.235 'bash /opt/waypoint/current/deploy/lightsail/backup.sh /opt/waypoint/current'
$env:VIDEO_PROJECT='waypoint-judge'
$env:VIDEO_DEPLOYMENT='18.138.29.235'
node tools/seed-video-demo.mjs
node tools/prepare-video-browsers.mjs
Remove-Item Env:VIDEO_PROJECT, Env:VIDEO_DEPLOYMENT
```

The runner uses HTTPS for real workflow APIs and SSH for narrowly scoped database insertion and internal OSRM nearest requests. It never uploads the local database, resets hosted orders, or prints credentials. Cloud reports stay under ignored `data/private/video-demo-cloud`. A rerun verifies the original baseline; it will report changes after a demo has consumed it rather than rewind hosted history.