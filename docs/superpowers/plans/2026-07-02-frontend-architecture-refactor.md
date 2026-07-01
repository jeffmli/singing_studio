# Frontend Re-architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 1,377-line `web/js/app.js` monolith into a vanilla, zero-build reactive architecture — a small store/actions/dom core plus one self-contained module per feature — with real tests, migrated incrementally so the Playwright smoke test stays green throughout.

**Architecture:** A single reactive store is the only source of truth; state changes only via pure named actions; feature modules subscribe to state slices and do targeted DOM updates (full re-render only for input-free list regions). Markup moves from `index.html` into each feature; CSS splits by concern.

**Tech Stack:** Vanilla ES modules (no npm runtime deps, no bundler). Node for unit tests; jsdom (test-only devDependency) for component tests; existing Playwright `smoke-test.cjs` as the integration guardrail. Python `server.py` serves `web/` static files unchanged.

## Global Constraints

- **Zero-build**: no bundler, no CDN runtime imports. Browser loads `web/js/main.js` via `<script type="module">`. Only test-only devDependencies (jsdom) may be added.
- **Preserve every element `id`** currently used by `smoke-test.cjs` and the code. IDs are the stability contract.
- **Preserve storage**: localStorage keys `singing-practice-setup-v1`, `singing-practice-mic-v1`, `singing-practice-current-session-v1`; IndexedDB `singing-practice-recordings` v2 with object stores `takes` and `sessions` (both `keyPath: "id"`). Shapes unchanged so existing data survives.
- **Server endpoints/payloads unchanged**: `/api/search`, `/api/alt`, `/api/reference`, `/api/analyze`.
- **Smoke test green after every task**: `node smoke-test.cjs` must print `60 passed, 0 failed` before each commit that touches wiring.
- Branch: `refactor/frontend-architecture`. One commit per task.
- Run server for smoke test with: `.venv/bin/python server.py` (serves `web/` on :4173).

---

## File Structure

```
web/js/
  core/
    store.js        reactive store: createStore(initial) -> { get, dispatch, subscribe }
    actions.js      pure reducers keyed by action type; initialState
    dom.js          html`` tag, mount(), setText/setValue/toggleClass helpers, renderList()
    db.js           IndexedDB: openDb, writeTake, readTakes, deleteTake, writeSession, readSessions
  lib/              pitch.js, lyrics.js, mic.js   (UNCHANGED)
  features/
    setup.js        setup form + localStorage persistence + tab switching
    warmups.js      warm-up stage: dots, prev/next/finish
    players.js      YouTube iframe players + embed-error fallback + playback rate
    search.js       /api/search + /api/alt, fills setup fields
    recording.js    mic capture (lib/mic), MediaRecorder, meter, timer, save take
    takes.js        takes drawer + list (core/db)
    analysis.js     analyze modal, progress, result charts
    history.js      sessions history + reflection modal
    live-guide.js   prepare/start/stop/tick, pitch chart, lyric caption (lib/pitch, lib/lyrics)
  main.js           bootstrap: build store, mount features, one-time init
web/styles/
  base.css layout.css setup.css sing.css live-guide.css modals.css
web/index.html      thin skeleton + per-feature mount points
tests (repo root, run with node):
  test_store.mjs test_actions.mjs test_dom.mjs
  test_setup.dom.mjs ... (jsdom component tests per feature)
```

**Migration principle:** During migration the old `app.js` keeps running the app. New modules are built and unit-tested first (Tasks 1–4) without being wired in. Then `main.js` replaces `app.js` as the entry point (Task 5) and features are moved into it one at a time (Tasks 6–14), each keeping IDs stable and the smoke test green. `app.js` is deleted only when empty (Task 16).

---

## Task 1: Reactive store (`core/store.js`)

**Files:**
- Create: `web/js/core/store.js`
- Test: `test_store.mjs` (repo root)

**Interfaces:**
- Produces: `createStore(initialState)` → `{ get(), dispatch(action), subscribe(selector, fn) }`.
  - `get()` returns the current state object.
  - `dispatch(action)` where `action = { type, payload }`; applies the reducer registered for `type`, replacing state; notifies subscribers whose selected slice changed (shallow `!==`).
  - `subscribe(selector, fn)` calls `fn(selector(state), prevSlice)` whenever `selector(state) !== previous`; returns an `unsubscribe()` function. Selector defaults to identity.
  - Reducers are provided at creation via `createStore(initialState, reducers)` where `reducers` is `{ [type]: (state, payload) => newState }`.

