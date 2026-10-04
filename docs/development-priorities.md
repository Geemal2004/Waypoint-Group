# Waypoint development priorities

Spring remains authoritative for operational state and allocation validation. Python proposes plans; OSRM supplies operational road routes. Development preserves shared identifiers, version checks, loading locks and retained evidence across the four roles.

| Improvement | Current work / next step |
| --- | --- |
| Durable proof preparation | Account/stop-scoped quantity, issue and photo drafts survive reloads before submission. IndexedDB v3 adds a separate table while retaining earlier outbox evidence. Changed stop versions block draft submission. Final save atomically creates the immutable action/photo and removes the draft. Browser acceptance is in progress. |
| Publication review | After Spring validation, show every vehicle/trip, departure/return, fuel, ordered stops, deferred count, next version and receiving roles. Edits invalidate validation; Spring rechecks publication. |
| Plan change consequences | Next: show before/after arrival, stop/loading position and window margin for untouched-manifest revisions, plus bounded draft undo/redo. Calculate later-trip effects in Spring and preserve loading locks. |
| Deferral clarity | Next: separate the constraint, dispatcher's choice, recovery action and what the outlet sees. Keep actual skip history. Do not promise a next trip without validation. |
| Other offline actions | Preserve immutable proof UUIDs and retained conflicts. Additional offline mutations need server version and ordering rules before implementation. |
| Receiver and receipt evidence | Next: address receiver/signature and damage evidence gaps. Photo compression needs decode limits, an original-evidence policy and real phone testing. |
| Mobile performance and languages | Measure mobile startup, then split heavy role/map bundles. Sinhala/Tamil requires reviewed translations and layout tests. Keep submitted typography and tokens. |
| Proposal caching | Any cache needs dataset, policy and road revision keys plus Spring revalidation. ML remains deferred. |
| Judge isolation | Consider isolated judge sessions. Preserve live competition history, actual capture/audit times and the declared replay day. |

Local drafts are preparation, separate from proof acceptance and receipt confirmation. “Draft saved” appears after the IndexedDB write completes; storage failures are visible and submission is disabled. Drafts remain account scoped after sign-out with explicit discard. Clearing browser storage removes local drafts/evidence. Concurrent tabs editing one unsent draft are not a collaborative editor; final outbox duplicate guards and server replay rules still apply.

Acceptance must cover offline reload before submission, photo/count/issue restoration, stale-draft preservation/discard, atomic draft-to-outbox transfer, account isolation, schema upgrade and same-stop conflict recovery. Private multi-stop acceptance remains distinct from public CI fixtures. Physical mobile acceptance and the broader product backlog remain open.
