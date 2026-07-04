// test_piano.dom.mjs — jsdom component test for features/piano.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="pianoKeys"></div>
  <b id="pianoActiveNote">--</b>
  <p id="pianoStatus"></p>
  <button id="pianoStartMatch"></button>
  <button id="pianoStopMatch" disabled></button>
  <b id="pianoTargetNote">--</b>
  <b id="pianoUserNote">--</b>
  <b id="pianoPitchDelta">--</b>
  <b id="pianoFeedback">Pick note</b>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const createdOscillators = [];
const gainTargets = [];
const stoppedOscillators = [];

class FakeOscillator {
  constructor() {
    this.frequency = { value: 0 };
    this.detune = { value: 0 };
    this.type = "";
    createdOscillators.push(this);
  }
  connect() {}
  start() {}
  stop(when) { stoppedOscillators.push({ oscillator: this, when }); }
}
class FakeGain {
  constructor() {
    this.gain = {
      value: 0,
      setValueAtTime: (value) => { gainTargets.push(value); },
      linearRampToValueAtTime: (value) => { gainTargets.push(value); },
      exponentialRampToValueAtTime: (value) => { gainTargets.push(value); },
      cancelScheduledValues: () => {},
    };
  }
  connect() {}
}
class FakeFilter {
  constructor() {
    this.type = "";
    this.frequency = { value: 0 };
    this.Q = { value: 0 };
  }
  connect() {}
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() { return new FakeOscillator(); }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDynamicsCompressor() { return { connect: () => {} }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAudioContext;
dom.window.AudioContext = FakeAudioContext;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initPiano, pianoNoteName, classifyPitchMatch } = await import("../web/js/features/piano.js");
const { midiToHz } = await import("../web/js/lib/pitch.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
const ctx = {
  openMic: async () => ({ getTracks: () => [{ stop: () => {} }] }),
  refreshMicList: async () => {},
};
initPiano(store, ctx);

ok("keyboard renders C2 through C6", document.querySelectorAll("#pianoKeys [data-midi]").length === 49);
ok("first key is C2", document.querySelector("#pianoKeys [data-midi]").textContent.includes("C2"));
ok("last key is C6", [...document.querySelectorAll("#pianoKeys [data-midi]")].at(-1).textContent.includes("C6"));
ok("black keys are marked", document.querySelectorAll("#pianoKeys .black").length > 0);

const c4Key = document.querySelector('#pianoKeys [data-midi="60"]');
c4Key.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 0));
ok("pressing C4 updates active note", document.getElementById("pianoActiveNote").textContent === "C4");
ok("pressing C4 updates target note", document.getElementById("pianoTargetNote").textContent === "C4");
ok("piano note uses layered oscillators", createdOscillators.length >= 3);
ok("piano note is louder than old tone", Math.max(...gainTargets) >= 0.28);
ok("holding C4 keeps note running", stoppedOscillators.length === 0);
c4Key.dispatchEvent(new dom.window.Event("pointerup", { bubbles: true }));
ok("releasing C4 stops held note", stoppedOscillators.length >= 3);

ok("midiToHz maps A4", Math.round(midiToHz(69)) === 440);
ok("note name maps black key", pianoNoteName(61) === "C#4");
ok("match no pitch asks user to sing", classifyPitchMatch(60, null).feedback === "Sing");
ok("match on target", classifyPitchMatch(60, 60.2).feedback === "On");
ok("match sharp", classifyPitchMatch(60, 61).feedback === "Sharp");
ok("match flat", classifyPitchMatch(60, 59).feedback === "Flat");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
