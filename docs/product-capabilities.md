# Product capability checklist

Implemented means working code exists; Verified identifies executed acceptance evidence. Partial and Pending identify remaining scope. Production acceptance is distinct from local judge verification. ML remains deferred to the Datathon; retailer examples do not imply verified integrations.

| Capability | Status | Evidence / limits |
| --- | --- | --- |
| Figma foundations / role navigation | Implemented | Inspected reference frames, local design assets/fonts, day/night tokens; separate operational tasks and selected day |
| Dispatcher orders/planning | Verified | Source road multi-stop UI, both capacities, stop ordering, publication, shortage approval, same-stop recovery |
| Fresh/Style/Tech store | Implemented | Branded catalogue, draft/review, separate temperature submissions, tracking/receipt/history; supplemental SKU provenance, no source prices |
| Loader reverse multi-stop manifest | Verified | Shared stops, reverse loading, physical counts, hold/approval/release; phone sticky actions and tablet split |
| Driver journey/proof/sync | Verified | Ordered journey, local photo preview, durable offline reload, conflicts/retry/account isolation; signatures pending |
| Road routing / allocation authority | Verified | OSRM adapter; Python proposes, Spring independently validates; road failure/unreachable rejection; 53 Java and 12 Python checks |
| Permission-based location | Verified server / Partial device | Scope, monotonic capture, accuracy/freshness, capture/receipt, 15-minute expiry; emulated-browser Start/Stop, denied/poor-accuracy/offline/reconnect checks pass; physical/background acceptance pending |
| Full-network map / live control | Implemented | Two depots, all 120 source outlets/60 vehicles, configured coordinate clusters, run/reporting filters, trip details, missing positions explicit |
| Current-day road arrival estimate | Verified | Fresh accurate location required, service/window risk, OSRM failure explicit; replay/future dates remain planned, no traffic/truck accuracy claim |
| Server-driven updates | Implemented | Authenticated scoped SSE, reconnect/active-account checks, query invalidation and transient positions; 15-second network refresh fallback |
| Issues / authorized phone links | Verified messages / Implemented contacts | Durable scoped idempotent issues; optional provisioned telephone links, no invented voice/chat integration |
| Draft/confirm/amend/cancel/reschedule | Verified API | Scoped versioned drafts/idempotent submission, review gate, amendment revalidation, cancellation audit, single linked replacement and skip lineage |
| Operational administration | Verified API / Implemented UI | Explicit privilege, whitelisted/revisioned changes, active-assignment protection, audited provenance, rollback preview and atomic imports |
| HTTPS configuration | Verified local proxy / Partial deployment | Validated Compose override, private local TLS smoke test and API headers; public certificate/domain and production acceptance pending |
| Backup / restore | Verified local | Final V1–V7 dump restored to disposable isolated DB, no orphaned stops; offsite encrypted/automated backup pending |
| Session / evidence / concurrency | Verified | CSRF/scopes, session revocation, no-store evidence, immutable actions, stale/concurrent publication and retained conflict |
| Retention | Implemented position policy / Partial records | Locations expire; server evidence/audit has no automatic purge; operational retention policy requires review |
| Multi-role browser acceptance | Verified | Three final scenarios pass together, including amendment rollback/propagation, live issues, deferral/rescheduling, source offline recovery and account isolation |
| Visual fidelity / mobile hardware | Partial | Required screen sizes captured/inspected locally; full human pixel-fidelity, real GPS/camera and background behavior pending |
| Public host/video/team naming | Pending | No public deployment or human-recorded submission video |

Further limits: uncertified supplemental outlet geography/cold ranges; car-profile roads without live traffic; heuristic rather than optimal allocation; automatic rolling rescheduling and published membership/vehicle reassignment; receipt damage attachments, receiver signatures, barcode/price/invoice/customer integrations and fleet telemetry certification.
