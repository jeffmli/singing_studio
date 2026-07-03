# Home + Setup Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homepage becomes a pure session-history + "Start new session" entry point; Setup becomes "Pick your song" with one search bar, a manual-entry toggle, a recent-songs library (localStorage), and a single merged "Save & start warmups" button.

**Architecture:** Vanilla-JS feature modules (`web/js/features/*.js`) share a `store` (reducer state) and `ctx` (service registry). Setup persists to localStorage; sessions/takes live in IndexedDB (`web/js/core/db.js`). A new pure helper `web/js/lib/song-library.js` owns dedupe/cap logic; `setup.js` wires it to localStorage key `singing-song-library-v1`.

**Tech Stack:** Vanilla ES modules, no framework. Unit tests: plain node scripts (`node tests/test_<name>.mjs`, jsdom for DOM tests). E2E: Playwright smoke test (`npm test`) against `python3 server.py` on :4173.

**Spec:** `docs/superpowers/specs/2026-07-02-home-setup-flow-redesign-design.md`

## Global Constraints

- Song library localStorage key: `singing-song-library-v1`, cap **20** entries, most-recent-first, dedupe by case-insensitive trimmed title.
- Songs with no real title (empty or `"Practice Song"` placeholder) **and** no URLs are never saved to the library.
- Setup stage copy: eyebrow `Step One`, title `Pick your song`.
- Home keeps exactly one start button: `#homeStartBottom`, label `Start new session`, at the bottom of the session list.
- Removed element IDs (`homeStartTop`, `homeChangeSong`, `homeFocusTitle`, `homeFocusMeta`, `saveSetup`) must not remain anywhere in `web/` or the plan's updated tests.
- All existing unit tests + smoke test must pass at the end of every task (`for t in tests/test_*.mjs; do node $t; done` and `npm test`).
- Commit after each task with the message given in the task.

---

### Task 1: Song library pure helper

**Files:**
- Create: `web/js/lib/song-library.js`
- Test: `tests/test_song-library.mjs`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `hasSongContent(song) -> boolean` — true if the snapshot is worth saving.
  - `upsertSong(list, song, now = Date.now()) -> newList` — returns a **new** array with `{...song, savedAt: now}` first, deduped by normalized title, capped at 20. Returns `list` unchanged (same reference) when `!hasSongContent(song)`.
  - Song snapshot shape (same keys `getSetup()` returns, minus `phraseFocus`): `{ songTitle, originalUrl, instrumentalUrl, lyricVideoUrl, lyrics, syncedLyrics, warmups, savedAt }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/test_song-library.mjs
import { upsertSong, hasSongContent } from "../web/js/lib/song-library.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const song = (title, extra = {}) => ({
  songTitle: title, originalUrl: "", instrumentalUrl: "", lyricVideoUrl: "",
  lyrics: "", syncedLyrics: "", warmups: [], ...extra,
});

// hasSongContent
ok("empty song has no content", !hasSongContent(song("")));
ok("placeholder title has no content", !hasSongContent(song("Practice Song")));
ok("real title counts", hasSongContent(song("Hello")));
ok("url without title counts", hasSongContent(song("", { originalUrl: "https://youtu.be/x" })));

// upsertSong basics
const l1 = upsertSong([], song("Hello", { originalUrl: "https://youtu.be/a" }), 1000);
ok("adds new song first", l1.length === 1 && l1[0].songTitle === "Hello");
ok("stamps savedAt", l1[0].savedAt === 1000);

// dedupe by normalized title, newest wins
const l2 = upsertSong(l1, song("  hello ", { originalUrl: "https://youtu.be/b" }), 2000);
ok("dedupes case-insensitive trimmed title", l2.length === 1);
ok("newest snapshot wins", l2[0].originalUrl === "https://youtu.be/b" && l2[0].savedAt === 2000);

// most-recent-first ordering
const l3 = upsertSong(l2, song("Another"), 3000);
ok("newest song goes first", l3[0].songTitle === "Another" && l3[1].songTitle.trim().toLowerCase() === "hello");

// skip empty
const l4 = upsertSong(l3, song("Practice Song"), 4000);
ok("skips placeholder song, same reference", l4 === l3);

// immutability
ok("does not mutate input list", l1.length === 1 && l1[0].originalUrl === "https://youtu.be/a");

// cap at 20
let big = [];
for (let i = 0; i < 25; i++) big = upsertSong(big, song("Song " + i), i);
ok("caps at 20", big.length === 20);
ok("cap keeps newest", big[0].songTitle === "Song 24" && big[19].songTitle === "Song 5");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_song-library.mjs`
Expected: crash — `Cannot find module .../web/js/lib/song-library.js`

