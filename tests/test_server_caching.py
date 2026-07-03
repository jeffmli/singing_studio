"""Static responses must send Cache-Control: no-cache so browsers revalidate
JS modules on every load — otherwise a deploy can mix old cached modules with
new HTML and silently break event bindings.

  .venv/bin/python tests/test_server_caching.py
"""
import os
import sys
import threading
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from functools import partial
from http.server import ThreadingHTTPServer

import server


def test_static_files_send_no_cache():
    handler = partial(server.Handler, directory=str(server.WEB_DIR))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        for path in ("/", "/js/main.js", "/styles/base.css"):
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}") as resp:
                cc = resp.headers.get("Cache-Control", "")
                assert "no-cache" in cc, f"{path}: Cache-Control={cc!r}"
        print("ok static files send no-cache")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    test_static_files_send_no_cache()
    print("ALL PASS")
