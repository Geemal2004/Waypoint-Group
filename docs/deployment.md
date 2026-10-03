# Deployment and recovery

The local judge runs on loopback with explicit demo accounts. The competition app is deployed over HTTPS on Lightsail; see [AWS deployment](aws-deployment.md). Production uses an isolated Compose project and volume. Production acceptance and physical mobile deployment remain unverified.

The competition AWS rollout is tracked in [AWS deployment](aws-deployment.md). It preserves judge mode rather than using the production override, which disables demo seeding.

## HTTPS startup

Prepare private `data/private/production-network.sql` through the validated network preparation workflow. Review source coordinates, cold capabilities, selectable catalogue and operating dates before operational use. S1/legacy order seeding is judge-only; production starts without synthetic assignments. Provision real orders through authenticated drafts/submission. The shared network import retains its digest guard and raw source records.

.env and certificate files stay private. After preparing and reviewing `shared-network.sql`, copy it to the separately named production import; seeding S1 is disabled.

Supply private environment values without committing `.env`, credentials or certificates. A certificate directory must contain `fullchain.pem` and `privkey.pem`; Compose >=2.24.4 is required for port overrides.

```powershell
Copy-Item data/private/shared-network.sql data/private/production-network.sql
if (-not (Test-Path data/private/production-network.sql)) { throw 'Prepare the private network import first' }
$env:POSTGRES_PASSWORD = '<private database password>'
$env:TLS_DIRECTORY = 'C:\private\waypoint-tls'
$env:HTTPS_BIND = '127.0.0.1'
$env:HTTPS_PORT = '8443'
docker compose -p waypoint-production -f compose.yaml -f compose.production.yaml --profile routing up --build -d --wait
./tools/provision-administrator.ps1 -Project waypoint-production -Username operations-admin
```

The bootstrap script prompts securely for a password, provisions a new explicit administrator with BCrypt, and audits the bootstrap. It does not rewrite an existing account. Source depots must be imported first. Administration can provision enabled scoped drivers/loaders/managers, optional authorized phone numbers, selectable catalogue products and outlet permissions. Source driver identities initially remain disabled. Do not use judge login credentials for deployment.

Production sets DEMO_SEED=false and secure session cookies, TLS 1.2/1.3, HSTS, same-origin permissions and unbuffered SSE. PostgreSQL/Redis stay internal; debug service bindings remain loopback. Use a valid public certificate and reviewed host/firewall settings before public access. Location permission requires a secure context (HTTPS or supported localhost). There is no public-host readiness claim.

Readiness: `/actuator/health/readiness` on core; `/health` on planning. Structured ECS console logs are enabled in production. OSRM/service failures remain explicit and block operational publication; no straight-line route is accepted. Database restart preserves operations. Redis loss removes transient locations and returns unavailable states; it never removes proof. Browser background tracking is limited by the platform.

## Backup and isolated restore verification

```powershell
./tools/backup-database.ps1 -Project waypoint
./tools/verify-backup-restore.ps1 -BackupPath '<absolute private dump path printed above>'
```

Backups use PostgreSQL custom format and SHA-256. They include account hashes and server evidence, remain under ignored `data/private/backups`, and require restricted/encrypted off-device storage. Restore verification creates a uniquely named disposable database container with no host ports or remote network, restores the dump, checks schema/counts and orphaned stops, then removes only that temporary container. It never restores over the running application. Local restore was actually exercised; managed/offsite recovery remains deployment work.

## Retention and separation

Live position records expire after 15 minutes; stale status begins at 90 seconds. The foreground location queue keeps one latest sample and expires it after 15 minutes. Server proofs, conflicts, orders, messages and audit have no automatic purge: deletion/retention policy requires explicit operational review. Device proof remains account scoped until browser/device storage removal; the device is not a backup. Sign-out clears active session/query state and retains that account's local evidence for resumption.

Judge reset is opt-in and scoped to DEMO/S1 order history, commands/drafts/messages/evidence/plans. Source network, source records and unrelated operational orders survive. Never invoke reset on production. Certificate renewal, offsite encrypted backup automation, monitoring, legal retention periods, public load/security review and physical device checks remain pending.

## Validated administration imports

Administration imports JSON `{ "records": [...] }` for one entity type. Each record contains `id`, `expectedRevision`, whitelisted `fields`, and a nonempty `reason`; new accounts also require `initialPassword` (never returned/audited). Maximum 200 records and 2 MB in the browser. References must already exist; create dependency records first. Preview reports every invalid row and rolls back. Apply rejects the whole batch on any invalid/stale record. Source files and raw records are never rewritten.
