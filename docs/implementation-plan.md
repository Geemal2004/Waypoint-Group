# Implementation plan and acceptance gates

Spring owns operational truth; Python proposes allocations that Spring independently validates. The supplied booklet/data are audited, the Figma role surfaces are implemented, and the competition app is deployed over HTTPS on Lightsail. Datathon model integration remains deferred by the user's clarification.

| Milestone | Acceptance gate | Current position |
| --- | --- | --- |
| 1. Audit/schema/import | Verified units/IDs, private source handling, repeatable seed/reset | Implemented and database tested |
| 2. Online delivery | Four scoped browser roles, order → plan → load/release → arrival/photo → distinct receipt | Implemented; browser handoff with partial approval passed |
| 3. Allocation/deferral | Shared constrained manual/solver validator, job states, road feasibility, full skip/recovery decisions | Dataset multi-stop OSRM, Spring validation, versioned publication and linked deferral/skip history verified locally and in the cloud |
| 4. Offline proof | Account-scoped cache/evidence, atomic local save, idempotent replay, true same-stop review/recovery | Driver proof slice implemented and browser reload/recovery tested; other offline mutations pending |
| 5. Maps/design/ML | Road extract/coordinates, live ingest, all submitted branches/fidelity, Datathon model validation | Role surfaces, source network maps and location degradation implemented; full human fidelity, physical devices, certified geography/cold and Datathon ML remain pending |
| 6. Submission | Fresh Compose/health, tests, HTTPS deployment, team naming, new unlisted video | Lightsail HTTPS, source API and three browser scenarios verified; tested cloud backup/update/restore; team naming/repository confirmation and human video pending |

The judge uses authorized supplemental waypoints and cold capabilities with audited operating budgets. Versioned proposals, validation, immutable plan history, reviewed order changes/rescheduling, live issues/location and audited administration are implemented. Continue locally and deploy reviewed commits with `tools/deploy-lightsail.ps1`; preserve cloud history and offline action IDs. Remaining scope includes receipt damage attachments/signatures, full human design acceptance, physical GPS/camera/background checks and production-certified inputs. See the capability checklist for precise states.
