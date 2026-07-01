"""Lyrics fetching: lrclib (plain + synced LRC), falling back to lyrics.ovh."""
import json
import re
import urllib.parse
import urllib.request

LYRICS_TIMEOUT = 10

TIMESTAMP_TAG = re.compile(r"\[\d{1,2}:\d{2}(?:\.\d+)?\]\s*")


def _get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "singing-studio/1.0"})
    with urllib.request.urlopen(req, timeout=LYRICS_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _extract_lrclib(item):
    """Pull (plain, synced) out of an lrclib item, each stripped. synced keeps
    its [mm:ss.xx] tags — they're what powers the timed lyric caption."""
    item = item or {}
    return ((item.get("plainLyrics") or "").strip(),
            (item.get("syncedLyrics") or "").strip())


def _lrclib_get(artist, song):
    try:
        url = "https://lrclib.net/api/get?" + urllib.parse.urlencode(
            {"artist_name": artist, "track_name": song}
        )
        plain, synced = _extract_lrclib(_get_json(url))
        return {"plain": plain, "synced": synced}
    except Exception:
        return {"plain": "", "synced": ""}


def _lrclib_search(query):
    try:
        url = "https://lrclib.net/api/search?" + urllib.parse.urlencode({"q": query})
        for item in _get_json(url) or []:
            if item.get("plainLyrics"):
                plain, synced = _extract_lrclib(item)
                return {"plain": plain, "synced": synced}
    except Exception:
        pass
    return {"plain": "", "synced": ""}


def _lyrics_ovh(artist, song):
    try:
        url = (
            "https://api.lyrics.ovh/v1/"
            + urllib.parse.quote(artist)
            + "/"
            + urllib.parse.quote(song)
        )
        return (_get_json(url).get("lyrics") or "").strip()
    except Exception:
        return ""


def _clean_lyrics(text):
    if not text:
        return ""
    text = TIMESTAMP_TAG.sub("", text)          # strip [mm:ss.xx] tags
    text = re.sub(r"\n{3,}", "\n\n", text)        # collapse extra blank lines
    return text.strip()


def fetch_lyrics(artist, song, query):
    """Best-effort lyrics: lrclib (exact, then search), then lyrics.ovh.

    Returns (plain, synced): plain is cleaned of timestamp tags for display;
    synced is the raw LRC (with [mm:ss.xx] tags) for the live caption, or ""
    when the source has none (e.g. the lyrics.ovh fallback)."""
    res = {"plain": "", "synced": ""}
    if artist and song:
        res = _lrclib_get(artist, song)
    if not res["plain"]:
        res = _lrclib_search(f"{artist} {song}".strip() or query)
    if not res["plain"] and artist and song:
        res = {"plain": _lyrics_ovh(artist, song), "synced": ""}
    return _clean_lyrics(res["plain"]), res["synced"]
