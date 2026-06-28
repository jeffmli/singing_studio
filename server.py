#!/usr/bin/env python3
"""Singing Practice Studio server.

Serves the static studio page AND a /api/search endpoint that finds the
right YouTube videos (original / instrumental / lyric video) via yt-dlp
and pulls lyrics from the free lyrics.ovh API. No API keys required.

Run:  python3 server.py   (serves http://localhost:4173)
"""

import json
import re
import subprocess
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


def yt_search(query):
    """Return the top YouTube result for a query, or None."""
    try:
        proc = subprocess.run(
            ["yt-dlp", "--flat-playlist", "-J", "--no-warnings", f"ytsearch1:{query}"],
            capture_output=True,
            text=True,
            timeout=YT_TIMEOUT,
        )
        if proc.returncode != 0 or not proc.stdout:
            return None
        entries = (json.loads(proc.stdout) or {}).get("entries") or []
        if not entries:
            return None
        entry = entries[0]
        vid = entry.get("id")
        if not vid:
            return None
        return {
            "id": vid,
            "url": f"https://www.youtube.com/watch?v={vid}",
            "title": entry.get("title") or "",
            "channel": entry.get("channel") or entry.get("uploader") or "",
        }
    except Exception:
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


def _lrclib_get(artist, song):
    try:
        url = "https://lrclib.net/api/get?" + urllib.parse.urlencode(
            {"artist_name": artist, "track_name": song}
        )
        return (_get_json(url).get("plainLyrics") or "").strip()
    except Exception:
        return ""


def _lrclib_search(query):
    try:
        url = "https://lrclib.net/api/search?" + urllib.parse.urlencode({"q": query})
        for item in _get_json(url) or []:
            if item.get("plainLyrics"):
                return item["plainLyrics"].strip()
    except Exception:
        pass
    return ""


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
    """Best-effort lyrics: lrclib (exact, then search), then lyrics.ovh."""
    text = ""
    if artist and song:
        text = _lrclib_get(artist, song)
    if not text:
        text = _lrclib_search(f"{artist} {song}".strip() or query)
    if not text and artist and song:
        text = _lyrics_ovh(artist, song)
    return _clean_lyrics(text)


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
    title = query
    if original:
        artist, song = split_artist_title(original["title"], original.get("channel", ""))
        lyrics = fetch_lyrics(artist, song, query)
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
        return super().do_GET()

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
