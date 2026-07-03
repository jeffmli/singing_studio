# Warm-up Picker PRD

## Summary

Add a warm-up picker to Singing Studio so a singer can build a warm-up queue from a curated library of vocal exercise videos instead of manually pasting every YouTube URL. The existing pasted-URL workflow remains available for custom videos.

## Problem / Opportunity

The current setup flow has a `warmupLinks` textarea where the user enters one YouTube URL per line. This works, but it forces the singer to leave the app, remember useful exercises, find videos, and paste links before starting practice. Warm-ups are a repeatable part of every session, so the app should offer a simple library of common exercises and let the user select, order, and reuse them quickly.

## Goals

- Let the user select warm-up videos from a curated in-app library.
- Let the user add, remove, and reorder selected warm-ups before starting a session.
- Preserve the existing manual URL escape hatch for custom warm-ups.
- Continue using the current warm-up stage playback, dots, previous/next controls, and local persistence model.
- Make the selected warm-up queue survive refreshes through the existing setup persistence.

## Non-Goals

- Building full YouTube search or discovery for warm-ups in the first version.
- Accounts, cloud sync, sharing warm-up libraries, or multi-device persistence.
- Validating vocal pedagogy quality beyond a starter curated list.
- Replacing the existing YouTube iframe playback system.
- Changing the Sing stage, recording flow, pitch analysis, or live pitch guide.

## Users / Personas

- Solo singer practicing independently.
- Wants a low-friction practice setup without repeatedly hunting for warm-up videos.
- May still have favorite external videos and needs a manual add path.

## Current Context

- `web/index.html` contains a Setup field labeled "Warmup videos (one URL per line)" backed by `#warmupLinks`.
- `web/js/features/setup.js` owns `singing-practice-setup-v1`, reads `#warmupLinks`, persists a `warmups` array, and bumps `setupRev` after changes.
- `web/js/features/warmups.js` reads `ctx.getSetup().warmups`, renders progress dots, and asks `players.js` to embed the active warm-up URL.
- The README describes the app as a local-only practice studio with a three-stage flow: Setup -> Warmups -> Sing.

## Assumptions

- **Safe:** MVP should use a static curated list in the frontend rather than search-backed discovery.
- **Safe:** The persisted output can remain a simple `warmups` array of URLs so `warmups.js` does not need a data model migration.
- **Needs confirmation:** The first curated list should be manually chosen and may need later review for embed reliability.
- **Needs confirmation:** Drag-and-drop is nice, but up/down reorder buttons are acceptable for the first implementation if they are faster and more reliable.

## Proposed Solution

Replace the single-purpose warm-up URL textarea with a picker UI in Setup:

- A curated library of common vocal warm-up exercises.
- A selected queue showing the warm-ups that will play during the Warmups stage.
- Controls to add/remove and reorder queue items.
- A custom URL input or textarea for user-provided warm-up videos.

Internally, the selected queue should still write a URL list into the existing setup `warmups` array. This keeps the Warmups stage simple and avoids changing playback behavior.

## User Stories / Key Flows

1. As a singer, I can open Setup and see a list of suggested warm-up exercises.
2. As a singer, I can add a warm-up from the library to my session queue.
3. As a singer, I can remove a warm-up from my queue before starting the session.
4. As a singer, I can reorder the warm-up queue so exercises play in my preferred sequence.
5. As a singer, I can paste a custom YouTube URL and include it in the queue.
6. As a returning singer, my selected warm-up queue is still present after refresh.
7. As a singer, I can start the session and use the existing Warmups step without learning a new playback UI.

## Functional Requirements

- FR-1: The Setup screen must show a curated warm-up library with at least 6 starter items.
- FR-2: Each library item must show a human-readable title and warm-up type, such as lip trills, sirens, scales, humming, or arpeggios.
- FR-3: The user must be able to add a library item to the selected warm-up queue.
- FR-4: The selected queue must show warm-ups in playback order.
- FR-5: The user must be able to remove an item from the selected queue.
- FR-6: The user must be able to reorder selected queue items using accessible controls.
- FR-7: The user must be able to add at least one custom YouTube URL to the selected queue.
- FR-8: The existing manual URL list behavior must remain available, either as an advanced editor or as the backing value of the custom URL workflow.
- FR-9: Saving or auto-saving setup must persist the selected queue to `singing-practice-setup-v1` as `warmups`.
- FR-10: Loading setup must hydrate the picker and queue from the persisted `warmups` array.
- FR-11: Starting a session must reset `warmupIndex` to 0 and play the selected queue through the existing Warmups stage.
- FR-12: If no warm-ups are selected, the Warmups stage must keep showing the existing empty-state guidance.

## Non-Functional Requirements

