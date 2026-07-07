# In-app Piano PRD

## Summary

Add a playable in-app piano/keyboard to Singing Studio so a singer can hear a target note, sing it back, and optionally see whether their voice matches the note. The MVP should use Web Audio synthesis with no external samples, support mouse/touch interaction, and fit naturally into the existing local-only practice workflow.

## Problem / Opportunity

Singing Studio currently supports song practice, warmups, recording, pitch analysis, and a live pitch guide tied to a prepared song melody. It does not provide a simple way to practice individual notes on demand. Singers often need to isolate pitch matching outside a song: hear C4, sing C4, repeat, then move through a range. An in-app piano gives the user that focused drill without leaving the studio.

## Goals

- Let the user play individual notes from an on-screen keyboard.
- Support a sensible vocal practice range by default, approximately C2-C6.
- Make the feature usable with mouse, touch, and optionally computer keyboard shortcuts.
- Use Web Audio synthesis for MVP so the feature works locally with no added audio assets.
- Provide a path to integrate microphone pitch matching using existing pitch utilities.
- Preserve the app's local-only privacy model.

## Non-Goals

- High-fidelity sampled piano playback in MVP.
- Full MIDI controller support.
- Sheet music, chord charts, or multi-note composition tools.
- Recording piano audio into takes.
- Replacing the existing live song pitch guide.
- Cloud sync, accounts, or external note-practice services.

## Users / Personas

- Solo singer practicing independently.
- Wants quick pitch drills before or during song practice.
- Needs immediate reference tones without opening a separate piano app.
- May want to check if their sung note is sharp, flat, or on target.

## Current Context

- The app is a local browser app with modular frontend feature files under `web/js/features`.
- `web/js/lib/pitch.js` already exposes `detectPitchHz`, `hzToMidi`, and `noteName`.
- `web/js/features/live-guide.js` already opens the microphone and computes live user pitch, but it compares against a prepared song reference from `/api/reference`.
- `web/index.html` currently has stages for Home, Setup, Warmups, and Sing. The Sing stage contains a collapsible "Live pitch guide" panel.
- `web/styles/live-guide.css` provides existing styles for pitch readouts and chart-like UI.

## Assumptions

- **Safe:** MVP should use a Web Audio oscillator instead of sampled piano files.
- **Safe:** C2-C6 is a good default visible range because `detectPitchHz` accepts approximately 65-1200 Hz, and C2-C6 fits comfortably inside that range.
- **Safe:** The first version can live as a panel inside the Sing stage or a reusable practice panel without creating a new top-level app stage.
- **Needs confirmation:** Whether the piano should be a standalone practice tool on Home/Setup or primarily embedded in the Sing stage.
- **Needs confirmation:** Whether matching feedback should ship in MVP or as a follow-up after the basic keyboard is usable.

## Proposed Solution

Build a compact piano practice panel with two phases:

1. **MVP keyboard:** An on-screen keyboard that plays one note at a time using Web Audio. It shows note labels and supports a default C2-C6 range.
2. **Pitch match mode:** The user plays/selects a target note, starts microphone listening, sings, and sees simple feedback: Flat, On, Sharp, or Sing.

For MVP, the keyboard can be added as a collapsible panel near the existing live pitch guide in the Sing stage, or as a section reachable from Home. The implementation should keep synthesis and pitch-matching logic isolated so the UI location can change later without rewriting the audio core.

## User Stories / Key Flows

1. As a singer, I can open the piano tool and tap/click a note to hear it.
2. As a singer, I can see which note I am playing.
3. As a singer, I can practice within a useful vocal range without configuring anything.
4. As a singer, I can use computer keyboard shortcuts for common notes if available.
5. As a singer, I can choose a target note and sing it back.
6. As a singer, I can see whether I am flat, on target, or sharp compared with the selected note.
7. As a singer, I can stop microphone listening cleanly.

## Functional Requirements

- FR-1: The app must display an on-screen piano keyboard covering at least C2 through C6.
- FR-2: The user must be able to play a note by clicking or tapping its key.
- FR-3: The app must generate note audio locally through Web Audio.
- FR-4: The app must show the active note name when a note is played.
- FR-5: The app must stop or fade a note cleanly after release or after a short default duration.
- FR-6: The keyboard must visually distinguish white keys and black keys.
- FR-7: The user must be able to select a target note for matching mode.
- FR-8: Matching mode must use microphone input and existing pitch math to compare sung pitch with the selected target note.
- FR-9: Matching mode must show target note, detected user note, cents delta, and feedback state.
- FR-10: Feedback must label pitches within a defined tolerance as "On" and pitches outside that tolerance as "Sharp" or "Flat."
- FR-11: The user must be able to start and stop matching mode without affecting recording or the live song pitch guide.
- FR-12: The feature must handle browsers without Web Audio or microphone support with clear disabled states.

## Non-Functional Requirements

- NFR-1: The feature must not require API keys, network access, or bundled audio files for MVP.
- NFR-2: Microphone audio must stay local in the browser.
- NFR-3: The keyboard must work on mobile and desktop layouts without horizontal page overflow.
- NFR-4: Keys and controls must be keyboard-accessible.
- NFR-5: Audio startup must follow browser user-gesture rules.
- NFR-6: The implementation must avoid adding a new framework or state library.

