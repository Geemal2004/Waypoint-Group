# Complete four-persona demo seed plan

Status: merged into regular local Compose on October 4, 2026, at http://localhost:8080. Existing orders and trips are preserved; five dedicated campaign vehicles avoid collisions. API scope, quantities, real OSRM plans, shortages, proof and receipt checks passed. See seed/README.md for local and hosted deployment commands. Physical camera/GPS behavior requires validation on the recording device.

## 1. Demo baseline

Build a dedicated, repeatable **video campaign** with populated Store manager, Dispatcher, Loader and Driver workspaces. Seed relationships, decisions and evidence behind each visible status, rather than setting status flags alone.

Recommended operating day: **Monday, 12 October 2026**, Asia/Colombo. This is within the existing supplemental October calendar and satisfies the supplemental Style Monday rule. Use 5–10 October for background history, 13 October for a Tech replacement, and 19 October for a subsequent Style order. If recording occurs later, choose the next reviewed eligible Monday and regenerate the campaign consistently; real submission uses the 16:00 Colombo cutoff.

The primary video uses the supplemental retail catalogue. The January 8 S1 source replay remains a separate chapter with exact imported source quantities and its existing January 9 deferral day. Do not move S1 orders to October or turn aggregate source units into retail SKUs.

Use three data layers:

1. Existing source network, raw source records, provenance and private OSRM preparation.
2. Existing six legacy DEMO fixtures and 85 S1 orders, retained for their existing walkthroughs.
3. New versioned video campaign: **37 orders, six unsubmitted drafts, five active-day road-backed trips, and historical trips generated through the same validator**. Counts below apply to the campaign only.

The current seed provides four role accounts, three authorized supplemental outlets, six selectable products, three vehicles and six RECEIVED October 5 orders. It does not populate the full workflow. `seed/README.md` is outdated and should be corrected during implementation.

## 2. Identities and reference data

| Entity | Required campaign setup |
| --- | --- |
| Store manager | Existing `manager` / `DEMO-MANAGER`; explicit outlet bindings for every campaign store. Fresh, Style and Tech are three brand views within this persona. |
| Dispatcher | Existing `dispatcher` / `DEMO-DISPATCHER`; planning, shortage approval, issues, conflict review and existing demo administration permission. |
| Loader | Existing `loader` / `DEMO-LOADER`; assigned to all five campaign manifests. |
| Driver | Existing `driver` / `DEMO-DRIVER`; judge representation of the assigned vehicles. Only one trip is already started; remaining assignments are staged work, not simultaneous physical journeys. |
| Outlets | Ten supplemental stores: Fresh F1–F4, Style S1–S3, Tech T1–T3. Reuse the existing authorized demo outlet as each brand's first store; add seven campaign outlets. Use clearly labelled synthetic names, same depot/district per trip, explicit access, windows, docks and service allowances. |
| Scope control | Preserve `DEMO-OUTSIDE` without manager authorization; it must never appear in manager catalogue, orders or evidence. |
| Catalogue | Existing rice, milk, frozen vegetables, garments, television and washing machine products; retain units, kg/m³, handling and supplemental provenance. No invented prices or source SKU claims. |
| Fleet | Existing dry truck, van and reefer plus two explicitly supplemental dry trucks with reviewed capacities/fuel. Five distinct vehicle/date/slot assignments. Keep source fleet records intact. |
| Roads | Add private, labelled supplemental OSRM-snapped points for each campaign outlet. Existing demo outlets are not assigned road points by `DemoSeed`; do not assume their routes work. |
| Contacts | Leave phone links absent unless actual authorized demo contact numbers are provisioned. Do not seed invented contact numbers. |

Retain existing account credentials; do not embed cloud passwords or change them. Four separate browser profiles are required because same-origin tabs share session cookies and account-scoped local state.

## 3. Exact opening-state manifest

Campaign keys below are stable seed identifiers, **not replacements for server-generated WP order references**. Every order detail must retain its real reference, UUID, line UUIDs, versions and timeline.

