// test_players.dom.mjs — jsdom component test for features/players.js
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="pacePills">
    <button data-rate="0.75"></button>
    <button data-rate="1" class="active"></button>
  </div>
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
const ctx = { setGuideStatus: (m) => { guideMsg = m; } };
initPlayers(store, ctx);

ok("songPlayerTime is null with no player", ctx.songPlayerTime() === null);
ok("test hook exposed", typeof dom.window.__studioTest.forceSongError === "function");

document.querySelector('[data-rate="0.75"]').click();
ok("rate click updates store", store.get().playbackRate === 0.75);
ok("rate click toggles active class", document.querySelector('[data-rate="0.75"]').classList.contains("active")
  && !document.querySelector('[data-rate="1"]').classList.contains("active"));
ok("rate click reports pace", guideMsg.includes("75%"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