## Data, Integrations, and Dependencies

### Audio Synthesis

Use Web Audio:

- `AudioContext`
- oscillator node for the selected frequency
- gain envelope to avoid clicks
- optional waveform choice, defaulting to a mellow sine or triangle wave

### Pitch Detection

Reuse:

- `detectPitchHz(buffer, sampleRate)`
- `hzToMidi(hz)`
- `noteName(midi)`

Add a small conversion helper if needed:

```js
function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
```

### Likely Frontend Modules

- New `web/js/features/piano.js` for UI wiring, Web Audio tone playback, and optional match mode.
- Existing `web/js/lib/pitch.js` for pitch math.
- Existing microphone helper or `ctx.openMic()` pattern from `live-guide.js` if appropriate.
- `web/index.html` for panel markup.
- New CSS file or additions to existing styles, depending on repo convention.

## UX / Content / API Notes

- Label the tool "Piano" or "Note practice."
- Use a compact keyboard that can horizontally scroll on small screens if needed.
- Show octave markers, such as C2, C3, C4, C5, C6.
- Provide a simple readout: Target, You, Difference, Feedback.
- Use the existing feedback vocabulary from live guide: On, Sharp, Flat, Sing.
- Avoid long instruction copy; controls should be self-explanatory.
- Icon-only controls need accessible labels.

## Edge Cases and Error States

- Browser blocks AudioContext until user gesture: start audio only after key press.
- User holds multiple keys: MVP may play only the latest key or allow simple polyphony; define and test one behavior.
- Device has no microphone: piano playback still works; matching mode is disabled with a clear message.
- Pitch detector returns null because the singer is quiet or noisy: show "Sing" rather than stale feedback.
- Target note is outside detectable range: default range should avoid this.
- Another feature is using the microphone: avoid double-opening streams when possible, and stop matching mode cleanly.

## Privacy, Security, and Compliance Notes

Piano playback is generated locally. Microphone matching, if enabled, should process audio in memory in the browser and should not store or transmit pitch samples.

## Success Metrics

- A user can play notes across C2-C6 without leaving the app.
- A user can select a target note and see matching feedback from their sung pitch.
- The feature works with no server running beyond the static app.
- Existing recording, live guide, and pitch analysis flows continue working.
- Automated tests cover note/frequency mapping, UI rendering, and match feedback state.

## Rollout / Migration Plan

1. Add MVP keyboard with Web Audio note playback and visual active-note state.
2. Add keyboard accessibility and responsive layout.
3. Add optional target-note selection and match readouts using existing pitch math.
4. Decide whether to move the panel into its own top-level practice stage after usage.
5. Consider sampled piano sounds only if the synthesized tone is not good enough.

## Risks and Mitigations

- **Web Audio tone sounds harsh:** use a triangle/sine waveform plus a short gain envelope.
- **Mobile keyboard too wide:** use responsive key sizing and horizontal scroll inside the piano panel.
- **Microphone conflicts with recording/live guide:** keep match mode lifecycle separate and stop streams on close.
- **Pitch detection jitters:** reuse median smoothing from `live-guide.js`.
- **Feature scope expands into music theory tools:** keep MVP focused on reference tone and pitch matching.

## Open Questions

- Should the piano live on Home, Sing, Warmups, or in its own top-level stage?
- Should MVP include pitch matching, or should it ship as playback-only first?
- Should computer keyboard shortcuts map to one octave only or follow the visible range?
- Should note labels show sharps only, or support flats as an option?
- Should users be able to change range beyond C2-C6?

## Implementation Handoff

### Suggested MVP Scope

- On-screen C2-C6 keyboard.
- Web Audio oscillator playback.
- Active note readout.
- Responsive and accessible keyboard controls.
- Optional pitch matching only if it can reuse `detectPitchHz` without interfering with existing mic flows.

### Likely Files To Change

- `web/index.html`
- `web/js/main.js`
- `web/js/features/piano.js`
- `web/js/lib/pitch.js` if `midiToHz` helper is added there
- `web/styles/live-guide.css` or a new piano-specific stylesheet
- `tests/test_pitch.mjs`
- New `tests/test_piano.dom.mjs`
- `tests/smoke-test.cjs`

### Acceptance Criteria

- Given the piano panel is visible, clicking C4 plays a C4 reference tone and shows "C4" as active.
- Given a black key is clicked, the app plays the correct sharp note and displays its label.
- Given the user releases a key or the note duration ends, the note stops without an audible click.
- Given the app is on a mobile-width viewport, the keyboard remains usable without overlapping other controls.
- Given matching mode is started and the microphone detects a sung pitch near the target, feedback shows "On."
- Given the detected pitch is above or below the target tolerance, feedback shows "Sharp" or "Flat."
- Existing smoke tests for setup, warmups, recording, live guide, and history continue passing.

### Test Plan Outline

- Unit test MIDI-to-frequency conversion and note label mapping.
- DOM test piano key rendering across the configured range.
- DOM test click/touch handlers update active note state.
- DOM test match feedback classification from synthetic pitch values.
- Playwright smoke test opens the piano panel, plays a note, and verifies the active note readout.

