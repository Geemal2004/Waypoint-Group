# Driver role improvement plan

Updated 4 October 2026. Runtime field reliability requires physical-device validation.

## Recommendation

Improve the existing driver workflow in place. Keep Spring authoritative, preserve published stop order and loading locks, and extend the existing account-scoped IndexedDB drafts/outbox. Use a phone-focused task flow and consistent driver/dispatcher trip context. Keep Waypoint Group's typography, day/night tokens and real OSRM geometry.

Target flow: Today's trips → Review released load → Start trip → Next stop → Arrive → Record delivery → Saved confirmation → Next stop → Trip summary. Report a problem and sync status remain accessible throughout.

## What the review found

| Project | Evidence | Implication |
| --- | --- | --- |
| Waypoint Group | `apps/web/src/components/operations.tsx`: Driver starts at line 708; Journey/Stop proof/Sync/History tabs; assigned-stop selector; departure and arrival disabled offline; quantity/issue/photo proof drafts. | Strong foundations, but the screen is organized around orders and tabs rather than the driver's current trip and next task. Offline proof needs an already-arrived stop. |
| Waypoint Group | `apps/web/src/components/live-operations.tsx`: existing road journey, timing and explicit foreground location sharing. `lib/proof-draft.ts`, `offline-db.ts`, `sync.ts` preserve evidence. | Reuse existing routing, location and recovery infrastructure. |

Our development priorities already identify receiver/signature evidence, additional offline actions, mobile performance and reviewed translations. This plan makes those actionable for the driver role.

## Delivery sequence

### 1. Make the current trip and next action obvious — P0

- Extract driver screens from `operations.tsx` into a dedicated driver feature directory, keeping existing behavior during the extraction.
- Group assignments by stable route-trip ID and operating day. Show vehicle, depot, temperature, trip progress and the next eligible stop. Avoid mixing stops from multiple trips in the default selector.
- Put the next-stop card first: outlet, window, access restriction, loaded quantity, planned arrival and supported live estimate with freshness/source. Keep the map and full manifest below or behind a detail action.
- Show one primary action for the current state: review/start, arrive, record proof, or continue. Keep Sync and History accessible as secondary destinations.
- Review the full released manifest before starting, including every approved shortage and the plan revision. Use existing server checks for full-trip release and order sequence.
- After proof save, show a dedicated confirmation distinguishing saved on this phone, uploading, accepted and needing review, then offer the next task. A local save must not imply server completion or store receipt.

Acceptance: two assigned trips never interleave; an incomplete load cannot depart; later stops cannot bypass server sequencing; a 390 px phone shows the next task without horizontal scrolling; existing proof and conflict regressions pass.

### 2. Complete the offline stop workflow — P0

Today departure and arrival require connectivity, while proof can be saved offline after arrival. First extend arrival, then allow proof to depend on that queued arrival. Keep departure online in the first release.

- Define a server event contract for offline arrival with immutable action UUID, account, trip/order IDs, original version, captured time and optional location metadata.
- Cache the authorized manifest and released quantities with their revision and fetched time. Explain when no offline snapshot exists.
- Persist arrival before showing local success. Queue proof behind its specific arrival dependency, using server-returned state/version after arrival acceptance rather than guessing a version increment.
- Distinguish local progress from accepted operational state. Reconcile the next-stop display with locally saved work without marking server delivery complete.
- Retry safely in order. If arrival conflicts with a deferral or reassignment, retain the arrival and dependent proof for review. Never silently discard evidence or apply it to another assignment.
- Count distinct affected stops in the driver banner, with separate photo-only and needs-review states. Keep technical action details available in Sync.

Acceptance: lose signal before arrival → arrive → capture proof → reload → reconnect; duplicate retries are idempotent; a changed/deferred stop retains evidence; account switching cannot replay another account's events; dependent proof cannot outrun arrival; storage failure cannot display false success.

### 3. Add structured problem reporting — P1

Extend the existing IssueConversation and scoped live-operations service with structured field reports.

- Offer the six field reasons listed below, with context-specific inputs: delay minutes, blocked access detail, refusal reason, damaged line/count or vehicle detail.
- Attach trip/stop context, captured time, optional authorized location and optional photo. Do not require GPS to report a problem.
- Persist offline reports through a defined event contract; display saved locally versus delivered to dispatch.
- Show dispatch acknowledgment and reply, and call links only where authorized numbers exist.
- A report does not automatically defer an order, skip a stop, change a receiving window or reassign a vehicle. Dispatch retains the validated recovery workflow.

Acceptance: an offline report survives reload; dispatch sees one report after repeated retries; replies reach the correct driver; reporting a closed outlet cannot bypass the stop-state rules.

### 4. Improve proof and receiver evidence — P1

