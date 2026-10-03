# Submission preparation

The competition deployment is **https://18-138-29-235.sslip.io**; HTTPS, source multi-stop workflow and three browser scenarios are verified. Private judge credentials are in ignored `data/private/lightsail-judge-access.txt`. The human-recorded video is pending. Keep the repository name until the team supplies TeamName for TeamName_SolutionName and confirms the final repository URL.

Deployment uses the existing Compose services with migrations and persistent PostgreSQL. Use the isolated HTTPS override in [deployment instructions](deployment.md); restrict core/planning to the private network, set SESSION_SECURE=true, choose deployment-specific database credentials, and provision passwords appropriate for the judge environment. Back up the PostgreSQL volume including evidence. Do not place challenge CSVs or generated import SQL in a public repository, image, artifact or website. Confirm the competition's hosting/data rules before uploading private challenge reference data.

Acceptance gates: follow README's private dataset and pinned OSRM preparation on a fresh database, verify readiness and seeded scopes, execute the dataset API and browser walkthroughs, check authentication/CSRF and evidence restrictions through HTTPS, verify PWA reload and session expiry, then record the actual public URL. Judge routes use actual OSRM road durations with explicitly supplemental waypoints and declared cold capabilities. Actual outlet coordinates and certified fleet capabilities remain required for production use.

Suggested new unlisted video, 5–8 minutes:

1. 0:00–0:40 — problem, four roles, hackathon/Datathon boundary, January source planning replay and supplemental waypoint/cold labels.
2. 0:40–1:40 — dispatcher proposes the dataset judge scenario: ordered multi-stop trips, separate Fresh dry/chilled, van-only access, fixed mall window, both capacity bars, fuel and recorded excess-demand deferral. Show Spring validation and versioned publication.
3. 1:40–2:40 — loader reverses the published stop order; record a one-unit shortage, dispatcher approval and release every stop before the shared trip starts. Keep the visible source quantities consistent.
4. 2:40–3:40 — driver follows stop order, safely stopped arrival, actual photo and the store's separate receipt of the approved loaded quantity.
5. 3:40–5:20 — disconnect/reload, local proof, same-stop deferral, reconnect/conflict, preserved evidence, authorised recovery.
6. 5:20–6:20 — manual stop reorder/retiming with the same validator, capacity/window failure, deferred reason and consecutive-skip history; show the Tech mall window and road return/reload timing.
7. 6:20–7:20 — architecture, scoped sessions, transactional locks/idempotency, local storage, actual verification results and remaining integrations.

Record fresh footage with visible application behavior. Do not reuse a Designathon video or claim trained models, verified customer integrations or production-certified geography. Include the confirmed public URL, repository URL and four judge account credentials in the final submission. Human recording/upload is pending.
