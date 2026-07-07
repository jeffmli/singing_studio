// test_search.dom.mjs — jsdom component test for features/search.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <input id="songSearch"><button id="searchBtn"></button><p id="searchStatus"></p>
  <button id="changeSongInSession"></button>
  <div id="singSongPicker" class="hidden">
    <input id="singSongSearch"><button id="singSongSearchBtn"></button><button id="singSongPickerClose"></button>
    <p id="singSongSearchStatus"></p>
  </div>
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

let manualOpened = null, saved = null, librarySaves = 0, clearedRecentSelection = 0;
const dispatched = [];
const ctx = {
  setManualOpen: (v) => { manualOpened = v; },
  saveSetup: (opts) => { saved = opts; },
  saveSetupToLibrary: () => { librarySaves++; saved = { library: true }; },
  clearRecentSongSelection: () => { clearedRecentSelection++; },
  showToast: () => {},
};
const store = { dispatch: (action) => dispatched.push(action) };

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

initSearch(store, ctx);

document.getElementById("songSearch").value = "test song";
document.getElementById("searchBtn").click();
await new Promise((r) => setTimeout(r, 0));

ok("title filled", document.getElementById("songTitle").value === "Test Artist – Test Song");
ok("original url filled", document.getElementById("originalUrl").value.includes("aaaaaaaaaaa"));
ok("synced lyrics stored", document.getElementById("syncedLyricsData").value.includes("[00:01.00]"));
ok("status mentions missing instrumental", document.getElementById("searchStatus").textContent.includes("instrumental"));
ok("manual section revealed", manualOpened === true);
ok("setup saved silently", saved && saved.silent === true);
ok("successful search clears highlighted recent song", clearedRecentSelection === 1);

document.getElementById("changeSongInSession").click();
ok("sing change song opens inline picker", !document.getElementById("singSongPicker").classList.contains("hidden"));
document.getElementById("singSongSearch").value = "next song";
document.getElementById("singSongSearchBtn").click();
await new Promise((r) => setTimeout(r, 0));

ok("sing inline search fills title", document.getElementById("songTitle").value === "Test Artist – Test Song");
ok("sing inline search saves to library", librarySaves === 1);
ok("sing inline search switches to original tab", dispatched.some((action) => action.type === "setActiveTab" && action.payload === "original"));
ok("sing inline search closes picker", document.getElementById("singSongPicker").classList.contains("hidden"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
