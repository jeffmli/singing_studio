// test_live-guide.dom.mjs — jsdom component test for features/live-guide.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <button id="prepareGuide"></button><button id="refreshGuide" disabled></button>
  <button id="startGuide" disabled></button><button id="stopGuide" disabled></button>
  <p id="guideStatus"></p><span id="pitchFeedback"></span>
  <span id="targetNote"></span><span id="userNote"></span><span id="pitchDelta"></span>
  <canvas id="livePitchChart"></canvas>
  <div id="liveLyricLine"><span class="cur"></span><span class="nxt"></span></div>
  <textarea id="lyricsInput">la la la</textarea>
  <input id="syncedLyricsData" type="hidden">
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initLiveGuide } = await import("../web/js/features/live-guide.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
const ctx = { getSetup: () => ({ originalUrl: "" }), songPlayerTime: () => null };
initLiveGuide(store, ctx);

document.getElementById("syncedLyricsData").value = "[00:01.00]first line\n[00:05.00]second line";
ctx.updateLiveLyric(2.0);
ok("current lyric line shown", document.querySelector("#liveLyricLine .cur").textContent === "first line");
ok("next lyric line dimmed slot", document.querySelector("#liveLyricLine .nxt").textContent === "second line");

ctx.updateLiveLyric(6.0);
ok("caption advances with time", document.querySelector("#liveLyricLine .cur").textContent === "second line");

document.getElementById("syncedLyricsData").value = "";
ctx.updateLiveLyric(2.0);
ok("no synced lyrics message", document.querySelector("#liveLyricLine .cur").textContent.includes("No synced lyrics"));

store.dispatch({ type: "setStep", payload: "song" });
ok("overlay render is a no-op without markup", typeof ctx.renderLyricOverlay === "function");
ctx.renderLyricOverlay();
ok("renderLyricOverlay does not require overlay DOM", true);

await document.getElementById("prepareGuide").click();
ok("prepare without url reports guidance", document.getElementById("guideStatus").textContent.includes("Original song YouTube link"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
