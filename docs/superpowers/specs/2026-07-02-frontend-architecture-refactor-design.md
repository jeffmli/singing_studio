# Frontend re-architecture — reactive store + feature components

Refactor the frontend so it is easy to iterate on. The Python side (server /
services / pitch) is already modular; the remaining monolith is
`web/js/app.js` (1,377 lines, 81 functions, ~6 tangled concerns), a single
632-line `styles.css`, and markup + behavior + state that are scattered rather
than co-located.

## Goals (the four pains, all in scope)
1. Break up the giant `app.js` into focused modules.
2. Replace the shared mutable `state` object with a single reactive store whose
   only mutation path is named actions.
3. Add real tests so UI changes stop feeling risky.
4. Split the monolithic CSS (and move feature markup into its component).

## Decisions (locked)
- **Full re-architecture**: reactive store + feature components that render their
  own markup and update on state change.
- **Vanilla zero-build**: hand-rolled core, pure ES modules, no npm/bundler/CDN
  runtime deps. `python server.py` and the native app keep serving static files.
- Tests may use test-only devDependencies (jsdom), consistent with the existing
  Playwright smoke test. Nothing test-related ships in the app bundle.

## Architecture

### Reactive core (`web/js/core/`)
- **store.js** — one state tree; `get()`, `dispatch(action)`,
  `subscribe(selector, fn)`. A selector subscription fires only when its slice
  changes (shallow-compared). No module mutates state directly.
- **actions.js** — named actions as pure reducers `(state, payload) => state`.
  All state transitions live here; pure, so directly unit-testable.
- **dom.js** — a small `html\`\`` tagged-template + `mount(el, node)` helper, and
  the update convention below.
- **db.js** — IndexedDB access for takes/sessions (moved out of app.js). Schema
  (`dbName`, `dbVersion`, stores) is unchanged so existing data keeps working.

### Rendering strategy (the vanilla-reactive nuance)
Components render their markup **once** on mount, then subscribe to state and do
**targeted DOM updates**. Full subtree re-render (`innerHTML`) is used ONLY for
list-like regions with no live inputs — takes list, history list, warm-up dots,
analysis/live-guide charts. Regions containing focused inputs (setup fields,
take-note, search box) are never wholesale re-rendered, so typing/focus is never
clobbered. This gives reactivity without a virtual DOM.

### Feature modules (`web/js/features/`)
Each owns one concern and answers: what it does, what state it reads, what
actions it fires.
- **setup.js** — setup form, persistence to localStorage (shape unchanged).
- **warmups.js** — warm-up stage, dots, prev/next.
- **players.js** — YouTube embed control (original / instrumental / lyric).
- **recording.js** — mic capture (uses `lib/mic.js`), MediaRecorder, meter, timer.
- **takes.js** — takes drawer + list, backed by `core/db.js`.
- **live-guide.js** — prepare/start/stop/tick, pitch chart, lyric caption; uses
  `lib/pitch.js` + `lib/lyrics.js`. (Today's 61-ref hotspot.)
- **analysis.js** — analyze modal, progress, result charts (`/api/analyze`).
- **history.js** — sessions history + reflection.
- **search.js** — `/api/search`, `/api/alt`, fill setup.

### Pure libraries (`web/js/lib/`, unchanged)
`pitch.js`, `lyrics.js`, `mic.js` already exist and are unit-tested.

### Entry (`web/js/main.js`)
Builds the store, mounts each feature into its skeleton container, wires the
one-time app init (load setup, ensure session, initial render).

### Markup & CSS
- `web/index.html` becomes a thin skeleton: header + one mount point per feature.
  Feature markup moves into its component's template.
- `web/styles/` split by concern: `base.css`, `layout.css`, `setup.css`,
  `sing.css`, `live-guide.css`, `modals.css`, linked from `index.html`.

## Invariants (what MUST NOT change)
- **Every element `id`** the smoke test and code rely on stays identical.
- **localStorage keys/shapes** (`setupKey`, `sessionKey`, mic key) and the
  **IndexedDB schema** stay identical, so saved setups/takes/sessions survive.
- All server endpoints and payload shapes are untouched.

## Testing
- **Node unit tests**: `store` (subscribe/selector firing), every action/reducer,
  selectors; plus existing `lib` tests.
- **jsdom component tests** (test-only devDep): mount a feature, dispatch actions,
  assert DOM updates.
- **Playwright `smoke-test.cjs`** stays the integration guardrail — must be green
  after every migration step.

## Migration plan (incremental, one commit each, smoke green throughout)
On branch `refactor/frontend-architecture`:
1. Stand up `core/` (store, actions, dom, db) with unit tests — app still runs on
   the old app.js.
2. Migrate features one at a time (setup → warmups → players → recording → takes
   → search → analysis → history → live-guide). Each: move markup+logic into the
   component, route state through the store, keep IDs stable, smoke test green.
3. Split CSS into `web/styles/` and slim `index.html` to the skeleton.
4. Delete the old `app.js` once every feature is migrated.
5. Add jsdom component tests alongside the migrated features.

## Risks
- Largest change to date; touches every UI surface. Mitigated by ID-stability +
  the smoke test as a continuous guardrail + one-feature-at-a-time commits that
  each stay green (easy to bisect/revert).
- Hand-rolled reactivity must avoid re-rendering over live inputs (handled by the
  targeted-update convention above).
