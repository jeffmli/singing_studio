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

  async function playNote(midi) {
    targetMidi = Number(midi);
    const label = pianoNoteName(targetMidi);
    if ($("pianoActiveNote")) $("pianoActiveNote").textContent = label;
    if ($("pianoTargetNote")) $("pianoTargetNote").textContent = label;
    for (const key of document.querySelectorAll("#pianoKeys [data-midi]")) {
      key.classList.toggle("active", Number(key.dataset.midi) === targetMidi);
    }

    const ac = await ensureAudioContext();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(targetMidi);
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.85);
    setStatus(`${label} reference tone`);
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
  $("pianoKeys")?.addEventListener("click", (event) => {
    const key = event.target.closest("[data-midi]");
    if (!key) return;
    playNote(Number(key.dataset.midi));
  });
  $("pianoStartMatch")?.addEventListener("click", startMatch);
  $("pianoStopMatch")?.addEventListener("click", stopMatch);

  store.subscribe((s) => s.step, (step) => {
    if (step !== "song" && stream) stopMatch();
  });

  ctx.playPianoNote = playNote;
  ctx.stopPianoMatch = stopMatch;
}
