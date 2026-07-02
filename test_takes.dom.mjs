// test_takes.dom.mjs — jsdom component test for features/takes.js
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <button id="takesToggle"><span id="takesCount">0</span></button>
  <aside><button id="closeDrawer"></button><div id="takesList"></div></aside>
  <div id="drawerOverlay"></div>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;

const { createStore } = await import("./web/js/core/store.js");
const { initialState, reducers } = await import("./web/js/core/actions.js");
const db = await import("./web/js/core/db.js");
const { initTakes } = await import("./web/js/features/takes.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
store.dispatch({ type: "setSession", payload: { id: "sess-1", startedAt: 1 } });

const blob = new Blob(["x"], { type: "audio/webm" });
await db.writeTake({ id: "t1", createdAt: 10, title: "Chorus try", note: "", phraseFocus: "bridge", takeTempo: "Slow", blob, sessionId: "sess-1" });
await db.writeTake({ id: "t2", createdAt: 5, title: "Other session", blob, sessionId: "other" });

const ctx = { analyzeTake: () => {} };
initTakes(store, ctx);
await ctx.renderTakes();

ok("only this session's takes listed", document.querySelectorAll("#takesList .take").length === 1);
ok("take title rendered", document.querySelector("#takesList .take").textContent.includes("Chorus try"));
ok("badge shows count", document.getElementById("takesCount").textContent === "1");
ok("takesCount in store", store.get().takesCount === 1);

document.getElementById("takesToggle").click();
ok("drawer opens", document.body.classList.contains("takes-open"));
document.getElementById("closeDrawer").click();
ok("drawer closes", !document.body.classList.contains("takes-open"));

document.getElementById("takesToggle").click();
ctx.closePanels();
ok("closePanels clears drawer", !document.body.classList.contains("takes-open"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
