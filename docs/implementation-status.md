# Implementation status — 4 October 2026

The dataset-backed multi-stop milestone is implemented and locally verified. The source API and browser walkthroughs and isolated reset pass. This is not the completed hackathon submission. ML integration remains deferred to the Datathon.

The competition app is deployed over trusted HTTPS on Lightsail. Source API and all three browser scenarios pass against the cloud app; a source-only update preserved cloud history and its backup restored successfully in an isolated database. See [AWS deployment](aws-deployment.md). Production/physical-device acceptance and submission video/naming remain pending.

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Repository/data/booklet audit | Completed, tested | All 17 CSVs audited; relationship joins passed; budget pages rendered/read |
| Shared network import | Completed, tested | 120 supplied outlets, 60 vehicles, 12,607 retained source records; transactional digest guard; private preparation |
| Schema/scenario/reset | Completed, tested | Seven migrations, 85 private S1 orders, 38 source fleet statuses, supplemental waypoint/cold provenance; isolated reset restores 91 orders, clears plans/proof actions and retains 12,692 source records |
| Authentication/CSRF/role/scope | Completed, tested | Server sessions and scoped queries; unauthorized/wrong-role/outlet/CSRF rejection; browser login |
| Online four-role delivery | Completed, tested | Actual browser manager → dispatcher → loader → driver photo → manager receipt |
| Distinct quantities / shortage | Completed, tested | 10 ordered / 8 loaded / 8 delivered / 8 received; no false new receiving discrepancy |
| Partial release | Completed, tested | Loader blocked, dispatcher reason/approval, loader release; audit retained |
| Legacy fixture allocation | Regression tested | Separate DEMO-only reservation workflow retained; judge source orders use multi-stop road-backed publication |
| Operational road validator | Implemented, tested | Local pinned OSRM graph; seconds/metres/GeoJSON; unreachable, failure and estimated fallback rejected; labelled supplemental judge inputs |
| Concurrency/stale rejection | Completed, tested | Real competing-publisher test commits exactly one run/audit |
| Editable plans/history | Implemented, tested | Immutable snapshots; manual reorder/retiming; stable trip/stop/run IDs; tests preserve shortages and lock after loading |
| Deferral/skip history | Implemented, tested | Audited linked replacements preserve original demand/evidence and skip lineage; automatic rolling rescheduling and ranked alternatives pending |
| Calendar/cutoff | Partial, tested | 16:00 Colombo boundary; source calendar retained; demo October days and Style Mondays explicit |
| Photo upload/security | Completed, tested | JPEG/PNG validation, scoped no-store bytes, bounded uploads; browser native file/camera control |
| Offline action API | Completed, tested | Transactional accepted actions, duplicate replay, changed-payload rejection, retained same-stop conflict/recovery |
| Browser offline proof | Completed driver slice, tested | Atomic Dexie action/photo save, account cache, reload, reconnect/timer/manual retries, conflict and recovery polling |
| Other offline mutations | Pending | Loading, arrival/start and receipt require connectivity; no silent offline success |
| Role interfaces / brand/day/night | Implemented subset | Figma contexts/screenshots/rationales inspected; phone overflow/night checks passed; complete visual acceptance pending |
| Style full mall-window recovery | Pending | Demo Monday and van/window rules exist; alternative routing/feasible recovery not implemented |
| Tech receipt issue | Implemented, browser tested | Persisted receiving issue; receipt-specific damage photo/accepted-issue branch pending |
| Assisted multi-stop allocation | Implemented, tested | Python whole-order insertion; independent Spring road/physical/calendar/fuel/budget validation; full remaining-demand proposal valid; optimality/jobs not claimed |
| ML/future forecasts | Deferred to Datathon | Data contracts/history audit; no trained model or fabricated metrics |
| Maps/live location | Implemented | MapLibre network/trip maps, permission-based scoped location reporting, transient retention, fresh road estimate and explicit degradation; physical devices pending |
| Compose fresh installation | Tested | All six services healthy with routing enabled, migrations/private import/seed on a fresh volume |
| Builds/backend tests | Tested | Production web build; 13 unit + 40 real-PostgreSQL integration tests, including manual immutable revisions, source Style calendar and shared parent-trip fuel/slot reservations |
| Planning tests | Tested | 12 tests covering multi-stop insertion, capacity/fuel deferrals, cold separation, windows, daily slots and rejected road matrices |
| Four-role browser/offline walkthrough | Completed, tested | Source multi-stop browser scenario passed with both receipts, shortage, ordered handoffs, offline reload/conflict/recovery; original two browser scenarios also passed |
| CI | Prepared | Web/core/planning/browser jobs; remote execution not claimed |
| Public deployment/video/naming | Host verified / Human submission pending | Lightsail HTTPS URL and cloud walkthroughs verified; team name/repository URL and human-recorded unlisted 5–8 minute video remain pending |

See verification.md for executed checks and design-departures.md for scope/fidelity departures. Production outlet geolocation/certified cold capabilities, truck-specific/live-traffic routing, optimality, automatic rolling rescheduling and published membership/vehicle reassignment remain limitations.

The product expansion adds draft/confirmation/amend/cancel/reschedule commands, separate role tasks, explicit administration, SSE and durable issues, HTTPS configuration and backup/restore tooling. See [product capability checklist](product-capabilities.md) for current verification and limitations.
