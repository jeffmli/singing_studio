// test_dom.mjs
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
globalThis.document = dom.window.document;

const { html, raw, escapeHtml, mount, renderList, byId } = await import("./web/js/core/dom.js");

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

ok("escapeHtml escapes angle brackets", escapeHtml("<b>&") === "&lt;b&gt;&amp;");
ok("html escapes interpolated values", html`<p>${"<x>"}</p>` === "<p>&lt;x&gt;</p>");
ok("raw() is not escaped", html`<p>${raw("<b>hi</b>")}</p>` === "<p><b>hi</b></p>");

mount(byId("root"), html`<span id="s">${"hi"}</span>`);
ok("mount sets innerHTML", byId("s").textContent === "hi");

renderList(byId("root"), [1, 2, 3], (n) => `<li>${n}</li>`);
ok("renderList joins items", byId("root").querySelectorAll("li").length === 3);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
