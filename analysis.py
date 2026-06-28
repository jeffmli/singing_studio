"""Pitch / intonation analysis for Singing Studio.

Pipeline:
  build_reference(video_url)  -> download original, isolate vocal (Demucs),
                                 extract melody (pyin), cache it.
  detect_pitch(path)          -> pitch contour for a user take.
  align_and_score(user, ref)  -> subsequence-DTW align + cents scoring.

Heavy deps (torch/demucs/librosa) are imported lazily so importing this module
is cheap; they're only loaded when analysis actually runs.
"""
import json
import os
import re
import subprocess
import tempfile

ANALYSIS_SR = 22050
FMIN_NOTE = "C2"
FMAX_NOTE = "C6"
IN_TUNE_CENTS = 35          # within this many cents counts as "in tune"
CACHE_DIR = os.path.expanduser("~/Library/Application Support/Singing Studio/refcache")


def _video_id(url):
    raw = (url or "").strip()
    if not raw:
        return ""
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})", raw)
    if m:
        return m.group(1)
    return raw if re.fullmatch(r"[A-Za-z0-9_-]{11}", raw) else ""


# ---------- audio + pitch ----------
def _load_mono(path, sr=ANALYSIS_SR):
    import librosa
    y, _ = librosa.load(path, sr=sr, mono=True)
    return y


def detect_pitch(path):
    """Return (times, f0) for an audio file (NaN where unvoiced)."""
    import librosa
    import numpy as np
    y = _load_mono(path)
    if y.size < ANALYSIS_SR // 2:
        raise ValueError("Recording is too short to analyze.")
    if float(np.max(np.abs(y))) < 1e-3:
        raise ValueError("Recording is too quiet to analyze.")
    f0, _, _ = librosa.pyin(
        y, sr=ANALYSIS_SR,
        fmin=librosa.note_to_hz(FMIN_NOTE),
        fmax=librosa.note_to_hz(FMAX_NOTE),
        frame_length=2048,
    )
    times = librosa.times_like(f0, sr=ANALYSIS_SR)
    return times, f0


