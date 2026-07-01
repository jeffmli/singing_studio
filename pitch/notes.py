"""Pitch <-> MIDI conversions."""


def _hz_to_midi(f0, np):
    out = np.full(len(f0), np.nan)
    mask = ~np.isnan(f0)
    out[mask] = 69 + 12 * np.log2(np.asarray(f0)[mask] / 440.0)
    return out
