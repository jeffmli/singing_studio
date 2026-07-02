// test_recording.dom.mjs — jsdom component test for features/recording.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <button id="recordBtn"></button><button id="stopBtn" disabled></button>
  <select id="micSelect"></select>
  <div id="transportBar"><div id="meterBar"></div><span id="recTimer">● <span>0:00</span></span></div>
  <input id="takeNote"><p id="recordingStatus"></p>
  <button data-tempo="Slow" class="active"></button><button data-tempo="Medium"></button>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;

// Stub device enumeration (jsdom has no mediaDevices).
Object.defineProperty(dom.window.navigator, "mediaDevices", {
  value: {
    enumerateDevices: async () => [
      { kind: "audioinput", deviceId: "mic-a", label: "USB Mic" },
      { kind: "audioinput", deviceId: "mic-b", label: "Built-in Mic" },
      { kind: "videoinput", deviceId: "cam", label: "Camera" },
    ],
  },
  configurable: true,
});

const { createStore } = await import("./web/js/core/store.js");
const { initialState, reducers } = await import("./web/js/core/actions.js");
const { initRecording } = await import("./web/js/features/recording.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
const ctx = { getSetup: () => ({}), renderTakes: async () => {} };
initRecording(store, ctx);

await ctx.refreshMicList();
const options = [...document.querySelectorAll("#micSelect option")];
ok("mic list shows default + audio inputs only", options.length === 3);
ok("audio input labels listed", options.some((o) => o.textContent.includes("USB Mic")));

document.getElementById("micSelect").value = options[1].value;
document.getElementById("micSelect").dispatchEvent(new dom.window.Event("change"));
ok("mic change updates store", store.get().micDeviceId === options[1].value);
ok("mic change reports status", document.getElementById("recordingStatus").textContent.includes("Press Record"));

document.querySelector('[data-tempo="Medium"]').click();
ok("tempo pill updates store", store.get().takeTempo === "Medium");
ok("take note placeholder follows tempo", document.getElementById("takeNote").placeholder.includes("medium"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
