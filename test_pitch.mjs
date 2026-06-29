/**
 * Unit tests for the live pitch detector module (web/js/lib/pitch.js).
 *
 * Imports the real ES module and runs it against synthetic tones in Node — no
 * browser. Focus: accuracy on clean tones and octave robustness on harmonic-
 * rich / missing-fundamental signals. Run:  node test_pitch.mjs
 */
import { detectPitchHz, hzToMidi, noteName, medianOf } from "./web/js/lib/pitch.js";

const SR = 44100;
const N = 2048;

function tone(f0, harmonics) {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    harmonics.forEach((amp, k) => { s += amp * Math.sin(2 * Math.PI * f0 * (k + 1) * (i / SR)); });
    buf[i] = s;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) for (let i = 0; i < N; i++) buf[i] = (buf[i] / peak) * 0.5;
  return buf;
}

let pass = 0, fail = 0;
const cents = (hz, f0) => 1200 * Math.log2(hz / f0);
function near(name, hz, f0, tol) {
  if (hz == null) { console.log(`  ✗ ${name}: got null`); fail++; return; }
  const c = cents(hz, f0);
  if (Math.abs(c) <= tol) { console.log(`  ✓ ${name}: ${hz.toFixed(1)}Hz (${c.toFixed(1)}¢)`); pass++; }
  else { console.log(`  ✗ ${name}: ${hz.toFixed(1)}Hz off by ${c.toFixed(1)}¢ (>${tol})`); fail++; }
}
function isNull(name, hz) {
  if (hz == null) { console.log(`  ✓ ${name}: null`); pass++; }
  else { console.log(`  ✗ ${name}: expected null, got ${hz.toFixed(1)}Hz`); fail++; }
}
function eq(name, got, want) {
  if (got === want) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}: got ${got}, want ${want}`); fail++; }
}

near("pure 220Hz (A3)", detectPitchHz(tone(220, [1]), SR), 220, 5);
near("pure 440Hz (A4)", detectPitchHz(tone(440, [1]), SR), 440, 5);
near("low 98Hz (G2)", detectPitchHz(tone(98, [1, 0.5]), SR), 98, 12);
near("voice 147Hz (D3) + harmonics", detectPitchHz(tone(147, [1, 0.7, 0.5, 0.3, 0.2]), SR), 147, 12);
near("voice 262Hz (C4) + harmonics", detectPitchHz(tone(262, [1, 0.8, 0.6, 0.4]), SR), 262, 10);
near("missing-fundamental 130Hz", detectPitchHz(tone(130, [0, 1, 0.7, 0.5]), SR), 130, 15);

const noise = new Float32Array(N);
for (let i = 0; i < N; i++) noise[i] = (Math.random() * 2 - 1) * 0.5;
isNull("white noise -> null", detectPitchHz(noise, SR));
isNull("silence -> null", detectPitchHz(new Float32Array(N), SR));

// Helper exports.
eq("hzToMidi(440) === 69", Math.round(hzToMidi(440)), 69);
eq("noteName(69) === A4", noteName(69), "A4");
eq("medianOf([3,1,2]) === 2", medianOf([3, 1, 2]), 2);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
