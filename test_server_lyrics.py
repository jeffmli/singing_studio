"""Tests for synced-lyric surfacing in services.lyrics (no network).

  .venv/bin/python test_server_lyrics.py
"""
import services.lyrics as lyrics


def test_extract_lrclib_item():
    plain, synced = lyrics._extract_lrclib(
        {"plainLyrics": "  line one\nline two  ", "syncedLyrics": "[00:01.00]line one"}
    )
    assert plain == "line one\nline two", plain
    assert synced == "[00:01.00]line one", synced
    # Missing fields are safe.
    assert lyrics._extract_lrclib({}) == ("", "")
    print("ok _extract_lrclib")


def test_fetch_lyrics_returns_plain_and_synced(monkeypatch):
    monkeypatch(lyrics, "_lrclib_get", lambda a, s: {
        "plain": "I heard that you're settled down",
        "synced": "[00:14.20]I heard that you're settled down",
    })
    plain, synced = lyrics.fetch_lyrics("Adele", "Someone Like You", "adele someone like you")
    # Plain is cleaned (no timestamp tags); synced keeps its [mm:ss.xx] tags.
    assert plain == "I heard that you're settled down", plain
    assert synced == "[00:14.20]I heard that you're settled down", synced
    print("ok fetch_lyrics plain+synced")


def test_fetch_lyrics_synced_empty_when_only_ovh(monkeypatch):
    monkeypatch(lyrics, "_lrclib_get", lambda a, s: {"plain": "", "synced": ""})
    monkeypatch(lyrics, "_lrclib_search", lambda q: {"plain": "", "synced": ""})
    monkeypatch(lyrics, "_lyrics_ovh", lambda a, s: "from ovh\nsecond line")
    plain, synced = lyrics.fetch_lyrics("X", "Y", "x y")
    assert plain == "from ovh\nsecond line", plain
    assert synced == "", repr(synced)
    print("ok fetch_lyrics ovh fallback has no synced")


class _Patcher:
    """Minimal monkeypatch: restores originals at the end."""
    def __init__(self):
        self._undo = []

    def __call__(self, obj, name, value):
        self._undo.append((obj, name, getattr(obj, name)))
        setattr(obj, name, value)

    def restore(self):
        for obj, name, val in reversed(self._undo):
            setattr(obj, name, val)


if __name__ == "__main__":
    test_extract_lrclib_item()
    for fn in (test_fetch_lyrics_returns_plain_and_synced, test_fetch_lyrics_synced_empty_when_only_ovh):
        p = _Patcher()
        try:
            fn(p)
        finally:
            p.restore()
    print("ALL PASS")
