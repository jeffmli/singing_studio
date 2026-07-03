// test_home.dom.mjs — jsdom component test for features/home.js
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const makeDom = () => new JSDOM(`<!doctype html><html><body>
  <div id="homeSessionList"></div>
  <button id="homeStartBottom"></button>
</body></html>`, { url: "http://localhost/" });

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const db = await import("../web/js/core/db.js");
const { initHome } = await import("../web/js/features/home.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };
const waitFor = async (fn, timeoutMs = 1000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fn();
};

const dom = makeDom();
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const store = createStore(initialState, reducers);
store.dispatch({ type: "setSession", payload: { id: "active-session", startedAt: 1 } });
store.dispatch({ type: "setWarmupIndex", payload: 2 });

const blob = new Blob(["x"], { type: "audio/webm" });
await db.writeSession({
  id: "old-session",
  songTitle: "My Focus Song",
  startedAt: 1000,
  endedAt: 121000,
  durationMs: 245000,
  practiceGoal: "Record clean take",
  rating: 4,
  wins: "steady breath",
  focus: "chorus lift",
});
await db.writeTake({
  id: "old-take",
  createdAt: 110000,
  title: "Old take",
  note: "good run",
  phraseFocus: "chorus",
  takeTempo: "Slow",
  blob,
  sessionId: "old-session",
});

let newSessionCalls = 0;
let renderTakesCalls = 0;
const ctx = {
  startNewSession: () => { newSessionCalls++; },
  renderTakes: async () => { renderTakesCalls++; },
  buildTakeEl: (take) => {
    const el = document.createElement("article");
    el.className = "take";
    el.textContent = take.title;
    return el;
  },
  analyzeTake: () => {},
};

initHome(store, ctx);
await ctx.renderHome();

ok("previous session listed", document.querySelectorAll("#homeSessionList .session-card").length === 1);
ok("previous session shows song title", document.querySelector("#homeSessionList .session-card").textContent.includes("My Focus Song"));
ok("previous session shows reflection", document.querySelector("#homeSessionList .session-card").textContent.includes("steady breath"));
ok("previous session shows logged duration", document.querySelector("#homeSessionList .session-card").textContent.includes("4:05"));
ok("previous session shows practice goal", document.querySelector("#homeSessionList .session-card").textContent.includes("Record clean take"));
ok("start button always enabled", !document.getElementById("homeStartBottom").disabled);

document.getElementById("homeStartBottom").click();
await new Promise((r) => setTimeout(r, 0));
ok("start does not create session yet", newSessionCalls === 0);
ok("start moves to setup", store.get().step === "setup");
ok("start does not reset warmup index yet", store.get().warmupIndex === 2);
ok("start does not refresh takes yet", renderTakesCalls === 0);

document.querySelector("#homeSessionList .session-card summary").click();
const expandedTake = await waitFor(() => document.querySelector("#homeSessionList .take"));
ok("expanded session shows take", expandedTake?.textContent.includes("Old take"));
ok("expanding old session keeps active session", store.get().sessionId === "active-session");

const emptyDom = makeDom();
globalThis.document = emptyDom.window.document;
const emptyStore = createStore(initialState, reducers);
const emptyCtx = {
  buildTakeEl: () => document.createElement("article"),
};
// wipe sessions so the empty state renders
const rawDb = await db.openDb();
await new Promise((res, rej) => {
  const tx = rawDb.transaction("sessions", "readwrite");
  tx.objectStore("sessions").clear();
  tx.oncomplete = res;
  tx.onerror = () => rej(tx.error);
});
rawDb.close();
initHome(emptyStore, emptyCtx);
await emptyCtx.renderHome();

ok("empty state invites first session", document.getElementById("homeSessionList").textContent.includes("No sessions yet"));
ok("empty state keeps start enabled", !document.getElementById("homeStartBottom").disabled);
document.getElementById("homeStartBottom").click();
ok("empty home sends user to setup", emptyStore.get().step === "setup");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
