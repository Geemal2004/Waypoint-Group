# Continuous integration and competition deployment

`.github/workflows/ci.yml` runs on pushes, pull requests and manual dispatches. The web job builds TypeScript/Vite, core runs Java 21 unit and real PostgreSQL Testcontainers integration tests, planning runs Python tests, and browser builds an isolated Compose stack and runs Playwright. Failures retain browser evidence and service logs. Private source files are absent on GitHub runners, so the dataset-dependent browser case explicitly skips; run that walkthrough separately against reviewed private inputs. CI does not claim full private-dataset or physical-device coverage.

Only successful `main` push/manual runs deploy. All four jobs must pass. Pull requests and other branches cannot access deployment credentials. The GitHub `competition` environment should restrict deployments to the `main` branch. Configure these environment secrets in repository Settings → Environments → competition:

| Secret | Value |
| --- | --- |
| `LIGHTSAIL_SSH_KEY` | Private SSH key authorized for ubuntu on the competition instance. Prefer a dedicated deployment key. |
| `LIGHTSAIL_KNOWN_HOSTS` | Previously verified `18.138.29.235 ssh-ed25519 ...` known-host entry. Never acquire it blindly during deployment. |

Environment secrets are GitHub-encrypted; workflow editors with access to trusted deployment code can still exercise that server access. Restrict repository write access. See [GitHub environment guidance](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Deployment packages the exact checked commit with `tools/package-release.ps1`, checks for restricted paths, uploads source only, verifies its checksum, and invokes the existing Lightsail release script. SSH host checking is strict. Private datasets, OSRM files, cloud credentials and PostgreSQL state stay on the server. The release script backs up existing PostgreSQL before migration, builds serially for the 4 GB instance, checks service/OSRM/HTTPS health and advances `/opt/waypoint/current` only after success. Deployments do not cancel an active deployment and the server also holds a deployment lock.

A failed deployment may already have applied database migrations or recreated containers even though `current` still points to the last successful release. Inspect Actions and server logs before retrying. There is no automatic rollback or destructive reset; restoring a database needs explicit operator review. Backups remain on the same host, so offsite backup is still pending.

Development continues on branches through pull requests. Merge reviewed work into `main` to test and deploy it, or use Actions → Checks → Run workflow on `main` to retry. CI does not run destructive judge walkthroughs against the live competition database. The manual PowerShell deployment remains available as documented in `aws-deployment.md`.
