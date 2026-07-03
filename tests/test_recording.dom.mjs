// test_recording.dom.mjs — jsdom component test for features/recording.js
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

const fakeStream = {
  getTracks: () => [{ stop: () => {} }],
};

Object.defineProperty(dom.window.navigator, "mediaDevices", {
  value: {
    getUserMedia: async () => fakeStream,
    enumerateDevices: async () => [
      { kind: "audioinput", deviceId: "mic-a", label: "USB Mic" },
      { kind: "audioinput", deviceId: "mic-b", label: "Built-in Mic" },
      { kind: "videoinput", deviceId: "cam", label: "Camera" },
    ],
    addEventListener: () => {},
  },
  configurable: true,
});

class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = "inactive";
    this.ondataavailable = null;
    this.onstop = null;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }
  static isTypeSupported() {
    return true;
  }
}
globalThis.MediaRecorder = FakeMediaRecorder;
dom.window.MediaRecorder = FakeMediaRecorder;

class FakeAnalyser {
  constructor() {
    this.frequencyBinCount = 8;
  }
  getByteFrequencyData(data) {
    data.fill(0);
  }
}
class FakeSource {
  connect() {}
}
class FakeAudioContext {
  createMediaStreamSource() { return new FakeSource(); }
  createAnalyser() { return new FakeAnalyser(); }
  close() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAudioContext;
dom.window.AudioContext = FakeAudioContext;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const db = await import("../web/js/core/db.js");
const { initRecording } = await import("../web/js/features/recording.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
store.dispatch({ type: "setSession", payload: { id: "sess-1", startedAt: Date.now() } });
const ctx = {
  getSetup: () => ({ songTitle: "My Song", originalUrl: "https://youtu.be/aaaaaaaaaaa", phraseFocus: "verse 1" }),
  renderTakes: async () => {},
};
initRecording(store, ctx);

await ctx.refreshMicList();
const options = [...document.querySelectorAll("#micSelect option")];
ok("mic list shows default + audio inputs only", options.length === 3);
ok("audio input labels listed", options.some((o) => o.textContent.includes("USB Mic")));

document.getElementById("micSelect").value = options[1].value;
document.getElementById("micSelect").dispatchEvent(new dom.window.Event("change"));
ok("mic change updates store", store.get().micDeviceId === options[1].value);
ok("mic change reports status", document.getElementById("recordingStatus").textContent.includes("Press Record"));

document.getElementById("recordBtn").click();
for (let i = 0; i < 20 && document.getElementById("stopBtn").disabled; i++) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
ok("record starts", document.getElementById("recordBtn").disabled === true && document.getElementById("stopBtn").disabled === false);
document.getElementById("stopBtn").click();

const waitForTakes = async () => {
  for (let i = 0; i < 20; i++) {
    const takes = await db.readTakes();
    if (takes.length) return takes;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return [];
};

const takes = await waitForTakes();
ok("take saved after stop", takes.length === 1);
ok("saved take omits phrase focus", !("phraseFocus" in takes[0]));
ok("saved take omits take tempo", !("takeTempo" in takes[0]));
ok("saved take keeps title", takes[0].title === "My Song");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