| Keys | Count | Opening state | Contents and purpose |
| --- | ---: | --- | --- |
| A01–A03 | 3 | RECEIVED, confirmation pending | F1: 12 rice cartons; S1: 4 garment cartons; T1: 1 TV + 1 washer. Populate dispatcher review and store submitted-order tracking. |
| A04–A08 | 5 | RECEIVED, confirmed | F2: 8 rice; F2: 12 milk; F3: 6 frozen cartons; T2: 2 TVs; S2: 25 garments. Planning queue covers dry, chilled, frozen, protected goods and an access/capacity rejection. |
| A09–A11 | 3 | SCHEDULED | F1/F2/F3: 10/8/6 rice cartons. Untouched Fresh dry trip is the main recording handoff and amendment/revision example. |
| A12–A14 | 3 | SCHEDULED | S1/S2/S3: 6/5/4 garment cartons. Untouched van trip demonstrates Monday service, mall windows and manual reordering. |
| A15–A17 | 3 | LOADING | T1: 2 TVs, physically counted 1 with SHORTAGE; T2: 1 washer counted 1; T3: 1 TV counted 1. Partial approval is still pending and no stop is released. |
| A18–A20 | 3 | RELEASED | F1/F2/F3: 8/6/10 milk crates, all quantities complete. Separate chilled trip is ready to acknowledge/start. |
| A21 | 1 | IN_TRANSIT | F4: 3 rice cartons; stop 4 of the already-started Fresh trip. |
| A22 | 1 | ARRIVED | F3: 6 rice cartons; stop 3 of that trip, ready for driver proof/offline branch. |
| A23–A24 | 2 | DELIVERED, receipt pending | F1/F2: 4/5 rice cartons; stops 1/2 of that trip. Accepted proof exists, no manager receipt yet. |
| A25–A26 | 2 | DEFERRED | F4: 1,000 rice cartons, excess whole demand with real validation failure recorded; T2: 1 TV, documented receiving closure with next day 13 October. A26 has the linked replacement N01. |
| A27 | 1 | CANCELLED | S3: 2 garments; manager cancelled before allocation, with reason and audit. |
| H01–H09 | 9 | RECEIVED_AT_STORE | Three completed examples per brand over October 5–10. Include normal receipt, approved loading shortage, and separately explained receiving discrepancy. All Style examples use October 5. |
| N01 | 1 | RECEIVED, confirmed, October 13 | Single linked replacement for A26, same whole demand, with rescheduled-from link and original deferral retained. |

Totals: **27 primary-day orders + nine historical orders + one next-day replacement = 37**. Pending/confirmed are both RECEIVED; distinguish them with `confirmation_required` and `confirmed_at`, not invented statuses.

Allocate history keys H01–H03 to Fresh, H04–H06 to Style, H07–H09 to Tech. Each brand gets one normal example, one approved shortage example and one receiving discrepancy example. Use modest valid quantities: rice 5, garments 4, TV 2. For shortage cases load/deliver/receive one fewer; for receipt discrepancies load/deliver the full quantity and receive one fewer with an explicit explanation. Tech discrepancy can record damaged packaging. Each completed example needs a published road trip, physical counts, release, trip start, ordered arrival, accepted proof and separate receipt.

Six unsubmitted drafts: Fresh dry 5 rice; Fresh chilled 6 milk; Fresh frozen 4 frozen; Style 3 garments; Tech 1 TV; Tech 1 TV + 1 washer. Bind drafts to the intended outlet, account and eligible date. Do not count drafts as orders or submit them before filming.

## 4. Five active-day manifests

| Trip | Vehicle | Delivery sequence | Opening condition | Ordered mass / volume |
| --- | --- | --- | --- | --- |
| P1 | Existing dry truck | A09 → A10 → A11 | All SCHEDULED; editable until any loading begins | 480 kg / 0.96 m³ |
| P2 | Existing van | A12 → A13 → A14 | All SCHEDULED; mall/access demonstration | 120 kg / 2.25 m³ |
| P3 | Additional dry truck 1 | A15 → A16 → A17 | All LOADING; A15 shortage awaiting dispatch decision | 119 kg / 1.25 m³ ordered; 101 kg / 1.00 m³ counted |
| P4 | Existing reefer | A18 → A19 → A20 | Every stop RELEASED; chilled-only 2–5°C | 288 kg / 0.72 m³ |
| P5 | Additional dry truck 2 | A23 → A24 → A22 → A21 | DELIVERED, DELIVERED, ARRIVED, IN_TRANSIT | 360 kg / 0.72 m³ |

Loading order is the reverse of delivery order, displayed with stable stop identifiers. P1/P2/P3/P4 have three stops; P5 has four. Trip start advances every released stop together; do not create P5 with a later stop still RELEASED.

Set route departures only after actual OSRM validation: Fresh starts no earlier than 03:30 and completes unloading by 08:00; Style's first stop fits its 10:00–12:00 mall bay, while the other two use 09:00–16:00 rear docks; Tech fits 09:00–16:00. The supplied Style mall allowance is 59 minutes, so three mall stops would not fit the two-hour window. Keep source allowances unchanged. Respect road return, reload allowance, service, waiting, category budgets, weekly fuel and both capacities. Distinct vehicles prevent slot collisions but do not bypass validation. The capacity totals above are arithmetic; the implemented fixture additionally passed actual route validation.

A08 is an intentional failure: 25 garment cartons weigh 200 kg but occupy 3.75 m³, exceeding the existing 3 m³ van. A truck violates the mall's VAN_ONLY access. Show failures without publishing an invalid trip. A25 is 20,000 kg / 40 m³; evaluate eligible fleet and defer the whole order with the actual failure and next eligible date. Frozen A06 demonstrates a separately validated compatible cold trip; never combine it with chilled milk or imply certified source frozen capability.