def _separate_vocals(path):
    """Isolate the vocal stem with the Demucs Python API; return mono @ ANALYSIS_SR."""
    import librosa
    import numpy as np
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    model = get_model("htdemucs")
    model.eval()
    y, _ = librosa.load(path, sr=model.samplerate, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    wav = torch.tensor(y, dtype=torch.float32)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std()
    wav = (wav - mean) / (std + 1e-8)
    with torch.no_grad():
        sources = apply_model(model, wav[None], device="cpu", progress=False)[0]
    sources = sources * std + mean
    vocals = sources[model.sources.index("vocals")].cpu().numpy()
    mono = vocals.mean(axis=0)
    return librosa.resample(mono, orig_sr=model.samplerate, target_sr=ANALYSIS_SR)


def _download_audio(video_url):
    tmp = tempfile.mkdtemp(prefix="ss-ref-")
    out = os.path.join(tmp, "orig.%(ext)s")
    subprocess.run(
        ["yt-dlp", "-x", "--audio-format", "wav", "--audio-quality", "0",
         "--no-playlist", "-o", out, video_url],
        check=True, capture_output=True, text=True, timeout=300,
    )
    for name in os.listdir(tmp):
        if name.endswith(".wav"):
            return os.path.join(tmp, name)
    raise RuntimeError("Could not download the original audio.")


def build_reference(video_url, force=False):
    """Return the reference melody contour {times, f0, midi}, using a disk cache."""
    import librosa
    import numpy as np

    vid = _video_id(video_url)
    if not vid:
        raise ValueError("A valid Original-song YouTube link is required.")
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache = os.path.join(CACHE_DIR, f"{vid}.json")
    if os.path.exists(cache) and not force:
        with open(cache) as fh:
            return json.load(fh)

    audio = _download_audio(video_url)
    vocals = _separate_vocals(audio)
    f0, _, _ = librosa.pyin(
        vocals, sr=ANALYSIS_SR,
        fmin=librosa.note_to_hz(FMIN_NOTE),
        fmax=librosa.note_to_hz(FMAX_NOTE),
        frame_length=2048,
    )
    times = librosa.times_like(f0, sr=ANALYSIS_SR)
    midi = _hz_to_midi(f0, np)
    ref = {
        "videoId": vid,
        "times": [round(float(t), 3) for t in times],
        "f0": [None if np.isnan(v) else round(float(v), 2) for v in f0],
        "midi": [None if np.isnan(v) else round(float(v), 3) for v in midi],
    }
    with open(cache, "w") as fh:
        json.dump(ref, fh)
    return ref


def _hz_to_midi(f0, np):
    out = np.full(len(f0), np.nan)
    mask = ~np.isnan(f0)
    out[mask] = 69 + 12 * np.log2(np.asarray(f0)[mask] / 440.0)
    return out


def _interp_nan(arr, np):
    """Linear-fill NaNs so DTW has a continuous 1-D feature."""
    a = np.array(arr, dtype=float)
    idx = np.arange(len(a))
    good = ~np.isnan(a)
    if good.sum() == 0:
        return np.zeros_like(a)
    a[~good] = np.interp(idx[~good], idx[good], a[good])
    return a


# ---------- alignment + scoring ----------
def align_and_score(user_times, user_f0, ref):
    """Subsequence-DTW align the user take to the reference, score in cents."""
    import librosa
    import numpy as np

    user_midi = _hz_to_midi(user_f0, np)
    ref_midi = np.array([np.nan if v is None else v for v in ref["midi"]], dtype=float)
    ref_times = np.array(ref["times"], dtype=float)

    user_voiced = ~np.isnan(user_midi)
    ref_voiced = ~np.isnan(ref_midi)
    if user_voiced.sum() < 10:
        raise ValueError("Couldn't detect enough singing in the take.")

    # Continuous 1-D features for DTW (query = user, db = reference).
    # Remove each contour's mean first, so alignment matches on melodic SHAPE
    # only. Otherwise DTW can hide a global pitch offset by re-routing your
    # notes to different, similarly-pitched notes elsewhere in the song.
    X = _interp_nan(user_midi, np) - np.nanmean(user_midi)
    Y = _interp_nan(ref_midi, np) - np.nanmean(ref_midi)
    _, wp = librosa.sequence.dtw(
        X=X[np.newaxis, :], Y=Y[np.newaxis, :], subseq=True, metric="euclidean"
    )
    wp = wp[::-1]  # ascending order: pairs of (user_idx, ref_idx)

    times, u_out, r_out, cents = [], [], [], []
    for ui, ri in wp:
        if user_voiced[ui] and ref_voiced[ri]:
            c = (user_midi[ui] - ref_midi[ri]) * 100.0
            times.append(float(user_times[ui]))
            u_out.append(round(float(user_midi[ui]), 3))
            r_out.append(round(float(ref_midi[ri]), 3))
            cents.append(round(float(c), 1))

    if not cents:
        raise ValueError("Couldn't line up the take with the song.")

    cents_arr = np.array(cents)
    abs_cents = np.abs(cents_arr)
    in_tune_pct = float(np.mean(abs_cents <= IN_TUNE_CENTS) * 100)
    median_cents = float(np.median(abs_cents))
    mean_signed = float(np.mean(cents_arr))
    tendency = _tendency(mean_signed)

    # Downsample arrays for the graph.
    step = max(1, len(times) // 600)
    return {
        "score": round(in_tune_pct),
        "inTunePct": round(in_tune_pct, 1),
        "inTuneCents": IN_TUNE_CENTS,
        "medianCents": round(median_cents),
        "meanSignedCents": round(mean_signed, 1),
        "tendency": tendency,
        "frames": len(times),
        "times": times[::step],
        "userMidi": u_out[::step],
        "refMidi": r_out[::step],
        "centsErr": [round(c, 1) for c in cents][::step],
    }


def _tendency(mean_signed):
    if mean_signed > 30:
        return "you tend to sing sharp"
    if mean_signed > 12:
        return "you tend to sing slightly sharp"
    if mean_signed < -30:
        return "you tend to sing flat"
    if mean_signed < -12:
        return "you tend to sing slightly flat"
    return "your pitch centering is solid"


def analyze(take_path, video_url):
    """Full analysis for one take. Returns the scoring result dict."""
    ref = build_reference(video_url)
    user_times, user_f0 = detect_pitch(take_path)
    return align_and_score(user_times, user_f0, ref)
