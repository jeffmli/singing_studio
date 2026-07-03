// tests/test_song-library.mjs
import { upsertSong, hasSongContent } from "../web/js/lib/song-library.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const song = (title, extra = {}) => ({
  songTitle: title, originalUrl: "", instrumentalUrl: "", lyricVideoUrl: "",
  lyrics: "", syncedLyrics: "", warmups: [], ...extra,
});

// hasSongContent
ok("empty song has no content", !hasSongContent(song("")));
ok("placeholder title has no content", !hasSongContent(song("Practice Song")));
ok("real title counts", hasSongContent(song("Hello")));
ok("url without title counts", hasSongContent(song("", { originalUrl: "https://youtu.be/x" })));

// upsertSong basics
const l1 = upsertSong([], song("Hello", { originalUrl: "https://youtu.be/a" }), 1000);
ok("adds new song first", l1.length === 1 && l1[0].songTitle === "Hello");
ok("stamps savedAt", l1[0].savedAt === 1000);

// dedupe by normalized title, newest wins
const l2 = upsertSong(l1, song("  hello ", { originalUrl: "https://youtu.be/b" }), 2000);
ok("dedupes case-insensitive trimmed title", l2.length === 1);
ok("newest snapshot wins", l2[0].originalUrl === "https://youtu.be/b" && l2[0].savedAt === 2000);

// most-recent-first ordering
const l3 = upsertSong(l2, song("Another"), 3000);
ok("newest song goes first", l3[0].songTitle === "Another" && l3[1].songTitle.trim().toLowerCase() === "hello");

// skip empty
const l4 = upsertSong(l3, song("Practice Song"), 4000);
ok("skips placeholder song, same reference", l4 === l3);

// immutability
ok("does not mutate input list", l1.length === 1 && l1[0].originalUrl === "https://youtu.be/a");

// cap at 20
let big = [];
for (let i = 0; i < 25; i++) big = upsertSong(big, song("Song " + i), i);
ok("caps at 20", big.length === 20);
ok("cap keeps newest", big[0].songTitle === "Song 24" && big[19].songTitle === "Song 5");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
