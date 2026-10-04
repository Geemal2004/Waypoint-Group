# Driver in-vehicle UX plan

Updated 4 October 2026. Companion to `driver-role-improvement-plan.md`, which covers workflow, offline and evidence rules. This plan covers how the driver screens look and behave in a vehicle: readable at a glance, operable with one thumb and safe to use.

## Design principles

1. **Glance, don't read.** Anything shown while the vehicle may be moving must be understood in a single glance of under 2 seconds (in line with common driver-distraction guidance). That means one stop, one number, one action.
2. **Stopped work, moving view.** Data entry (arrival, quantities, photos, problem reports) is designed for a parked driver. While moving, the screen shows a read-only glance view. The app reminds and guards but does not claim to enforce safety.
3. **One primary action per screen**, always in the same place: a full-width button anchored at the bottom, inside the thumb zone.
4. **Big by default.** No driver-facing text below 16px. Body text is 18px or larger and key facts are 28–48px.
5. **Never colour alone.** Every state uses an icon, a word and a colour together, so it survives glare, night mode and colour-vision differences.
6. **Plain words, progressive detail.** Show the short sentence first. Plan IDs, action UUIDs, version numbers and audit text go behind a "Details" disclosure.
7. **Forgiving touch.** Bumpy roads and gloves cause mis-taps, so use large, well-spaced targets. Irreversible actions need deliberate confirmation, and an undo is offered where the workflow allows one.

## Problems in the current screen

| Area | Today | Effect in a vehicle |
| --- | --- | --- |
| Type | Inherits 14px body, 12–13px `small`/meta, 18px `h2` | Unreadable at arm's length in a cradle |
| Header | Shared header, day picker, demo button and offline banner above content | Next stop pushed below the fold on a 360px phone |
| Navigation | Four outline tabs (Journey, Stop proof, Sync, History) at top | Out of thumb reach; tabs compete with the task |
| Selection | Native `<select>` for trip and stop | Tiny option text, two-step precise taps |
| Next stop | Paragraph stack: vehicle, plan version, access, window | Must be read, not glanced at |
| Actions | Primary button mid-card; notices below it | Position moves as content changes |
| Map | Map plus long location status and caveat paragraphs | Dense text while driving |
| Proof form | Keyboard number inputs per line | Slow, error-prone, needs precise taps |
| Feedback | Text-only status | Easy to miss without looking |

## Visual system (driver-scoped)

All tokens are scoped under `.app-shell.role-DRIVER`, so dispatcher, loader and store screens are unchanged.

### Type scale (fluid with `clamp()`)

| Token | Use | Size |
| --- | --- | --- |
| `--drv-hero` | Next outlet name, big ETA/countdown | `clamp(32px, 9vw, 48px)`, weight 700, line-height 1.1 |
| `--drv-title` | Screen titles, card headings | `clamp(24px, 6.5vw, 30px)`, 700 |
| `--drv-key` | Key facts (window, units, distance) | `clamp(22px, 6vw, 28px)`, 700, tabular numbers |
| `--drv-body` | Sentences, list rows | `clamp(18px, 4.8vw, 20px)`, line-height 1.45 |
| `--drv-meta` | Secondary labels (smallest allowed) | `16px`, `--muted-foreground` at ≥ 4.5:1 contrast |

- Use `font-variant-numeric: tabular-nums` for times and quantities so digits don't jump.
- Sizes use `rem`, so the phone's system font-size setting scales the layout. Layouts must survive 200% text scale without horizontal scrolling.
- Sinhala and Tamil need about 1.6 line-height and longer labels; buttons wrap rather than truncate.

### Touch and spacing

- Primary action: minimum **64px** high, full width, 20px label, anchored in a bottom action bar with `env(safe-area-inset-bottom)` padding.
- Secondary actions: minimum 56px high. Icon buttons are 56×56px with at least 12px between targets.
- Stepper buttons (− / +) are 64×64px.
- Card padding is 20–24px, and the gap between sections is 16px.

### Colour and contrast

