"""Pitch / intonation analysis model for Singing Studio.

Public API:
  build_reference(video_url)  -> download original, isolate vocal (Demucs),
                                 extract melody (pyin), cache it.
  detect_pitch(path)          -> pitch contour for a user take.
  align_and_score(user, ref)  -> subsequence-DTW align + cents scoring.
  analyze(take_path, url)     -> end-to-end score for one take.

The model is UI- and HTTP-agnostic. Heavy deps (torch/demucs/librosa/numpy) are
imported lazily inside functions, so importing this package stays cheap.

Submodules: config, notes, audio, detect, score, reference, orchestrate.
"""
from .config import (
    ANALYSIS_SR,
    CACHE_DIR,
    CONF_THRESHOLD,
    FMAX_NOTE,
    FMIN_NOTE,
    IN_TUNE_CENTS,
    MIN_SINGING_CONFIDENCE,
    MIN_SUSTAINED_RUN_SEC,
    TOLERANCE_MARGIN_CENTS,
)
from .notes import _hz_to_midi
from .audio import _download_audio, _load_mono, _separate_vocals
from .detect import _gate_confidence, _pitch_contour, detect_pitch
from .score import (
    _fold_cents,
    _frame_credit,
    _interp_nan,
    _singing_confidence,
    _tendency,
    align_and_score,
)
from .reference import _video_id, build_reference
from .orchestrate import analyze

__all__ = [
    "build_reference",
    "detect_pitch",
    "align_and_score",
    "analyze",
    "IN_TUNE_CENTS",
    "TOLERANCE_MARGIN_CENTS",
    "CONF_THRESHOLD",
    "MIN_SINGING_CONFIDENCE",
    "MIN_SUSTAINED_RUN_SEC",
]
