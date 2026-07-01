"""Build and cache a song's reference melody contour from its YouTube link."""
import json
import os
import re

from .config import ANALYSIS_SR, CACHE_DIR, CONF_THRESHOLD, FMAX_NOTE, FMIN_NOTE
from .audio import _download_audio, _separate_vocals
from .detect import _gate_confidence
from .notes import _hz_to_midi


def _video_id(url):
    raw = (url or "").strip()
    if not raw:
        return ""
    m = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})", raw)
    if m:
        return m.group(1)
    return raw if re.fullmatch(r"[A-Za-z0-9_-]{11}", raw) else ""


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
    f0, _, voiced_prob = librosa.pyin(
        vocals, sr=ANALYSIS_SR,
        fmin=librosa.note_to_hz(FMIN_NOTE),
        fmax=librosa.note_to_hz(FMAX_NOTE),
        frame_length=2048,
    )
    f0 = _gate_confidence(f0, voiced_prob, np)
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
