"""Pitch detection: pyin contour with a voiced-probability confidence gate."""
from .config import ANALYSIS_SR, CONF_THRESHOLD, FMAX_NOTE, FMIN_NOTE
from .audio import _load_mono, _separate_vocals


def _gate_confidence(f0, voiced_prob, np):
    """Blank out frames pyin isn't confident about, so shaky reads don't score."""
    out = np.array(f0, dtype=float)
    out[np.asarray(voiced_prob) < CONF_THRESHOLD] = np.nan
    return out


def _pitch_contour(y):
    """Return (times, f0) for mono audio @ ANALYSIS_SR (NaN where unvoiced/low-conf)."""
    import librosa
    import numpy as np
    if y.size < ANALYSIS_SR // 2:
        raise ValueError("Recording is too short to analyze.")
    if float(np.max(np.abs(y))) < 1e-3:
        raise ValueError("Recording is too quiet to analyze.")
    f0, _, voiced_prob = librosa.pyin(
        y, sr=ANALYSIS_SR,
        fmin=librosa.note_to_hz(FMIN_NOTE),
        fmax=librosa.note_to_hz(FMAX_NOTE),
        frame_length=2048,
    )
    f0 = _gate_confidence(f0, voiced_prob, np)
    times = librosa.times_like(f0, sr=ANALYSIS_SR)
    return times, f0


def detect_pitch(path, isolate=False):
    """Return (times, f0) for an audio file.

    isolate=True runs Demucs vocal separation first, so the take is scored in the
    same vocal-only domain as the cached reference. Without it, pyin locks onto
    whatever instrument is loudest — playing an original mix back scores near zero
    even though every note is "right".
    """
    y = _separate_vocals(path) if isolate else _load_mono(path)
    return _pitch_contour(y)
