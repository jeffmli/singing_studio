// test_store.mjs
import { createStore } from "../web/js/core/store.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

const reducers = {
  setStep: (s, step) => ({ ...s, step }),
  inc: (s) => ({ ...s, n: s.n + 1 }),
};
const store = createStore({ step: "setup", n: 0 }, reducers);

ok("get returns initial", store.get().step === "setup");

let seen = [];
const un = store.subscribe((s) => s.step, (v) => seen.push(v));
store.dispatch({ type: "setStep", payload: "song" });
ok("dispatch updates state", store.get().step === "song");
ok("selector subscriber fired with new slice", seen[seen.length - 1] === "song");

store.dispatch({ type: "inc" });
ok("unrelated change does NOT fire step subscriber", seen.length === 1);

un();
store.dispatch({ type: "setStep", payload: "warmups" });
ok("unsubscribe stops notifications", seen.length === 1);

ok("unknown action type throws", (() => { try { store.dispatch({ type: "nope" }); return false; } catch { return true; } })());

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
