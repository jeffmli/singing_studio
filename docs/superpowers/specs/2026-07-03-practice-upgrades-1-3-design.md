# Practice Upgrades 1-3 PRD

## Summary

Add the next three Singing Studio product upgrades as one coordinated release:

1. A curated warm-up picker that replaces the raw warm-up URL workflow as the main path.
2. An in-app piano / note practice panel with local Web Audio playback and pitch matching.
3. A practice goal selector that tags each session and makes reflection/history more useful.

The release should keep the app local-only, avoid new frameworks, and preserve the existing Home -> Pick song -> Warmups -> Sing -> Finish & reflect flow.

## Problem

Singing Studio now supports a complete practice session, but three gaps still make practice less repeatable than it should be:

- Warm-ups are still managed as raw YouTube URLs, which forces the user to remember or find exercises before each session.
- Pitch work is tied to full songs. There is no simple way to hear one note and sing it back.
- Sessions capture rating and reflection, but not the reason for the session. History can show what happened, but not what the singer was trying to improve.

These features solve setup friction, add focused note practice, and make the practice journal more actionable.

## Goals

- Let the user build a warm-up queue from a small curated library.
- Preserve custom YouTube warm-up URLs and legacy saved `warmups` arrays.
- Add a compact piano tool in the Sing stage that plays reference notes locally.
- Add a pitch-match mode that compares the user's sung note to the selected piano note.
- Let the user choose one practice goal before starting a session.
- Persist the selected goal with saved sessions and show it in Home and History.
- Keep tests and the native Mac app deploy path working.

## Non-Goals

- Full warm-up search/discovery in the first release.
- Sampled piano sounds, MIDI input, chords, sheet music, or music theory lessons.
- Cloud sync, accounts, sharing, or analytics.
- Reintroducing removed Singing-tab controls such as custom playback pace, phrase focus, or take labels.
- Replacing the existing live song pitch guide.

## Users

The primary user is a solo singer practicing independently. They want to start quickly, do a repeatable warm-up, work through a song, drill specific notes when needed, record takes, and see what they practiced over time.

## Feature 1: Warm-Up Picker

### User Experience

In Setup, the "Lyrics & Warmups" section gets a warm-up picker with:

- A curated library of 6-10 warm-up exercises.
- An ordered "Your warm-up queue" list.
- Add buttons on library items.
- Remove and Move up / Move down controls in the queue.
- A compact custom URL add field.
- The existing raw URL textarea kept as an advanced editor or hidden backing field during rollout.

The Warmups stage continues reading `ctx.getSetup().warmups`, so playback, dots, Previous, Next, and Finish Warmups stay the same.

### Requirements

- The selected queue must persist as `warmups: string[]` inside `singing-practice-setup-v1`.
- Loading setup must hydrate the queue from existing `warmups` arrays.
- URLs not recognized from the curated library must appear as custom queue items.
- Blank custom URLs must not be added.
- Duplicates should be prevented for MVP; adding an existing URL should leave the queue unchanged and keep the UI stable.
- If the queue is empty, the Warmups stage must continue showing its existing empty state.

### Curated Library

Use a static frontend list for MVP. Each item should include:

- `id`
- `title`
- `type`
- `url`
- optional short `note`

The list can be revised later without data migration because persisted setup stores URLs, not library IDs.

## Feature 2: In-App Piano / Note Practice

### User Experience

Add a collapsible "Piano / note practice" panel in the Sing stage, near the live pitch guide. It should be compact and practical:

- C2-C6 keyboard by default.
- White and black keys visually distinct.
- Clicking or tapping a key plays a short local reference tone.
- Active note readout shows the selected note.
- Match mode can be started after selecting a note.
- Match readouts show Target, You, Difference, and Feedback.
- Feedback uses the existing language: Sing, On, Sharp, Flat.

The piano should not add another top-level stage in this release. It is a drill tool inside song practice.

### Audio Requirements

- Use Web Audio only; no bundled audio samples.
- Use a sine or triangle oscillator with a short gain envelope to avoid clicks.
- Audio starts only from a user gesture.
- If Web Audio is unavailable, disable playback with clear status text.

### Pitch Match Requirements

- Reuse the existing pitch utilities: `detectPitchHz`, `hzToMidi`, `noteName`, and a new or local `midiToHz`.
- Use microphone input locally in the browser.
- Smooth recent MIDI readings with the same practical median approach used by the live guide.
- Show "On" when the sung note is within 35 cents of target.
- Show "Sharp" or "Flat" outside that tolerance.
- Show "Sing" when no stable pitch is detected.
- Match mode must stop its own mic stream cleanly and must not break recording or live guide flows.

## Feature 3: Practice Goals

### User Experience

In Setup, before "Save & start warmups", show a compact practice goal selector. Use a simple segmented/radio style with these starter goals:

- Learn melody
- Improve pitch
- Memorize lyrics
- Record clean take
- Warmup only

The selected goal appears:

- In the reflection summary.
- In saved session cards on Home.
- In session cards in History.

The goal helps the user understand why a session happened when reviewing older practice.

### Data Requirements

- Persist the current selected goal in setup localStorage as `practiceGoal`.
- Save `practiceGoal` into each finished session.
- Existing sessions without a goal must still render normally.
- Song library snapshots can include `practiceGoal` because it is part of how the user practices a song, but it must not break older saved songs.

### Reflection Requirements

The reflection modal should include the goal in its summary, for example:

`Test Song · Improve pitch · 12:34 · 3 takes recorded.`

No new required reflection fields are needed for this release.

## Data Model

### Setup LocalStorage

