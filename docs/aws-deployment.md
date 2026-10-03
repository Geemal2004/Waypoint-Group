# AWS deployment

The competition app is deployed at **https://18-138-29-235.sslip.io** on the user's Ubuntu 24.04 Lightsail instance (`18.138.29.235`, 4 GB RAM, 2 vCPUs, 80 GB SSD). Ports 80/443 are reachable; the public certificate, secure sessions and dataset-backed workflow were verified on 4 October 2026. This is a judge environment with labelled supplemental geography/cold capabilities, not production-certified operations.

The user explicitly approved private-data transfer. All 31 payload files matched SHA-256 checksums. Spring/Python/frontend images built on the host; 13 Java unit tests passed in that build. The dataset API walkthrough and all three browser scenarios pass over public HTTPS; the final browser run took 2.0 minutes. Secure HttpOnly SameSite cookies, no-store API responses and unauthenticated rejection pass. The initial import permission error was corrected for the non-root core group. Interrupted verification deliveries were completed with their quantities and prior evidence retained; no cloud reset was used. A source-only update preserved the database and generated a pre-update backup. Its isolated restore passed: seven migrations, 85 S1 orders, 12,692 source records, 14 proof actions and zero orphaned stops. Physical phone GPS/camera, production acceptance and automated encrypted offsite backups remain pending. Detailed logs stay ignored under `tmp/lightsail-*.log`.

The earlier 3 October preparation had no AWS access; the official CLI download timed out without running an unverified installer. This existing instance is deployed through the user-supplied SSH key, so AWS CLI authentication is not required for application updates. Use account preflight only for future AWS API provisioning.

## Lightsail competition release

Allow inbound TCP 80 and 443 in the Lightsail Networking tab. SSH remains subject to your instance SSH rule. Caddy manages public certificates and forwards authenticated APIs/SSE without caching. Only the HTTPS edge is published; PostgreSQL, Redis, core, Python and OSRM remain inside Docker. Four judge accounts use private competition credentials rather than documented local defaults. The cloud build hides the local default password on the login screen.

Use the supplied private SSH key locally; never upload it. Server layout:

- `/opt/waypoint/releases/<commit>`: immutable source releases.
- `/opt/waypoint/shared/cloud.env`: private database configuration and hostname (mode 600).
- `/opt/waypoint/shared/private`: approved judge SQL and initial account rotation SQL.
- `/opt/waypoint/shared/osrm`: prepared road files and provenance.
- `/opt/waypoint/shared/backups`: private database dumps and hashes.
- `/opt/waypoint/current`: the last successfully started release.

The fixed Compose project is `waypoint-judge`; database and certificate volumes survive release changes. The cloud database started as a fresh judge installation and now retains walkthrough plans/receipts/evidence. Local history was not imported or reset. Private cloud configuration remains in ignored `data/private/lightsail-credentials.json`. Share only `data/private/lightsail-judge-access.txt` with authorized judges; that sheet excludes the database password. The two source SQL imports have mode 640 for the non-root core group, their directory mode 750; cloud.env and account-rotation SQL stay mode 600 and are unreadable by core.

After approved private inputs and a source release are installed:

```bash
bash /opt/waypoint/releases/<commit>/deploy/lightsail/start-release.sh /opt/waypoint/releases/<commit>
```

For subsequent reviewed commits, run `./tools/deploy-lightsail.ps1 -Revision HEAD` locally. It transfers source only. The server script checks required inputs, locks against concurrent deployments, backs up an existing cloud database before migrations, builds services serially, verifies non-root import access, starts internal services, replaces fresh default passwords through audited SQL, then starts HTTPS. Rotation changes only accounts still using the documented default password; later account changes survive. It checks OSRM and trusted HTTPS, records deployed image IDs/digests and advances `current` after startup. Container logs rotate at 10 MB with three files per service. Never invoke demo reset during a release.

```bash
bash /opt/waypoint/current/deploy/lightsail/backup.sh
bash /opt/waypoint/current/deploy/lightsail/verify-backup.sh /opt/waypoint/shared/backups/<dump-file>.dump
cd /opt/waypoint/current
docker compose -p waypoint-judge -f compose.yaml -f compose.lightsail.yaml --profile routing ps
docker compose -p waypoint-judge -f compose.yaml -f compose.lightsail.yaml --profile routing logs --tail 100 core edge
```

Restore verification uses a disposable labelled container, no external network/host ports and a separate clean database; it removes only that container and leaves the live database untouched. These backups are on the same host. Copy them to restricted encrypted off-host storage. Previous releases support code rollback, subject to migration compatibility. Preserve the database volume and take a backup before every update. This is a single competition server, with no high-availability claim.

## Prepare an immutable release

```powershell
./tools/package-release.ps1 -Revision HEAD
```

This creates a source-only Git archive and SHA-256 manifest under ignored `tmp/releases/<commit>/`. It archives the selected commit rather than copying a working directory. It checks committed paths for private data, environment files and certificate/backup extensions. This is a path check, not a comprehensive secret scanner. The bundle excludes uncommitted changes; deploy a reviewed commit.

Private network SQL, prepared OSRM road files and any explicitly selected database backup must travel separately through restricted encrypted storage. Do not upload the local `.env`, demo browser evidence or a full workspace. Decide explicitly whether staging starts from imported judge fixtures or a restored database; production uses reviewed imports and new authorized accounts. A blank installation is not a migration of local history.

## Verify the target account

Install AWS CLI v2 using the [official AWS installer](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Configure an authorized named profile, preferably with [IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html), and authenticate locally. Never paste access keys into chat or commit them. The following command is read only:

```powershell
./tools/aws-preflight.ps1 -Profile '<authorized profile>' -Region '<chosen region>' -ExpectedAccountId '<12-digit account ID>'
```

Preflight verifies STS authentication and the expected account. It does not create resources or establish that the identity has provisioning permissions. Scope deployment credentials to the selected environment; do not rely on long-lived root credentials.

## Deployment acceptance and continued development

Before accepting the first AWS release, verify HTTPS, secure cookies, four-role login and scopes, actual OSRM multi-stop allocation, ordered loading, approved shortages, driver proof, offline reload/conflict recovery, store receipt, scoped live updates and routing-failure behavior on isolated cloud judge records. Verify persistent database storage and an off-host encrypted backup with a tested restore. Confirm required source files and capabilities are present before claiming dataset readiness.

Record the deployed commit, image digests, environment mode, hostname and recovery procedure. Keep local development and cloud staging separate. Subsequent releases must use reviewed commits, run existing checks, take a pre-migration backup, preserve the database volume and smoke-test the deployed app. Never invoke judge reset as part of deployment. Schema migrations may prevent simply rolling back an image; assess migration compatibility before rollback.

The existing [HTTPS and recovery instructions](deployment.md) are the application baseline. AWS-specific provisioning, pricing and public acceptance will be documented once the target environment is known. A cost estimate requires region and topology; no price or production-availability claim is made yet.
