#!/usr/bin/env python3
"""Singing Practice Studio server — routing + static serving only.

Endpoints:
  GET  /api/search?q=...                 find videos + lyrics  (services.search)
  GET  /api/alt?q=...&kind=...&exclude=  next candidate video  (services.youtube)
  GET  /api/reference?videoUrl=...       build reference melody (pitch model)
  POST /api/analyze?videoUrl=...         score an uploaded take (pitch model)
Everything else is served as a static file.

Run:  python3 server.py   (serves http://localhost:4173)
"""

import json
import os
import tempfile
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from services.search import do_search
from services.youtube import KIND_QUERY, do_alt

CANVAS_DIR = Path(__file__).resolve().parent
WEB_DIR = CANVAS_DIR / "web"          # static UI layer (markup + css + js modules)
HOST = "127.0.0.1"
PORT = 4173

ANALYSIS_UNAVAILABLE = "Pitch analysis isn't installed. Run setup.sh to enable it."


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            return self._handle_search(parsed)
        if parsed.path == "/api/alt":
            return self._handle_alt(parsed)
        if parsed.path == "/api/reference":
            return self._handle_reference(parsed)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/analyze":
            return self._handle_analyze(parsed)
        return self._json({"error": "not found"}, 404)

    # ---- route handlers ----
    def _handle_search(self, parsed):
        query = self._param(parsed, "q")
        if not query:
            return self._json({"error": "missing q"}, 400)
        try:
            return self._json(do_search(query))
        except Exception as exc:  # noqa: BLE001
            return self._json({"error": str(exc)}, 500)

    def _handle_alt(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        query = self._param(parsed, "q")
        kind = self._param(parsed, "kind")
        exclude = set(filter(None, (params.get("exclude") or [""])[0].split(",")))
        if not query or kind not in KIND_QUERY:
            return self._json({"error": "missing or invalid q/kind"}, 400)
        try:
            return self._json({"result": do_alt(query, kind, exclude)})
        except Exception as exc:  # noqa: BLE001
            return self._json({"error": str(exc)}, 500)

    def _handle_reference(self, parsed):
        video_url = self._param(parsed, "videoUrl")
        if not video_url:
            return self._json({"error": "missing videoUrl"}, 400)
        analysis = self._load_model()
        if analysis is None:
            return self._json({"error": ANALYSIS_UNAVAILABLE}, 503)
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

    def _handle_analyze(self, parsed):
        video_url = self._param(parsed, "videoUrl")
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if not body:
            return self._json({"error": "No audio was uploaded."}, 400)
        analysis = self._load_model()
        if analysis is None:
            return self._json({"error": ANALYSIS_UNAVAILABLE}, 503)
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

    # ---- helpers ----
    @staticmethod
    def _param(parsed, name):
        return (urllib.parse.parse_qs(parsed.query).get(name) or [""])[0].strip()

    @staticmethod
    def _load_model():
        """Import the pitch model lazily; None if its heavy deps aren't installed."""
        try:
            import pitch
            return pitch
        except Exception:
            return None

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
    handler = partial(Handler, directory=str(WEB_DIR))
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"Singing Studio running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