- Key text meets WCAG AAA (7:1) in both day and night themes. Re-check `--muted-foreground` and the warning/critical text against cards.
- Add a **sun mode** (pure white surface, near-black text, thicker 2px borders) for direct sunlight, alongside the existing day/night themes.
- Default to night theme with `prefers-color-scheme: dark`; the driver can override with one tap. Night mode avoids pure white areas larger than a button.
- Status chips pair an icon with a word: ✓ Delivered, ● Next, ⏱ Window risk, ⚠ Needs review, ☁ Saved on phone, ↑ Sending.

### Motion and feedback

- Respect `prefers-reduced-motion`. Allow no layout shift on the current-stop card: reserve space for ETA and status text.
- Haptics (`navigator.vibrate`, 30–60ms) on confirmed actions where supported.
- Optional spoken prompts (Web Speech API), off by default and toggled in settings: "Next stop, Keells Nugegoda, window closes 11:30."
- Keep the screen on during an active trip with the Screen Wake Lock API, and re-acquire it on `visibilitychange`.

## Layout

Driver mode hides the dispatcher-style chrome. The shared header collapses to a 56px bar (trip progress, connection/sync chip, menu). The operating-day picker and demo button move into the menu.

```text
┌────────────────────────────────┐
│ Trip 2 · 3 of 7   ☁ 1 sending ≡│  56px status bar
├────────────────────────────────┤
│                                │
│   Screen content               │  scrolls
│   (one task at a time)         │
│                                │
├────────────────────────────────┤
│ [   PRIMARY ACTION  (64px)   ] │  fixed action bar
├──────────┬──────────┬──────────┤
│  Trip    │  Stop    │  Sync •  │  64px bottom nav, icon + label
└──────────┴──────────┴──────────┘
```

- **Bottom navigation** has three destinations: Trip, Stop and Sync (with a badge). History, theme, voice prompts and sign-out go in the menu.
- **Landscape/cradle** (`orientation: landscape` and short height): two columns, with the map on the left and the stop card plus action on the right. The bottom nav becomes a left rail.
- Use **container queries** on the stop card so it adapts to the column it is in, not only to viewport width.
- Support phones from **360px** wide, the common budget-Android width, up to tablets.

## Screens

### 1. Today's trips (replaces the trip `<select>`)

Large tappable cards, one per trip: vehicle, trip number, departure time, stop count, temperature icon, status chip. With only one trip, skip this screen and go straight to the trip.

### 2. Review released load (before departure)

- Stop list with big rows: sequence badge, outlet, released/ordered units. Shortages are highlighted with a ⚠ chip and the reason.
- Sticky summary at the top: total units, stops, temperature.
- Primary action: **Start trip**, using hold-to-confirm (about 0.8s with a fill animation) to prevent accidental starts. An accessible fallback opens a confirmation sheet for screen-reader and switch users.
- Blocked states (load not fully released, offline) replace the button with a clear disabled bar and one sentence explaining what is needed.

### 3. Next stop: glance view (the main driving screen)

```text
┌────────────────────────────────┐
│ NEXT STOP · 3 of 7             │  meta 16px
│ Keells Nugegoda                │  hero 40px
│ ⏱ 10:30 – 11:30   🚐 Van only  │  key 24px chips
│ 42 units · Chilled             │  key 24px
│ ETA 10:52 · 6.4 km             │  key 28px (only when fresh)
├────────────────────────────────┤
│        [ map, 40% height ]     │
├────────────────────────────────┤
│ [ ➤ Navigate ]  [ ⚠ Problem ]  │  56px secondary
│ [   I've arrived (64px)      ] │  primary
└────────────────────────────────┘
```

- When the vehicle appears to be moving (geolocation `speed` above about 8 km/h while location reporting is on), the glance view is the only screen. The primary button changes to "Stop safely to record arrival" and is disabled. Navigate stays available because it hands off to the maps app. If speed is unknown, show the normal view with a one-line "Only use when parked" reminder.
- ETA shows only under the existing freshness and accuracy rules; otherwise show "ETA unavailable" rather than a stale number.
- Location sharing becomes a single toggle row with a status chip (Sharing / Paused / Weak GPS). The long explanatory text moves to "Details".
- Show the selected stop in the published order. Other stops are reachable from the Trip tab, not from a dropdown.

### 4. Arrive

On tap, show a full-screen confirmation sheet: outlet name, stop number, **Confirm arrival** (64px) and Cancel. A haptic pulse and toast confirm it. A short undo window applies only if the backend supports reverting arrival; otherwise there is none.

