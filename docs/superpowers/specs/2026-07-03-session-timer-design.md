# Session Timer Design

## Goal

Add an end-to-end practice session timer. Timing starts when the user starts a new practice session from setup, continues through warmups and singing, and is logged when the user saves the `Finish & reflect` modal.

## User Experience

- After `Start new session` sends the user to setup, the actual timer starts when `Save & start warmups` creates the active practice session.
- The active session shows a compact elapsed timer in the top bar, formatted as `Session 0:00`.
- The timer remains visible while the active session is in progress and updates about once per second.
- When the user clicks `Finish & reflect`, the reflection summary includes the elapsed session duration.
- When the user saves reflection, the saved session records the elapsed duration.
- Home and History cards show the logged duration for saved sessions.

## Architecture

Use the existing session lifecycle in `web/js/features/history.js`. The app already creates sessions with `sessionStartedAt`, writes saved sessions with `startedAt` and `endedAt`, and renders duration-like metadata in Home and History.

Add a small timer surface to the existing shared context:

- `ctx.formatSessionDuration(ms)` for consistent display.
- `ctx.getSessionElapsedMs()` derived from `Date.now() - store.get().sessionStartedAt`.

The UI timer can live in the existing top bar markup as `#sessionTimer`. History owns the interval because it owns session lifecycle and can update the timer whenever a session starts or is saved.

## Data

Saved session records add:

- `durationMs`: elapsed milliseconds between `sessionStartedAt` and the reflection save time.

Existing `startedAt` and `endedAt` stay unchanged. Renderers prefer `durationMs` when present and fall back to `endedAt - startedAt` for older saved sessions.

## Error Handling

If no session start time exists, show `Session 0:00` and save `durationMs: 0` rather than failing. Older saved sessions continue to render using their existing timestamps.

## Testing

- Add DOM coverage for `history.js` proving the reflection summary includes elapsed time and saved sessions persist `durationMs`.
- Update Home/History rendering tests to assert the duration display uses saved `durationMs`.
- Update the smoke test to verify the session timer is visible and the saved session card includes a duration.
