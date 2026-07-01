// Pure pitch math for the live guide — no DOM, no app state.

// McLeod Pitch Method (MPM): a normalized square-difference function plus a
// clarity threshold. Unlike plain autocorrelation (which picks the tallest
// peak and so often slips to a harmonic an octave away), MPM takes the FIRST
// peak above 0.9x the global max, which locks onto the true fundamental and
// is robust even when the fundamental is weak or missing. Returns Hz, or null
// when the signal is too quiet/noisy to trust.
export function detectPitchHz(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;                 // gate: too quiet

  // Normalized square difference function in [-1, 1].
  const nsdf = new Float32Array(SIZE);
  for (let tau = 0; tau < SIZE; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i + tau < SIZE; i++) {
      const a = buffer[i], b = buffer[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Collect the local maximum of each positive lobe past the central peak.
  const maxima = [];
  let tau = 0;
  while (tau < SIZE - 1 && nsdf[tau] > 0) tau++;   // skip the lobe around tau=0
  while (tau < SIZE - 1) {
    if (nsdf[tau] > 0) {
      let peakTau = tau, peakVal = nsdf[tau];
      while (tau < SIZE - 1 && nsdf[tau] > 0) {
        if (nsdf[tau] > peakVal) { peakVal = nsdf[tau]; peakTau = tau; }
        tau++;
      }
      maxima.push([peakTau, peakVal]);
    } else {
      tau++;
    }
  }
  if (!maxima.length) return null;

  let globalMax = 0;
  for (const [, v] of maxima) if (v > globalMax) globalMax = v;
  const threshold = 0.9 * globalMax;
  let chosen = maxima[0];
  for (const mx of maxima) { if (mx[1] >= threshold) { chosen = mx; break; } }

  const [peakTau, clarity] = chosen;
  if (clarity < 0.5) return null;               // gate: not periodic enough

  // Parabolic interpolation around the chosen peak for sub-sample precision.
  const x1 = nsdf[peakTau - 1] || 0, x2 = nsdf[peakTau], x3 = nsdf[peakTau + 1] || 0;
  const denom = 2 * (2 * x2 - x1 - x3);
  const shift = denom !== 0 ? (x3 - x1) / denom : 0;
  const period = peakTau + (Number.isFinite(shift) ? shift : 0);
  if (period <= 0) return null;
  const hz = sampleRate / period;
  return hz >= 65 && hz <= 1200 ? hz : null;
}

export function noteName(m) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}
export function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
