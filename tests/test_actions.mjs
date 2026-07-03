// test_actions.mjs
import { initialState, reducers } from "../web/js/core/actions.js";

let pass = 0, fail = 0;
const ok = (n, c) => { console.log((c ? "  ✓ " : "  ✗ ") + n); c ? pass++ : fail++; };

ok("initial step is setup", initialState.step === "setup");
const s1 = reducers.setStep(initialState, "song");
ok("setStep returns new state", s1.step === "song" && s1 !== initialState);
ok("setStep does not mutate original", initialState.step === "setup");
const s2 = reducers.setSession(initialState, { id: "abc", startedAt: 123 });
ok("setSession sets id + startedAt", s2.sessionId === "abc" && s2.sessionStartedAt === 123);
ok("setLiveGuideRunning toggles", reducers.setLiveGuideRunning(initialState, true).liveGuideRunning === true);
ok("bumpSetupRev increments", reducers.bumpSetupRev(initialState).setupRev === initialState.setupRev + 1);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