### 5. Record delivery (one step per screen)

1. **Quantities.** Prominent **All delivered as loaded** button. Otherwise each line is a row with the product name (20px) and a large −/+ stepper around a 32px quantity. Tapping the number opens the numeric keypad (`inputmode="numeric"`). A changed line asks for a reason via large radio cards.
2. **Photo.** Full-width camera button, large preview, Retake / Use photo.
3. **Receiver.** Name, plus signature when evidence rules are agreed (see the companion plan).
4. **Review & save.** A summary card, then **Save delivery**.

A progress indicator ("Step 2 of 4") sits at the top, and Back is a 56px button. Drafts are kept on every step, using the existing proof-draft storage.

### 6. Saved confirmation

Full-screen state with a large icon and one headline: "Saved on this phone", "Sending…", "Accepted" or "Needs review". One sentence explains it, and **Next stop** is the primary action. Auto-advancing to the next stop is optional; never auto-advance mid-form.

### 7. Trip summary and Sync

- Trip tab: a vertical stop timeline with big rows and status chips, plus delivered/remaining counts.
- Sync tab: one card per stop (not per action) with a plain state and a **Retry** button. Action IDs and timestamps go under "Details".

### 8. Report a problem

Bottom sheet with six large reason tiles (Delayed, Blocked access, Store closed, Refused, Damaged, Vehicle issue). Each tile opens at most one simple follow-up input, then **Send to dispatch**. Usable offline, following the companion plan.

## Technical approach

- **Feature folder:** `apps/web/src/features/driver/` containing `DriverShell`, `TripList`, `LoadReview`, `NextStop`, `ArriveSheet`, `DeliverySteps/*`, `SavedState`, `TripTimeline`, `SyncList`, `ProblemSheet`, and the hooks `useWakeLock`, `useMotionState`, `useHaptics`, `useSpeech`. Logic stays in `lib/driver-workspace.ts`, with the current `Driver` component in `operations.tsx` reduced to a wrapper during migration.
- **Styles:** a `driver.css` layer imported after `index.css`, scoped to `.role-DRIVER`, using the tokens above. Tailwind utilities can consume the same tokens through `@theme`.
- **State machine:** derive one `driverStep` (`choose-trip | review-load | next-stop | arrived | delivery-step-n | saved | trip-done`) from order status, outbox and selection. This replaces the scattered `tab` effects, so the screen never shows a mismatched step.
- **Shell:** `App.tsx` renders a compact header for `DRIVER` and moves the day picker and demo info into the driver menu.
- **PWA:** check that the manifest uses `display: standalone`, portrait-primary with landscape allowed, and a theme colour per theme.
- **Unchanged:** server authority, stop-order and loading-release checks, offline outbox, account scoping and real OSRM geometry.

## Delivery phases

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 1. Foundations (P0) | Driver tokens and type scale, compact header, bottom nav, fixed action bar, wake lock, state machine | No driver text under 16px; primary action always in the bottom bar; 360px and 200% text scale show no horizontal scroll; existing driver tests pass |
| 2. Glance next-stop (P0) | Next-stop card, trip cards replacing selects, arrive sheet, simplified location row, motion-aware guard | Next outlet, window and action visible without scrolling at 360×740; moving state disables data entry; a 2-second glance test passes with 5 or more testers |
| 3. Stepwise delivery (P1) | All-as-loaded, steppers, photo step, review, saved state | Proof with no changes recorded in 3 taps or fewer after arrival; drafts survive reload at every step |
| 4. Feedback and conditions (P1) | Sun mode, auto night, haptics, optional voice prompts, landscape cradle layout | AAA contrast on key text in all themes; landscape 740×360 shows map and action together |
| 5. Problem sheet and summary (P1) | Problem tiles, trip timeline, per-stop sync cards | Report sent in 2 taps or fewer plus optional detail; summary matches dispatcher state |
| 6. Field validation (P2) | Physical low-end Android in a cradle, sunlight, night, gloves, Sinhala/Tamil strings | Field checklist signed off; no clipped translated labels |

