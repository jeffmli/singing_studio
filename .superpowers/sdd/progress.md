# Frontend re-architecture — progress ledger

Plan: docs/superpowers/plans/2026-07-02-frontend-architecture-refactor.md
Branch: refactor/frontend-architecture
Base: 7d68ceb

## Tasks
- [x] Task 1: core/store.js
- [x] Task 2: core/actions.js
- [x] Task 3: core/dom.js (+jsdom)
- [x] Task 4: core/db.js (+fake-indexeddb)
- [x] Task 5: main.js entry switch / initLegacy
- [x] Task 6: setup (ctx service registry + setupRev reducer introduced)
- [x] Task 7: warmups
- [x] Task 8: takes (getTake added to core/db.js; fileNameForTake lives in takes.js)
- [x] Task 9: players (getSongDuration was dead code — dropped; songPlayerTime probe on ctx)
- [x] Task 10: search
- [x] Task 11: recording
- [x] Task 12: analysis
- [x] Task 13: history (owns session lifecycle + toast)
- [x] Task 14: live-guide (app.js now an empty shell)
- [ ] Task 15: CSS split
- [ ] Task 16: delete app.js
