/**
 * Unit tests for the live pitch detector in index.html.
 *
 * Extracts the real detector source (between the __PITCH_DETECTOR__ sentinels)
 * and runs it against synthetic tones in Node — no browser. Focus: accuracy on
 * clean tones and, crucially, octave robustness on harmonic-rich / missing-
 * fundamental signals where naive autocorrelation slips an octave.
 *
 * Run:  node test_pitch.cjs
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const START = "// __PITCH_DETECTOR_START__";
const END = "// __PITCH_DETECTOR_END__";
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < 0) {
  console.error("Could not find pitch-detector sentinels in index.html");
  process.exit(1);
}
const src = html.slice(a + START.length, b);
// eslint-disable-next-line no-new-func
const detectPitchHz = new Function(src + "\n return detectPitchHz;")();

const SR = 44100;
const N = 2048;

function tone(f0, harmonics) {
  // harmonics: array of amplitudes for [1f, 2f, 3f, ...]
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    harmonics.forEach((amp, k) => {
      s += amp * Math.sin(2 * Math.PI * f0 * (k + 1) * (i / SR));
    });
    buf[i] = s;
  }
  // normalize to ~0.5 peak
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) for (let i = 0; i < N; i++) buf[i] = (buf[i] / peak) * 0.5;
  return buf;
}

let pass = 0, fail = 0;
function cents(hz, f0) { return 1200 * Math.log2(hz / f0); }
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

// Clean tones across the vocal range.
near("pure 220Hz (A3)", detectPitchHz(tone(220, [1]), SR), 220, 5);
near("pure 440Hz (A4)", detectPitchHz(tone(440, [1]), SR), 440, 5);
near("low 98Hz (G2)", detectPitchHz(tone(98, [1, 0.5]), SR), 98, 12);

// Voice-like: strong harmonics. Naive ACF tends to octave-jump here.
near("voice 147Hz (D3) + harmonics", detectPitchHz(tone(147, [1, 0.7, 0.5, 0.3, 0.2]), SR), 147, 12);
near("voice 262Hz (C4) + harmonics", detectPitchHz(tone(262, [1, 0.8, 0.6, 0.4]), SR), 262, 10);

// Missing fundamental: only 2f,3f,4f present. Must still report f0, not 2*f0.
near("missing-fundamental 130Hz", detectPitchHz(tone(130, [0, 1, 0.7, 0.5]), SR), 130, 15);

// Rejection: noise and silence should not produce a confident pitch.
const noise = new Float32Array(N);
for (let i = 0; i < N; i++) noise[i] = (Math.random() * 2 - 1) * 0.5;
isNull("white noise -> null", detectPitchHz(noise, SR));
isNull("silence -> null", detectPitchHz(new Float32Array(N), SR));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
