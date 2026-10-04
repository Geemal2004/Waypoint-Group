# Continuous integration and competition deployment

`.github/workflows/ci.yml` runs on pushes, pull requests and manual dispatches. The web job builds TypeScript/Vite, core runs Java 21 unit and real PostgreSQL Testcontainers integration tests, planning runs Python tests, and browser builds an isolated Compose stack, runs the authenticated API walkthrough and runs Playwright. Public fixtures cover handoffs, shortage approval, replay recovery, browser offline reload/conflict recovery, protected receiving and account isolation. Failures retain browser evidence and service logs. Private source files are absent on GitHub runners, so both private-network browser cases explicitly skip; run those separately against reviewed private inputs and OSRM. CI does not claim full private-dataset or physical-device coverage. Public one-stop fixtures are regression tests, not competition allocation demonstrations.

Only successful `main` push/manual runs deploy. All four jobs must pass. This workflow passes deployment credentials only to the deployment job; that job never runs for pull requests or other branches. The GitHub `competition` environment restricts deployments to `main`. Configure these repository secrets in Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `SSH_PRIVATE_KEY` | Entire private SSH key authorized for ubuntu on the competition instance. Prefer a dedicated deployment key. |
| `SERVER_HOST` | `18.138.29.235` |
| `SERVER_USER` | `ubuntu` |

The verified public ED25519 host key is pinned in `deploy/lightsail/known_hosts`; it is not a private credential. SSH fails if the server key changes. Verify any replacement independently before updating it.

Repository secrets are GitHub-encrypted but are available to other trusted workflows in this repository. Workflow editors can exercise that server access. Restrict repository write access; environment-scoped secrets can provide tighter deployment isolation later. See [GitHub environment guidance](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Deployment packages the exact checked commit with `tools/package-release.ps1`, checks for restricted paths, uploads source only, verifies its checksum, and invokes the existing Lightsail release script. SSH host checking is strict. Private datasets, OSRM files, cloud credentials and PostgreSQL state stay on the server. The release script backs up existing PostgreSQL before migration, builds serially for the 4 GB instance, checks service/OSRM/HTTPS health and advances `/opt/waypoint/current` only after success. Deployments do not cancel an active deployment and the server also holds a deployment lock.

A failed deployment may already have applied database migrations or recreated containers even though `current` still points to the last successful release. Inspect Actions and server logs before retrying. There is no automatic rollback or destructive reset; restoring a database needs explicit operator review. Backups remain on the same host, so offsite backup is still pending.

Development continues on branches through pull requests. Merge reviewed work into `main` to test and deploy it, or use Actions → Checks → Run workflow on `main` to retry. CI does not run destructive judge walkthroughs against the live competition database. The manual PowerShell deployment remains available as documented in `aws-deployment.md`.
