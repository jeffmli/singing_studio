// test_history.dom.mjs — jsdom component test for features/history.js
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <span id="sessionTimer">Session 0:00</span>
  <button id="historyBtn"></button><button id="endSessionBtn"></button>
  <aside><button id="closeHistory"></button><div id="historyList"></div></aside>
  <div id="reflectStars">
    <span class="star" data-rating="1"></span><span class="star" data-rating="2"></span>
    <span class="star" data-rating="3"></span><span class="star" data-rating="4"></span>
    <span class="star" data-rating="5"></span>
  </div>
  <p id="reflectSummary"></p><textarea id="reflectWins"></textarea><textarea id="reflectFocus"></textarea>
  <button id="reflectCancel"></button><button id="reflectSave"></button>
  <div id="toast"></div>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { createStore } = await import("../web/js/core/store.js");
const { initialState, reducers } = await import("../web/js/core/actions.js");
const db = await import("../web/js/core/db.js");
const { initHistory } = await import("../web/js/features/history.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const store = createStore(initialState, reducers);
let renderTakesCalls = 0;
const ctx = {
  getSetup: () => ({ songTitle: "My Song", practiceGoal: "Improve pitch" }),
  closePanels: () => document.body.classList.remove("takes-open", "history-open", "reflect-open", "analyze-open"),
  renderTakes: async () => { renderTakesCalls++; },
  buildTakeEl: () => document.createElement("article"),
  analyzeTake: () => {},
};
initHistory(store, ctx);

ok("ensureSession creates a session", Boolean(store.get().sessionId));
ok("session persisted to localStorage", JSON.parse(localStorage.getItem("singing-practice-current-session-v1")).sessionId === store.get().sessionId);
const firstSession = store.get().sessionId;
store.dispatch({ type: "setSession", payload: { id: firstSession, startedAt: 1000 } });
ok("session timer renders initial elapsed time", document.getElementById("sessionTimer").textContent === "Session 0:00");
ok("duration formatter handles minutes and seconds", ctx.formatSessionDuration(125000) === "2:05");

const realDateNow = Date.now;
Date.now = () => 181000;
document.getElementById("endSessionBtn").click();
await new Promise((r) => setTimeout(r, 50));
ok("reflect modal opens", document.body.classList.contains("reflect-open"));
ok("summary mentions song", document.getElementById("reflectSummary").textContent.includes("My Song"));
ok("summary mentions practice goal", document.getElementById("reflectSummary").textContent.includes("Improve pitch"));
ok("summary includes elapsed duration", document.getElementById("reflectSummary").textContent.includes("3:00"));

document.querySelector('#reflectStars .star[data-rating="4"]').click();
ok("4 stars lit", document.querySelectorAll("#reflectStars .star.lit").length === 4);
ok("rating in store", store.get().reflectRating === 4);

document.getElementById("reflectWins").value = "breath steady";
document.getElementById("reflectSave").click();
await new Promise((r) => setTimeout(r, 50));
Date.now = realDateNow;
ok("reflect modal closes after save", !document.body.classList.contains("reflect-open"));
ok("new session started", store.get().sessionId !== firstSession);
ok("takes re-rendered", renderTakesCalls === 1);
ok("toast shown", document.getElementById("toast").classList.contains("show"));

const sessions = await db.readSessions();
ok("session saved with rating + wins", sessions.length === 1 && sessions[0].rating === 4 && sessions[0].wins === "breath steady");
ok("session saved with practice goal", sessions[0].practiceGoal === "Improve pitch");
ok("saved session logs durationMs", sessions[0].durationMs === 180000);

document.getElementById("historyBtn").click();
await new Promise((r) => setTimeout(r, 50));
ok("history panel opens", document.body.classList.contains("history-open"));
ok("saved session card listed", document.querySelectorAll("#historyList .session-card").length === 1);
ok("card shows reflection", document.querySelector("#historyList .session-card").textContent.includes("breath steady"));
ok("card shows logged duration", document.querySelector("#historyList .session-card").textContent.includes("3:00"));
ok("card shows practice goal", document.querySelector("#historyList .session-card").textContent.includes("Improve pitch"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
