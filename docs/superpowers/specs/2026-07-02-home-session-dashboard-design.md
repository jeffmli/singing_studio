# Home Session Dashboard Design

## Goal

Make Singing Studio open on a useful home screen instead of forcing the user back through setup. The home screen should show the current focus song, list previous practice sessions, let the user click into a previous session to review its recordings, and make starting a fresh session for the saved song the primary action.

## Current State

The app currently starts on the Setup stage. Song setup is persisted in `localStorage` under `singing-practice-setup-v1`, current in-progress session identity is persisted in `singing-practice-current-session-v1`, and finished sessions plus takes are stored in IndexedDB. The History drawer already renders finished sessions and uses the existing take-card UI, but history is secondary and hidden behind a top-bar button.

## User Experience

Add a new Home stage as the default first screen.

Home shows the current focus song from the saved setup. If a saved song exists, the primary action is `Start new session`; it creates a fresh session for that song, resets warmups to the first warmup, and navigates to Warmups. A secondary `Change song` action navigates to Setup/search.

If no saved song exists, Home shows an empty state with a primary action to choose a song in Setup.

Home lists previous saved sessions inline. Each session appears as a card with song title, date, duration, rating, take count, and reflection highlights. Clicking a session expands it in place to show that session's recordings/takes using the same take controls already used in the History drawer. Old sessions are review-only: clicking an old session does not resume it, and new recordings always belong to a fresh session started from Home.

Place another `Start new session` button near the bottom of the Home page after the previous sessions list, so after reviewing past sessions the next action is still obvious.

Keep the existing History drawer for now. Home becomes the primary history surface, while the drawer remains a compatible secondary view.

## Architecture

Represent Home as a new store step, `home`, before the existing `setup`, `warmups`, and `song` steps. Update stage rendering and top navigation to include Home without changing the existing setup, warmup, and song feature boundaries.

Add a focused Home feature module, `web/js/features/home.js`, responsible for:

- Reading the saved setup through `ctx.getSetup()`.
- Reading sessions and takes from the existing IndexedDB helpers.
- Rendering the current focus song card and session list.
- Starting a new session through the existing session lifecycle API.
- Navigating to Setup for song changes.
- Handling inline session expansion and take actions.

Expose any needed session lifecycle functions from `history.js` through `ctx`, instead of duplicating session-id persistence. The Home module should call the same `ctx.startNewSession()` path used by setup so current-session state stays consistent.

Reuse `ctx.buildTakeEl(take)` for recording/take rendering. That keeps take playback, download, analysis, and delete controls behaviorally consistent with the drawers.

## Data Flow

On app load:

1. `initSetup` loads the saved setup into the form.
2. `initHistory` restores or creates the current session id as it does today.
3. `initHome` renders the Home stage from saved setup, sessions, and takes.
4. Initial app step is `home`.

When `Start new session` is clicked on Home:

1. Save the current setup silently.
2. Create a fresh session id.
3. Reset warmup index to `0`.
4. Navigate to `warmups`.
5. Refresh current-session take counts.

When a previous session is expanded:

1. Read all takes.
2. Filter takes to the clicked session id.
3. Render them inline under the session card.
4. Keep the active recording session unchanged.

When setup changes:

1. Existing setup persistence bumps `setupRev`.
2. Home re-renders the focus song area so returning to Home shows the new saved song.

## Error And Empty States

If sessions cannot load, Home should show a concise error in the session list and keep the current-song actions usable.

If there are no previous saved sessions, Home should show a calm empty state explaining that finished sessions will appear there after using `Finish & reflect`.

If a previous session has no takes, its expanded state should say there are no recordings for that session and still show reflection metadata if present.

If there is no saved focus song, Home should avoid showing a misleading `Start new session` action and should send the user to Setup first.

## Testing

Add DOM tests for the Home module:

- Home renders saved focus song from existing setup.
- Home starts a fresh session and navigates to Warmups.
- Home sends users with no saved song to Setup.
- Previous session cards render and expand inline to show their takes.
- Old session expansion does not replace the active current session.

Update existing setup/history tests for the new initial `home` step where needed.

Update the Playwright smoke test so it starts from Home, changes/searches the song through Setup, returns to Home or starts a session, finishes and saves a session, then verifies that the saved session appears inline on Home with its reflection and recordings.

## Non-Goals

Do not add a multi-song library or song-project schema in this change.

Do not migrate existing storage or change IndexedDB schema unless a test proves it is required.

Do not remove the History drawer in this change.

Do not support resuming old completed sessions or adding new takes to them.
