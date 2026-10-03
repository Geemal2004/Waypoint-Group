# Product screen-to-Figma coverage

Reference file: [Waypoint Designathon](https://www.figma.com/design/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-).

| Screen / treatment | Figma frame | Implementation / verification |
| --- | --- | --- |
| Semantic foundations | 2116:28 | Day/night semantic tokens, DM Sans, tabular numbers, 8 px panel/spacing rhythm; local dark captures inspected; human pixel-fidelity acceptance pending |
| Dispatcher shell and orders | 2091:23 | 190 px navigation rail and compact shell implemented; orders workspace implemented with review/shortage/deferral commands |
| Dispatcher planning | 2292:45 | Filterable order table, vehicle-run assignments, selected-run constraints and publication bar; 1440×900 first pass visually compared |
| Loader tablet | 2104:5 | Reference code/screenshot inspected; role task screens implemented |
| Loader phone / partial release | 2212:13 | Reference code/screenshot inspected; role task screens implemented |
| Driver journey start | 2289:25 | Reference code/screenshot inspected; role task screens implemented |
| Driver proof | 2107:11 | Reference code/screenshot inspected; preview and persistent phone proof action implemented |
| Driver conflict / recovery | 2107:49 / 2107:79 | Existing evidence recovery works; new role navigation and evidence/history implementation inspected |
| Fresh store catalogue | 2109:8 | Reference code/screenshot inspected; role task screens implemented |
| Fresh receipt | 2109:130 / 2233:81 | Existing receipt works; new role navigation and evidence/history implementation inspected |
| Style / Tech store | 2110:18 / 2111:26 | Brand catalogue captures inspected |

Before captures: `tmp/product-ui/before/` (dispatcher 1440×900; store/loader/driver 390×844; loader tablet 1024×768). First dispatcher after capture: `tmp/product-ui/after/dispatcher-planning-first.png`. Captures remain private and gitignored because they contain challenge records. `node tools/capture-product.mjs before|after` reproduces the role captures; screenshots do not replace functional acceptance.

The first dispatcher comparison preserves Figma's rail, heading, compact metrics, brand-associated accents, white panels and assignment hierarchy. Responsive grid widths adapt the 1600 px reference to 1440 px. Actual source quantities and OSRM routes replace illustrative design values. A selected-run map adds operational information requested in this milestone. Demo provenance is accessible through a concise indicator and information dialog. Assignment checks and immutable APIs remain authoritative.

Final inspected captures: `tmp/product-ui/release/` (earlier inspected set: `tmp/product-ui/accepted/`), including dispatcher planning/live network, store home/three catalogues/product counts, loader phone/tablet and driver journey in day/night. No horizontal overflow was detected in all 17 capture variants. The initial `final/dispatcher-1440.png` caught a loading state and is superseded by the actual rendered `release/` capture; loading screenshots do not establish screen acceptance. Loader captures show a genuine three-stop source trip and reverse load sequence. The submitted Figma frames were fetched before screen implementation; assets sit in semantic slots, not as full-page screenshots.

Phone primary actions use safe-area padding and remain persistent for ordering, loading and proof; the catalogue compresses repeated context while retaining outlet/date controls and temperature separation. Maps display OpenStreetMap attribution, actual OSRM geometry, labelled supplemental waypoints and explicit missing-position/tile states. Demo/source provenance is in the information dialog or secondary details. Full human design acceptance and physical device checks remain open.

Additional inspected phone proof/night and permission/accuracy/offline captures are in `tmp/product-ui/location/`. The location walkthrough uses explicitly emulated browser coordinates and an isolated source Tech trip, not physical GPS.
