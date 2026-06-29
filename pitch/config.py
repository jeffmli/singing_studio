"""Tunable constants for the pitch model — the single place to adjust scoring."""
import os

ANALYSIS_SR = 22050
FMIN_NOTE = "C2"
FMAX_NOTE = "C6"

IN_TUNE_CENTS = 35           # within this many cents = full credit ("in tune")
TOLERANCE_MARGIN_CENTS = 15  # soft band past the core: partial credit, not zero
CONF_THRESHOLD = 0.5         # drop pyin frames below this voiced probability
MIN_SINGING_CONFIDENCE = 0.28  # reject speechy / staccato input that is not really singing
MIN_SUSTAINED_RUN_SEC = 0.12

CACHE_DIR = os.path.expanduser("~/Library/Application Support/Singing Studio/refcache")
