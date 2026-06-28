# Time-aligned lyric caption in the live pitch guide

## Problem
The live pitch guide graph plots the user's pitch vs the target melody on a
rolling song-time axis, but there is no text anchor — you can't tell which part
of the lyrics the current graph position corresponds to.

## Decision
- **Timing source:** synced LRC from lrclib (already fetched, currently
  discarded). Plain-text fallback when a song has no synced lyrics.
- **Overlay style:** current lyric line shown as a highlighted caption above the
  graph, with the next line dimmed below; advances in sync with playback.

## Data flow
1. **Server (`server.py`):** capture lrclib's `syncedLyrics` field in
   `_lrclib_get` / `_lrclib_search`; surface it as `syncedLyrics` (string, "" if
   none) in the `/api/search` JSON alongside the existing plain `lyrics`.
2. **Storage:** persist `syncedLyrics` in the saved setup (new field), like
   `lyrics`. The plain lyrics textarea is unchanged and user-editable; synced
   lyrics are separate data used only for caption timing.
3. **Parse (client):** `parseLrc(str) -> [{t, text}]` sorted by time;
   `lyricLineAt(lines, songTime) -> {current, next}`.
4. **Render:** a caption element inside `guide-chart-wrap`, above the canvas.
   Each `liveGuideTick` updates it from the same `currentSongTime()` the pitch
   curve uses, so caption and graph stay locked together even if both are
   offset from the real recording.

## Fallback
No synced lyrics → caption shows a muted "No synced lyrics for this song"; the
existing full-text lyric overlay is unchanged.

## Scope (YAGNI)
- Line-level only (no word-level highlighting).
- No new manual offset control — the existing live-guide resync already shifts
  `songTime`.

## Components & testing
- `parseLrc` and `lyricLineAt` are pure functions, wrapped in
  `// __LYRIC_SYNC_START__` / `__LYRIC_SYNC_END__` sentinels in `index.html` and
  unit-tested in Node (`test_lyrics.cjs`): multi-timestamp lines, out-of-order
  input, line boundaries, before-first / after-last.
- Server change is a passthrough of lrclib's field; covered by a small Python
  check that `syncedLyrics` is surfaced.