## 5. What every persona can show

| Persona | Populated screens at baseline | Live action reserved for recording |
| --- | --- | --- |
| Store manager | Fresh/Style/Tech home, drafts/catalogue, submitted and planned orders, tracking, two receipt tasks, cancelled/deferred lineage and nine history records | Resume a draft, review/submit, inspect tracking, confirm the main trip receipt separately from proof. Switch brands to show mall and fragile/heavy handling. |
| Dispatcher | Confirmation queue, five confirmed planning orders, five trip manifests, published versions/road geometry/capacity/fuel, shortage awaiting approval, deferrals/replacement, issues/history, source network | Confirm newly submitted demand; propose/validate; approve loader shortage; review retained proof conflict; reorder untouched P2 and show failed validation. |
| Loader | Fresh dry scheduled manifest, Style van manifest, Tech physical count/shortage hold and already released chilled manifest | Work P1 in reverse sequence, count A09 one short, obtain approval, release every stop. P3 supplies an already visible held-load example. |
| Driver | P5 already in progress with completed/current/next stops, P4 ready to start, accepted proof history and coherent published journeys | Start the fully released P1 once; arrive in sequence; photo preview/save; complete the second stop offline and recover its same-stop conflict. |

Seed four durable issue conversations through authorized endpoints: Tech loading shortage, Style bay/window reminder, Tech receiving closure, and historical damaged-package receipt. Each includes a useful order-specific message and an authorized response, with actual authors and timestamps. Avoid unsupported invoice, barcode, signature or chat-integration content.

The manager UI initially prefers a source outlet when source imports exist. Recording preparation must explicitly select campaign F1 and set the same October 12 operating day in every profile. Driver proof/journey selection must target the intended trip; do not rely on whichever assignment sorts first.

## 6. Evidence, offline and live map

Historical and pre-delivered orders require real valid JPEG/PNG fixture assets of sample cartons/packaging, clearly identified as staged demo evidence. Use modest reusable images with an asset-to-order manifest; never use the existing walkthrough's one-pixel PNG for visible video evidence. Create/read fixtures during implementation and verify preview and protected access.

Keep ordered, loaded, delivered and received quantities separate. An approved shortage remains visible and receiving its approved delivered quantity does not introduce another discrepancy. Store proof capture time, server acceptance time and receipt time separately; older operating dates do not justify fabricated historical capture timestamps. Mark baseline events as staged seed actions.

Device-only state is a separate rehearsal step. A PostgreSQL seed cannot populate Dexie drafts/outbox, service-worker cache or browser permissions:

- Baseline profiles: signed into their own persona, cached online, consistent selected day/outlet, no stale drafts/outbox/conflicts.
- Offline take: arrive at P1 stop 2 online, load its proof workspace once, disconnect/reload, capture/save proof, defer that same stop as dispatcher, reconnect, inspect retained conflict, explicitly accept with reason, then confirm store receipt. Capture this through the real browser; it is not represented by a forged server conflict row.
- Optional screenshot checkpoint: a separate driver profile with a photo draft or pending action generated by the actual UI. Label this checkpoint and keep it separate from clean recording profiles.
- Live map: imported outlets with configured points; missing vehicle reports remain visible as missing. Any judge simulator report must use the app's explicit simulator label. October 12 is future on the planning date, so route times remain planned; a current-day arrival estimate requires a supported current operating date, fresh accurate report and OSRM. Do not promise live ETA from this baseline.

## 7. Implementation sequence

1. Add a campaign fixture definition with stable namespace, schema version, date parameter, entity keys, quantities, intended states and expected totals. Keep campaign identities distinct from legacy and S1 fixtures. Update stale seed documentation.
2. Add seven supplemental outlets, two dry vehicles, required account scopes, reviewed calendar entries/service metadata and privately generated road points. Retain raw source data and existing credentials.
3. Build a fixture runner against an isolated demo stack. Create baseline historical demand with an explicitly demo-gated fixture mechanism because normal order submission enforces future-day cutoff; do not weaken the product cutoff for filming.
4. Submit/confirm active demand through existing lifecycle APIs where eligible. Validate/publish plans using existing planning APIs and actual OSRM. Use returned versions and WP references throughout.
5. Advance loading/release/start/arrival/proof/receipt/deferral/rescheduling through existing workflow APIs. Use a narrow authorized fixture factory only for baseline demand unavailable through regular APIs; never fabricate a route, approval, processed action or status chain directly in SQL.
6. Create six drafts and issue conversations. Write an ignored campaign report mapping stable keys to actual references/IDs/trips and recording quantities, scope checks, validation and dataset checksums. Keep private source rows and credentials out of tracked output.
7. Add browser preparation/checkpoint tooling separate from the server runner. It should stop on a conflicting device outbox, not silently erase unsynced evidence.
8. Produce a backed-up `video-start` checkpoint on the demo environment and a successful preflight report. Rehearse once, restore that checkpoint to an isolated recording environment, then record. No automatic cloud reset/deployment.

