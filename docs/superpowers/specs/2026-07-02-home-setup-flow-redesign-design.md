# Home + Setup Flow Redesign — Design

**Date:** 2026-07-02
**Status:** Approved by Jeff (conversation, 2026-07-02)

## Problem

The current home stage keeps a "Current focus / Review song" card, and Setup is
framed as "Review your song." Jeff wants the homepage to be purely a session
history + entry point, and Setup to be the one place you pick a song — with
song data saved to a local profile so previously practiced songs are one click
away.

## Design

### 1. Homepage (`stageHome`)

- **Delete** the "Current focus" card (`homeFocusTitle`, `homeFocusMeta`,
  `homeStartTop`, `homeChangeSong`).
- The page is the session history list. Every saved session renders as an
  expandable card: song title, date, star rating, duration, take count.
  Expanding shows that session's recordings (play / download / analyze /
  delete) and reflection notes.
- **Bottom only:** one primary **Start new session** button → navigates to
  Setup.
- Empty state: "No sessions yet — start your first one."

### 2. Setup page (`stageSetup`) — retitled "Pick your song"

Top to bottom:

1. **One search bar** + Search button. Keeps existing auto-fill behavior
   (original / instrumental / lyric videos + lyrics via `/api/search`).
2. **Small "Enter details manually" toggle** (existing `manualToggle`),
   collapsed by default. Contains title, video URLs, lyrics, warmup links.
3. **Recent songs** list: songs from the local song library. Clicking one
   instantly fills the entire setup (title, videos, lyrics, warmups) — no
   re-search.
4. **One bottom button: "Save & start warmups →"**. Starting the session is
   what saves: setup persists to localStorage, a song snapshot is upserted
   into the song library, and the flow advances to Warmups. The separate
   "Save" button is removed.

### 3. Data — song library

- New `songs` array in **localStorage** (key: `singing-song-library-v1`),
  matching the existing localStorage setup persistence. Sessions/takes stay
  in IndexedDB.
- On session start: snapshot the full setup (`songTitle`, `originalUrl`,
  `instrumentalUrl`, `lyricVideoUrl`, `lyrics`, `syncedLyrics`, `warmups`),
  stamp `savedAt`.
- Dedupe by normalized (case-insensitive, trimmed) title — newest snapshot
  wins. Most-recent-first, capped at 20 entries.
- Songs with no real title (empty or the "Practice Song" placeholder) and no
  URLs are not saved.

### 4. Polish + verification

- UX pass over both pages: hierarchy, spacing, empty states, consistent
  button styles with the existing Fraunces/Spline Sans design.
- Update the Playwright smoke test (`tests/smoke-test.cjs`): it currently
  clicks `homeStartTop`/`homeChangeSong` and the `saveSetup` button, which
  are being removed. Add coverage for recent-songs click-to-fill and the
  merged Save & start button. Run `npm test` until green.

## Out of scope

- Any account/login system — "profile" means local storage on this machine.
- Changes to warmups, sing stage, recording, pitch analysis, or the server.

## Error handling

- Song library read failures (corrupt JSON) fall back to an empty library.
- Session list load failure keeps the existing inline error message.

## Testing

- Playwright smoke test drives the full flow: home → start new session →
  search-fill or recent-song-fill → save & start → warmups → sing → record →
  finish & reflect → session appears on home with its recordings.
- Node unit test for song-library upsert/dedupe/cap logic if extracted into
  a pure helper.
