"""End-to-end analysis for one take: reference -> detect -> align/score."""
from .reference import build_reference
from .detect import detect_pitch
from .score import align_and_score


def analyze(take_path, video_url):
    """Full analysis for one take. Returns the scoring result dict."""
    ref = build_reference(video_url)
    user_times, user_f0 = detect_pitch(take_path, isolate=True)
    return align_and_score(user_times, user_f0, ref)