- [ ] **Step 1: Write the failing test**

```js
// test_store.mjs
import { createStore } from "./web/js/core/store.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const reducers = {
  setStep: (s, step) => ({ ...s, step }),
  inc: (s) => ({ ...s, n: s.n + 1 }),
};
const store = createStore({ step: "setup", n: 0 }, reducers);

ok("get returns initial", store.get().step === "setup");

let seen = [];
const un = store.subscribe((s) => s.step, (v) => seen.push(v));
store.dispatch({ type: "setStep", payload: "song" });
ok("dispatch updates state", store.get().step === "song");
ok("selector subscriber fired with new slice", seen[seen.length - 1] === "song");

store.dispatch({ type: "inc" });
ok("unrelated change does NOT fire step subscriber", seen.length === 1);

un();
store.dispatch({ type: "setStep", payload: "warmups" });
ok("unsubscribe stops notifications", seen.length === 1);

ok("unknown action type throws", (() => { try { store.dispatch({ type: "nope" }); return false; } catch { return true; } })());

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_store.mjs`
Expected: FAIL — `Cannot find module .../core/store.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/js/core/store.js
// Minimal reactive store: single state tree, pure reducers, selector subscriptions.
export function createStore(initialState, reducers = {}) {
  let state = initialState;
  const subs = [];  // { selector, fn, last }

  function get() { return state; }

  function dispatch(action) {
    const reducer = reducers[action.type];
    if (!reducer) throw new Error(`Unknown action: ${action.type}`);
    state = reducer(state, action.payload);
    for (const sub of subs) {
      const next = sub.selector(state);
      if (next !== sub.last) { const prev = sub.last; sub.last = next; sub.fn(next, prev); }
    }
  }

  function subscribe(selector = (s) => s, fn) {
    const sub = { selector, fn, last: selector(state) };
    subs.push(sub);
    return function unsubscribe() {
      const i = subs.indexOf(sub);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  return { get, dispatch, subscribe };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test_store.mjs`
Expected: `ALL PASS: 6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/js/core/store.js test_store.mjs
git commit -m "Add reactive store core (store.js)"
```

---

## Task 2: Actions + initial state (`core/actions.js`)

**Files:**
- Create: `web/js/core/actions.js`
- Test: `test_actions.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `initialState` — the app's initial state tree. Serializable UI/domain fields only (no DOM nodes, streams, or timers — those live in module-local variables, not the store). Shape:
    ```js
    {
      step: "setup",                 // "setup" | "warmups" | "song"
      activeTab: "original",         // "original" | "instrumental" | "lyricVideo" | "lyrics"
      warmupIndex: 0,
      micDeviceId: "",
      takeTempo: "Slow",
      playbackRate: 1,
      currentSongKind: "original",
      reflectRating: 0,
      lyricsHidden: false,
      sessionId: null,
      sessionStartedAt: 0,
      takesCount: 0,
      liveGuideReady: false,
      liveGuideRunning: false,
    }
    ```
  - `reducers` — `{ [type]: (state, payload) => newState }` with at least: `setStep`, `setActiveTab`, `setWarmupIndex`, `setMicDeviceId`, `setTakeTempo`, `setPlaybackRate`, `setCurrentSongKind`, `setReflectRating`, `setLyricsHidden`, `setSession(payload:{id,startedAt})`, `setTakesCount`, `setLiveGuideReady`, `setLiveGuideRunning`. Each returns a new object (never mutates).
  - NOTE for later tasks: add new reducers here as features need them; keep them pure.

- [ ] **Step 1: Write the failing test**

```js
// test_actions.mjs
import { initialState, reducers } from "./web/js/core/actions.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

