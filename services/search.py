"""The /api/search use-case: find the three videos + lyrics for a song query."""
from concurrent.futures import ThreadPoolExecutor

from .youtube import split_artist_title, yt_search
from .lyrics import fetch_lyrics


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
