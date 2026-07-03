# 🎤 Singing Practice Studio

A self-guided vocal practice app. Search a song and it finds the right YouTube
videos and lyrics for you, then walks you through a focused practice session:
**warm up → sing → record → reflect** — and keeps a history of every session.

It runs entirely on your own machine. No accounts, no cloud, no API keys.

![stage](https://img.shields.io/badge/runs-locally-0f766e) ![tests](https://img.shields.io/badge/smoke%20tests-59%20passing-f5a524)

## Features

- **Search a song by name** — auto-finds the original, instrumental/karaoke, and
  lyric videos on YouTube (via `yt-dlp`, no API key) plus the lyrics, and
  auto-fills your session. Manual fields stay tucked away until you need them.
- **Recent songs** — every song you practice is saved locally; one click on the
  setup page reloads everything (videos, lyrics, warmups). No re-search.
- **Self-healing videos** — if a video refuses to embed ("Video unavailable"),
  the app automatically finds and swaps in another that plays.
- **Home → Pick your song → Warmups → Sing** — the homepage lists every saved
  session (open one to hear its recordings); starting a new session walks you
  through one focused screen at a time.
- **Build a warm-up queue** from a curated picker or custom YouTube URLs, then
  step through the selected exercises.
- **Sing** with the original, instrumental, lyric video, or on-screen lyrics.
- **Practice goals** — tag each session as melody, pitch, lyrics, clean take, or
  warmup-only, then see that goal in your history.
- **In-app piano / note practice** — play local reference tones and match them
  with microphone pitch feedback.
- **Record your takes** straight from the browser mic, with a live input meter.
- **Analyze pitch** — optional local pitch scoring compares a take to the
  original melody and shows a green/red intonation graph when the analysis
  dependencies are installed.
- **Live pitch guide** — prepare the song's melody once, then see immediate
  sharp / flat / on-target feedback from the microphone while the video plays.
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
auto-fill, save-on-start, recent songs, warm-up picker, practice goals, warmup
nav, stepper, source tabs, piano note practice, record/stop (with a fake mic),
live pitch guide, mocked pitch analysis, takes drawer, finish & reflect, and
history.

```bash
npm install      # first time
python3 server.py &   # the app must be running
npm test
```

## Project layout

| File | Purpose |
| --- | --- |
| `web/` | Front-end: `index.html` skeleton, `js/` (reactive core + feature modules), `styles/` |
| `server.py` | Static server + APIs (`/api/search`, `/api/alt`, `/api/reference`, `/api/analyze`) |
| `tests/` | All tests: `smoke-test.cjs` (Playwright e2e), `test_*.mjs` (node/jsdom units), `test_*.py` |
| `docs/singing-practice-prd.md` | Product requirements |

Run the browser smoke test with `npm test`. Node unit tests: `node tests/test_<name>.mjs`.

## Privacy

Everything stays on your computer. Recordings, session history, and setup never
leave the browser/local server.
