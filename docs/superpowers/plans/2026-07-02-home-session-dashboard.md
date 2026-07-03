# Home Session Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Home dashboard that shows the saved focus song, inline previous sessions with recordings, and a primary path to start a fresh session.

**Architecture:** Add `home` as the first store step and a focused `web/js/features/home.js` module. Reuse the existing saved setup, session lifecycle, IndexedDB helpers, and `ctx.buildTakeEl(take)` so history and recordings stay consistent with existing drawers.

**Tech Stack:** Vanilla ES modules, DOM APIs, localStorage, IndexedDB via `web/js/core/db.js`, jsdom/fake-indexeddb component tests, Playwright smoke test.

## Global Constraints

- Home is the default first screen.
- Starting from Home creates a fresh session for the current saved song and navigates to Warmups.
- Previous sessions are review-only and must not replace the active current session.
- Do not add a multi-song library or song-project schema.
- Do not migrate existing storage or change IndexedDB schema unless a test proves it is required.
- Do not remove the History drawer.

---

### Task 1: Home Step And Stage Shell

**Files:**
- Modify: `web/js/core/actions.js`
- Modify: `web/index.html`
- Modify: `web/js/features/setup.js`
- Modify: `tests/test_actions.mjs`
- Modify: `tests/test_setup.dom.mjs`

**Interfaces:**
- Produces: store step value `home`.
- Produces: DOM ids `stageHome`, `homeStartTop`, `homeStartBottom`, `homeChangeSong`, `homeFocusTitle`, `homeSessionList`.

- [ ] **Step 1: Write failing tests**

Update `tests/test_actions.mjs` so initial state expects Home:

```js
ok("initial step is home", initialState.step === "home");
```

Update `tests/test_setup.dom.mjs` fixture to include:

```html
<button class="step" id="stepHome" data-step="home"></button>
<section id="stageHome"></section>
```

Add assertions after `initSetup(store, ctx);`:

```js
ok("home stage active on load", document.getElementById("stageHome").classList.contains("active"));
ok("home step is current", document.getElementById("stepHome").classList.contains("current"));
```

Add after clicking `editSetup`:

```js
document.getElementById("stepHome").click();
ok("home stepper returns home", store.get().step === "home");
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd canvas
node tests/test_actions.mjs
node tests/test_setup.dom.mjs
```

Expected: `test_actions.mjs` fails because `initialState.step` is still `setup`; `test_setup.dom.mjs` fails because setup rendering does not know `home`.

- [ ] **Step 3: Implement minimal shell**

In `web/js/core/actions.js`, change:

```js
step: "setup",
```

to:

```js
step: "home",
```

In `web/index.html`, add a Home step before Setup:

```html
<button class="step current" id="stepHome" data-step="home"><span class="num">0</span>Home</button>
<span class="step-divider"></span>
```

Add a Home stage before `stageSetup`:

```html
<section id="stageHome" class="stage active">
  <div class="stage-head">
    <div class="stage-eyebrow">Home</div>
    <h1 class="stage-title">Your singing practice</h1>
    <p class="stage-sub">Start a fresh session for your focus song or review previous sessions.</p>
  </div>
  <div class="home-wrap">
    <section class="home-focus card">
      <div>
        <p class="eyebrow">Current focus</p>
        <h2 id="homeFocusTitle">Choose a song</h2>
        <p id="homeFocusMeta" class="muted">Set up a song to begin.</p>
      </div>
      <div class="home-actions">
        <button id="homeStartTop" class="primary">Start new session</button>
        <button id="homeChangeSong" class="ghost">Change song</button>
      </div>
    </section>
    <section class="home-history">
      <div class="home-section-head">
        <h2>Previous sessions</h2>
      </div>
      <div id="homeSessionList"></div>
      <div class="home-bottom-action">
        <button id="homeStartBottom" class="primary">Start new session</button>
      </div>
    </section>
  </div>
</section>
```

In `web/js/features/setup.js`, update stage map and order:

```js
const map = { home: "stageHome", setup: "stageSetup", warmups: "stageWarmups", song: "stageSong" };
const order = ["home", "setup", "warmups", "song"];
[["stepHome", 0], ["stepSetup", 1], ["stepWarmups", 2], ["stepSong", 3]].forEach(([id, idx]) => {
  const el = $(id);
  el.classList.toggle("current", idx === current);
  el.classList.toggle("done", idx < current);
});
document.body.classList.toggle("on-home", step === "home");
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
cd canvas
node tests/test_actions.mjs
node tests/test_setup.dom.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
cd canvas
git add web/js/core/actions.js web/index.html web/js/features/setup.js tests/test_actions.mjs tests/test_setup.dom.mjs
git commit -m "Add home stage shell"
```

### Task 2: Home Feature Behavior

**Files:**
- Create: `web/js/features/home.js`
- Modify: `web/js/main.js`
- Create: `tests/test_home.dom.mjs`

