// test_analysis.dom.mjs — jsdom component test for features/analysis.js
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="analyzeModal"><div id="analyzeBody"></div><button id="analyzeClose"></button></div>
</body></html>`, { url: "http://localhost/" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { initAnalysis } = await import("../web/js/features/analysis.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const ctx = { getSetup: () => ({ originalUrl: "" }), closePanels: () => {} };
initAnalysis(null, ctx);

// renderAnalysis is internal; drive it through analyzeTake with a mocked fetch.
const db = await import("../web/js/core/db.js");
const blob = new Blob(["x"], { type: "audio/webm" });
await db.writeTake({ id: "t1", createdAt: 1, title: "Take", blob, originalUrl: "https://youtu.be/aaaaaaaaaaa" });

// jsdom canvas has no 2d context — stub a recording proxy so drawAnalysisChart is exercised safely.
dom.window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    score: 82, inTuneCents: 35, medianCents: 18, tendency: "solid", frames: 64,
    times: [0, 0.5], refMidi: [60, 62], userMidi: [60.1, 61.8], centsErr: [10, -20],
  }),
});

await ctx.analyzeTake("t1");

const body = document.getElementById("analyzeBody").textContent;
ok("modal opened", document.body.classList.contains("analyze-open"));
ok("score rendered", body.includes("82"));
ok("in-tune threshold rendered", body.includes("35"));
ok("tendency rendered", body.includes("solid"));

document.getElementById("analyzeClose").click();
ok("close button closes modal", !document.body.classList.contains("analyze-open"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
