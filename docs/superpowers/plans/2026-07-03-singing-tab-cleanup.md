# Singing Tab Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Singing tab by removing custom phrase focus, playback pace, take label, and lyric-overlay controls while keeping the four source tabs.

**Architecture:** Remove the obsolete controls from `web/index.html` and `web/styles/sing.css`. Guard feature code that used removed DOM ids and stop writing new phrase-focus/take-label metadata, while preserving old saved data rendering. Update focused DOM tests and the Playwright smoke test.

**Tech Stack:** Vanilla JavaScript modules, jsdom tests, fake-indexeddb, Playwright smoke test, no-mistakes validation.

## Global Constraints

- Keep the top source tabs unchanged: `Original`, `Instrumental`, `Lyric Video`, and `Lyrics`.
- Remove the visible `Phrase focus`, `Playback pace`, and `Take label` controls from the Singing tab.
- Remove the lyric overlay from the YouTube player area so the embedded YouTube player is directly clickable.
- Keep the separate `Lyrics` tab as the place to read lyrics.
- Keep recording controls in the bottom transport bar.
- New recordings no longer save phrase-focus or take-label metadata.
- Existing old takes may still display previously saved phrase-focus or take-label metadata.
- YouTube's native controls handle playback speed; the app no longer renders custom pace buttons or wires pace-click behavior.
- No new dependencies.

---

### Task 1: Markup And Smoke Expectations

**Files:**
- Modify: `web/index.html`
- Modify: `tests/smoke-test.cjs`
- Test: `tests/smoke-test.cjs`

**Interfaces:**
- Consumes: existing Sing-stage ids `stageSong`, `videoPane`, `lyricsPane`, source tabs via `[data-tab]`.
- Produces: no `#phraseFocus`, no `#pacePills`, no `#tempoPills`, no `#lyricOverlay`, no `#lyricToggle` in the Sing stage.

- [ ] **Step 1: Write failing smoke assertions**

Replace the smoke assertions that expect phrase focus, playback pace, and lyric overlay with:

```js
check("phrase focus removed", (await page.locator("#phraseFocus").count()) === 0);
check("playback pace controls removed", (await page.locator("#pacePills").count()) === 0);
check("take label controls removed", (await page.locator("#tempoPills").count()) === 0);
check("lyric overlay removed from video pane", (await page.locator("#lyricOverlay").count()) === 0);
check("source tabs remain", (await page.locator('[data-tab="original"], [data-tab="instrumental"], [data-tab="lyricVideo"], [data-tab="lyrics"]').count()) === 4);
```

Remove smoke steps that click `[data-rate]`, `#lyricToggle`, fill `#phraseFocus`, or click `[data-tempo]`.

- [ ] **Step 2: Run smoke test to verify failure**

Run: `npm test`

Expected: FAIL before markup cleanup because removed controls are still present or removed-click steps still exist.

- [ ] **Step 3: Remove obsolete Sing markup**

In `web/index.html`, delete the `.practice-plan` block and delete the `#lyricOverlay` block from `#videoPane`. Keep the segmented source tabs and `#lyricsPane`.

- [ ] **Step 4: Run smoke test to verify DOM expectations advance**

Run: `npm test`

Expected: May still fail from JS code expecting removed elements; proceed to Task 2.

---

### Task 2: JS Guards And New Recording Metadata

**Files:**
- Modify: `web/js/features/setup.js`
- Modify: `web/js/features/players.js`
- Modify: `web/js/features/recording.js`
- Modify: `web/js/features/live-guide.js`
- Test: `tests/test_setup.dom.mjs`
- Test: `tests/test_players.dom.mjs`
- Test: `tests/test_recording.dom.mjs`
- Test: `tests/test_live-guide.dom.mjs`

**Interfaces:**
- Consumes: optional DOM ids `phraseFocus`, `pacePills`, `tempoPills`, `lyricOverlay`, `lyricToggle`.
- Produces: startup succeeds when those ids are absent; newly saved takes omit `phraseFocus` and `takeTempo`.

- [ ] **Step 1: Update focused tests first**

Update fixtures to omit removed controls where possible. Add assertions:

```js
ok("new take omits phrase focus", !("phraseFocus" in savedTake));
ok("new take omits take tempo", !("takeTempo" in savedTake));
```

Update player tests to assert there are no `[data-rate]` buttons required and remove rate-click assertions.

Update live-guide tests to omit `#lyricOverlay` and `#lyricToggle`; assert initialization does not throw.

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
node tests/test_setup.dom.mjs
node tests/test_players.dom.mjs
node tests/test_recording.dom.mjs
node tests/test_live-guide.dom.mjs
```

Expected: FAIL until production code guards removed ids and stops writing metadata.

- [ ] **Step 3: Implement guards/defaults**

In `setup.js`, remove `phraseFocus` from the persisted input field list and have `getSetup()` return `phraseFocus: ""` without reading a missing element. Only write `phraseFocus` in `loadSetup()` if the element exists.

In `players.js`, remove the `[data-rate]` event listener loop and do not call `applyPlaybackRate()` for app buttons.

In `recording.js`, save takes without `phraseFocus` or `takeTempo`, and remove `[data-tempo]` listener wiring.

In `live-guide.js`, make lyric overlay/toggle code no-op when the overlay or toggle is absent.

- [ ] **Step 4: Run focused tests to verify pass**

Run:

```bash
node tests/test_setup.dom.mjs
node tests/test_players.dom.mjs
node tests/test_recording.dom.mjs
node tests/test_live-guide.dom.mjs
```

Expected: ALL PASS.

---

### Task 3: Styles, Cache Version, Full Validation, Push

**Files:**
- Modify: `web/styles/sing.css`
- Modify: `web/styles/setup.css`
- Modify: `web/index.html`
- Modify: `web/js/main.js`
- Test: `tests/test_static_cache_bust.mjs`

**Interfaces:**
- Consumes: source tabs and player frame remain.
- Produces: no obsolete `.practice-plan`, `.pace-pills`, `.tempo-pills`, `.phrase-field` styling; cache version bumped.

- [ ] **Step 1: Remove obsolete CSS**

Delete `.practice-plan`, `.practice-plan .plan-fields`, `.practice-plan .field`, `.practice-plan input`, `.phrase-field`, `.tempo-pills`, and `.pace-pills` rules from `web/styles/sing.css`. Remove mobile `.practice-plan .plan-fields` rule from `web/styles/setup.css`.

- [ ] **Step 2: Bump cache versions**

Update module query versions in `web/index.html` and `web/js/main.js` to `20260703-singing-cleanup`.

- [ ] **Step 3: Run final tests**

Run:

```bash
node tests/test_static_cache_bust.mjs
node tests/test_setup.dom.mjs
node tests/test_players.dom.mjs
node tests/test_recording.dom.mjs
node tests/test_live-guide.dom.mjs
npm test
```

Expected: all commands pass.

- [ ] **Step 4: Commit and push**

Commit only relevant files, excluding unrelated `docs/in-app-piano-prd.md`, then run `no-mistakes axi run --intent "<intent>"` and respond to gates as needed. Push the feature branch after validation succeeds.
