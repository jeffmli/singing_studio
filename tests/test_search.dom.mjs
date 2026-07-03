// test_search.dom.mjs — jsdom component test for features/search.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <input id="songSearch"><button id="searchBtn"></button><p id="searchStatus"></p>
  <div class="field"><input id="songTitle"></div>
  <div class="field"><input id="originalUrl"></div>
  <div class="field"><input id="instrumentalUrl"></div>
  <div class="field"><input id="lyricVideoUrl"></div>
  <div class="field"><textarea id="lyricsInput"></textarea></div>
  <input id="syncedLyricsData" type="hidden">
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;

const { initSearch } = await import("../web/js/features/search.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

let manualOpened = null, saved = null;
const ctx = {
  setManualOpen: (v) => { manualOpened = v; },
  saveSetup: (opts) => { saved = opts; },
};

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    title: "Test Artist – Test Song",
    original: { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
    instrumental: null,
    lyricVideo: { url: "https://www.youtube.com/watch?v=ccccccccccc" },
    lyrics: "la la la",
    syncedLyrics: "[00:01.00]la la la",
  }),
});

initSearch(null, ctx);

document.getElementById("songSearch").value = "test song";
document.getElementById("searchBtn").click();
await new Promise((r) => setTimeout(r, 0));

ok("title filled", document.getElementById("songTitle").value === "Test Artist – Test Song");
ok("original url filled", document.getElementById("originalUrl").value.includes("aaaaaaaaaaa"));
ok("synced lyrics stored", document.getElementById("syncedLyricsData").value.includes("[00:01.00]"));
ok("status mentions missing instrumental", document.getElementById("searchStatus").textContent.includes("instrumental"));
ok("manual section revealed", manualOpened === true);
ok("setup saved silently", saved && saved.silent === true);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
