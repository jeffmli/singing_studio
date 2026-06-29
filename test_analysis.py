"""Pipeline test for analysis.py — pitch detection + cents scoring.

Runs on a local vocal file (no network / Demucs), asserting:
  - pitch detection finds a reasonable amount of voiced singing,
  - an identical take scores ~perfect,
  - a +50-cent detuned take scores clearly worse.

Run under the analysis venv:  .venv/bin/python test_analysis.py [vocals.wav]
"""
import sys
import numpy as np
import pitch as analysis

VOCALS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/spike/vocals.wav"


def main():
    times, f0 = analysis.detect_pitch(VOCALS)
    voiced = float(np.mean(~np.isnan(f0)))
    print(f"voiced frames: {voiced*100:.0f}%")
    assert voiced > 0.5, "expected mostly-voiced vocal stem"

    midi = analysis._hz_to_midi(f0, np)
    ref = {
        "videoId": "test",
        "times": [float(t) for t in times],
        "f0": [None if np.isnan(v) else float(v) for v in f0],
        "midi": [None if np.isnan(v) else float(v) for v in midi],
    }

    same = analysis.align_and_score(times, f0, ref)
    print(f"identical take score: {same['score']}%  (median {same['medianCents']}c)")
    assert same["score"] >= 90, "identical take should score very high"

    sharp_f0 = f0 * (2 ** (60 / 1200.0))  # 60c sharp — past the ±35c threshold
    sharp = analysis.align_and_score(times, sharp_f0, ref)
    print(f"+60c sharp take score: {sharp['score']}%  ({sharp['tendency']})")
    assert sharp["score"] < 30, "a clearly-detuned take should score low"
    assert "sharp" in sharp["tendency"], "should detect a sharp tendency"

    print("PASS ✓")


def test_play_original_scores_high():
    """Playing the original mix back should score high: the take is vocal-isolated
    (isolate=True) so it's compared in the same domain as the vocal-stem reference.

    Skipped unless the spike's vocal stem + matching full mix are present, since it
    needs Demucs. STEM must be the separated vocals of MIX.
    """
    import os
    STEM = "/tmp/spike/vocals.wav"
    MIX = os.path.join(os.path.dirname(__file__), "..", "pitch-spike", "clip.wav")
    if not (os.path.exists(STEM) and os.path.exists(MIX)):
        print("skip play_original (audio fixtures missing)")
        return

    rt, rf = analysis.detect_pitch(STEM)
    ref = {
        "videoId": "fixture",
        "times": [float(t) for t in rt],
        "f0": [None if np.isnan(v) else float(v) for v in rf],
        "midi": [None if np.isnan(v) else float(v) for v in analysis._hz_to_midi(rf, np)],
    }
    ut, uf = analysis.detect_pitch(MIX, isolate=True)  # Demucs the mix take
    res = analysis.align_and_score(ut, uf, ref)
    print(f"play-original score: {res['score']}%  (median {res['medianCents']}c)")
    assert res["score"] >= 80, "playing the original should score high"


if __name__ == "__main__":
    main()
    test_play_original_scores_high()
