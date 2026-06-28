/**
 * Unit tests for the LRC parsing / lookup used by the live-guide lyric caption.
 *
 * Extracts the real source (between __LYRIC_SYNC__ sentinels) from index.html
 * and runs it in Node. Run:  node test_lyrics.cjs
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const START = "// __LYRIC_SYNC_START__";
const END = "// __LYRIC_SYNC_END__";
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0) { console.error("Missing __LYRIC_SYNC__ sentinels in index.html"); process.exit(1); }
const src = html.slice(a + START.length, b);
// eslint-disable-next-line no-new-func
const { parseLrc, lyricLineAt } = new Function(src + "\n return { parseLrc, lyricLineAt };")();

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name); fail++; } }

const LRC = [
  "[ti:Someone Like You]",
  "[ar:Adele]",
  "[00:14.20]I heard that you're settled down",
  "[00:18.50]That you found a girl",
  "[00:23.00]and you're married now",
].join("\n");

const lines = parseLrc(LRC);
ok("parses 3 timed lines (skips metadata tags)", lines.length === 3);
ok("first line time = 14.2s", Math.abs(lines[0].t - 14.2) < 1e-6);
ok("first line text", lines[0].text === "I heard that you're settled down");
ok("sorted ascending", lines[0].t < lines[1].t && lines[1].t < lines[2].t);

// Out-of-order + multi-timestamp line ([t1][t2]text -> two entries).
const lines2 = parseLrc("[00:30.00]later\n[00:05.00]early\n[00:10.00][00:40.00]repeat");
ok("out-of-order gets sorted", lines2.map((l) => l.t).join(",") === "5,10,30,40");
ok("multi-timestamp expands to two entries", lines2.filter((l) => l.text === "repeat").length === 2);

// lyricLineAt windows.
ok("before first line -> no current, next is first", (() => {
  const r = lyricLineAt(lines, 0); return r.current == null && r.next && r.next.text.startsWith("I heard");
})());
ok("inside first line -> current is first, next is second", (() => {
  const r = lyricLineAt(lines, 16); return r.current.text.startsWith("I heard") && r.next.text === "That you found a girl";
})());
ok("exactly on a timestamp -> that line is current", (() => {
  const r = lyricLineAt(lines, 18.5); return r.current.text === "That you found a girl";
})());
ok("after last line -> current is last, next null", (() => {
  const r = lyricLineAt(lines, 999); return r.current.text === "and you're married now" && r.next == null;
})());

// Empty / malformed input is safe.
ok("empty string -> []", parseLrc("").length === 0);
ok("lyricLineAt on [] -> nulls", (() => { const r = lyricLineAt([], 10); return r.current == null && r.next == null; })());

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
