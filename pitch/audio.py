"""Audio I/O and vocal isolation. Heavy deps are imported lazily."""
import os
import subprocess
import tempfile

from .config import ANALYSIS_SR


def _load_mono(path, sr=ANALYSIS_SR):
    import librosa
    y, _ = librosa.load(path, sr=sr, mono=True)
    return y


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