- [ ] **Step 3: Write the implementation**

```js
// web/js/lib/song-library.js
// Pure helpers for the recent-songs library. Storage wiring lives in
// features/setup.js; this module owns dedupe/cap/skip rules only.
const CAP = 20;
const PLACEHOLDER = "practice song";

const normTitle = (song) => String(song.songTitle || "").trim().toLowerCase();

export function hasSongContent(song) {
  const title = normTitle(song);
  const hasRealTitle = title && title !== PLACEHOLDER;
  return Boolean(hasRealTitle || song.originalUrl || song.instrumentalUrl || song.lyricVideoUrl);
}

export function upsertSong(list, song, now = Date.now()) {
  if (!hasSongContent(song)) return list;
  const key = normTitle(song);
  const kept = list.filter((entry) => normTitle(entry) !== key);
  return [{ ...song, savedAt: now }, ...kept].slice(0, CAP);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_song-library.mjs`
Expected: `ALL PASS: 14 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add web/js/lib/song-library.js tests/test_song-library.mjs
git commit -m "Add song-library pure helper (upsert/dedupe/cap)"
```

---

### Task 2: Setup page — pick-a-song copy, merged start button, recent songs

**Files:**
- Modify: `web/index.html` (setup stage, lines ~74–137)
- Modify: `web/js/features/setup.js`
- Modify: `web/styles/setup.css` (append recent-songs styles)
- Modify: `tests/test_setup.dom.mjs`

**Interfaces:**
- Consumes: `upsertSong` from `web/js/lib/song-library.js` (Task 1).
- Produces:
  - DOM: `#recentSongs` (section, hidden via `hidden` attr when library empty), `#recentSongList` (button list, one `<button class="recent-song" data-index="N">` per entry), `#startSession` (kept id, new label). `#saveSetup` is **gone**.
  - `setup.js` internal: `readLibrary() -> Song[]` (parse `localStorage["singing-song-library-v1"]`, corrupt/missing → `[]`), `applySong(song)` fills all setup fields + persists, `renderRecentSongs()`.
  - Library write happens **only** inside the `#startSession` click handler.

- [ ] **Step 1: Update `tests/test_setup.dom.mjs` to the new contract (failing first)**

Edit the jsdom skeleton: replace `<button id="saveSetup"></button>` with the recent-songs markup, keep `#startSession`:

```html
<section id="recentSongs" hidden><div id="recentSongList"></div></section>
<button id="startSession"></button><button id="editSetup"></button>
```

Replace the `saveSetup` click assertions (old lines ~46–50) with library assertions after `startSession`:

```js
// starting a session saves setup AND upserts the song library
document.getElementById("songTitle").value = "Test Song";
document.getElementById("originalUrl").value = "https://youtu.be/aaaaaaaaaaa";
document.getElementById("startSession").click();
const lib = JSON.parse(localStorage.getItem("singing-song-library-v1") || "[]");
ok("start upserts song library", lib.length === 1 && lib[0].songTitle === "Test Song");
const setupSaved = JSON.parse(localStorage.getItem("singing-practice-setup-v1") || "{}");
ok("start persists setup", setupSaved.songTitle === "Test Song");

// recent songs render + click-to-fill
document.getElementById("songTitle").value = "";
ctxRef.renderRecentSongs?.();   // expose via ctx (see Step 3)
ok("recent songs section visible", !document.getElementById("recentSongs").hidden);
document.querySelector("#recentSongList .recent-song").click();
ok("clicking recent song fills title", document.getElementById("songTitle").value === "Test Song");
```

