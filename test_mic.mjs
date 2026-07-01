/**
 * Unit tests for the mic option-list builder (web/js/lib/mic.js).
 * Imports the real ES module. Run:  node test_mic.mjs
 */
import { micOptions } from "./web/js/lib/mic.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { console.log("  ✓ " + name); pass++; } else { console.log("  ✗ " + name); fail++; } }

// Always leads with a "Default" option (value "").
const empty = micOptions([], "");
ok("empty device list -> just Default", empty.length === 1 && empty[0].value === "" && /default/i.test(empty[0].label));

const devs = [
  { deviceId: "aaa", kind: "audioinput", label: "MacBook Pro Microphone" },
  { deviceId: "bbb", kind: "audioinput", label: "Scarlett 2i2 USB" },
  { deviceId: "vid", kind: "videoinput", label: "FaceTime Camera" },
];
const opts = micOptions(devs, "bbb");
ok("filters to audioinput only (+Default)", opts.length === 3);
ok("keeps real labels", opts.some((o) => o.label === "Scarlett 2i2 USB"));
ok("no video devices leak in", !opts.some((o) => /FaceTime/.test(o.label)));
ok("marks the selected device", opts.find((o) => o.value === "bbb").selected === true);
ok("default not selected when a device is", opts[0].selected === false);

// Unlabeled devices (labels are blank until mic permission is granted).
const unlabeled = micOptions([
  { deviceId: "d1", kind: "audioinput", label: "" },
  { deviceId: "d2", kind: "audioinput", label: "" },
], "");
ok("falls back to 'Microphone N' when unlabeled", unlabeled[1].label === "Microphone 1" && unlabeled[2].label === "Microphone 2");
ok("default selected when selectedId missing", unlabeled[0].selected === true);

// Selected id no longer present -> default falls back to selected.
const stale = micOptions(devs, "gone");
ok("stale selection falls back to Default selected", stale[0].selected === true && !stale.some((o) => o.value === "gone"));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
