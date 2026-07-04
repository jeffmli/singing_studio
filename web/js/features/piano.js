// web/js/features/piano.js
// In-app piano: local reference tones plus optional target-note pitch matching.
import { byId as $ } from "../core/dom.js";
import { detectPitchHz, hzToMidi, medianOf, midiToHz, noteName } from "../lib/pitch.js";

const FIRST_MIDI = 36; // C2
const LAST_MIDI = 84;  // C6
const BLACK_NOTES = new Set([1, 3, 6, 8, 10]);
const MATCH_TOLERANCE_CENTS = 35;

export function pianoNoteName(midi) {
  return noteName(Math.round(midi));
}

export function classifyPitchMatch(targetMidi, userMidi, toleranceCents = MATCH_TOLERANCE_CENTS) {
  if (userMidi == null || !Number.isFinite(userMidi)) return { feedback: "Sing", cents: null };
  const cents = (userMidi - targetMidi) * 100;
  if (Math.abs(cents) <= toleranceCents) return { feedback: "On", cents };
  return { feedback: cents > 0 ? "Sharp" : "Flat", cents };
}

export function initPiano(store, ctx) {
  let audioContext = null;
  let heldNote = null;
  let targetMidi = 60;
  let stream = null;
  let matchAudioContext = null;
  let analyser = null;
  let data = null;
  let raf = 0;
  let recentMidi = [];

  function setStatus(message) {
    if ($("pianoStatus")) $("pianoStatus").textContent = message;
  }

  function setFeedback(feedback, cents = null, userMidi = null) {
    const fb = $("pianoFeedback");
    if (fb) {
      fb.className = "";
      fb.textContent = feedback;
      if (feedback === "On") fb.classList.add("on");
      if (feedback === "Sharp" || feedback === "Flat") fb.classList.add("off");
    }
    if ($("pianoPitchDelta")) {
      $("pianoPitchDelta").textContent = cents == null ? "--" : `${cents > 0 ? "+" : ""}${Math.round(cents)}¢`;
    }
    if ($("pianoUserNote")) {
      $("pianoUserNote").textContent = userMidi == null ? "--" : pianoNoteName(userMidi);
    }
  }

  async function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setStatus("Web Audio is not available in this browser.");
      return null;
    }
    if (!audioContext) audioContext = new AudioContextClass();
    await audioContext.resume?.();
    return audioContext;
  }

  function setSelectedNote(midi) {
    targetMidi = Number(midi);
    const label = pianoNoteName(targetMidi);
    if ($("pianoActiveNote")) $("pianoActiveNote").textContent = label;
    if ($("pianoTargetNote")) $("pianoTargetNote").textContent = label;
    for (const key of document.querySelectorAll("#pianoKeys [data-midi]")) {
      key.classList.toggle("active", Number(key.dataset.midi) === targetMidi);
    }
    return label;
  }

  function releaseHeldNote() {
    if (!heldNote) return;
    const { audioContext: ac, gain, oscillators } = heldNote;
    const now = ac.currentTime;
    gain.gain.cancelScheduledValues?.(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value || 0.0001, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime?.(0.0001, now + 0.16);
    gain.gain.linearRampToValueAtTime?.(0.0001, now + 0.18);
    for (const osc of oscillators) osc.stop(now + 0.2);
    heldNote = null;
    for (const key of document.querySelectorAll("#pianoKeys [data-midi]")) key.classList.remove("active");
  }

  async function startPianoNote(midi) {
    const label = setSelectedNote(midi);
    const ac = await ensureAudioContext();
    if (!ac) return;
    if (heldNote?.midi === Number(midi)) return;
    releaseHeldNote();

    const now = ac.currentTime;
    const hz = midiToHz(targetMidi);
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter?.();
    const compressor = ac.createDynamicsCompressor?.();
    const destination = compressor || ac.destination;
    const oscillators = [];

    if (filter) {
      filter.type = "lowpass";
      filter.frequency.value = Math.min(5600, Math.max(2200, hz * 12));
      filter.Q.value = 0.7;
      filter.connect(destination);
    }
    if (compressor) compressor.connect(ac.destination);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.34, now + 0.012);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.18);
    gain.connect(filter || destination);

    const layers = [
      { type: "triangle", ratio: 1, level: 0.9, detune: 0 },
      { type: "sine", ratio: 2, level: 0.28, detune: 2 },
      { type: "sine", ratio: 3, level: 0.12, detune: -4 },
    ];
    for (const layer of layers) {
      const osc = ac.createOscillator();
      const layerGain = ac.createGain();
      osc.type = layer.type;
      osc.frequency.value = hz * layer.ratio;
      if (osc.detune) osc.detune.value = layer.detune;
      layerGain.gain.setValueAtTime(layer.level, now);
      osc.connect(layerGain);
      layerGain.connect(gain);
      osc.start(now);
      oscillators.push(osc);
    }

    heldNote = { midi: Number(midi), audioContext: ac, gain, oscillators };
    setStatus(`${label} reference tone`);
  }

  async function playNote(midi) {
    await startPianoNote(midi);
    setTimeout(() => {
      if (heldNote?.midi === Number(midi)) releaseHeldNote();
    }, 900);
  }

  function renderKeyboard() {
    const wrap = $("pianoKeys");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `piano-key ${BLACK_NOTES.has(midi % 12) ? "black" : "white"}`;
      button.dataset.midi = String(midi);
      button.textContent = pianoNoteName(midi);
      button.setAttribute("aria-label", `Play ${pianoNoteName(midi)}`);
      wrap.appendChild(button);
    }
  }

  function matchTick() {
    if (!analyser || !data) return;
    analyser.getFloatTimeDomainData(data);
    const hz = detectPitchHz(data, matchAudioContext.sampleRate);
    if (hz) {
      recentMidi.push(hzToMidi(hz));
      if (recentMidi.length > 5) recentMidi.shift();
    } else {
      recentMidi.length = 0;
    }
    const userMidi = recentMidi.length ? medianOf(recentMidi) : null;
    const result = classifyPitchMatch(targetMidi, userMidi);
    setFeedback(result.feedback, result.cents, userMidi);
    raf = requestAnimationFrame(matchTick);
  }

  async function startMatch() {
    if (!ctx.openMic) {
      setStatus("Microphone is not available for note matching.");
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not available.");
      stream = await ctx.openMic();
      await ctx.refreshMicList?.();
      matchAudioContext = new AudioContextClass();
      analyser = matchAudioContext.createAnalyser();
      analyser.fftSize = 2048;
      matchAudioContext.createMediaStreamSource(stream).connect(analyser);
      data = new Float32Array(analyser.fftSize);
      recentMidi = [];
      $("pianoStartMatch").disabled = true;
      $("pianoStopMatch").disabled = false;
      setStatus(`Listening for ${pianoNoteName(targetMidi)}.`);
      matchTick();
    } catch (error) {
      setStatus(`Microphone unavailable: ${error.message}`);
    }
  }

  async function stopMatch() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (matchAudioContext) await matchAudioContext.close?.();
    stream = null;
    matchAudioContext = null;
    analyser = null;
    data = null;
    recentMidi = [];
    if ($("pianoStartMatch")) $("pianoStartMatch").disabled = false;
    if ($("pianoStopMatch")) $("pianoStopMatch").disabled = true;
    setFeedback("Pick note");
    setStatus("Match mode stopped.");
  }

  renderKeyboard();
  if ($("pianoTargetNote")) $("pianoTargetNote").textContent = pianoNoteName(targetMidi);
  if ($("pianoActiveNote")) $("pianoActiveNote").textContent = "--";
  $("pianoKeys")?.addEventListener("pointerdown", (event) => {
    const key = event.target.closest("[data-midi]");
    if (!key) return;
    event.preventDefault();
    key.setPointerCapture?.(event.pointerId);
    startPianoNote(Number(key.dataset.midi));
  });
  $("pianoKeys")?.addEventListener("pointerup", releaseHeldNote);
  $("pianoKeys")?.addEventListener("pointercancel", releaseHeldNote);
  $("pianoKeys")?.addEventListener("pointerleave", releaseHeldNote);
  $("pianoKeys")?.addEventListener("keydown", (event) => {
    const key = event.target.closest("[data-midi]");
    if (!key || event.repeat || ![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    startPianoNote(Number(key.dataset.midi));
  });
  $("pianoKeys")?.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    releaseHeldNote();
  });
  $("pianoStartMatch")?.addEventListener("click", startMatch);
  $("pianoStopMatch")?.addEventListener("click", stopMatch);

  store.subscribe((s) => s.step, (step) => {
    if (step !== "song" && stream) stopMatch();
  });

  ctx.playPianoNote = playNote;
  ctx.startPianoNote = startPianoNote;
  ctx.releasePianoNote = releaseHeldNote;
  ctx.stopPianoMatch = stopMatch;
}
