"""Alignment + cents scoring: octave folding, margin credit, singing confidence."""
from .config import (
    IN_TUNE_CENTS,
    MIN_SINGING_CONFIDENCE,
    MIN_SUSTAINED_RUN_SEC,
    TOLERANCE_MARGIN_CENTS,
)
from .notes import _hz_to_midi


def _interp_nan(arr, np):
    """Linear-fill NaNs so DTW has a continuous 1-D feature."""
    a = np.array(arr, dtype=float)
    idx = np.arange(len(a))
    good = ~np.isnan(a)
    if good.sum() == 0:
        return np.zeros_like(a)
    a[~good] = np.interp(idx[~good], idx[good], a[good])
    return a


def _fold_cents(cents, np):
    """Fold a cents error onto the nearest octave -> range (-600, 600].

    A whole-octave detection slip (common with pyin) shows up as ±1200c and
    would otherwise zero a note the singer actually nailed. Folding removes that
    artifact while leaving real, sub-octave errors untouched.
    """
    c = np.asarray(cents, dtype=float)
    return c - 1200.0 * np.round(c / 1200.0)


def _frame_credit(abs_cents, np):
    """Per-frame score in [0,1]: full credit within the core, then a linear
    ramp down across the margin band so notes just outside the core aren't
    punished as harshly as wildly wrong ones."""
    edge = IN_TUNE_CENTS + TOLERANCE_MARGIN_CENTS
    return np.clip((edge - np.asarray(abs_cents, dtype=float)) / TOLERANCE_MARGIN_CENTS, 0.0, 1.0)


def _singing_confidence(user_times, user_voiced, np):
    """Estimate whether the take sounds like singing instead of short speech bursts.

    Speech often yields many brief voiced islands. Singing tends to produce
    longer, more sustained voiced runs, even when the melody changes.
    """
    voiced_idx = np.flatnonzero(np.asarray(user_voiced, dtype=bool))
    if voiced_idx.size < 10:
      return 0.0

    if len(user_times) > 1:
        hop = float(np.median(np.diff(np.asarray(user_times, dtype=float))))
    else:
        hop = 0.01

    runs = []
    start = voiced_idx[0]
    prev = start
    for idx in voiced_idx[1:]:
        if idx != prev + 1:
            runs.append((prev - start + 1) * hop)
            start = idx
        prev = idx
    runs.append((prev - start + 1) * hop)

    runs = np.asarray(runs, dtype=float)
    voiced_sec = float(np.sum(runs))
    if voiced_sec <= 0:
        return 0.0

    sustained = float(np.sum(runs[runs >= MIN_SUSTAINED_RUN_SEC]) / voiced_sec)
    median_run = float(np.median(runs))
    median_score = float(np.clip((median_run - 0.08) / 0.16, 0.0, 1.0))
    long_run_share = float(np.mean(runs >= MIN_SUSTAINED_RUN_SEC))
    return float(
        0.55 * sustained +
        0.25 * median_score +
        0.20 * long_run_share
    )


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

    singing_confidence = _singing_confidence(user_times, user_voiced, np)
    if singing_confidence < MIN_SINGING_CONFIDENCE:
        raise ValueError(
            "That sounds more like speech than sustained singing. Try a held vowel or a slower phrase."
        )

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

    times, u_out, r_out, cents_raw = [], [], [], []
    for ui, ri in wp:
        if user_voiced[ui] and ref_voiced[ri]:
            times.append(float(user_times[ui]))
            u_out.append(round(float(user_midi[ui]), 3))
            r_out.append(round(float(ref_midi[ri]), 3))
            cents_raw.append((user_midi[ui] - ref_midi[ri]) * 100.0)

    if not cents_raw:
        raise ValueError("Couldn't line up the take with the song.")

    # Fold octave slips out before scoring, then give graded (margin) credit.
    cents_arr = _fold_cents(np.array(cents_raw), np)
    cents = [round(float(c), 1) for c in cents_arr]
    abs_cents = np.abs(cents_arr)
    score_pct = float(np.mean(_frame_credit(abs_cents, np)) * 100)
    in_tune_pct = float(np.mean(abs_cents <= IN_TUNE_CENTS) * 100)
    median_cents = float(np.median(abs_cents))
    mean_signed = float(np.mean(cents_arr))
    tendency = _tendency(mean_signed)

    # Downsample arrays for the graph.
    step = max(1, len(times) // 600)
    return {
        "score": round(score_pct),
        "inTunePct": round(in_tune_pct, 1),
        "inTuneCents": IN_TUNE_CENTS,
        "medianCents": round(median_cents),
        "meanSignedCents": round(mean_signed, 1),
        "tendency": tendency,
        "singingConfidence": round(singing_confidence, 2),
        "frames": len(times),
        "times": times[::step],
        "userMidi": u_out[::step],
        "refMidi": r_out[::step],
        "centsErr": [round(c, 1) for c in cents][::step],
    }
