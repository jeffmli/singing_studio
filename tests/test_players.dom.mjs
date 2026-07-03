// test_players.dom.mjs — jsdom component test for features/players.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="warmupPlaceholder" class="hidden"></div>
  <div id="songPlaceholder" class="hidden"><div></div></div>
  <div id="warmupFrame"></div>
  <div id="songFrame"></div>
  <div id="videoPane"></div>
  <div id="lyricsPane"></div>
  <h2 id="songHeading"></h2>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initPlayers } = await import("../web/js/features/players.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
let guideMsg = "";
const ctx = {
  getSetup: () => ({ songTitle: "Test Song", lyrics: "Line 1", originalUrl: "", instrumentalUrl: "", lyricVideoUrl: "" }),
  saveSetup: () => {},
  setGuideStatus: (m) => { guideMsg = m; },
  renderLyricOverlay: () => {},
};
initPlayers(store, ctx);
ctx.renderSong();

ok("songPlayerTime is null with no player", ctx.songPlayerTime() === null);
ok("test hook exposed", typeof dom.window.__studioTest.forceSongError === "function");
ok("song tab renders heading", document.getElementById("songHeading").textContent === "Test Song");
ok("lyrics pane renders setup lyrics", document.getElementById("lyricsPane").textContent === "Line 1");
ok("no custom rate controls required", document.querySelectorAll("[data-rate]").length === 0);
ok("no pace status is emitted", guideMsg === "");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