Extend `singing-practice-setup-v1`:

```json
{
  "songTitle": "Practice Song",
  "warmups": ["https://www.youtube.com/watch?v=..."],
  "practiceGoal": "Improve pitch"
}
```

### Session IndexedDB Records

Extend saved sessions:

```json
{
  "id": "uuid",
  "songTitle": "Practice Song",
  "practiceGoal": "Improve pitch",
  "startedAt": 123,
  "endedAt": 456,
  "durationMs": 333,
  "rating": 4,
  "wins": "...",
  "focus": "...",
  "takeCount": 2
}
```

No IndexedDB schema version change is required if records are stored as plain objects in the existing object store.

## Architecture

### New Modules

- `web/js/features/piano.js`
  - Renders / wires piano controls.
  - Owns Web Audio oscillator lifecycle.
  - Owns pitch-match mic lifecycle.
  - Exposes small helpers for tests if needed.

- `web/js/lib/warmups.js`
  - Static curated warm-up library.
  - Optional helpers to resolve a URL to a display label.

### Existing Modules

- `setup.js`
  - Owns warm-up queue state through DOM and persisted setup.
  - Owns `practiceGoal` read/write.
  - Keeps `getSetup().warmups` as the single playback contract.

- `warmups.js`
  - No model change expected.
  - Continues playing the URL array.

- `history.js`
  - Saves `practiceGoal`.
  - Includes goal in reflection summary and session rendering.

- `home.js`
  - Shows goal on session cards when present.

- `main.js`
  - Initializes the piano feature after recording/live guide dependencies are available.

## UI Placement

- Setup:
  - Practice goal selector near the start action.
  - Warm-up picker inside the existing "Lyrics & Warmups" section.

- Sing:
  - Piano / note practice as a collapsible panel below the video/lyrics area and above or near the live pitch guide.

- Home / History:
  - Goal appears as a small metadata chip or inline text in session cards.

## Error Handling

- Warm-up picker:
  - Ignore blank custom URLs.
  - Display custom persisted URLs as "Custom warm-up".
  - Keep warm-up playback empty state when no queue exists.

- Piano:
  - If Web Audio is unavailable, show a disabled playback status.
  - If microphone access fails, keep piano playback working and show the mic error in match status.
  - If pitch detection returns no pitch, show "Sing" and clear stale cents.

- Practice goals:
  - Missing or unknown goals render as no goal instead of crashing.

## Testing

### Unit / DOM Tests

- `test_setup.dom.mjs`
  - Warm-up library item add.
  - Queue remove and reorder.
  - Custom URL add.
  - Legacy `warmups` hydration.
  - Practice goal persistence.

- `test_warmups.dom.mjs`
  - Existing playback still reads URL order from setup.

- `test_piano.dom.mjs`
  - Keyboard renders C2-C6.
  - Clicking C4 updates active note.
  - Note label / MIDI / frequency helpers are correct.
  - Match feedback classification works for flat/on/sharp/no pitch.

- `test_history.dom.mjs` and `test_home.dom.mjs`
  - Goal is saved and rendered.

### Smoke Test

Update `tests/smoke-test.cjs` to cover:

- Selecting a practice goal.
- Adding/reordering warm-ups in the picker.
- Starting a session and confirming Warmups dots match the selected queue.
- Opening piano panel and playing a note.
- Starting/stopping piano match mode with fake mic if stable in Playwright.
- Finishing a session and confirming goal appears in Home and History.

## Acceptance Criteria

- A user can build a warm-up queue from curated items and a custom URL.
- The warm-up queue persists and plays in order in the Warmups stage.
- A user can select a practice goal before starting.
- The selected goal is saved with the finished session and appears on Home and History cards.
- A user can open the piano panel, play C2-C6 notes, and see the active note.
- A user can start match mode and get local flat/on/sharp feedback for a selected note.
- Existing search, recent songs, recording, takes, pitch analysis, live guide, finish/reflection, and history flows continue passing tests.
- The native Mac app build bundles the new web files successfully.

## Rollout Plan

Build and ship in this order:

1. Practice goals, because this is the smallest data and UI change and feeds the rest of session history.
2. Warm-up picker, because it changes Setup but preserves the existing Warmups playback contract.
3. Piano / note practice, because it adds new audio and mic lifecycle behavior.

Each feature should be committed after its tests pass. After all three are implemented:

1. Run targeted DOM/unit tests.
2. Run the full Playwright smoke test against `python3 server.py`.
3. Push the feature branch.
4. Rebuild `/Applications/Singing Studio.app` with `./mac-app/build-native.sh`.
5. Verify the installed app bundle contains the new UI files.

## Risks

- The Setup screen may become too dense. Mitigation: keep the picker compact and put raw URL editing behind an advanced affordance.
- Curated warm-up videos may fail to embed. Mitigation: preserve custom URL workflow and existing fallback behavior.
- Piano match mode may conflict with recording/live guide mic streams. Mitigation: keep a separate start/stop lifecycle and stop streams on stage changes where possible.
- Pitch detection can jitter. Mitigation: median-smooth recent readings and use a practical 35-cent "On" tolerance.
- Adding all three features at once can make review harder. Mitigation: implement and commit in the rollout order above.

## Self-Review Notes

- Scope is limited to features 1-3 from the product review.
- All new persistence is additive and compatible with existing localStorage / IndexedDB records.
- The Warmups stage contract remains `warmups: string[]`.
- Piano is intentionally placed in Sing instead of adding a new top-level stage.
- The PRD does not require cloud services, new package dependencies, or a frontend framework.
