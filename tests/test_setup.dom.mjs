// test_setup.dom.mjs — jsdom component test for features/setup.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <nav>
    <button class="step" id="stepHome" data-step="home"></button>
    <button class="step" id="stepSetup" data-step="setup"></button>
    <button class="step" id="stepWarmups" data-step="warmups"></button>
    <button class="step" id="stepSong" data-step="song"></button>
  </nav>
  <section id="stageHome"></section>
  <section id="stageSetup"></section>
  <section id="stageWarmups"></section>
  <section id="stageSong"></section>
  <input id="songTitle"><textarea id="warmupLinks"></textarea>
  <input id="originalUrl"><input id="instrumentalUrl"><input id="lyricVideoUrl">
  <textarea id="lyricsInput"></textarea><input id="syncedLyricsData" type="hidden">
  <input id="phraseFocus">
  <div id="manualSetup"></div><button id="manualToggle"></button>
  <section id="recentSongs" hidden><div id="recentSongList"></div></section>
  <button id="startSession"></button><button id="editSetup"></button>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initSetup, parseYouTubeId } = await import("../web/js/features/setup.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
let newSessionCalls = 0;
const ctx = {
  startNewSession: () => { newSessionCalls++; },
  renderTakes: () => {},
};
initSetup(store, ctx);

ok("home stage active on load", document.getElementById("stageHome").classList.contains("active"));
ok("home step is current", document.getElementById("stepHome").classList.contains("current"));
ok("loadSetup seeds fallback title", document.getElementById("songTitle").value === "Practice Song");
ok("recent songs hidden when library empty", document.getElementById("recentSongs").hidden);

document.getElementById("songTitle").value = "My Test Song";
document.getElementById("originalUrl").value = "https://youtu.be/aaaaaaaaaaa";
document.getElementById("startSession").click();
ok("start session dispatches step=warmups", store.get().step === "warmups");
ok("start session starts a new session", newSessionCalls === 1);
ok("stage class follows step", document.getElementById("stageWarmups").classList.contains("active"));
const saved = JSON.parse(localStorage.getItem("singing-practice-setup-v1"));
ok("start persists setup to localStorage", saved.songTitle === "My Test Song");
const lib = JSON.parse(localStorage.getItem("singing-song-library-v1") || "[]");
ok("start upserts song library", lib.length === 1 && lib[0].songTitle === "My Test Song");
ok("library snapshot excludes phraseFocus", !("phraseFocus" in lib[0]));

// recent songs render + click-to-fill
ok("recent songs section visible after start", !document.getElementById("recentSongs").hidden);
document.getElementById("songTitle").value = "";
document.getElementById("originalUrl").value = "";
document.querySelector("#recentSongList .recent-song").click();
ok("clicking recent song fills title", document.getElementById("songTitle").value === "My Test Song");
ok("clicking recent song fills original url", document.getElementById("originalUrl").value === "https://youtu.be/aaaaaaaaaaa");

document.getElementById("editSetup").click();
ok("edit setup returns to setup step", store.get().step === "setup");

document.getElementById("stepHome").click();
ok("home stepper returns home", store.get().step === "home");

ok("parseYouTubeId handles watch urls", parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "dQw4w9WgXcQ");
ok("parseYouTubeId handles youtu.be", parseYouTubeId("https://youtu.be/dQw4w9WgXcQ") === "dQw4w9WgXcQ");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
