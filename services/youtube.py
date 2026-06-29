"""YouTube discovery via yt-dlp: search slots and artist/title parsing."""
import json
import re
import subprocess

YT_TIMEOUT = 25

NOISE_WORDS = re.compile(
    r"(?i)\b(official|audio|video|lyrics?|lyric video|hd|hq|mv|m/v|"
    r"visualizer|visualiser|remaster(ed)?|explicit|full song|with lyrics)\b"
)
CHANNEL_NOISE = re.compile(r"(?i)\b(vevo|official|topic|music|records?|tv)\b")

# Search query templates per song slot (used by /api/search and /api/alt).
KIND_QUERY = {
    "original": "{q} official audio",
    "instrumental": "{q} instrumental karaoke",
    "lyricVideo": "{q} lyrics",
}


def yt_search_many(query, count=1):
    """Return up to `count` YouTube results for a query (list of dicts)."""
    try:
        proc = subprocess.run(
            ["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"ytsearch{count}:{query}"],
            capture_output=True,
            text=True,
            timeout=YT_TIMEOUT,
        )
        if proc.returncode != 0 or not proc.stdout:
            return []
        entries = (json.loads(proc.stdout) or {}).get("entries") or []
        results = []
        for entry in entries:
            vid = entry.get("id")
            if not vid:
                continue
            results.append({
                "id": vid,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "title": entry.get("title") or "",
                "channel": entry.get("channel") or entry.get("uploader") or "",
            })
        return results
    except Exception:
        return []


def yt_search(query):
    """Return the top YouTube result for a query, or None."""
    results = yt_search_many(query, 1)
    return results[0] if results else None


def do_alt(query, kind, exclude):
    """Return the next candidate video for a slot, skipping excluded ids."""
    template = KIND_QUERY.get(kind, "{q}")
    for result in yt_search_many(template.format(q=query), 8):
        if result["id"] not in exclude:
            return result
    return None


def split_artist_title(title, channel):
    """Best-effort guess of (artist, song) from a YouTube title + channel."""
    cleaned = re.sub(r"[\(\[].*?[\)\]]", "", title)
    cleaned = NOISE_WORDS.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -–—|")

    artist, song = "", cleaned
    for sep in (" - ", " – ", " — ", " | ", "|"):
        if sep in cleaned:
            left, right = cleaned.split(sep, 1)
            artist, song = left.strip(), right.strip()
            break

    if not artist:
        artist = CHANNEL_NOISE.sub("", channel).strip(" -–—|")
    return artist, song
