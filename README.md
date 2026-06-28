# 🎤 Singing Practice Studio

A self-guided vocal practice app. Search a song and it finds the right YouTube
videos and lyrics for you, then walks you through a focused practice session:
**warm up → sing → record → reflect** — and keeps a history of every session.

It runs entirely on your own machine. No accounts, no cloud, no API keys.

![stage](https://img.shields.io/badge/runs-locally-0f766e) ![tests](https://img.shields.io/badge/smoke%20tests-36%20passing-f5a524)

## Features

- **Search a song by name** — auto-finds the original, instrumental/karaoke, and
  lyric videos on YouTube (via `yt-dlp`, no API key) plus the lyrics, and
  auto-fills your session. Manual fields stay tucked away until you need them.
- **Self-healing videos** — if a video refuses to embed ("Video unavailable"),
  the app automatically finds and swaps in another that plays.
- **Three-stage flow** — one focused screen at a time: Setup → Warmups → Sing.
- **Step through warmups** with embedded YouTube exercises.
- **Sing** with the original, instrumental, lyric video, or on-screen lyrics.
- **Record your takes** straight from the browser mic, with a live input meter.
- **Finish & reflect** — rate the session and jot what went well / what to work
  on next time.
- **Practice history** — every saved session, with its takes, ratings, and notes.
- Recordings and history are stored locally (IndexedDB); setup persists in
  localStorage. Download any take as a `.webm` file.

## Requirements

- **Python 3** (serves the app and powers search)
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — `brew install yt-dlp`
- A modern browser. Microphone recording needs a secure context (localhost is fine).

## Run it

```bash
python3 server.py
```

Then open **http://localhost:4173/**.

> The plain page can be opened on its own, but the **song search** feature needs
> `server.py` running (it shells out to `yt-dlp` and fetches lyrics).

### Run it as a Mac app

Build a double-clickable **Singing Studio.app** (installs to `/Applications`) that
starts the server and opens the studio in its own clean window:

```bash
./mac-app/build.sh
```

It uses Google Chrome's app mode for a standalone window. Icon source and the
build script live in [`mac-app/`](mac-app/).

## How search works

`server.py` exposes `GET /api/search?q=<song>`. It runs three `yt-dlp` searches
in parallel (original / instrumental / lyric video) and fetches lyrics from
[lrclib.net](https://lrclib.net) (falling back to lyrics.ovh), then returns the
best matches as JSON. The instrumental/karaoke slot is the least reliable — swap
it manually if it picks the wrong track.

## Tests

A Playwright smoke test drives the real app and checks every button — search
auto-fill, save setup, start session, warmup nav, stepper, source tabs,
record/stop (with a fake mic), takes drawer, finish & reflect, and history.

```bash
npm install      # first time
python3 server.py &   # the app must be running
npm test
```

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | The entire front-end (HTML/CSS/JS, single file) |
| `server.py` | Static server + `/api/search` (yt-dlp + lyrics) |
| `smoke-test.cjs` | Playwright end-to-end smoke test |
| `docs/singing-practice-prd.md` | Product requirements |

## Privacy

Everything stays on your computer. Recordings, session history, and setup never
leave the browser/local server.