Implemented files: `seed/video-campaign.json`, `tools/seed-video-demo.mjs`, `tools/verify-video-demo.mjs`, `tools/prepare-video-browsers.mjs`, `tools/backup-video-demo.mjs`, `tools/verify-video-backup.mjs`, and ignored `data/private/video-demo-local/report.json`. The isolated database's `video_seed_campaigns` and `video_seed_entities` explicitly register membership for targeted reset; no display-name prefix is used to infer ownership.

Restart must not regress consumed demo work. A second seed invocation should verify/return the original checkpoint or clearly report a consumed campaign; reset is an explicit separate operation. The current `tools/reset-demo.sql` deletes all `demo=true` and S1 orders, including evidence, and is too broad for a campaign reset. A campaign reset must delete only that campaign's dependent data, include N01 and drafts, handle self-referencing rescheduling links in safe order, and preserve shared source/non-campaign plans and accounts.

## 8. Recording script, approximately 7 minutes

| Time | Scene | Starting record |
| --- | --- | --- |
| 0:00–0:35 | Introduce four personas; show populated brand overview and clear supplemental/replay context | F1 overview |
| 0:35–1:15 | Store draft → review → submit; brief Style and Tech views | Fresh dry draft; A02/A03 |
| 1:15–2:15 | Dispatcher confirmation, road proposal/capacities, published P1 and van-only volume failure | New submission; P1; A08 |
| 2:15–3:10 | Loader reverse sequence; one missing carton; dispatch approval; all stops released | A09–A11 |
| 3:10–4:05 | Driver starts shared trip, arrives stop 1, captures proof; manager separately receives approved quantity | A09 |
| 4:05–5:30 | Offline reload/proof, same-stop dispatcher deferral, reconnect conflict, explicit evidence recovery | A10 |
| 5:30–6:15 | Untouched van revision, explicit excess deferral and linked next-day replacement | P2; A25/A26/N01 |
| 6:15–7:00 | History/audit and source-network view; optional January S1 cutaway; architecture/limits | H01–H09; separate January replay |

Keep a cue sheet with actual generated WP references, outlet selection, operating date and opening quantities for each scene. The primary end-to-end chain remains untouched at the baseline. The existing dataset walkthrough consumes its dry S1 trip and cannot be run immediately before filming that same source workflow without restoring an appropriate demo checkpoint.

## 9. Required readiness checks

- Campaign totals are 37 orders, six unsubmitted drafts, five active-day trips and 16 active-day route stops; history has nine fully receipted orders and matching validated runs/stops. Legacy/source counts are checked separately.
- All four demo accounts authenticate; manager sees ten campaign stores plus its existing authorized source scope and cannot access `DEMO-OUTSIDE`. Loader/driver see only authorized assignments/evidence.
- Opening states match the manifest. Confirmed orders are planning-eligible; pending confirmations remain held. A26 has exactly one N01 replacement with original demand and history intact.
- Every trip passes Spring validation with real route geometry, distance, time, service, return, fuel, temperature, access, kg/m³, windows and booklet budgets. Failures from A08/A25 are expected and cannot publish.
- No orphaned lines/runs/stops/attachments, no conflicting vehicle slots, no invented plan versions. Loader release blocks until all counts/approvals are satisfied; driver departure blocks until the entire trip is released.
- All quantity chains satisfy 0 ≤ received ≤ delivered ≤ loaded ≤ ordered; shortages and receiving discrepancies retain separate reasons and actors. Every delivered/history item opens a valid protected image.
- Dispatcher, manager, loader and driver screens are visually checked at recording desktop size, plus phone layouts for driver/loader. Draft resume, receipt task, issue timeline and history are actually visible under the intended selections.
- The offline rehearsal survives reload and preserves photo/action identity; reconnect conflict recovery retains the deferral and creates a separate receipt task. Repeated submission does not duplicate proof or replacements.
- Seed rerun does not duplicate or rewind work. Campaign reset restores the baseline while leaving S1, legacy, source network, accounts and unrelated operational data intact. Verify device state separately after any server restoration.
- Report is green and the recording start checkpoint is backed up. Database access/OSRM feasibility, physical camera/GPS behavior and recording-environment visual checks must be reported as unverified until executed.

Completion criterion: four populated persona sessions, a repeatable clean baseline, an intact main recording chain, a complete cue sheet and a passing campaign preflight. A plan document alone does not mean the database is video-ready.
