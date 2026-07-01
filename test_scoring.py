"""Unit tests for the scoring hardening in analysis.py.

Pure-math tests (octave folding, margin credit, confidence gating) plus two
align_and_score behaviour tests built from synthetic contours — no audio or
Demucs required. Run under the analysis venv:

    .venv/bin/python test_scoring.py
"""
import numpy as np

import pitch as analysis


def _ref_from_midi(midi, hop=0.01):
    """Build a reference dict (times/f0/midi) from a MIDI contour array."""
    midi = np.asarray(midi, dtype=float)
    times = np.arange(len(midi)) * hop
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    return {
        "videoId": "synthetic",
        "times": [float(t) for t in times],
        "f0": [float(v) for v in f0],
        "midi": [float(v) for v in midi],
    }, times, f0


def test_fold_cents():
    fold = lambda c: analysis._fold_cents(np.array([c], float), np)[0]
    assert abs(fold(35) - 35) < 1e-6          # small error untouched
    assert abs(fold(1230) - 30) < 1e-6        # +octave + 30c folds to 30c
    assert abs(fold(-1175) - 25) < 1e-6       # -octave + 25c folds to 25c
    assert abs(abs(fold(700)) - 500) < 1e-6   # 700c folds to the near side (500c)
    print("ok fold_cents")


def test_frame_credit():
    core = analysis.IN_TUNE_CENTS
    margin = analysis.TOLERANCE_MARGIN_CENTS
    credit = lambda c: analysis._frame_credit(np.array([c], float), np)[0]
    assert abs(credit(0) - 1.0) < 1e-6                 # dead on
    assert abs(credit(core) - 1.0) < 1e-6              # edge of core still full
    assert abs(credit(core + margin)) < 1e-6           # edge of margin = no credit
    assert abs(credit(core + margin / 2) - 0.5) < 1e-6  # halfway = half credit
    print("ok frame_credit")


def test_gate_confidence():
    f0 = np.array([100.0, 200.0, 300.0])
    prob = np.array([0.9, 0.1, 0.7])  # middle frame is low-confidence
    gated = analysis._gate_confidence(f0, prob, np)
    assert not np.isnan(gated[0]) and not np.isnan(gated[2])
    assert np.isnan(gated[1])
    print("ok gate_confidence")


def test_octave_error_does_not_tank_score():
    melody = 60 + 4 * np.sin(np.linspace(0, 6, 240))
    ref, times, f0 = _ref_from_midi(melody)
    user_f0 = f0 * 2.0  # exactly one octave high — a classic pyin artifact
    res = analysis.align_and_score(times, user_f0, ref)
    assert res["score"] >= 90, f"octave-off take should still score high, got {res['score']}"
    assert res["medianCents"] <= analysis.IN_TUNE_CENTS
    print(f"ok octave_error score={res['score']}")


def test_margin_gives_partial_credit():
    melody = 62 + 3 * np.sin(np.linspace(0, 5, 240))
    ref, times, f0 = _ref_from_midi(melody)
    # 42 cents flat everywhere: past the 35c core but inside the 15c margin band.
    user_f0 = f0 * 2 ** (-42 / 1200.0)
    res = analysis.align_and_score(times, user_f0, ref)
    assert 30 < res["score"] < 70, f"42c-off take should get partial credit, got {res['score']}"
    print(f"ok margin_partial_credit score={res['score']}")


def test_speechy_contour_is_rejected():
    melody = 60 + 2 * np.sin(np.linspace(0, 5, 240))
    ref, times, f0 = _ref_from_midi(melody)
    speechy = np.array(f0, copy=True)
    voiced = np.zeros_like(speechy, dtype=bool)
    for start in range(0, len(voiced), 4):
        voiced[start:start + 2] = True
    speechy[~voiced] = np.nan
    try:
        analysis.align_and_score(times, speechy, ref)
    except ValueError as exc:
        assert "speech" in str(exc).lower() or "singing" in str(exc).lower()
        print("ok speechy_contour_rejected")
        return
    raise AssertionError("speech-like contour should not score as accurate singing")


if __name__ == "__main__":
    test_fold_cents()
    test_frame_credit()
    test_gate_confidence()
    test_octave_error_does_not_tank_score()
    test_margin_gives_partial_credit()
    test_speechy_contour_is_rejected()
    print("ALL PASS")
