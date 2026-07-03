# Singing Tab Cleanup Design

## Goal

Make the Singing tab cleaner by removing custom practice controls that duplicate YouTube or add clutter, while preserving the four top source tabs.

## User Experience

- Keep the top source tabs unchanged: `Original`, `Instrumental`, `Lyric Video`, and `Lyrics`.
- Remove the visible `Phrase focus`, `Playback pace`, and `Take label` controls from the Singing tab.
- Remove the lyric overlay from the YouTube player area so the embedded YouTube player is directly clickable.
- Keep the separate `Lyrics` tab as the place to read lyrics.
- Keep recording controls in the bottom transport bar.

## Behavior

- New recordings no longer save phrase-focus or take-label metadata.
- Existing old takes may still display previously saved phrase-focus or take-label metadata.
- YouTube's native controls handle playback speed; the app no longer renders custom pace buttons or wires pace-click behavior.
- The live guide can continue to use the default playback rate value from state; this cleanup does not refactor live-guide timing internals.

## Architecture

Update the Singing-stage markup in `web/index.html`, remove obsolete styling from `web/styles/sing.css`, and guard setup/recording/player code that previously assumed removed elements existed.

Keep the change scoped to the Singing surface and new recording metadata. Do not remove persisted setup fields or reducer state broadly in this pass, so older local data remains compatible.

## Testing

- DOM tests should verify the removed controls are absent or no longer required.
- Recording tests should verify new takes do not include phrase-focus or take-label metadata.
- Player tests should no longer expect custom playback-rate controls.
- Smoke test should verify the Singing tab keeps the four source tabs, the removed controls are gone, and the video pane has no lyric overlay.
