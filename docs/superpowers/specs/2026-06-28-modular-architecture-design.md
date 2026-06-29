# Modular architecture refactor

Refactor the single-file app into clean **UI / backend / model** layers so the
model can be improved independently of the UI and backend. Zero-build (no
bundler); incremental, one layer per commit, full test suite green between each.

## Target layout
```
canvas/
  web/                 # UI layer — the static root the server serves
    index.html         # markup only
    styles.css
    js/
      main.js          # entry: wires modules, owns app state
      lib/pitch.js     # detectPitchHz (MPM), hzToMidi, noteName, medianOf
      lib/lyrics.js    # parseLrc, lyricLineAt
      storage.js       # IndexedDB takes/sessions
      players.js       # YouTube embeds
      recording.js     # mic capture/meter/timer
      search.js        # /api/search, /api/alt
      live-guide.js    # prepare/start/stop/tick/chart + lyric caption
      analysis-ui.js   # analyze modal + charts
      ui.js            # drawers/history/reflect/toast
  services/            # backend integrations (not web-served)
    youtube.py         # yt-dlp search + artist/title split
    lyrics.py          # lrclib + lyrics.ovh
  pitch/               # model (UI/HTTP-agnostic, heavy deps lazy)
    config.py notes.py audio.py detect.py score.py reference.py orchestrate.py
  server.py            # entrypoint: routing + static(web/) only
  tests/               # all suites
```

## Principles
- `pitch/` knows nothing about HTTP or the browser — pure functions, heavy deps
  (torch/demucs/librosa/numpy) imported lazily inside functions.
- `server.py` stays the entrypoint (`python server.py`) but only routes; it
  serves static files from `web/` and delegates work to `services/` + `pitch/`.
- Each JS module owns one concern with explicit ES-module imports; `index.html`
  carries no inline JS/CSS.
- Backend dirs (`pitch/`, `services/`) live outside `web/`, so they are never
  web-accessible.

## Phases (each its own commit, tests green)
1. **Model** → `pitch/` package; `server.py` + tests import `pitch`; delete
   `analysis.py`. Pure relocation (no behaviour change) — unit tests prove it.
2. **Backend** → `services/youtube.py` + `services/lyrics.py`; `server.py`
   shrinks to routing. Smoke + server-lyrics tests prove it.
3. **Frontend** → extract `styles.css`, split inline JS into `web/js/` ES
   modules, point the server's static root at `web/`. Full smoke test proves it.

## Safety net
`smoke-test.cjs` (60 browser checks) guards the frontend; `test_scoring.py`,
`test_analysis.py`, `test_pitch.cjs`, `test_lyrics.cjs`, `test_server_lyrics.py`
guard model/backend. Done on branch `refactor/modular-architecture`.
