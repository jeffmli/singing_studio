// test_mic_autoselect.dom.mjs — jsdom test for the fifine auto-select behavior
// in features/recording.js. A plugged-in fifine should be picked automatically
// (so the dropdown reads "fifine Microphone"), unless the user chose a mic by
// hand, and it should fall back to Default when the fifine is unplugged.
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";

const dom = new JSDOM(`<!doctype html><html><body>
  <button id="recordBtn"></button><button id="stopBtn" disabled></button>
  <select id="micSelect"></select>
  <div id="transportBar"><div id="meterBar"></div><span id="recTimer">● <span>0:00</span></span></div>
  <input id="takeNote"><p id="recordingStatus"></p>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "crypto", { value: dom.window.crypto, configurable: true });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// Swappable device list so we can simulate the fifine being unplugged.
let deviceList = [
  { kind: "audioinput", deviceId: "fifine-1", label: "fifine Microphone" },
  { kind: "audioinput", deviceId: "builtin", label: "MacBook Pro Microphone" },
];
Object.defineProperty(dom.window.navigator, "mediaDevices", {
  value: {
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }),
    enumerateDevices: async () => deviceList,
    addEventListener: () => {},
  },
  configurable: true,
});

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initRecording } = await import("../web/js/features/recording.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
const ctx = { getSetup: () => ({ songTitle: "S" }), renderTakes: async () => {} };
initRecording(store, ctx);

// 1. fifine present + no prior choice -> auto-selected.
await ctx.refreshMicList();
ok("fifine auto-selected in store", store.get().micDeviceId === "fifine-1");
const sel = document.getElementById("micSelect");
const selectedOpt = [...sel.options].find((o) => o.selected);
ok("dropdown shows fifine as selected", selectedOpt && selectedOpt.textContent === "fifine Microphone");

// 2. Manual pick of another mic wins and isn't overridden on refresh.
sel.value = "builtin";
sel.dispatchEvent(new dom.window.Event("change"));
ok("manual pick updates store", store.get().micDeviceId === "builtin");
await ctx.refreshMicList();
ok("auto does not override a manual pick", store.get().micDeviceId === "builtin");

// 3. Fresh session (auto active again), fifine unplugged -> stays on Default.
const store2 = createStore(initialState, reducers);
localStorage.clear();
const ctx2 = { getSetup: () => ({}), renderTakes: async () => {} };
initRecording(store2, ctx2);
deviceList = [{ kind: "audioinput", deviceId: "builtin", label: "MacBook Pro Microphone" }];
await ctx2.refreshMicList();
ok("no fifine -> stays on Default", store2.get().micDeviceId === "");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