- NFR-1: The picker must work without accounts, API keys, or internet access beyond YouTube playback itself.
- NFR-2: The picker must preserve the local-only privacy model; no warm-up selections should leave the browser.
- NFR-3: The UI must be usable on desktop and mobile widths supported by the current app.
- NFR-4: Reordering and removal must be keyboard-accessible.
- NFR-5: The implementation must avoid introducing a new framework or state library.

## Data, Integrations, and Dependencies

### Warm-up Library Data

Use a static list in frontend code for MVP:

```js
[
  {
    id: "lip-trills-basic",
    title: "Lip Trills - Basic Range",
    type: "Lip trills",
    url: "https://www.youtube.com/watch?v=..."
  }
]
```

The final selected setup remains:

```json
{
  "warmups": [
    "https://www.youtube.com/watch?v=..."
  ]
}
```

### Existing Dependencies

- `setup.js`: add queue serialization and hydration.
- `warmups.js`: no required model change if `warmups` remains a URL array.
- `players.js`: continues embedding the active warm-up URL.
- `tests/test_setup.dom.mjs`, `tests/test_warmups.dom.mjs`, and `tests/smoke-test.cjs`: update coverage for the picker.

## UX / Content / API Notes

- Put the picker in the existing "Lyrics & Warmups" setup section.
- Use compact cards or rows for library items so the setup form stays scannable.
- Label the selected list clearly, for example "Your warm-up queue."
- Keep custom URLs visible enough to find, but secondary to the curated list.
- Show a short empty state when the queue is empty: "Choose warm-ups from the library or add a custom YouTube URL."
- Avoid long instructional copy.

## Edge Cases and Error States

- Library video fails to embed: existing player fallback/error behavior should still apply.
- Duplicate add: either allow duplicates for repeated exercises or show "Already added"; MVP should pick one behavior and test it.
- Persisted URL is not in the curated library: show it in the queue as a custom warm-up.
- Invalid custom URL: do not add blank values; optionally allow raw YouTube IDs if existing parsing supports them.
- All warm-ups removed: persist an empty `warmups` array and show the existing Warmups empty state.

## Privacy, Security, and Compliance Notes

Warm-up selections stay in `localStorage` through the existing setup object. The feature should not add analytics, external storage, or new network calls beyond embedding selected YouTube videos.

## Success Metrics

- A user can build a three-video warm-up queue without leaving the app.
- The selected queue survives refresh and app restart.
- The Warmups stage plays the selected queue in order.
- Manual custom warm-up URLs still work.
- Automated tests cover add, remove, reorder, persistence, and warm-up playback handoff.

## Rollout / Migration Plan

1. Add the picker UI and static library while continuing to write `warmups` as URL strings.
2. Hydrate selected queue from existing `warmups` arrays so current saved setups keep working.
3. Keep the old textarea or advanced editor during rollout to reduce migration risk.
4. Once the picker is stable, decide whether to hide the raw textarea by default.

## Risks and Mitigations

- **Curated video embeds may break:** start with a small list and preserve custom URLs.
- **Setup UI gets cluttered:** keep library rows compact and selected queue short.
- **State duplication between picker and textarea:** make the selected queue the source of truth and update the persisted `warmups` array through one save path.
- **Drag-and-drop adds complexity:** use up/down buttons first unless drag-and-drop is clearly needed.

## Open Questions

- What exact videos should ship in the initial curated library?
- Should duplicates be allowed for repeating the same warm-up?
- Should custom entries have user-editable labels, or is the URL enough for MVP?
- Should the raw URL textarea remain visible, or move behind an "Advanced" disclosure?

## Implementation Handoff

### Suggested MVP Scope

- Static curated library with 6-10 warm-up items.
- Selected queue with add, remove, and up/down reorder.
- Custom URL add path.
- Existing `warmups` array persistence and Warmups playback.
- DOM/unit tests and smoke test updates.

### Likely Files To Change

- `web/index.html`
- `web/js/features/setup.js`
- `web/styles/setup.css`
- `tests/test_setup.dom.mjs`
- `tests/test_warmups.dom.mjs` only if queue behavior changes Warmups assumptions
- `tests/smoke-test.cjs`

### Acceptance Criteria

- Given no selected warm-ups, Setup shows the library and an empty selected queue.
- Given a library item is added, it appears in the selected queue and persists after refresh.
- Given multiple selected warm-ups, the user can reorder them and Warmups plays them in that order.
- Given a custom URL is added, it persists and plays in the Warmups stage.
- Given a saved setup with legacy `warmups` URLs, the picker loads them as selected queue items.
- Existing search, song setup, Warmups navigation, and Sing stage tests continue passing.

### Test Plan Outline

- Unit/DOM test `setup.js` queue add/remove/reorder/persist/hydrate behavior.
- Unit/DOM test legacy `warmups` hydration.
- Existing `warmups.js` test confirms playback reads the URL array correctly.
- Playwright smoke test builds a queue, starts session, verifies dots and navigation.