Phase 1 progress (4 October 2026):
- **Done:**
  - `driver.css` driver-scoped type scale and darker day-theme secondary text.
  - Compact sticky header.
  - Four-item bottom navigation with icons and a sync badge (labels kept for existing tests).
  - Fixed 64px primary action bar for start, arrive, save proof and next stop.
  - Icon-and-word status banner.
  - Glanceable stop card shown before the trip and stop pickers.
  - Screen wake lock during an active trip (`lib/use-wake-lock.ts`).
- **Checks:** `tests/driver-in-vehicle.spec.ts` checks text of at least 16px, the action and navigation positions, the stop card being visible at 360×740, and no horizontal scroll at 360/390px and at 200% text size.
- **Moved to phase 2:** the `driverStep` state machine (the screens it drives change in phase 2) and moving the day picker into a menu.
- **Exception:** map attribution text keeps the map library's size.

Phase 2 progress (4 October 2026):
- **Done:**
  - Trip and stop dropdowns replaced by full-card radio choices. Trip cards appear only when more than one trip is assigned. The stop timeline shows every trip stop with sequence, window, units, shortage and status, and only active stops are selectable.
  - "I've arrived" opens a confirmation sheet (Escape or Cancel closes it; Confirm arrival vibrates where supported).
  - Navigate button at the top of the journey panel.
  - Location sharing is a status chip plus one toggle, with the caveats under "Location details".
  - Step-based page titles (`driverStep` in `lib/driver-workspace.ts`).
  - Motion guard: while location sharing reports a speed above about 8 km/h (hysteresis down to about 3 km/h), arrival is disabled and labelled "Stop safely to record arrival". When speed is unknown, the card shows a "use only when parked" reminder.
- **Decision:** Start trip stays a single deliberate button after the load review, with no hold-to-confirm.
- **Follow-up:** location sharing runs in the Journey tab component, so the motion guard covers arrival but not the delivery form. Lifting location sharing to the driver workspace is needed before the form can be locked while moving (phase 3). The operating-day picker stays in the shared toolbar because the shared handoff tests fill it directly.
- **Checks:** `tests/driver-in-vehicle.spec.ts` covers the sheet, a simulated moving GPS feed and card sizes. `delivery.spec.ts` helpers were updated for the cards and the sheet but not rerun, because they need the database-backed stack.

Phase 3 progress (4 October 2026):
- **Done:**
  - Delivery is two steps: "Step 1 of 2 · Count" and "Step 2 of 2 · Photo and save".
  - "All delivered as loaded" fills every quantity with the loaded amount, clears the issue and moves to the photo step. An unchanged delivery after arrival takes three taps plus the photo.
  - Delivery issues are radio cards, and a short count requires a reason before "Continue to photo".
  - The camera input is a large dashed target with a preview.
  - Location sharing moved to `useLocationSharing` at workspace level, so the motion guard now also replaces the delivery form while the vehicle moves. The local draft is kept.
- **Rule:** a resumed draft that already has a photo, or a stale draft, opens in a single review view instead of the steps, so retained evidence and the stale-load controls stay visible.
- **Deferred:** a receiver name or signature step.
- **Checks:** `tests/driver-in-vehicle.spec.ts` adds three-tap, short-reason and moving-lock tests. `delivery.spec.ts` uses the new radios and the "Continue to photo" step but has not been rerun against the database-backed stack.

## Testing

- Playwright: add `360x740`, `390x844` and landscape `740x360` projects for driver specs. Assert there is no horizontal overflow, the primary button stays inside the bottom bar, and computed font sizes are 16px or larger for every visible text node in the driver shell.
- Accessibility: `@axe-core/playwright` on each driver step; keyboard and screen-reader pass over hold-to-confirm and its fallback.
- Visual: screenshots per step in day, night and sun themes.
- Human: 2-second glance test (show the screen for 2s, then ask for outlet, window and next action), plus a gloved-tap accuracy check and an outdoor sunlight check on real phones.

## Open decisions

- Motion threshold and behaviour when GPS speed is unavailable (current proposal: warn only).
- Whether arrival can be undone on the server (this decides whether the arrive sheet offers undo).
- Whether voice prompts ship in phase 4 or wait for reviewed Sinhala/Tamil voice text.
- Whether hold-to-confirm or a confirmation sheet is the default for Start trip.
