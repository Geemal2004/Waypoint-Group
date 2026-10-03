# Product screen-to-Figma coverage

Reference file: [Waypoint Designathon](https://www.figma.com/design/gWapWGfw3V1dhKLlMKSwxG/Waypoint_Designathon--Copy-).

| Screen / treatment | Figma frame | Implementation / verification |
| --- | --- | --- |
| Semantic foundations | 2116:28 | Day/night semantic tokens, DM Sans, tabular numbers, 8 px panel/spacing rhythm; full dark acceptance pending |
| Dispatcher shell and orders | 2091:23 | 190 px navigation rail and compact shell implemented; orders workspace pending |
| Dispatcher planning | 2292:45 | Filterable order table, vehicle-run assignments, selected-run constraints and publication bar; 1440×900 first pass visually compared |
| Loader tablet | 2104:5 | Reference code/screenshot inspected; task rebuild pending |
| Loader phone / partial release | 2212:13 | Reference code/screenshot inspected; task rebuild pending |
| Driver journey start | 2289:25 | Reference code/screenshot inspected; task rebuild pending |
| Driver proof | 2107:11 | Reference code/screenshot inspected; preview/sticky proof rebuild pending |
| Driver conflict / recovery | 2107:49 / 2107:79 | Existing evidence recovery works; new visual review pending |
| Fresh store catalogue | 2109:8 | Reference code/screenshot inspected; task rebuild pending |
| Fresh receipt | 2109:130 / 2233:81 | Existing receipt works; new visual review pending |
| Style / Tech store | 2110:18 / 2111:26 | Theme-specific visual review pending |

Before captures: `tmp/product-ui/before/` (dispatcher 1440×900; store/loader/driver 390×844; loader tablet 1024×768). First dispatcher after capture: `tmp/product-ui/after/dispatcher-planning-first.png`. Captures remain private and gitignored because they contain challenge records. `node tools/capture-product.mjs before|after` reproduces the role captures; screenshots do not replace functional acceptance.

The first dispatcher comparison preserves Figma's rail, heading, compact metrics, brand-associated accents, white panels and assignment hierarchy. Responsive grid widths adapt the 1600 px reference to 1440 px. Actual source quantities and OSRM routes replace illustrative design values. A selected-run map adds operational information requested in this milestone. Demo provenance is accessible through a concise indicator and information dialog. Assignment checks and immutable APIs remain authoritative.
