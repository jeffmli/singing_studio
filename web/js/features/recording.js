// web/js/features/recording.js
// Mic capture + take recording: device picker, MediaRecorder, level meter,
// timer, and saving takes. Owns "singing-practice-mic-v1".
import { byId as $ } from "../core/dom.js";
import { micAudioConstraints, micOptions } from "../lib/mic.js";
import { writeTake } from "../core/db.js";

export function initRecording(store, ctx) {
  const micKey = "singing-practice-mic-v1";
  // Once the user picks a mic by hand, stop auto-preferring the fifine so we
  // don't fight their choice. Session-scoped: resets on reload, where auto
  // re-resolves from whatever's currently plugged in.
  let userPickedMic = false;

  // Prefer a plugged-in fifine so the dropdown reads "fifine Microphone" instead
  // of the ambiguous "Default", falling back to the system default when it's
  // unplugged. Only resolvable once permission is granted (labels are blank
  // before that); returns null when there's no fifine or the user chose manually.
  function autoPreferredMicId(devices) {
    if (userPickedMic) return null;
    const fifine = (devices || []).find(
      (d) => d.kind === "audioinput" && d.deviceId && /fifine/i.test(d.label || "")
    );
    return fifine ? fifine.deviceId : null;
  }
  let mediaRecorder = null;
  let audioChunks = [];
  let audioStream = null;
  let audioContext = null;
  let meterAnimation = 0;
  let recordStart = 0;
  let timerInterval = 0;

  function setRecordingStatus(message) {
    $("recordingStatus").textContent = message;
  }

  function updateMeter(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    const data = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const peak = data.reduce((max, value) => Math.max(max, value), 0);
      $("meterBar").style.width = `${Math.min(100, Math.round((peak / 255) * 100))}%`;
      meterAnimation = requestAnimationFrame(tick);
    };
    tick();
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startTimer() {
    recordStart = Date.now();
    const update = () => {
      const secs = Math.floor((Date.now() - recordStart) / 1000);
      $("recTimer").lastChild.textContent = formatTime(secs);
    };
    update();
    timerInterval = setInterval(update, 250);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = 0;
  }

  // Prefer Opus at a music-grade bitrate; fall back to the browser default if
  // the type isn't supported. 128 kbps mono is plenty for a vocal take and a big
  // step up from MediaRecorder's low default.
  function pickRecorderOptions() {
    const opts = { audioBitsPerSecond: 128000 };
    const canType = window.MediaRecorder && MediaRecorder.isTypeSupported;
    for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
      if (canType && MediaRecorder.isTypeSupported(type)) { opts.mimeType = type; break; }
    }
    return opts;
  }

  // Open the mic with singing-tuned constraints, selecting the chosen device.
  // Falls back to the default device if the exact one is gone/unavailable.
  async function openMic() {
    const micDeviceId = store.get().micDeviceId;
    try {
      return await navigator.mediaDevices.getUserMedia(micAudioConstraints(micDeviceId));
    } catch (err) {
      if (micDeviceId && (err.name === "OverconstrainedError" || err.name === "NotFoundError")) {
        store.dispatch({ type: "setMicDeviceId", payload: "" });
        localStorage.removeItem(micKey);
        return navigator.mediaDevices.getUserMedia(micAudioConstraints(""));
      }
      throw err;
    }
  }

  // Populate the mic <select>. Labels only appear once permission is granted, so
  // this is called again after the first successful capture and on devicechange.
  async function refreshMicList() {
    const sel = $("micSelect");
    if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch { return; }
    // Auto-select the fifine when it's present and the user hasn't chosen a mic.
    const auto = autoPreferredMicId(devices);
    if (auto && store.get().micDeviceId !== auto) {
      store.dispatch({ type: "setMicDeviceId", payload: auto });
    }
    const micDeviceId = store.get().micDeviceId;
    const opts = micOptions(devices, micDeviceId);
    sel.innerHTML = "";
    for (const o of opts) {
      const el = document.createElement("option");
      el.value = o.value;
      el.textContent = o.label;
      el.selected = o.selected;
      sel.appendChild(el);
    }
    // Keep state in sync if the saved device vanished (options fell back to Default).
    if (micDeviceId && !opts.some((o) => o.value === micDeviceId)) {
      store.dispatch({ type: "setMicDeviceId", payload: "" });
      localStorage.removeItem(micKey);
    }
  }

  function onMicChange() {
    userPickedMic = true; // respect the manual choice over the fifine auto-pick
    const micDeviceId = $("micSelect").value || "";
    store.dispatch({ type: "setMicDeviceId", payload: micDeviceId });
    if (micDeviceId) localStorage.setItem(micKey, micDeviceId);
    else localStorage.removeItem(micKey);
    setRecordingStatus(
      micDeviceId
        ? "Microphone set. Press Record to sing your take."
        : "Using the default microphone. Press Record to sing your take."
    );
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setRecordingStatus("Recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await openMic();
      await refreshMicList();  // labels are available now that permission is granted
      audioStream = stream;
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, pickRecorderOptions());
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) audioChunks.push(event.data);
      };
      mediaRecorder.onstop = saveRecording;
      mediaRecorder.start();
      $("recordBtn").disabled = true;
      $("stopBtn").disabled = false;
      $("transportBar").classList.add("recording");
      setRecordingStatus("Recording now — sing your take, then press Stop.");
      startTimer();
      updateMeter(stream);
    } catch (error) {
      setRecordingStatus(`Microphone unavailable: ${error.message}`);
    }
  }

  async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    $("recordBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("transportBar").classList.remove("recording");
    stopTimer();
    if (meterAnimation) cancelAnimationFrame(meterAnimation);
    $("meterBar").style.width = "0%";
    if (audioContext) await audioContext.close();
    if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
  }

  async function saveRecording() {
    const setup = ctx.getSetup();
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const take = {
      id: crypto.randomUUID(),
      title: setup.songTitle || "Singing Take",
      note: $("takeNote").value.trim(),
      blob,
      createdAt: Date.now(),
      sessionId: store.get().sessionId,
      originalUrl: setup.originalUrl || "",
    };
    await writeTake(take);
    $("takeNote").value = "";
    setRecordingStatus("Take saved. Open “This session” to review or download.");
    await ctx.renderTakes();
  }

  $("recordBtn").addEventListener("click", startRecording);
  $("stopBtn").addEventListener("click", stopRecording);
  $("micSelect").addEventListener("change", onMicChange);
  if (navigator.mediaDevices && "ondevicechange" in navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener("devicechange", () => { refreshMicList(); });
  }

  // Seed the store with the saved mic choice.
  store.dispatch({ type: "setMicDeviceId", payload: localStorage.getItem(micKey) || "" });

  ctx.setRecordingStatus = setRecordingStatus;
  ctx.openMic = openMic;
  ctx.refreshMicList = refreshMicList;
}