**Interfaces:**
- Consumes: `ctx.getSetup(): { songTitle, warmups, originalUrl, instrumentalUrl, lyricVideoUrl }`.
- Consumes: `ctx.saveSetup({ silent: true })`.
- Consumes: `ctx.startNewSession()`.
- Consumes: `ctx.renderTakes(): Promise<void>`.
- Consumes: `ctx.buildTakeEl(take): HTMLElement`.
- Produces: `ctx.renderHome(): Promise<void>`.

- [ ] **Step 1: Write failing Home tests**

Create `tests/test_home.dom.mjs` with a jsdom fixture containing `homeFocusTitle`, `homeFocusMeta`, `homeStartTop`, `homeStartBottom`, `homeChangeSong`, and `homeSessionList`. Use `fake-indexeddb/auto`, `createStore`, `initialState`, `reducers`, `db.writeSession`, `db.writeTake`, and `initHome`.

Test these behaviors:

```js
ok("renders saved focus song", document.getElementById("homeFocusTitle").textContent.includes("My Focus Song"));
document.getElementById("homeStartTop").click();
ok("start creates fresh session", newSessionCalls === 1);
ok("start moves to warmups", store.get().step === "warmups");
ok("start resets warmup index", store.get().warmupIndex === 0);
document.getElementById("homeChangeSong").click();
ok("change song moves to setup", store.get().step === "setup");
ok("previous session listed", document.querySelectorAll("#homeSessionList .session-card").length === 1);
document.querySelector("#homeSessionList .session-card summary").click();
await new Promise((r) => setTimeout(r, 0));
ok("expanded session shows take", document.querySelector("#homeSessionList .take").textContent.includes("Old take"));
ok("expanding old session keeps active session", store.get().sessionId === "active-session");
```

Also create a second store/context with empty setup and assert:

```js
ok("empty focus disables top start", document.getElementById("homeStartTop").disabled);
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd canvas
node tests/test_home.dom.mjs
```

Expected: fails because `web/js/features/home.js` does not exist.

- [ ] **Step 3: Implement Home module**

Create `web/js/features/home.js` exporting `initHome(store, ctx)`. Implement:

```js
import { byId as $ } from "../core/dom.js";
import { readSessions, readTakes, deleteTake } from "../core/db.js";

export function initHome(store, ctx) {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }
  function hasFocus(setup) { return Boolean(setup.songTitle || setup.originalUrl || setup.instrumentalUrl || setup.lyricVideoUrl); }
  async function startFromHome() {
    if (!hasFocus(ctx.getSetup())) { store.dispatch({ type: "setStep", payload: "setup" }); return; }
    ctx.saveSetup?.({ silent: true });
    ctx.startNewSession?.();
    store.dispatch({ type: "setWarmupIndex", payload: 0 });
    store.dispatch({ type: "setStep", payload: "warmups" });
    await ctx.renderTakes?.();
  }
  async function renderHome() {
    const setup = ctx.getSetup();
    const focus = hasFocus(setup);
    $("homeFocusTitle").textContent = focus ? setup.songTitle || "Untitled song" : "Choose a song";
    $("homeFocusMeta").textContent = focus ? "Ready for a fresh practice session." : "Set up a song to begin.";
    $("homeStartTop").disabled = !focus;
    $("homeStartBottom").disabled = !focus;

    const [sessions, takes] = await Promise.all([readSessions(), readTakes()]);
    if (!sessions.length) {
      $("homeSessionList").innerHTML = "<p class=\"empty-takes\">No saved sessions yet.<br>Finish a session with Finish &amp; reflect.</p>";
      return;
    }
    const takesBySession = {};
    for (const take of takes) (takesBySession[take.sessionId] = takesBySession[take.sessionId] || []).push(take);
    $("homeSessionList").innerHTML = sessions.map((session) => {
      const count = (takesBySession[session.id] || []).length;
      return `<details class="session-card" data-session-id="${escapeHtml(session.id)}">
        <summary><div class="sc-top"><span class="sc-song">${escapeHtml(session.songTitle || "Practice session")}</span></div>
        <div class="sc-meta">${count} take${count === 1 ? "" : "s"}</div></summary>
        <div class="sc-takes" data-session-takes="${escapeHtml(session.id)}"></div>
      </details>`;
    }).join("");
  }
  $("homeStartTop").addEventListener("click", startFromHome);
  $("homeStartBottom").addEventListener("click", startFromHome);
  $("homeChangeSong").addEventListener("click", () => store.dispatch({ type: "setStep", payload: "setup" }));
  $("homeSessionList").addEventListener("click", async (event) => {
    const analyzeBtn = event.target.closest("[data-analyze]");
    if (analyzeBtn) { ctx.analyzeTake(analyzeBtn.dataset.analyze); return; }
    const deleteBtn = event.target.closest("[data-delete]");
    if (deleteBtn) { await deleteTake(deleteBtn.dataset.delete); await renderHome(); return; }
    const summary = event.target.closest("summary");
    if (!summary) return;
    const card = summary.closest("[data-session-id]");
    const wrap = card.querySelector("[data-session-takes]");
    const allTakes = await readTakes();
    const sessionTakes = allTakes.filter((take) => take.sessionId === card.dataset.sessionId);
    wrap.innerHTML = "";
    if (!sessionTakes.length) {
      wrap.innerHTML = "<p class=\"empty-takes\">No recordings for this session.</p>";
      return;
    }
    for (const take of sessionTakes) wrap.appendChild(ctx.buildTakeEl(take));
  });
  store.subscribe((s) => `${s.step}|${s.setupRev}`, () => { if (store.get().step === "home") renderHome(); });
  ctx.renderHome = renderHome;
}
```

