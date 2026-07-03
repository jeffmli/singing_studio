# Session Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible end-to-end session timer and persist the elapsed duration when a session is saved.

**Architecture:** Keep timing inside the existing `history.js` session lifecycle. Derive elapsed time from `store.get().sessionStartedAt`, display it in a new `#sessionTimer` top-bar element, save `durationMs` on session records, and have Home/History renderers prefer that logged duration with timestamp fallback for old sessions.

**Tech Stack:** Vanilla JavaScript modules, jsdom DOM tests, fake-indexeddb, Playwright smoke test.

## Global Constraints

- The timer starts when `Save & start warmups` creates the active practice session.
- Display format is compact: `Session 0:00`.
- The reflection summary includes the elapsed duration.
- Saved sessions record `durationMs`.
- Existing saved sessions without `durationMs` still render from `endedAt - startedAt`.
- No new dependencies.

---

### Task 1: History Lifecycle Timer

**Files:**
- Modify: `web/index.html`
- Modify: `web/js/features/history.js`
- Test: `tests/test_history.dom.mjs`

**Interfaces:**
- Consumes: `store.get().sessionStartedAt`, `store.dispatch({ type: "setSession", payload })`, `writeSession(session)`.
- Produces: `ctx.formatSessionDuration(ms): string`, `ctx.getSessionElapsedMs(): number`, saved session field `durationMs: number`, DOM element `#sessionTimer`.

- [ ] **Step 1: Write the failing test**

Add `#sessionTimer` to the `tests/test_history.dom.mjs` fixture.

Add assertions after `initHistory(store, ctx)`:

```js
ok("session timer renders initial elapsed time", document.getElementById("sessionTimer").textContent === "Session 0:00");
ok("duration formatter handles minutes and seconds", ctx.formatSessionDuration(125000) === "2:05");
```

Mock time around reflection save:

```js
const realDateNow = Date.now;
Date.now = () => 181000;
document.getElementById("endSessionBtn").click();
ok("summary includes elapsed duration", document.getElementById("reflectSummary").textContent.includes("3:00"));
document.getElementById("reflectWins").value = "breath steady";
document.getElementById("reflectSave").click();
await new Promise((r) => setTimeout(r, 0));
Date.now = realDateNow;
```

After reading saved sessions:

```js
ok("saved session logs durationMs", sessions[0].durationMs === 180000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_history.dom.mjs`

Expected: FAIL because `#sessionTimer` is missing and `ctx.formatSessionDuration` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `web/index.html`, add this to `.brand` after the existing tag:

```html
<span class="tag session-timer" id="sessionTimer">Session 0:00</span>
```

In `web/js/features/history.js`, add:

```js
let timerInterval = 0;

function formatSessionDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getSessionElapsedMs(now = Date.now()) {
  const startedAt = store.get().sessionStartedAt || now;
  return Math.max(0, now - startedAt);
}

function updateSessionTimer() {
  const el = $("sessionTimer");
  if (el) el.textContent = `Session ${formatSessionDuration(getSessionElapsedMs())}`;
}

function startSessionTimer() {
  updateSessionTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateSessionTimer, 1000);
}
```

Call `startSessionTimer()` in `startNewSession()` after `persistCurrentSession()`, and in `ensureSession()` after restoring a saved session. Use `formatSessionDuration(getSessionElapsedMs())` in the reflection summary. In `saveSession()`, compute `const endedAt = Date.now(); const durationMs = getSessionElapsedMs(endedAt);` and save both `endedAt` and `durationMs`.

Expose:

```js
ctx.formatSessionDuration = formatSessionDuration;
ctx.getSessionElapsedMs = getSessionElapsedMs;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_history.dom.mjs`

Expected: ALL PASS.

---

### Task 2: Saved Duration Rendering

**Files:**
- Modify: `web/js/features/home.js`
- Modify: `web/js/features/history.js`
- Test: `tests/test_home.dom.mjs`
- Test: `tests/test_history.dom.mjs`

**Interfaces:**
- Consumes: saved session `durationMs?: number`, `startedAt`, `endedAt`.
- Produces: Home and History metadata strings using logged duration when present.

- [ ] **Step 1: Write failing assertions**

In `tests/test_home.dom.mjs`, write the seeded session with `durationMs: 245000` and assert:

```js
ok("previous session shows logged duration", document.querySelector("#homeSessionList .session-card").textContent.includes("4:05"));
```

In `tests/test_history.dom.mjs`, after rendering history assert:

```js
ok("card shows logged duration", document.querySelector("#historyList .session-card").textContent.includes("3:00"));
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node tests/test_home.dom.mjs
node tests/test_history.dom.mjs
```

Expected: FAIL because renderers still show minute-rounded strings.

- [ ] **Step 3: Implement saved duration display**

In `home.js`, add:

```js
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sessionDurationMs(session) {
  if (Number.isFinite(session.durationMs)) return session.durationMs;
  const endedAt = session.endedAt || Date.now();
  const startedAt = session.startedAt || endedAt;
  return Math.max(0, endedAt - startedAt);
}
```

Update `sessionMeta()` to return:

```js
return `${formatDuration(sessionDurationMs(session))} · ${takes.length} take${takes.length === 1 ? "" : "s"}`;
```

In `history.js`, reuse `formatSessionDuration()` for card metadata:

```js
const durationMs = Number.isFinite(session.durationMs)
  ? session.durationMs
  : Math.max(0, (session.endedAt || 0) - (session.startedAt || session.endedAt || 0));
```

Then render `${formatSessionDuration(durationMs)} · ...`.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
node tests/test_home.dom.mjs
node tests/test_history.dom.mjs
```

Expected: ALL PASS.

---

### Task 3: Smoke Coverage And Cache Version

**Files:**
- Modify: `tests/smoke-test.cjs`
- Modify: `web/index.html`
- Modify: `web/js/main.js`

**Interfaces:**
- Consumes: visible `#sessionTimer`, saved session card metadata.
- Produces: full-browser coverage for visible timer and logged duration.

- [ ] **Step 1: Add smoke assertions**

In `tests/smoke-test.cjs`, after setup page opens:

```js
check("session timer visible", await page.isVisible("#sessionTimer"));
check("session timer starts at zero", (await page.textContent("#sessionTimer")).includes("Session 0:00"));
```

After warmups start:

```js
check("session timer remains visible during session", await page.isVisible("#sessionTimer"));
```

After Home history card appears:

```js
check("home session shows logged duration", /\d+:\d{2}/.test(homeCardText));
```

- [ ] **Step 2: Run smoke test to verify failure before implementation if Task 1 is not complete**

Run: `npm test`

Expected before Task 1: FAIL because `#sessionTimer` is missing. Expected after Tasks 1-2: PASS.

- [ ] **Step 3: Update cache versions**

Change module query versions from `20260703-setup-route` to `20260703-session-timer` in:

```html
<script type="module" src="js/main.js?v=20260703-session-timer"></script>
```

```js
import { initSetup } from "./features/setup.js?v=20260703-session-timer";
```

- [ ] **Step 4: Run final verification**

Run:

```bash
node tests/test_static_cache_bust.mjs
node tests/test_setup.dom.mjs
node tests/test_home.dom.mjs
node tests/test_history.dom.mjs
npm test
```

Expected: all commands pass.
