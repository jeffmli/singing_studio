#!/usr/bin/env python3
"""Singing Practice Studio server.

Serves the static studio page AND a /api/search endpoint that finds the
right YouTube videos (original / instrumental / lyric video) via yt-dlp
and pulls lyrics from the free lyrics.ovh API. No API keys required.

Run:  python3 server.py   (serves http://localhost:4173)
"""

import json
import os
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CANVAS_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 4173
YT_TIMEOUT = 25
LYRICS_TIMEOUT = 10

NOISE_WORDS = re.compile(
    r"(?i)\b(official|audio|video|lyrics?|lyric video|hd|hq|mv|m/v|"
    r"visualizer|visualiser|remaster(ed)?|explicit|full song|with lyrics)\b"
)
CHANNEL_NOISE = re.compile(r"(?i)\b(vevo|official|topic|music|records?|tv)\b")


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


# Search query templates per song slot (used by /api/search and /api/alt).
KIND_QUERY = {
    "original": "{q} official audio",
    "instrumental": "{q} instrumental karaoke",
    "lyricVideo": "{q} lyrics",
}


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


TIMESTAMP_TAG = re.compile(r"\[\d{1,2}:\d{2}(?:\.\d+)?\]\s*")


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


def do_search(query):
    """Run the three YouTube searches in parallel, then fetch lyrics."""
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_original = pool.submit(yt_search, f"{query} official audio")
        f_instrumental = pool.submit(yt_search, f"{query} instrumental karaoke")
        f_lyric_video = pool.submit(yt_search, f"{query} lyrics")
        original = f_original.result()
        instrumental = f_instrumental.result()
        lyric_video = f_lyric_video.result()

    lyrics = ""
    synced_lyrics = ""
    title = query
    if original:
        artist, song = split_artist_title(original["title"], original.get("channel", ""))
        lyrics, synced_lyrics = fetch_lyrics(artist, song, query)
        if artist and song:
            title = f"{artist} – {song}"
        elif song:
            title = song

    return {
        "query": query,
        "title": title,
        "original": original,
        "instrumental": instrumental,
        "lyricVideo": lyric_video,
        "lyrics": lyrics,
        "syncedLyrics": synced_lyrics,
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            params = urllib.parse.parse_qs(parsed.query)
            query = (params.get("q") or [""])[0].strip()
            if not query:
                return self._json({"error": "missing q"}, 400)
            try:
                return self._json(do_search(query))
            except Exception as exc:  # noqa: BLE001
                return self._json({"error": str(exc)}, 500)
        if parsed.path == "/api/alt":
            params = urllib.parse.parse_qs(parsed.query)
            query = (params.get("q") or [""])[0].strip()
            kind = (params.get("kind") or [""])[0].strip()
            exclude = set(filter(None, (params.get("exclude") or [""])[0].split(",")))
            if not query or kind not in KIND_QUERY:
                return self._json({"error": "missing or invalid q/kind"}, 400)
            try:
                return self._json({"result": do_alt(query, kind, exclude)})
            except Exception as exc:  # noqa: BLE001
                return self._json({"error": str(exc)}, 500)
        if parsed.path == "/api/reference":
            params = urllib.parse.parse_qs(parsed.query)
            video_url = (params.get("videoUrl") or [""])[0].strip()
            if not video_url:
                return self._json({"error": "missing videoUrl"}, 400)
            try:
                import analysis  # lazy: heavy deps only load on demand
            except Exception:
                return self._json(
                    {"error": "Pitch analysis isn't installed. Run setup.sh to enable it."}, 503
                )
            try:
                ref = analysis.build_reference(video_url)
                return self._json({
                    "videoId": ref.get("videoId"),
                    "times": ref.get("times") or [],
                    "midi": ref.get("midi") or [],
                })
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            except Exception as exc:  # noqa: BLE001
                return self._json({"error": f"Reference failed: {exc}"}, 500)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/analyze":
            params = urllib.parse.parse_qs(parsed.query)
            video_url = (params.get("videoUrl") or [""])[0].strip()
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""
            if not body:
                return self._json({"error": "No audio was uploaded."}, 400)
            try:
                import analysis  # lazy: heavy deps only load on demand
            except Exception:
                return self._json(
                    {"error": "Pitch analysis isn't installed. Run setup.sh to enable it."}, 503
                )
            take_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as fh:
                    fh.write(body)
                    take_path = fh.name
                return self._json(analysis.analyze(take_path, video_url))
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            except Exception as exc:  # noqa: BLE001
                return self._json({"error": f"Analysis failed: {exc}"}, 500)
            finally:
                if take_path and os.path.exists(take_path):
                    os.remove(take_path)
        return self._json({"error": "not found"}, 404)

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # keep the console quiet


def main():
    handler = partial(Handler, directory=str(CANVAS_DIR))
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Singing Studio running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
