# Pitch Analysis — "How in tune am I?" (Design)

## Goal
Let the singer analyze a recorded a cappella take against the song's actual
melody and see, note-by-note, how in tune they were: an overall score plus a
green/red pitch-overlay graph and a couple of plain-English takeaways.

Validated by a feasibility spike (2026-06-28): Demucs vocal isolation + librosa
`pyin` produced a clean, musically correct reference melody from a real track in
~10–15s on an M4, and cents-based scoring + green/red visualization worked.

## User flow
1. Record an a cappella take (existing feature).
2. In the takes drawer or history, click **Analyze pitch** on a take.
3. The app sends the take audio + the song's *Original* YouTube URL to the local
   backend.
4. First time for a song: backend downloads the original, isolates the vocal
   (Demucs), extracts the reference melody, and caches it (~20–40s, shown with
   progress text). Subsequent takes of the same song reuse the cache (~10s).
5. Backend pitch-detects the take, time-aligns it to the reference (DTW), scores
   it in cents.
6. **Results view:** overall "% in tune" score, median cents off, a
   sharp/flat tendency note, and a graph of the user's pitch (green where in
   tune, red where off) over the target melody.

## Architecture

### Backend
- `server.py` runs under a project **virtualenv** (`.venv`, Python 3.11) that
  carries the heavy deps. Heavy libs are **lazily imported** only inside the
  analyze handler, so the server still starts instantly and all existing
  features work even if the deps aren't installed.
- New module **`analysis.py`**:
  - `build_reference(video_url) -> ref` — yt-dlp downloads the audio, Demucs
    isolates vocals, `pyin` extracts the melody. Cached to
    `~/Library/Application Support/Singing Studio/refcache/<videoId>.json`
    (times, f0/midi, confidence).
  - `detect_pitch(wav_path) -> contour` — `pyin` on the user take.
  - `align_and_score(user, ref) -> result` — **subsequence DTW** (so a take of
    just part of the song still aligns to the right section), then per-voiced-
    frame cents error.
- New endpoint **`POST /api/analyze`** (multipart: `audio` file + `videoUrl` +
  `title`) → JSON:
  ```
  { score, inTunePct, medianCents, tendency,        // "slightly sharp" | ...
    times[], refMidi[], userMidi[], centsErr[] }      // downsampled for graph
  ```
  Returns a clear error if the original URL is missing, audio is too short/quiet,
  or download/separation fails.

### Frontend
- **Analyze pitch** button on each take (drawer + history).
- **Results panel** (reuses the modal/drawer styling): loading states
  ("Isolating the original vocal — first time for this song can take ~30s"),
  then a score ring, the in-tune %, median cents, a "you tend to sing slightly
  sharp/flat" line, and a **canvas graph** drawn client-side from the returned
  arrays, styled to the dark/amber theme (gray target line, green/red user
  points, note labels).

### Dependencies & runtime
- `requirements-analysis.txt` (torch, demucs, librosa, soundfile, scipy) and a
  `setup.sh` that builds `.venv` with Python 3.11.
- The Mac app launcher prefers `.venv/bin/python` when present; otherwise it
  uses system `python3` and the Analyze feature reports "not installed."
- First analysis per song ~20–40s; cached reference makes later takes ~10s.

## Testing
- **Python pipeline test:** run `build_reference` + scoring on the spike clip;
  assert a reasonable voiced %, and that an identical copy scores ~100% while a
  +50-cent detuned copy scores clearly lower.
- **Playwright smoke:** mock `/api/analyze` and assert Analyze → results view
  renders the score + graph. (Real Demucs is too heavy for the browser smoke
  test, so the real pipeline is covered by the Python test.)

## Non-goals (v1)
- Real-time/live pitch feedback while singing.
- Polyphonic / harmony analysis.
- Rhythm/timing scoring beyond what alignment requires.
- Per-word lyric alignment.

## Risks & mitigations
- **Dense-mix separation noise** → confidence gating + ±50¢ threshold + light
  contour smoothing.
- **Octave errors** in pitch detection → median filtering; optional octave-
  agnostic scoring (compare pitch class).
- **Heavy install (~1–2 GB)** → isolated venv + one-time `setup.sh`; feature is
  optional and degrades gracefully if absent.