In `web/js/main.js`, import and initialize after takes/history are available:

```js
import { initHome } from "./features/home.js";

initHistory(store, ctx);
initHome(store, ctx);
initLiveGuide(store, ctx);

ctx.renderHome().catch((error) => {
  document.getElementById("homeSessionList").innerHTML =
    `<p class="empty-takes">Could not load sessions: ${String(error.message).replace(/[&<>]/g, "")}</p>`;
});
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
cd canvas
node tests/test_home.dom.mjs
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
cd canvas
git add web/js/features/home.js web/js/main.js tests/test_home.dom.mjs
git commit -m "Add home dashboard behavior"
```

### Task 3: Home Styling And Smoke Flow

**Files:**
- Modify: `web/styles/layout.css`
- Modify: `web/styles/modals.css`
- Modify: `tests/smoke-test.cjs`

**Interfaces:**
- Consumes: Home DOM from Task 1 and behavior from Task 2.
- Produces: responsive Home layout consistent with existing app styles.

- [ ] **Step 1: Write failing smoke assertions**

In `tests/smoke-test.cjs`, change load expectations:

```js
check("home stage is active on load", await page.isVisible("#stageHome.active"));
check("empty home prompts song setup", (await page.textContent("#homeFocusTitle")).includes("Choose a song"));
await page.click("#homeChangeSong");
check("change song opens setup", await page.isVisible("#stageSetup.active"));
```

After saving setup, navigate Home and start from Home:

```js
await page.click('.step[data-step="home"]');
check("saved song appears on home", (await page.textContent("#homeFocusTitle")).includes("Test Song"));
await page.fill("#warmupLinks", "https://www.youtube.com/watch?v=ddddddddddd\nhttps://www.youtube.com/watch?v=eeeeeeeeeee");
await page.click("#homeStartTop");
```

After saving reflection, verify Home inline history:

```js
await page.click('.step[data-step="home"]');
await page.waitForSelector("#homeSessionList .session-card", { timeout: 10000 });
check("saved session appears on home", (await page.locator("#homeSessionList .session-card").count()) >= 1);
check("home session shows reflection note", (await page.textContent("#homeSessionList .session-card")).includes("breath control felt steady"));
await page.click("#homeSessionList .session-card summary");
check("home expanded session shows recording", await waitTrue(() => document.querySelectorAll("#homeSessionList .take").length >= 1));
check("bottom start is available", await page.isVisible("#homeStartBottom"));
```

Do not modify `package.json`; `npm test` already runs `tests/smoke-test.cjs`, and the focused Home test is run directly in verification.

- [ ] **Step 2: Run smoke to verify failure**

Run:

```bash
cd canvas
npm test
```

Expected: fails until Home styles/behavior/smoke expectations are fully wired.

- [ ] **Step 3: Add styling**

Add Home styles to `web/styles/layout.css`:

```css
.home-wrap { width: min(1040px, calc(100vw - 36px)); margin: 0 auto 80px; display: grid; gap: 28px; }
.home-focus { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px; }
.home-focus h2 { margin: 4px 0 8px; font-family: var(--display); font-size: clamp(26px, 4vw, 44px); font-weight: 500; }
.home-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.home-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.home-section-head h2 { margin: 0; font-family: var(--display); font-weight: 500; }
#homeSessionList { display: grid; gap: 12px; }
.home-bottom-action { display: flex; justify-content: center; margin-top: 22px; }
@media (max-width: 760px) {
  .home-focus { align-items: stretch; flex-direction: column; }
  .home-actions { justify-content: stretch; }
  .home-actions > button { flex: 1; }
}
```

Ensure `.session-card` styles from `modals.css` work outside the drawer. If drawer-only spacing conflicts, add `.home-history .session-card { margin: 0; }`.

- [ ] **Step 4: Run full verification**

Run:

```bash
cd canvas
node tests/test_actions.mjs
node tests/test_setup.dom.mjs
node tests/test_home.dom.mjs
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd canvas
git add web/styles/layout.css web/styles/modals.css tests/smoke-test.cjs
git commit -m "Polish home dashboard flow"
```
