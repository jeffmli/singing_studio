# Practice Upgrades 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build practice goals, a curated warm-up picker, and an in-app piano / pitch-match panel for Singing Studio.

**Architecture:** Extend the existing vanilla modular frontend. `setup.js` remains the source of truth for setup persistence, Warmups still consumes `warmups: string[]`, `history.js` owns saved sessions, and a new `piano.js` feature owns note playback and match-mode audio lifecycle.

**Tech Stack:** Vanilla HTML/CSS/JS modules, Web Audio, existing pitch helpers, jsdom DOM tests, Playwright smoke test, Python local server, native macOS WKWebView bundle.

## Global Constraints

- Keep the app local-only; do not add cloud, accounts, analytics, or API keys.
- Do not add a frontend framework or new state library.
- Do not reintroduce removed Singing controls: custom playback pace, phrase focus, or take labels.
- Persist warm-ups as the existing `warmups: string[]` setup contract.
- Store practice goals additively so old sessions render without migration.
- Keep the native Mac app deploy path working through `./mac-app/build-native.sh`.

---

### Task 1: Practice Goals

**Files:**
- Modify: `web/index.html`
- Modify: `web/js/features/setup.js`
- Modify: `web/js/features/history.js`
- Modify: `web/js/features/home.js`
- Modify: `web/styles/setup.css`
- Test: `tests/test_setup.dom.mjs`
- Test: `tests/test_history.dom.mjs`
- Test: `tests/test_home.dom.mjs`

**Interfaces:**
- Produces: `ctx.getSetup().practiceGoal -> string`
- Produces: saved session field `practiceGoal?: string`
- Consumes: existing session renderers in Home and History.

- [ ] **Step 1: Add failing tests**
  - `test_setup.dom.mjs`: assert a goal button exists, clicking it persists `practiceGoal`, and recent song reload restores it.
  - `test_history.dom.mjs`: assert reflection summary includes the goal and saved session stores it.
  - `test_home.dom.mjs`: assert session cards render the goal when present.

- [ ] **Step 2: Run tests and verify RED**
  - Run `node tests/test_setup.dom.mjs`, `node tests/test_history.dom.mjs`, `node tests/test_home.dom.mjs`.
  - Expected: failures about missing goal controls / missing rendered goal.

- [ ] **Step 3: Implement minimal goal UI and persistence**
  - Add goal selector markup in Setup.
  - Update `getSetup`, `loadSetup`, `applySong`, and start-session library snapshot.
  - Save `practiceGoal` in `history.js`.
  - Render goal in Home and History cards.

- [ ] **Step 4: Run tests and verify GREEN**
  - Same commands as Step 2.
  - Expected: all pass.

- [ ] **Step 5: Commit**
  - Commit message: `Add practice goals to sessions`

### Task 2: Warm-Up Picker

**Files:**
- Create: `web/js/lib/warmups.js`
- Modify: `web/index.html`
- Modify: `web/js/features/setup.js`
- Modify: `web/styles/setup.css`
- Test: `tests/test_setup.dom.mjs`
- Test: `tests/test_warmups.dom.mjs`

**Interfaces:**
- Produces: `WARMUP_LIBRARY: Array<{id,title,type,url,note}>`
- Produces: `warmupLabelForUrl(url: string) -> string`
- Preserves: `ctx.getSetup().warmups -> string[]`

- [ ] **Step 1: Add failing tests**
  - Assert curated library renders at least six items.
  - Assert add, duplicate prevention, remove, move up/down, custom URL add, and legacy hydration update `#warmupLinks`.
  - Assert Warmups playback still reads URL order.

- [ ] **Step 2: Run tests and verify RED**
  - Run `node tests/test_setup.dom.mjs` and `node tests/test_warmups.dom.mjs`.
  - Expected: missing warm-up picker elements/functions.

- [ ] **Step 3: Implement picker**
  - Add static library helper.
  - Add picker markup and compact CSS.
  - Make `setup.js` render library and queue from the hidden/raw textarea.
  - Keep `warmupLinks` as the persisted backing field.

- [ ] **Step 4: Run tests and verify GREEN**
  - Same commands as Step 2.
  - Expected: all pass.

- [ ] **Step 5: Commit**
  - Commit message: `Add curated warmup picker`

### Task 3: Piano / Note Practice

**Files:**
- Create: `web/js/features/piano.js`
- Modify: `web/js/lib/pitch.js`
- Modify: `web/js/main.js`
- Modify: `web/index.html`
- Modify: `web/styles/live-guide.css`
- Test: `tests/test_piano.dom.mjs`
- Test: `tests/smoke-test.cjs`

**Interfaces:**
- Produces: `midiToHz(midi: number) -> number`
- Produces: `pianoNoteName(midi: number) -> string`
- Produces: `classifyPitchMatch(targetMidi: number, userMidi: number | null, toleranceCents = 35) -> {feedback, cents}`
- Consumes: `ctx.openMic()` and `ctx.refreshMicList()` from recording.

- [ ] **Step 1: Add failing tests**
  - Assert C2-C6 keys render.
  - Assert clicking C4 updates active note.
  - Assert `midiToHz(69) === 440`.
  - Assert match classification returns Sing / On / Sharp / Flat.

- [ ] **Step 2: Run tests and verify RED**
  - Run `node tests/test_piano.dom.mjs`.
  - Expected: missing module/helpers.

- [ ] **Step 3: Implement piano module**
  - Render keys from MIDI 36 through 84.
  - Play local Web Audio tone on pointer/click.
  - Add target/readout state.
  - Implement match mode with microphone stream and smoothed pitch detection.

- [ ] **Step 4: Run tests and verify GREEN**
  - Run `node tests/test_piano.dom.mjs`.
  - Expected: all pass.

- [ ] **Step 5: Commit**
  - Commit message: `Add in-app piano practice`

### Task 4: End-to-End Verification, Push, Mac App Deploy

**Files:**
- Modify: `tests/smoke-test.cjs`
- Modify: `README.md` if feature list is now materially stale.

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Update smoke coverage**
  - Cover goal selection, warm-up picker queue, piano note activation, saved goal in Home/History.

- [ ] **Step 2: Run targeted tests**
  - Run all changed DOM tests plus existing recording/live-guide/player tests.

- [ ] **Step 3: Run full smoke**
  - Start `python3 server.py`.
  - Run `npm test`.

- [ ] **Step 4: Commit smoke/docs updates**
  - Commit message: `Verify practice upgrades flow`

- [ ] **Step 5: Push and deploy**
  - Push branch to `origin`.
  - Run `./mac-app/build-native.sh`.
  - Verify installed app bundle contains the new piano/warm-up UI.
