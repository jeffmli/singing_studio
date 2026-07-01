# Feature Backlog

Running log of features to add to Singing Studio. Newest ideas at the top of
each section. Move items to **Done** (with the commit/PR) when shipped.

---

## Planned

### 1. Warm-up picker — choose warm-up videos from a library
**What:** In the Warm-ups section, let me pick which warm-up videos to use from a
set of options, instead of only pasting raw YouTube URLs in Setup.

**Today:** `web/index.html` Setup has a `#warmupLinks` textarea (one URL per line);
the Warm-ups stage plays them in order with prev/next dots
(`renderWarmups` in `web/js/app.js`). Fully manual — no discovery, no curation.

**Wanted:**
- A curated library of common vocal warm-ups (lip trills, sirens, scales, humming,
  arpeggios, etc.) I can toggle on/off to build my queue.
- Add/remove/reorder my selected warm-ups (drag or up/down).
- Keep the paste-a-URL escape hatch for custom videos.

**Open questions:**
- Where does the library come from — a hand-curated static list of YouTube links,
  or search-backed (reuse `/api/search` + yt-dlp)?
- Persist selections in the existing setup localStorage blob (`warmups` array)?

---

### 2. In-app piano for note practice
**What:** A playable piano/keyboard in the app so I can practice hitting specific
notes (play a note, then match it with my voice).

**Wanted:**
- On-screen keyboard (click/tap, and maybe computer-keyboard mapping) that plays
  the note (Web Audio oscillator or sampled piano).
- Sensible vocal range by default (~C2–C6, matching the pitch model's
  `FMIN_NOTE`/`FMAX_NOTE`).
- Nice-to-have: tie into the live pitch detector so it shows whether my sung note
  matches the piano note I just played (reuse `web/js/lib/pitch.js`
  `detectPitchHz` + `hzToMidi`/`noteName`).

**Open questions:**
- Standalone practice tool, or a panel inside the live pitch guide?
- Web Audio synth (zero assets) vs. sampled piano (better tone, needs samples)?

---

## Done

_(nothing yet)_
