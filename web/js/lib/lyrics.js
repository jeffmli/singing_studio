// Pure LRC parsing / lookup for the live-guide lyric caption.

// Parse an LRC string into time-sorted {t, text} entries. Skips ID tags like
// [ti:..]/[ar:..], expands multi-timestamp lines ("[t1][t2]text"), and drops
// blank lines. Time is seconds (float).
export function parseLrc(lrc) {
  const out = [];
  const stampRe = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
  for (const raw of String(lrc || "").split(/\r?\n/)) {
    const stamps = [];
    let m;
    stampRe.lastIndex = 0;
    while ((m = stampRe.exec(raw))) stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
    if (!stamps.length) continue;                 // metadata tag or untimed line
    const text = raw.replace(stampRe, "").trim();
    if (!text) continue;
    for (const t of stamps) out.push({ t, text });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// Given sorted lines, find the line active at songTime and the one after it.
export function lyricLineAt(lines, songTime) {
  let current = null, next = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= songTime) current = lines[i];
    else { next = lines[i]; break; }
  }
  return { current, next };
}
