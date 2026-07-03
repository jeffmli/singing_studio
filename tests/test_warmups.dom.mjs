// test_warmups.dom.mjs — jsdom component test for features/warmups.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="warmupDots"></div><p id="warmupStatus"></p>
  <button id="prevWarmup"></button><button id="nextWarmup"></button><button id="finishWarmups"></button>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const { initWarmups } = await import("../web/js/features/warmups.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
const shown = [];
const ctx = {
  getSetup: () => ({ warmups: ["u1", "u2", "u3"] }),
  showWarmupVideo: (url) => shown.push(url),
  applyVideo: () => {},
};
initWarmups(store, ctx);
ctx.renderWarmups();

ok("three dots rendered", document.querySelectorAll("#warmupDots .wd").length === 3);
ok("first dot active", document.querySelector("#warmupDots .wd").classList.contains("on"));
ok("prev disabled at start", document.getElementById("prevWarmup").disabled);
ok("status shows exercise 1 of 3", document.getElementById("warmupStatus").textContent.includes("Exercise 1 of 3"));

store.dispatch({ type: "setStep", payload: "warmups" });
document.getElementById("nextWarmup").click();
ok("next advances warmup index", store.get().warmupIndex === 1);
ok("second dot active after next", document.querySelectorAll("#warmupDots .wd")[1].classList.contains("on"));
ok("first dot marked done", document.querySelectorAll("#warmupDots .wd")[0].classList.contains("done"));
ok("warmup video shown for active step", shown[shown.length - 1] === "u2");

document.getElementById("prevWarmup").click();
ok("prev goes back", store.get().warmupIndex === 0);

document.getElementById("finishWarmups").click();
ok("finish moves to song step", store.get().step === "song");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
