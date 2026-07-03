// test_static_cache_bust.mjs — prevent old JS modules from surviving markup changes
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (name, condition) => {
  console.log((condition ? "  ✓ " : "  ✗ ") + name);
  condition ? pass++ : fail++;
};

const indexHtml = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const mainJs = fs.readFileSync(new URL("../web/js/main.js", import.meta.url), "utf8");

ok("index loads cache-busted main module", /<script\s+type="module"\s+src="js\/main\.js\?v=[^"]+"/.test(indexHtml));
ok("main imports cache-busted setup module", /from\s+"\.\/features\/setup\.js\?v=[^"]+"/.test(mainJs));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