(Adapt names to the file's existing `ctx` variable; it already builds one to pass to `initSetup`.)

Run: `node tests/test_setup.dom.mjs` — Expected: FAIL (no `#recentSongs`, library never written).

- [ ] **Step 2: Update `web/index.html` setup stage**

Replace the stage head copy and actions; add recent songs between the manual section and actions; delete the Save button:

```html
<div class="stage-head">
  <div class="stage-eyebrow">Step One</div>
  <h1 class="stage-title">Pick your song</h1>
  <p class="stage-sub">Search once — videos and lyrics fill in automatically.</p>
</div>
```

Search label/status copy (inside `.song-search`):

```html
<label for="songSearch">&#9889; What are you singing today?</label>
...
<p id="searchStatus" class="search-status muted">Type a song name and hit Search.</p>
```

After the closing `</div>` of `#manualSetup` and before `.setup-actions`:

```html
<section class="recent-songs" id="recentSongs" hidden>
  <h3>Recent songs</h3>
  <p class="hint">One click loads everything — videos, lyrics, warmups.</p>
  <div id="recentSongList"></div>
</section>
```

Replace `.setup-actions`:

```html
<div class="setup-actions">
  <button id="startSession" class="primary">Save &amp; start warmups &rarr;</button>
</div>
```

- [ ] **Step 3: Update `web/js/features/setup.js`**

At top: `import { upsertSong } from "../lib/song-library.js";` and `const libraryKey = "singing-song-library-v1";`.

Add inside `initSetup` (after `loadSetup`):

```js
function readLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(libraryKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function applySong(song) {
  $("songTitle").value = song.songTitle || "";
  $("originalUrl").value = song.originalUrl || "";
  $("instrumentalUrl").value = song.instrumentalUrl || "";
  $("lyricVideoUrl").value = song.lyricVideoUrl || "";
  $("lyricsInput").value = song.lyrics || "";
  $("syncedLyricsData").value = song.syncedLyrics || "";
  if (Array.isArray(song.warmups) && song.warmups.length) {
    $("warmupLinks").value = song.warmups.join("\n");
  }
  saveSetup({ silent: true });
}

function renderRecentSongs() {
  const library = readLibrary();
  const wrap = $("recentSongs");
  wrap.hidden = !library.length;
  const list = $("recentSongList");
  list.innerHTML = "";
  library.forEach((song, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-song";
    btn.dataset.index = String(index);
    const when = song.savedAt
      ? new Date(song.savedAt).toLocaleDateString([], { dateStyle: "medium" })
      : "";
    btn.innerHTML = `<span class="rs-title"></span><span class="rs-meta"></span>`;
    btn.querySelector(".rs-title").textContent = song.songTitle || "Untitled song";
    btn.querySelector(".rs-meta").textContent = when;
    list.appendChild(btn);
  });
}
```

Replace the two old button handlers (`$("saveSetup")...` and `$("startSession")...`) with:

```js
$("startSession").addEventListener("click", () => {
  saveSetup({ silent: true });
  const snapshot = getSetup();
  delete snapshot.phraseFocus; // session-specific, not part of the song
  localStorage.setItem(libraryKey, JSON.stringify(upsertSong(readLibrary(), snapshot)));
  renderRecentSongs();
  ctx.startNewSession?.();
  store.dispatch({ type: "setWarmupIndex", payload: 0 });
  setStep("warmups");
  ctx.renderTakes?.();
});
$("recentSongList").addEventListener("click", (event) => {
  const btn = event.target.closest(".recent-song");
  if (!btn) return;
  const song = readLibrary()[Number(btn.dataset.index)];
  if (song) applySong(song);
});
```

Export + initial paint at the bottom (next to the other `ctx.` lines, before `loadSetup()`):

```js
ctx.renderRecentSongs = renderRecentSongs;
```

and call `renderRecentSongs();` right after the existing `loadSetup();` call.

- [ ] **Step 4: Append recent-songs styles to `web/styles/setup.css`**

```css
/* ---------- Recent songs ---------- */
.recent-songs { margin-top: 22px; }
.recent-songs h3 {
  font-family: var(--display);
  font-size: 19px;
  font-weight: 500;
}
.recent-songs .hint { margin: 2px 0 10px; }
#recentSongList {
  display: grid;
  gap: 8px;
}
.recent-song {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.recent-song:hover {
  border-color: var(--amber);
  background: rgba(245, 165, 36, 0.07);
}
.recent-song .rs-title { font-weight: 600; }
.recent-song .rs-meta { font-size: 12px; color: var(--muted); white-space: nowrap; }
```

(Verify `--muted`/`--line`/`--amber`/`--display` exist in `web/styles/base.css`; use the file's actual variable names.)

- [ ] **Step 5: Run tests**

Run: `node tests/test_setup.dom.mjs` — Expected: ALL PASS.
Run: `for t in tests/test_*.mjs; do node "$t" || echo "FAILED $t"; done` — Expected: no `FAILED` lines. (`test_search.dom.mjs` and `test_home.dom.mjs` may reference removed IDs — if `test_home.dom.mjs` fails it gets fixed in Task 3; anything else referencing `saveSetup` must be fixed now.)

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/js/features/setup.js web/styles/setup.css tests/test_setup.dom.mjs
git commit -m "Setup: pick-a-song copy, merged save+start, recent songs library"
```

---

### Task 3: Home page — sessions only + bottom start button

**Files:**
- Modify: `web/index.html` (home stage, lines ~43–71)
- Modify: `web/js/features/home.js`
- Modify: `web/styles/layout.css`
- Modify: `tests/test_home.dom.mjs`

**Interfaces:**
- Consumes: `store.dispatch({type:"setStep",payload:"setup"})`, `readSessions/readTakes/deleteTake` from `core/db.js`, `ctx.buildTakeEl`, `ctx.analyzeTake` (all existing).
- Produces: DOM ids `#homeSessionList` and `#homeStartBottom` only. `homeFocusTitle`, `homeFocusMeta`, `homeStartTop`, `homeChangeSong` are deleted. `ctx.renderHome` keeps its signature (async, renders session list).

- [ ] **Step 1: Update `tests/test_home.dom.mjs` to the new contract (failing first)**

- Delete `#homeFocusTitle`, `#homeFocusMeta`, `#homeStartTop`, `#homeChangeSong` from the jsdom skeleton (keep `#homeSessionList`, `#homeStartBottom`).
- Delete the assertions at old lines ~71–74 ("renders saved focus song", "focus top action reviews song"), ~84 (`homeChangeSong` click), ~102–104 ("empty focus changes top action", "empty focus disables bottom start", `homeStartTop` click).
- Keep/adjust: `homeStartBottom` click dispatches step `setup`; session cards render with takes; empty state message. Add:

```js
ok("start button always enabled", !document.getElementById("homeStartBottom").disabled);
ok("empty state invites first session", document.getElementById("homeSessionList").textContent.includes("No sessions yet"));
```

Run: `node tests/test_home.dom.mjs` — Expected: FAIL (empty-state copy differs, focus ids still required by home.js).

- [ ] **Step 2: Update `web/index.html` home stage**

Replace the whole `#stageHome` section body with:

```html
<section id="stageHome" class="stage active">
  <div class="stage-head">
    <div class="stage-eyebrow">Home</div>
    <h1 class="stage-title">Your practice sessions</h1>
    <p class="stage-sub">Every session you've saved — open one to hear its recordings.</p>
  </div>
  <div class="home-wrap">
    <section class="home-history">
      <div id="homeSessionList"></div>
      <div class="home-bottom-action">
        <button id="homeStartBottom" class="primary">Start new session</button>
      </div>
    </section>
  </div>
</section>
```

- [ ] **Step 3: Update `web/js/features/home.js`**

- Delete `hasFocus()` and `startFromHome()`.
- In `renderHome()`: delete the six lines touching `homeFocusTitle/homeFocusMeta/homeStartTop/homeStartBottom.disabled` (the function starts directly with the session list work; `const setup = ctx.getSetup();` goes too).
- Empty state becomes:

```js
if (!sessions.length) {
  list.innerHTML = "<p class=\"empty-takes\">No sessions yet — start your first one below.</p>";
  return;
}
```

- Listener block becomes:

```js
$("homeStartBottom").addEventListener("click", () => store.dispatch({ type: "setStep", payload: "setup" }));
```

(delete the `homeStartTop` and `homeChangeSong` listeners; keep the `homeSessionList` delegation and the store subscription unchanged.)

- [ ] **Step 4: Update `web/styles/layout.css`**

- Delete rules: `.home-focus`, `.home-focus::before`, `.home-focus > *`, `.home-focus .eyebrow`, `.home-focus h2`, `.home-actions`, `.home-section-head`, `.home-section-head h2`, and the two `.home-focus`/`.home-actions` lines inside the `@media (max-width: 760px)` block.
- Keep `.home-wrap`, `#homeSessionList`, `.home-bottom-action`.

- [ ] **Step 5: Run tests**

Run: `node tests/test_home.dom.mjs` — Expected: ALL PASS.
Run: `grep -rn "homeStartTop\|homeChangeSong\|homeFocus\|saveSetup" web/ tests/test_home.dom.mjs tests/test_setup.dom.mjs` — Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/js/features/home.js web/styles/layout.css tests/test_home.dom.mjs
git commit -m "Home: sessions list + single bottom start button"
```

---

### Task 4: Smoke test rewrite + full verification

**Files:**
- Modify: `tests/smoke-test.cjs`
- Test: `npm test` (requires `python3 server.py` running on :4173)

**Interfaces:**
- Consumes: all DOM ids produced by Tasks 2–3.
- Produces: green e2e suite covering the new flow.

- [ ] **Step 1: Update the smoke test flow**

In `tests/smoke-test.cjs`:

1. **Load & Home (lines ~118–126):** replace the `homeFocusTitle`/`homeChangeSong` checks with:

```js
check("home stage is active on load", await page.isVisible("#stageHome.active"));
check("empty home invites first session", (await page.textContent("#homeSessionList")).includes("No sessions yet"));
await page.click("#homeStartBottom");
check("start new session opens setup", await page.isVisible("#stageSetup.active"));
check("setup page is pick-a-song copy", (await page.textContent("#stageSetup .stage-title")).includes("Pick your song"));
check("recent songs hidden when library empty", !(await page.isVisible("#recentSongs")));
check("search bar present", await page.isVisible("#songSearch"));
check("manual fields collapsed by default", !(await page.evaluate(() => document.getElementById("manualSetup").classList.contains("open"))));
```

2. **Save setup (lines ~147–151):** delete the `#saveSetup` click; the persistence check moves after `#startSession` below.

3. **Home → warmups (lines ~153–164):** replace with — fill warmups, then start directly from setup:

```js
console.log("Start session (save + warmups)");
await page.fill("#warmupLinks", "https://www.youtube.com/watch?v=ddddddddddd\nhttps://www.youtube.com/watch?v=eeeeeeeeeee");
await page.click("#startSession");
check("warmups stage active after start", await page.isVisible("#stageWarmups.active"));
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("singing-practice-setup-v1") || "{}"));
check("setup persisted on start", persisted.songTitle && persisted.songTitle.includes("Test Song"));
const library = await page.evaluate(() => JSON.parse(localStorage.getItem("singing-song-library-v1") || "[]"));
check("song saved to library on start", library.length === 1 && library[0].songTitle.includes("Test Song"));
```

(keep the existing warmup-dots/prev/next checks that follow.)

4. **Home history section (lines ~264–273):** keep, and extend after the existing checks:

```js
// --- Recent songs on setup ---
console.log("Recent songs");
await page.click('.step[data-step="setup"]');
check("recent songs visible after a session", await page.isVisible("#recentSongs"));
await page.evaluate(() => { document.getElementById("songTitle").value = ""; });
await page.click("#recentSongList .recent-song");
check("recent song click refills setup", (await page.inputValue("#songTitle")).includes("Test Song"));
check("recent song click refills original url", (await page.inputValue("#originalUrl")).length > 0);
```

5. Delete any remaining references to `homeStartTop`, `homeChangeSong`, `homeFocusTitle`, `saveSetup` (grep the file).

- [ ] **Step 2: Run the full e2e suite**

```bash
pkill -f "canvas.*server.py" 2>/dev/null; (.venv/bin/python server.py &>/dev/null &) && sleep 1
npm test
```

Expected: `All checks passed ✓`. Fix regressions until green (systematic-debugging if anything unexpected).

- [ ] **Step 3: Run every unit test**

```bash
for t in tests/test_*.mjs; do node "$t" >/dev/null || echo "FAILED $t"; done
```

Expected: no output.

- [ ] **Step 4: Update `README.md`**

Rewrite the "Three-stage flow" bullet to mention Home → Pick your song → Warmups → Sing, add a bullet for recent songs ("Practiced songs are saved locally; one click reloads everything"), and fix the smoke-test description sentence (search auto-fill, save-on-start, recent songs, warmup nav, …).

- [ ] **Step 5: Commit**

```bash
git add tests/smoke-test.cjs README.md
git commit -m "Smoke test + README for new home/setup flow"
```

---

### Task 5: UX polish pass + visual verification

**Files:**
- Modify (as needed): `web/styles/layout.css`, `web/styles/setup.css`, `web/index.html`

**Interfaces:**
- Consumes: everything above. No new ids; visual changes only.

- [ ] **Step 1: Screenshot both pages** (server already running)

Use Playwright to capture home (empty + with a session) and setup (empty library + with recent songs) at 1280×900 and 390×844. Review as a UX designer: hierarchy (page title → list → primary action), spacing rhythm, button prominence, empty-state warmth, mobile stacking.

- [ ] **Step 2: Fix what the review finds** — typical candidates: `.home-bottom-action` needs breathing room when list is empty; recent-song rows shouldn't visually compete with the Search primary; `#startSession` should be full-width on mobile. Apply CSS-only fixes.

- [ ] **Step 3: Re-run `npm test`** — Expected: `All checks passed ✓`.

- [ ] **Step 4: Commit**

```bash
git add -A web/
git commit -m "UX polish pass on home + setup"
```