- Add receiver name and optional signature capture, with a documented evidence policy before making either mandatory.
- Offer an all-released-quantity path plus explicit quantity adjustment. Record a reason per changed line while preserving approved loading shortages separately from delivery discrepancies.
- Add the new fields to draft restoration, immutable submission, backend validation, accepted-proof display and retained-conflict review together.
- Keep driver delivery evidence separate from the store manager's confirmed received quantities. A signature must not implicitly create a store receipt.
- Improve photo preview/retake and camera selection. Define decode limits, upload limits and original-evidence retention before compression; review all image processing changes.

Acceptance: receiver, signature, quantities and photo survive offline reload; invalid counts are rejected server-side; schema upgrades retain earlier evidence; stale drafts preserve every evidence field; photo failure leaves the draft recoverable.

### 5. Add trip summary and explicit completion — P1

- Show delivered/remaining/deferred stops, delivered quantities, unresolved issues and pending evidence for the selected trip.
- Inspect the existing trip schema before adding lifecycle fields. Define delivery work finished separately from returned to depot; do not free vehicle capacity merely because the final proof was saved locally.
- Add a versioned, idempotent completion endpoint with explicit unresolved-stop rules. Start with online completion; offline completion follows only after dependency ordering is proven.
- Preserve historical trip context so completed stops do not disappear from the driver's run summary when the active-order filter changes.

Acceptance: completion cannot hide unresolved stops or evidence; repeated finish calls do not duplicate state; completing trip 1 cannot release or start trip 2 incorrectly; dispatcher and driver show the same accepted lifecycle.

### 6. Improve field usability and readiness — P2

In-vehicle readability, layout and touch design are planned in detail in `driver-in-vehicle-ux-plan.md`.

- Review 48 px action targets, contrast, fixed-action placement, screen-reader labels, keyboard focus and day/night layouts.
- Introduce reviewed Sinhala/Tamil translations with long-text and quantity/time-format checks. Product translations require human review.
- Split driver/map bundles after measuring startup on a low-end Android device. Measure photo upload and IndexedDB behavior on weak networks.
- Validate foreground location, permission denied, inaccurate/stale position, camera and reload on physical phones. Continue to label replay dates and simulator data explicitly.
- Show live ETA only under our existing freshness/accuracy/routing rules. Model-derived expected times require an implemented and validated model.

## Technical work boundaries

| Area | Planned change |
| --- | --- |
| `apps/web/src/components/operations.tsx` | Extract Driver and proof presentation incrementally; introduce trip-based selection and state-specific screens. |
| `apps/web/src/components/live-operations.tsx` | Reuse DriverJourney, timing/location and scoped issue conversations; expose data suitable for the next-stop card. |
| `apps/web/src/lib/models.ts`, `api.ts` | Add typed driver event/evidence contracts as needed; preserve existing stable identifiers. |
| `apps/web/src/lib/offline-db.ts`, `proof-draft.ts`, `sync.ts` | Versioned migrations, receiver/signature fields, dependent events and distinct stop sync summaries. Preserve original evidence/action UUIDs. |
| Spring workflow and sync services | Authoritative arrival sequencing, idempotent dependent replay, proof validation and retained conflicts. |
| Spring live-operations services | Structured incident data and scoped acknowledgment/replies using existing conversation authorization. |
| PostgreSQL migrations | Add only reviewed evidence/incident/lifecycle fields; preserve historical audit and existing proof data. |
| Existing browser/API tests | Add offline-before-arrival, multiple-trip selection, evidence migration and completion scenarios; retain four-role handoff coverage. |

## Rollout and validation

Use separate reviewable increments: (1) screen extraction and trip/task UX, (2) offline event contract and arrival/proof dependencies, (3) structured incidents, (4) receiver evidence, (5) completion, (6) translation/performance. Backend migrations and compatible contracts precede UI features that need them.

For each increment, run relevant frontend checks and existing regression coverage; run Spring integration tests for state/authorization/migrations. For offline changes, use browser reload/disconnect tests and the existing retained-proof recovery scenarios. Validate physical phones before claiming field readiness. Use isolated fixtures rather than resetting shared competition history.

Release gates: zero lost drafts/evidence in reconnect scenarios; no cross-account replay; server-enforced stop order and full loading release; clear local-versus-server status; no horizontal overflow on phone screens; driver/dispatcher/store handoffs retain consistent accepted state.

Implementation progress: trip grouping, released-load summary, progress, current-stop action before the map, stop-based sync status, persistent saved confirmation and client-side loading/stop-sequence guards are implemented. Server checks remain authoritative. Offline arrival, receiver/signature evidence, structured reports and explicit trip completion remain planned.

Validation for this increment: production build, TypeScript and changed-file formatting passed. Two phone browser scenarios passed against the production shell with mocked API responses: trip isolation/stop-sequence guards/accepted proof, and offline proof save/reload/restored confirmation/reconnection. The existing handoff test helper now selects the assigned trip before its stop. Full database-backed handoff and physical-phone acceptance were not rerun for this increment.
