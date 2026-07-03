// web/js/lib/song-library.js
// Pure helpers for the recent-songs library. Storage wiring lives in
// features/setup.js; this module owns dedupe/cap/skip rules only.
const CAP = 20;
const PLACEHOLDER = "practice song";

const normTitle = (song) => String(song.songTitle || "").trim().toLowerCase();

export function hasSongContent(song) {
  const title = normTitle(song);
  const hasRealTitle = title && title !== PLACEHOLDER;
  return Boolean(hasRealTitle || song.originalUrl || song.instrumentalUrl || song.lyricVideoUrl);
}

export function upsertSong(list, song, now = Date.now()) {
  if (!hasSongContent(song)) return list;
  const key = normTitle(song);
  const kept = list.filter((entry) => normTitle(entry) !== key);
  return [{ ...song, savedAt: now }, ...kept].slice(0, CAP);
}