ok("initial step is setup", initialState.step === "setup");
const s1 = reducers.setStep(initialState, "song");
ok("setStep returns new state", s1.step === "song" && s1 !== initialState);
ok("setStep does not mutate original", initialState.step === "setup");
const s2 = reducers.setSession(initialState, { id: "abc", startedAt: 123 });
ok("setSession sets id + startedAt", s2.sessionId === "abc" && s2.sessionStartedAt === 123);
ok("setLiveGuideRunning toggles", reducers.setLiveGuideRunning(initialState, true).liveGuideRunning === true);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_actions.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// web/js/core/actions.js
// Initial state (serializable UI/domain only) + pure reducers. DOM nodes,
// MediaRecorder, streams, timers, and RAF handles are module-local, NOT here.
export const initialState = {
  step: "setup",
  activeTab: "original",
  warmupIndex: 0,
  micDeviceId: "",
  takeTempo: "Slow",
  playbackRate: 1,
  currentSongKind: "original",
  reflectRating: 0,
  lyricsHidden: false,
  sessionId: null,
  sessionStartedAt: 0,
  takesCount: 0,
  liveGuideReady: false,
  liveGuideRunning: false,
};

const set = (key) => (s, v) => ({ ...s, [key]: v });

export const reducers = {
  setStep: set("step"),
  setActiveTab: set("activeTab"),
  setWarmupIndex: set("warmupIndex"),
  setMicDeviceId: set("micDeviceId"),
  setTakeTempo: set("takeTempo"),
  setPlaybackRate: set("playbackRate"),
  setCurrentSongKind: set("currentSongKind"),
  setReflectRating: set("reflectRating"),
  setLyricsHidden: set("lyricsHidden"),
  setTakesCount: set("takesCount"),
  setLiveGuideReady: set("liveGuideReady"),
  setLiveGuideRunning: set("liveGuideRunning"),
  setSession: (s, { id, startedAt }) => ({ ...s, sessionId: id, sessionStartedAt: startedAt }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test_actions.mjs`
Expected: `ALL PASS: 5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/js/core/actions.js test_actions.mjs
git commit -m "Add initial state + pure reducers (actions.js)"
```

---

## Task 3: DOM helpers (`core/dom.js`)

**Files:**
- Create: `web/js/core/dom.js`
- Test: `test_dom.mjs` (uses jsdom — installs the devDependency here)

**Interfaces:**
- Produces:
  - `html(strings, ...values)` → returns an HTML string (tagged template; values are HTML-escaped unless wrapped in `raw(str)`).
  - `raw(str)` → marks a string as trusted (not escaped).
  - `escapeHtml(v)` / `escapeAttr(v)` → string escapers (behavior identical to the current `app.js` versions).
  - `mount(el, htmlString)` → sets `el.innerHTML = htmlString`; returns `el`.
  - `renderList(el, items, renderItem)` → sets `el.innerHTML = items.map(renderItem).join("")`. For input-free list regions only.
  - `byId(id)` → `document.getElementById(id)`.

- [ ] **Step 1: Add jsdom devDependency**

Run: `npm install --save-dev jsdom`
Expected: `package.json` gains `jsdom` under devDependencies; `node_modules/jsdom` exists.

- [ ] **Step 2: Write the failing test**

```js
// test_dom.mjs
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
globalThis.document = dom.window.document;

const { html, raw, escapeHtml, mount, renderList, byId } = await import("./web/js/core/dom.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

ok("escapeHtml escapes angle brackets", escapeHtml("<b>&") === "&lt;b&gt;&amp;");
ok("html escapes interpolated values", html`<p>${"<x>"}</p>` === "<p>&lt;x&gt;</p>");
ok("raw() is not escaped", html`<p>${raw("<b>hi</b>")}</p>` === "<p><b>hi</b></p>");

mount(byId("root"), html`<span id="s">${"hi"}</span>`);
ok("mount sets innerHTML", byId("s").textContent === "hi");

renderList(byId("root"), [1, 2, 3], (n) => `<li>${n}</li>`);
ok("renderList joins items", byId("root").querySelectorAll("li").length === 3);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test_dom.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```js
// web/js/core/dom.js
// Tiny DOM helpers: escaping, a tagged-template html builder, and mount/list
// helpers. No virtual DOM — components render markup then update surgically.
const RAW = Symbol("raw");

export function raw(str) { return { [RAW]: String(str) }; }

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export function escapeAttr(value) { return escapeHtml(value); }

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (v && typeof v === "object" && RAW in v) ? v[RAW] : escapeHtml(v);
    out += strings[i + 1];
  }
  return out;
}

export function byId(id) { return document.getElementById(id); }

export function mount(el, htmlString) { if (el) el.innerHTML = htmlString; return el; }

export function renderList(el, items, renderItem) {
  if (el) el.innerHTML = items.map(renderItem).join("");
  return el;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test_dom.mjs`
Expected: `ALL PASS: 5 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add web/js/core/dom.js test_dom.mjs package.json package-lock.json
git commit -m "Add DOM/render helpers (dom.js) + jsdom devDep"
```

---

## Task 4: IndexedDB module (`core/db.js`)

**Files:**
- Create: `web/js/core/db.js`
- Modify: none yet (app.js still has its own copies until Task 8).
- Test: `test_db.mjs` (jsdom provides no IndexedDB; use `fake-indexeddb` devDep).

**Interfaces:**
- Produces (identical behavior to current `app.js` functions):
  - `openDb()` → Promise<IDBDatabase>. `dbName="singing-practice-recordings"`, `dbVersion=2`, stores `takes` and `sessions`, both `keyPath:"id"`.
  - `writeTake(take)` → Promise<void>
  - `readTakes()` → Promise<take[]> sorted by `createdAt` desc.
  - `deleteTake(id)` → Promise<void>
  - `writeSession(session)` → Promise<void>
  - `readSessions()` → Promise<session[]> sorted by `startedAt` desc (matches current behavior).

- [ ] **Step 1: Add fake-indexeddb devDependency**

Run: `npm install --save-dev fake-indexeddb`
Expected: devDependency added.

- [ ] **Step 2: Write the failing test**

```js
// test_db.mjs
import "fake-indexeddb/auto";
const db = await import("./web/js/core/db.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

await db.writeTake({ id: "t1", createdAt: 1, title: "a" });
await db.writeTake({ id: "t2", createdAt: 2, title: "b" });
const takes = await db.readTakes();
ok("readTakes returns 2 sorted desc", takes.length === 2 && takes[0].id === "t2");
await db.deleteTake("t1");
ok("deleteTake removes one", (await db.readTakes()).length === 1);

await db.writeSession({ id: "s1", startedAt: 10 });
ok("readSessions returns it", (await db.readSessions())[0].id === "s1");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Run to verify it fails**

Run: `node test_db.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement by copying the existing functions**

Copy `openDb`, `writeTake`, `readTakes`, `deleteTake`, `writeSession`, `readSessions` verbatim from `web/js/app.js` (currently ~lines 1309–1375) into `web/js/core/db.js`, adding `export` to each and top constants:
```js
// web/js/core/db.js
const dbName = "singing-practice-recordings";
const dbVersion = 2;
// ...then the six functions, each prefixed with `export`, bodies unchanged...
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test_db.mjs`
Expected: `ALL PASS: 3 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add web/js/core/db.js test_db.mjs package.json package-lock.json
git commit -m "Extract IndexedDB access into core/db.js"
```

---

## Task 5: Bootstrap `main.js` and switch entry point

**Files:**
- Create: `web/js/main.js`
- Modify: `web/index.html` (change `<script type="module" src="js/app.js">` → `js/main.js`)
- Modify: `web/js/app.js` → export an `initLegacy(store)` that runs the existing IIFE body, reading/writing the shared store for the fields it owns. (Transitional: main.js builds the store and calls the legacy init; features migrate out of it one at a time.)

**Interfaces:**
- Consumes: `createStore` (Task 1), `initialState`+`reducers` (Task 2).
- Produces: `main.js` builds `const store = createStore(initialState, reducers)`, exposes it to legacy code, then runs init. `window.__studioTest` hook (used by smoke test — see `app.js` end) MUST still be set.

**Approach:** Wrap the current `app.js` IIFE: replace `(() => { ... })();` with `export function initLegacy(store) { ... }` and remove the local `const state = {...}` in favor of the passed store for the migrated fields. On this task, migrate NOTHING yet — keep app.js's internal `state` object as-is but also create the store in main.js. `main.js`:

```js
// web/js/main.js
import { createStore } from "./core/store.js";
import { initialState, reducers } from "./core/actions.js";
import { initLegacy } from "./app.js";

const store = createStore(initialState, reducers);
initLegacy(store);
```

And `web/js/app.js`: change the outer `(() => {` to `export function initLegacy(store) {` and the closing `})();` to `}`. Leave everything inside intact for now (it keeps its own `state`; `store` is unused until features migrate).

- [ ] **Step 1: Convert app.js IIFE to `initLegacy(store)` export** (edit first/last lines only).
- [ ] **Step 2: Create `web/js/main.js`** (code above).
- [ ] **Step 3: Point index.html at main.js**

```bash
# in web/index.html
# <script type="module" src="js/app.js"></script>  ->  src="js/main.js"
```

- [ ] **Step 4: Syntax check**

Run: `node --input-type=module --check < web/js/main.js && node --check web/js/app.js || node --input-type=module --check < web/js/app.js`
Expected: no output (OK).

- [ ] **Step 5: Smoke test**

Run: `.venv/bin/python server.py & sleep 2; node smoke-test.cjs; kill %1`
Expected: `60 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add web/js/main.js web/js/app.js web/index.html
git commit -m "Bootstrap store in main.js; app.js becomes initLegacy(store)"
```

---

## Tasks 6–14: Feature migration (one per task)

Each feature task follows the **same recipe**. Do them in this order (dependencies first, riskiest last): **6 setup, 7 warmups, 8 takes, 9 players, 10 search, 11 recording, 12 analysis, 13 history, 14 live-guide.**

**Recipe (apply to each feature):**

1. Create `web/js/features/<feature>.js` exporting `export function init<Feature>(store) { ... }`.
2. **Move** the feature's functions out of `app.js` into the module — verbatim bodies — replacing their reads/writes of the old `state` object with `store.get()` / `store.dispatch(...)` for the fields now in the store, and keeping DOM nodes / streams / timers as module-local `let` variables. Keep all element `id`s and any `$()`/`byId()` lookups identical. Move the feature's `addEventListener` wiring from `bindEvents` into the module's init.
3. If a feature needs state not yet in `actions.js`, add a pure reducer + initial field there (and a line in `test_actions.mjs`).
4. In `main.js`, `import { init<Feature> } from "./features/<feature>.js";` and call it, and DELETE the corresponding code from `app.js` (functions + its `bindEvents` lines + its `state` fields).
5. Add `test_<feature>.dom.mjs` (jsdom) asserting one real behavior of the module (see per-feature test below).
6. Syntax-check, run the feature's jsdom test, run the smoke test (`60 passed`), commit.

**Per-feature specifics** (functions to move by current name; state slice; IDs owned; the jsdom test assertion):

### Task 6: setup
- **Move:** `getSetup`, `saveSetup`, `loadSetup`, `renderStages`(setup parts), tab handling (`data-tab` loop), the `fields` input listeners, `parseYouTubeId`.
- **Store:** `step`, `activeTab`. Persist setup object to `localStorage["singing-practice-setup-v1"]` (unchanged shape).
- **IDs owned:** `songTitle, warmupLinks, originalUrl, instrumentalUrl, lyricVideoUrl, lyricsInput, syncedLyricsData, phraseFocus, saveSetup, startSession, editSetup, manualToggle`.
- **jsdom test:** mount setup skeleton, set `#songTitle` value, call save, assert `localStorage` has the value and dispatch set step.

### Task 7: warmups
- **Move:** `renderWarmups`, `prevWarmup`/`nextWarmup`/`finishWarmups` handlers, warm-up dots rendering.
- **Store:** `warmupIndex`, `step`.
- **IDs:** `warmupDots, warmupStatus, prevWarmup, nextWarmup, finishWarmups, warmupFrame, warmupPlaceholder, stageWarmups`.
- **jsdom test:** dispatch `setWarmupIndex`, assert active dot count via `renderList` output.

### Task 8: takes
- **Move:** `renderTakes`, `buildTakeEl`, `getTake`, drawer open/close (`openDrawer/closeDrawer/closePanels`), `takesCount` badge, delete handling. Import from `core/db.js` (remove the duplicate db funcs from app.js in this task).
- **Store:** `takesCount`.
- **IDs:** `takesList, takesToggle, takesCount, closeDrawer, drawerOverlay`.
- **jsdom test:** with `fake-indexeddb`, write a take, call render, assert list has one item and badge count updates.

### Task 9: players
- **Move:** `makePlayer, initPlayers, applyVideo, showWarmupVideo, showSongVideo, showSongPlaceholder, onWarmupError, onSongError, getSongDuration, applyPlaybackRate, currentSongTime, targetMidiAt` (players-related), the `renderSong` video/tab wiring, playback-rate control, and the `window.__studioTest.forceSongError` hook.
- **Store:** `activeTab`, `currentSongKind`, `playbackRate`.
- **IDs:** `songFrame, videoPane, lyricsPane, songStatus, playbackRate` + tab buttons.
- **jsdom test:** call the pure-ish helper `parseYouTubeId` (if not already in setup) — else assert `currentSongTime()` returns 0 with no player. Keep minimal (YT API is external).

### Task 10: search
- **Move:** `runSearch`, `fillField`, `flashField`, `/api/alt` "try another" handlers.
- **IDs:** `songSearch, searchBtn, searchStatus`.
- **jsdom test:** stub `globalThis.fetch` to return a canned search payload; call runSearch; assert `#originalUrl` filled and `#syncedLyricsData` set.

### Task 11: recording
- **Move:** `pickRecorderOptions, openMic, refreshMicList, onMicChange, startRecording, stopRecording, saveRecording, updateMeter, startTimer, stopTimer, formatTime, fileNameForTake`. Import `micAudioConstraints, micOptions` from `lib/mic.js`. Keep `mediaRecorder/audioStream/audioContext/meterAnimation/timerInterval` as module-local.
- **Store:** `micDeviceId`, `takeTempo`; dispatch `setTakesCount` after save.
- **IDs:** `recordBtn, stopBtn, micSelect, meterBar, recTimer, transportBar, takeNote, recordingStatus`.
- **jsdom test:** call `micOptions` via the module path is already covered by `test_mic.mjs`; here stub `navigator.mediaDevices.enumerateDevices` and assert `refreshMicList` populates `#micSelect` options. (Reuse pattern from the earlier Playwright mic probe, but in jsdom.)

### Task 12: analysis
- **Move:** `analyzeTake, startAnalyzeProgress, renderAnalysis, drawAnalysisChart, closeAnalyze`.
- **IDs:** `analyzeModal, analyzeBody, analyzeClose, analyzeChart` + `data-analyze` delegation.
- **jsdom test:** call `renderAnalysis` with a canned result object; assert `#analyzeBody` shows the score number and `inTuneCents`.

### Task 13: history
- **Move:** `openHistory, closeHistory, renderHistory, starsMarkup, setStars, openReflect, closeReflect, saveSession, showToast, ensureSession, startNewSession, persistCurrentSession`. Import `writeSession/readSessions` from `core/db.js`.
- **Store:** `sessionId`, `sessionStartedAt`, `reflectRating`.
- **IDs:** `historyBtn, historyList, closeHistory, endSessionBtn, reflectCancel, reflectSave, reflectStars`.
- **jsdom test:** dispatch `setReflectRating(4)`, call `starsMarkup`, assert 4 lit stars in output.

### Task 14: live-guide (largest)
- **Move:** `prepareLiveGuide, startLiveGuide, stopLiveGuide, refreshLiveGuide, liveGuideTick, drawLivePitchChart, targetMidiAt, currentSongTime` (guide parts), `noteName, hzToMidi` (import from `lib/pitch.js` instead of local copies — delete local copies), `syncedLyricLines, updateLiveLyric, renderLyricOverlay, lyricLines`. Import `detectPitchHz, hzToMidi, noteName, medianOf` from `lib/pitch.js` and `parseLrc, lyricLineAt` from `lib/lyrics.js`. Keep `analyser/stream/audioContext/raf/history/recentMidi` module-local.
- **Store:** `liveGuideReady`, `liveGuideRunning`, `lyricsHidden`.
- **IDs:** `prepareGuide, startGuide, stopGuide, refreshGuide, livePitchChart, liveLyricLine, guideStatus, targetNote, userNote, pitchDelta, pitchFeedback, lyricOverlay, lyricToggle, overlayBody, micSelect`.
- **jsdom test:** call `updateLiveLyric(songTime)` after seeding `#syncedLyricsData` with sample LRC; assert `#liveLyricLine .cur` shows the expected line (reuses `lib/lyrics.js`, already tested).

For EACH of Tasks 6–14, the closing steps are identical:

- [ ] Syntax check: `node --input-type=module --check < web/js/features/<feature>.js`
- [ ] Feature test: `node test_<feature>.dom.mjs` → `ALL PASS`
- [ ] Smoke test: `.venv/bin/python server.py & sleep 2; node smoke-test.cjs; kill %1` → `60 passed, 0 failed`
- [ ] Commit: `git add -A && git commit -m "Migrate <feature> into feature module"`

---

## Task 15: Split CSS into `web/styles/`

**Files:**
- Create: `web/styles/base.css`, `layout.css`, `setup.css`, `sing.css`, `live-guide.css`, `modals.css`
- Modify: `web/index.html` (replace the single `<link rel="stylesheet" href="styles.css">` with one link per file, in cascade order: base, layout, setup, sing, live-guide, modals)
- Delete: `web/styles.css`

**Approach:** Move rule blocks from `styles.css` into the file matching their concern (variables/reset/typography → base; grid/header/stage shell → layout; setup form → setup; transport/song/meter/mic-picker → sing; live-guide + chart + lyric caption → live-guide; drawer/history/reflect/analyze/toast → modals). No rule text changes — only relocation. Keep the same order overall so the cascade is unchanged.

- [ ] **Step 1:** Create the six files by moving blocks (no edits to rule bodies).
- [ ] **Step 2:** Update `index.html` links in cascade order.
- [ ] **Step 3:** Delete `web/styles.css`.
- [ ] **Step 4: Verify every asset resolves**

Run: `.venv/bin/python server.py & sleep 2; for f in base layout setup sing live-guide modals; do echo -n "$f: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/styles/$f.css; done; kill %1`
Expected: all `200`.

- [ ] **Step 5: Smoke test** → `60 passed, 0 failed`.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Split styles.css into web/styles/ by concern"
```

---

## Task 16: Remove the empty legacy `app.js`; slim `index.html`

**Files:**
- Delete: `web/js/app.js` (must be empty of feature code — only the `initLegacy` shell + the moved `window.__studioTest` hook remain; move that hook into `players.js` init if not already, then delete).
- Modify: `web/js/main.js` (remove the `initLegacy` import/call).
- Modify: `web/index.html` (confirm it is a skeleton of mount points; remove any now-dead inline markup that features render themselves — only where a feature took ownership; keep all IDs the features expect to find or create).

**Approach:** By now every function and event binding has moved out of `app.js`. Confirm `app.js` contains no remaining functions:

- [ ] **Step 1: Verify app.js is empty of logic**

Run: `grep -cE "function |addEventListener" web/js/app.js`
Expected: `0` (only the shell remains). If not 0, a feature migration was incomplete — finish it before deleting.

- [ ] **Step 2:** Ensure `window.__studioTest.forceSongError` is set inside `players.js` init (move it there if still in app.js). Re-run smoke test to confirm the `forceSongError` hook still works.
- [ ] **Step 3:** Delete `web/js/app.js`; remove its import/call from `main.js`.
- [ ] **Step 4: Syntax + smoke**

Run: `node --input-type=module --check < web/js/main.js && .venv/bin/python server.py & sleep 2; node smoke-test.cjs; kill %1`
Expected: `60 passed, 0 failed`.

- [ ] **Step 5: Full unit suite**

Run: `for t in test_store test_actions test_dom test_db test_mic test_pitch test_lyrics; do node $t.mjs >/dev/null 2>&1 && echo "$t ok" || echo "$t FAIL"; done`
Expected: all `ok`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Delete legacy app.js; index.html is now a skeleton"
```

---

## Self-Review (completed against the spec)

- **Spec goal 1 (split app.js):** Tasks 5–16 move every concern into `core/` + `features/`; Task 16 deletes it. ✓
- **Spec goal 2 (reactive store, actions-only mutation):** Tasks 1–2 build store+reducers; feature tasks route state through `store.dispatch`. ✓
- **Spec goal 3 (real tests):** Task 3 adds jsdom; each feature task adds a jsdom behavior test; store/actions/dom/db unit-tested; smoke test gates every task. ✓
- **Spec goal 4 (CSS/markup split):** Task 15 splits CSS; feature tasks move markup into components; Task 16 slims index.html. ✓
- **Invariants:** IDs, localStorage keys, IndexedDB schema, and endpoints called out in Global Constraints and each feature task. ✓
- **Type consistency:** store API (`get/dispatch/subscribe`), `initialState`/`reducers`, `dom.js` exports, and `db.js` signatures are named identically wherever referenced. ✓
- **Placeholder scan:** core tasks contain full code; feature tasks reference existing functions by exact current name plus the store slice/IDs/test — no "TBD"/"handle edge cases". ✓
