import { detectPitchHz, hzToMidi, noteName, medianOf } from "./lib/pitch.js";
import { parseLrc, lyricLineAt } from "./lib/lyrics.js";
import { micAudioConstraints, micOptions } from "./lib/mic.js";
import { parseYouTubeId } from "./features/setup.js";
import { writeTake, readTakes, getTake, writeSession, readSessions, deleteTake } from "./core/db.js";

export function initLegacy(store, ctx) {
  const micKey = "singing-practice-mic-v1";
  const sessionKey = "singing-practice-current-session-v1";
  const state = {
    micDeviceId: localStorage.getItem(micKey) || "",
    mediaRecorder: null,
    audioChunks: [],
    audioStream: null,
    audioContext: null,
    meterAnimation: 0,
    recordStart: 0,
    timerInterval: 0,
    reflectRating: 0,
    takeTempo: "Slow",
    lyricsOverlay: {
      hidden: false,
      raf: 0,
    },
    liveGuide: {
      ref: null,
      running: false,
      stream: null,
      audioContext: null,
      analyser: null,
      data: null,
      raf: 0,
      history: [],
      startedAt: 0,
      fallbackSongTime: 0,
    },
  };

  const $ = (id) => document.getElementById(id);

  function lyricLines() {
    return $("lyricsInput").value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  // ---------- Session lifecycle ----------
  function persistCurrentSession() {
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: store.get().sessionId,
      sessionStartedAt: store.get().sessionStartedAt,
    }));
  }

  function ensureSession() {
    const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
    if (saved && saved.sessionId) {
      store.dispatch({ type: "setSession", payload: { id: saved.sessionId, startedAt: saved.sessionStartedAt || Date.now() } });
    } else {
      startNewSession();
    }
  }

  function startNewSession() {
    store.dispatch({ type: "setSession", payload: { id: crypto.randomUUID(), startedAt: Date.now() } });
    persistCurrentSession();
  }

  function setRecordingStatus(message) {
    $("recordingStatus").textContent = message;
  }

  function renderLyricOverlay() {
    const overlay = $("lyricOverlay");
    if (!overlay) return;
    const lines = lyricLines();
    const isVideo = store.get().step === "song" && store.get().activeTab !== "lyrics";
    overlay.classList.toggle("off", state.lyricsOverlay.hidden || !isVideo);
    $("lyricToggle").textContent = state.lyricsOverlay.hidden ? "Show lyrics" : "Hide lyrics";

    if (!lines.length) {
      $("overlayBody").textContent = "Paste lyrics in Setup to follow along.";
      return;
    }

    $("overlayBody").textContent = lines.join("\n");
  }

  // ---------- Pitch analysis ----------
  function closeAnalyze() { document.body.classList.remove("analyze-open"); }

  async function analyzeTake(id) {
    const take = await getTake(id);
    if (!take) return;
    const videoUrl = take.originalUrl || ctx.getSetup().originalUrl;
    const body = $("analyzeBody");
    ctx.closePanels();
    document.body.classList.add("analyze-open");

    if (!videoUrl) {
      body.innerHTML = `<div class="analyze-error">Add the song's <b>Original</b> YouTube link in Setup so we can build the reference melody, then try again.</div>`;
      return;
    }
    const stopProgress = startAnalyzeProgress(body);
    try {
      const res = await fetch(
        `/api/analyze?videoUrl=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(take.title || "")}`,
        { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: take.blob }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || ("server " + res.status));
      renderAnalysis(data);
    } catch (err) {
      body.innerHTML = `<div class="analyze-error">${escapeHtml(err.message)}</div>`;
    } finally {
      stopProgress();
    }
  }

  // Staged, ticking loader so a long Demucs/pyin run never looks hung.
  // It's a heuristic timeline (we get no real progress from the blocking call);
  // the always-advancing elapsed counter is the honest "still working" signal.
  function startAnalyzeProgress(body) {
    const stages = [
      "Isolating the original vocal…",
      "Detecting your pitch, note-by-note…",
      "Aligning your take to the song…",
      "Scoring your intonation…",
    ];
    body.innerHTML = `<div class="analyze-loading"><span class="spin"></span>` +
      `<div class="aly-stage">${stages[0]}</div>` +
      `<div class="sub">First time for a song builds the reference melody and can take a minute. ` +
      `<span class="aly-elapsed">0s elapsed</span></div></div>`;
    const stageEl = body.querySelector(".aly-stage");
    const elapsedEl = body.querySelector(".aly-elapsed");
    const t0 = Date.now();
    let shown = 0;
    const tick = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      if (elapsedEl) elapsedEl.textContent = `${s}s elapsed`;
      // Advance a stage roughly every 7s, but hold on the last until done.
      const target = Math.min(stages.length - 1, Math.floor(s / 7));
      if (target !== shown && stageEl) { shown = target; stageEl.textContent = stages[shown]; }
    }, 250);
    return () => clearInterval(tick);
  }

  function renderAnalysis(data) {
    $("analyzeBody").innerHTML = `
      <div class="analyze-summary">
        <div class="score-big"><span class="num">${data.score}</span><span class="pct">%</span><span class="lbl">in tune (±${data.inTuneCents}¢)</span></div>
        <div class="analyze-stats">
          <div>Median pitch error: <b>${data.medianCents}¢</b></div>
          <div>Tendency: <b>${escapeHtml(data.tendency)}</b></div>
          <div>Notes compared: <b>${data.frames}</b></div>
        </div>
      </div>
      <div class="analyze-chart-wrap">
        <canvas id="analyzeChart"></canvas>
        <div class="analyze-legend">
          <span><i style="background:#9b8e7c"></i>target melody</span>
          <span><i style="background:#1aa37a"></i>you – in tune</span>
          <span><i style="background:#ff5b4d"></i>you – off</span>
        </div>
      </div>`;
    drawAnalysisChart(data);
  }

  function setGuideStatus(message) {
    $("guideStatus").textContent = message;
  }

  async function prepareLiveGuide() {
    const setup = ctx.getSetup();
    if (!setup.originalUrl) {
      setGuideStatus("Add the Original song YouTube link first.");
      $("pitchFeedback").textContent = "No song";
      return;
    }

    const btn = $("prepareGuide");
    btn.disabled = true;
    $("startGuide").disabled = true;
    $("pitchFeedback").textContent = "Preparing";
    $("pitchFeedback").className = "";
    setGuideStatus("Preparing reference melody. First time for a song can take about 30-60 seconds.");
    try {
      const res = await fetch(`/api/reference?videoUrl=${encodeURIComponent(setup.originalUrl)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || ("server " + res.status));
      if (!data.times || !data.times.length) throw new Error("No reference melody was returned.");
      state.liveGuide.ref = data;
      state.liveGuide.history = [];
      state.liveGuide.recentMidi = [];
      $("refreshGuide").disabled = false;
      $("startGuide").disabled = false;
      $("pitchFeedback").textContent = "Ready";
      setGuideStatus("Pitch guide ready. Press play on the video, then Start live guide.");
      updateLiveLyric(currentSongTime());
      drawLivePitchChart();
    } catch (err) {
      $("pitchFeedback").textContent = "Error";
      setGuideStatus(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function targetMidiAt(songTime) {
    const ref = state.liveGuide.ref;
    if (!ref || !ref.times || !ref.times.length) return null;
    const times = ref.times;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (times[mid] < songTime) lo = mid + 1;
      else hi = mid;
    }
    const candidates = [lo, lo - 1, lo + 1].filter((i) => i >= 0 && i < times.length);
    let best = candidates[0];
    for (const i of candidates) {
      if (Math.abs(times[i] - songTime) < Math.abs(times[best] - songTime)) best = i;
    }
    for (let radius = 0; radius < 16; radius++) {
      const left = best - radius;
      const right = best + radius;
      if (left >= 0 && ref.midi[left] != null) return { time: times[left], midi: ref.midi[left] };
      if (right < ref.midi.length && ref.midi[right] != null) return { time: times[right], midi: ref.midi[right] };
    }
    return null;
  }

  function currentSongTime() {
    const t = ctx.songPlayerTime();
    if (t != null) {
      state.liveGuide.fallbackSongTime = t;
      return t;
    }
    if (!state.liveGuide.startedAt) return state.liveGuide.fallbackSongTime || 0;
    return state.liveGuide.fallbackSongTime + ((Date.now() - state.liveGuide.startedAt) / 1000) * store.get().playbackRate;
  }

  async function startLiveGuide() {
    if (!state.liveGuide.ref) {
      await prepareLiveGuide();
      if (!state.liveGuide.ref) return;
    }
    if (!navigator.mediaDevices) {
      setGuideStatus("Microphone is not available in this browser.");
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const stream = await openMic();
      await refreshMicList();
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      state.liveGuide.stream = stream;
      state.liveGuide.audioContext = ctx;
      state.liveGuide.analyser = analyser;
      state.liveGuide.data = new Float32Array(analyser.fftSize);
      state.liveGuide.running = true;
      state.liveGuide.startedAt = Date.now();
      state.liveGuide.fallbackSongTime = currentSongTime();
      state.liveGuide.history = [];
      state.liveGuide.recentMidi = [];
      $("prepareGuide").disabled = true;
      $("refreshGuide").disabled = true;
      $("startGuide").disabled = true;
      $("stopGuide").disabled = false;
      setGuideStatus("Listening live. Sing with the video and watch sharp / flat feedback.");
      liveGuideTick();
    } catch (err) {
      setGuideStatus(`Microphone unavailable: ${err.message}`);
    }
  }

  async function stopLiveGuide() {
    state.liveGuide.running = false;
    if (state.liveGuide.raf) cancelAnimationFrame(state.liveGuide.raf);
    if (state.liveGuide.stream) state.liveGuide.stream.getTracks().forEach((track) => track.stop());
    if (state.liveGuide.audioContext) await state.liveGuide.audioContext.close();
    state.liveGuide.stream = null;
    state.liveGuide.audioContext = null;
    state.liveGuide.analyser = null;
    state.liveGuide.data = null;
    $("prepareGuide").disabled = false;
    $("refreshGuide").disabled = !state.liveGuide.ref;
    $("startGuide").disabled = !state.liveGuide.ref;
    $("stopGuide").disabled = true;
    setGuideStatus(state.liveGuide.ref ? "Live guide stopped. Start again when you replay the phrase." : "Prepare the guide before starting.");
  }

  function refreshLiveGuide() {
    if (!state.liveGuide.ref) {
      setGuideStatus("Prepare the guide first.");
      return;
    }
    const songTime = currentSongTime();
    state.liveGuide.fallbackSongTime = songTime;
    state.liveGuide.startedAt = Date.now();
    state.liveGuide.history = [];
    renderLyricOverlay();
    drawLivePitchChart();
    setGuideStatus(state.liveGuide.running
      ? "Live guide resynced to the current video position."
      : "Guide resynced. Press Start live when you are ready.");
  }

  // Parse the saved synced lyrics once per distinct LRC string (cached).
  function syncedLyricLines() {
    const raw = $("syncedLyricsData").value || "";
    if (state.liveGuide.lrcRaw !== raw) {
      state.liveGuide.lrcRaw = raw;
      state.liveGuide.lrcLines = parseLrc(raw);
    }
    return state.liveGuide.lrcLines;
  }

  // Show the lyric line active at songTime above the graph, next line dimmed.
  function updateLiveLyric(songTime) {
    const el = $("liveLyricLine");
    if (!el) return;
    const cur = el.querySelector(".cur"), nxt = el.querySelector(".nxt");
    const lines = syncedLyricLines();
    if (!lines.length) {
      el.classList.add("muted");
      cur.textContent = "No synced lyrics for this song";
      nxt.textContent = "";
      return;
    }
    el.classList.remove("muted");
    const { current, next } = lyricLineAt(lines, songTime);
    cur.textContent = current ? current.text : "♪ …";
    nxt.textContent = next ? next.text : "";
  }

  function liveGuideTick() {
    if (!state.liveGuide.running) return;
    const analyser = state.liveGuide.analyser;
    const data = state.liveGuide.data;
    analyser.getFloatTimeDomainData(data);
    const hz = detectPitchHz(data, state.liveGuide.audioContext.sampleRate);
    const songTime = currentSongTime();
    const target = targetMidiAt(songTime);

    // Median-smooth the last few readings: rejects a lone bad frame (e.g. a
    // transient octave slip) so the note/feedback doesn't twitch. Silence
    // clears the window so the readout drops out promptly when you stop.
    const recent = state.liveGuide.recentMidi || (state.liveGuide.recentMidi = []);
    if (hz) {
      recent.push(hzToMidi(hz));
      if (recent.length > 5) recent.shift();
    } else {
      recent.length = 0;
    }
    const userMidi = recent.length ? medianOf(recent) : null;
    const cents = target && userMidi != null ? (userMidi - target.midi) * 100 : null;

    $("targetNote").textContent = target ? noteName(Math.round(target.midi)) : "--";
    $("userNote").textContent = userMidi != null ? noteName(Math.round(userMidi)) : "--";
    $("pitchDelta").textContent = cents != null ? `${cents > 0 ? "+" : ""}${Math.round(cents)}¢` : "--";
    const fb = $("pitchFeedback");
    fb.className = "";
    if (cents == null) {
      fb.textContent = hz ? "No target" : "Sing";
    } else if (Math.abs(cents) <= 35) {
      fb.textContent = "On";
      fb.classList.add("on");
    } else {
      fb.textContent = cents > 0 ? "Sharp" : "Flat";
      fb.classList.add("off");
    }

    state.liveGuide.history.push({ t: songTime, target: target && target.midi, user: userMidi, cents });
    const minTime = songTime - 8;
    state.liveGuide.history = state.liveGuide.history.filter((p) => p.t >= minTime);
    updateLiveLyric(songTime);
    drawLivePitchChart();
    state.liveGuide.raf = requestAnimationFrame(liveGuideTick);
  }

  function drawLivePitchChart() {
    const canvas = $("livePitchChart");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 760;
    const cssH = 150;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const points = state.liveGuide.history;
    ctx.fillStyle = "#8a7e6d";
    ctx.font = "12px ui-sans-serif, sans-serif";
    if (!points.length) {
      ctx.fillText(state.liveGuide.ref ? "Start the guide to draw live pitch." : "Prepare the pitch guide first.", 12, 24);
      return;
    }

    const valid = points.flatMap((p) => [p.target, p.user]).filter((v) => v != null);
    if (!valid.length) return;
    const lo = Math.floor(Math.min(...valid)) - 1;
    const hi = Math.ceil(Math.max(...valid)) + 1;
    const t1 = points[points.length - 1].t;
    const t0 = Math.max(0, t1 - 8);
    const X = (t) => cssW * (t - t0) / (t1 - t0 || 1);
    const Y = (m) => cssH - 14 - (cssH - 28) * (m - lo) / (hi - lo || 1);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 2) continue;
      const y = Y(m);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#9b8e7c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const p of points) {
      if (p.target == null) { started = false; continue; }
      if (!started) { ctx.moveTo(X(p.t), Y(p.target)); started = true; }
      else ctx.lineTo(X(p.t), Y(p.target));
    }
    ctx.stroke();

    for (const p of points) {
      if (p.user == null) continue;
      ctx.fillStyle = p.cents != null && Math.abs(p.cents) <= 35 ? "#1aa37a" : "#ff5b4d";
      ctx.beginPath();
      ctx.arc(X(p.t), Y(p.user), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAnalysisChart(data) {
    const canvas = $("analyzeChart");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 760;
    const cssH = 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { l: 40, r: 12, t: 12, b: 22 };
    const W = cssW - pad.l - pad.r;
    const H = cssH - pad.t - pad.b;
    const { times, refMidi: ref, userMidi: you, centsErr: errs } = data;
    if (!times || !times.length) return;
    const all = ref.concat(you).filter((v) => v != null);
    let lo = Math.floor(Math.min(...all)) - 1;
    let hi = Math.ceil(Math.max(...all)) + 1;
    const t0 = times[0];
    const t1 = times[times.length - 1] || t0 + 1;
    const X = (t) => pad.l + W * (t - t0) / (t1 - t0 || 1);
    const Y = (m) => pad.t + H - H * (m - lo) / (hi - lo || 1);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "#8a7e6d";
    ctx.font = "10px ui-sans-serif, sans-serif";
    ctx.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 2) continue;
      const yy = Y(m);
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(cssW - pad.r, yy);
      ctx.stroke();
      ctx.fillText(noteName(m), 6, yy + 3);
    }

    ctx.strokeStyle = "#9b8e7c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < times.length; i++) {
      if (ref[i] == null) { started = false; continue; }
      const px = X(times[i]), py = Y(ref[i]);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (let i = 0; i < times.length; i++) {
      if (you[i] == null) continue;
      ctx.fillStyle = Math.abs(errs[i]) <= (data.inTuneCents || 35) ? "#1aa37a" : "#ff5b4d";
      ctx.beginPath();
      ctx.arc(X(times[i]), Y(you[i]), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function updateMeter(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    state.audioContext = new AudioContextClass();
    const source = state.audioContext.createMediaStreamSource(stream);
    const analyser = state.audioContext.createAnalyser();
    const data = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const peak = data.reduce((max, value) => Math.max(max, value), 0);
      $("meterBar").style.width = `${Math.min(100, Math.round((peak / 255) * 100))}%`;
      state.meterAnimation = requestAnimationFrame(tick);
    };
    tick();
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startTimer() {
    state.recordStart = Date.now();
    const update = () => {
      const secs = Math.floor((Date.now() - state.recordStart) / 1000);
      $("recTimer").lastChild.textContent = formatTime(secs);
    };
    update();
    state.timerInterval = setInterval(update, 250);
  }

  function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = 0;
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
    try {
      return await navigator.mediaDevices.getUserMedia(micAudioConstraints(state.micDeviceId));
    } catch (err) {
      if (state.micDeviceId && (err.name === "OverconstrainedError" || err.name === "NotFoundError")) {
        state.micDeviceId = "";
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
    const opts = micOptions(devices, state.micDeviceId);
    sel.innerHTML = "";
    for (const o of opts) {
      const el = document.createElement("option");
      el.value = o.value;
      el.textContent = o.label;
      el.selected = o.selected;
      sel.appendChild(el);
    }
    // Keep state in sync if the saved device vanished (options fell back to Default).
    if (state.micDeviceId && !opts.some((o) => o.value === state.micDeviceId)) {
      state.micDeviceId = "";
      localStorage.removeItem(micKey);
    }
  }

  function onMicChange() {
    state.micDeviceId = $("micSelect").value || "";
    if (state.micDeviceId) localStorage.setItem(micKey, state.micDeviceId);
    else localStorage.removeItem(micKey);
    setRecordingStatus(
      state.micDeviceId
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
      state.audioStream = stream;
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream, pickRecorderOptions());
      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) state.audioChunks.push(event.data);
      };
      state.mediaRecorder.onstop = saveRecording;
      state.mediaRecorder.start();
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
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    $("recordBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("transportBar").classList.remove("recording");
    stopTimer();
    if (state.meterAnimation) cancelAnimationFrame(state.meterAnimation);
    $("meterBar").style.width = "0%";
    if (state.audioContext) await state.audioContext.close();
    if (state.audioStream) state.audioStream.getTracks().forEach((track) => track.stop());
  }

  async function saveRecording() {
    const setup = ctx.getSetup();
    const blob = new Blob(state.audioChunks, { type: "audio/webm" });
    const take = {
      id: crypto.randomUUID(),
      title: setup.songTitle || "Singing Take",
      note: $("takeNote").value.trim(),
      phraseFocus: setup.phraseFocus || "",
      takeTempo: state.takeTempo,
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

  // ---------- Panels: open/close helpers now live in features/takes.js ----------
  async function openHistory() {
    await renderHistory();
    ctx.closePanels();
    document.body.classList.add("history-open");
  }
  function closeHistory() { document.body.classList.remove("history-open"); }

  function starsMarkup(rating) {
    let out = "";
    for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? "" : "off"}">&#9733;</span>`;
    return out;
  }

  async function renderHistory() {
    const list = $("historyList");
    const [sessions, allTakes] = await Promise.all([readSessions(), readTakes()]);
    const takesBySession = {};
    for (const take of allTakes) {
      const key = take.sessionId || "_ungrouped";
      (takesBySession[key] = takesBySession[key] || []).push(take);
    }

    list.innerHTML = "";
    if (!sessions.length) {
      list.innerHTML = "<p class=\"empty-takes\">No saved sessions yet.<br>Finish a session with “Finish &amp; reflect”.</p>";
      return;
    }

    for (const session of sessions) {
      const takes = (takesBySession[session.id] || []).sort((a, b) => b.createdAt - a.createdAt);
      const card = document.createElement("details");
      card.className = "session-card";
      const date = new Date(session.endedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      const mins = Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000));
      const reflectBits = [];
      if (session.wins) reflectBits.push(`<p class="r"><b>Went well:</b> ${escapeHtml(session.wins)}</p>`);
      if (session.focus) reflectBits.push(`<p class="r"><b>Next time:</b> ${escapeHtml(session.focus)}</p>`);
      card.innerHTML = `
        <summary>
          <div class="sc-top">
            <span class="sc-song">${escapeHtml(session.songTitle || "Practice session")}</span>
            <span class="sc-date">${date}</span>
          </div>
          <div class="sc-stars">${starsMarkup(session.rating || 0)}</div>
          <div class="sc-meta">${mins} min · ${takes.length} take${takes.length === 1 ? "" : "s"}</div>
        </summary>
        ${reflectBits.length ? `<div class="sc-reflect">${reflectBits.join("")}</div>` : ""}
      `;
      if (takes.length) {
        const wrap = document.createElement("div");
        wrap.className = "sc-takes";
        for (const take of takes) wrap.appendChild(ctx.buildTakeEl(take));
        card.appendChild(wrap);
      }
      list.appendChild(card);
    }
  }

  function setStars(rating) {
    state.reflectRating = rating;
    for (const star of document.querySelectorAll("#reflectStars .star")) {
      star.classList.toggle("lit", Number(star.dataset.rating) <= rating);
    }
  }

  async function openReflect() {
    const takes = (await readTakes()).filter((t) => t.sessionId === store.get().sessionId);
    const mins = Math.max(1, Math.round((Date.now() - store.get().sessionStartedAt) / 60000));
    const song = ctx.getSetup().songTitle || "this song";
    $("reflectSummary").textContent =
      `${song} · ${mins} min · ${takes.length} take${takes.length === 1 ? "" : "s"} recorded.`;
    setStars(0);
    $("reflectWins").value = "";
    $("reflectFocus").value = "";
    ctx.closePanels();
    document.body.classList.add("reflect-open");
  }
  function closeReflect() { document.body.classList.remove("reflect-open"); }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  async function saveSession() {
    const takes = (await readTakes()).filter((t) => t.sessionId === store.get().sessionId);
    const session = {
      id: store.get().sessionId,
      songTitle: ctx.getSetup().songTitle || "Practice session",
      startedAt: store.get().sessionStartedAt,
      endedAt: Date.now(),
      rating: state.reflectRating,
      wins: $("reflectWins").value.trim(),
      focus: $("reflectFocus").value.trim(),
      takeCount: takes.length,
    };
    await writeSession(session);
    startNewSession();   // fresh session for next time
    closeReflect();
    await ctx.renderTakes();
    showToast("Session saved to your history ✓");
  }

  function flashField(input) {
    const field = input.closest(".field");
    if (!field) return;
    field.classList.remove("flash");
    void field.offsetWidth; // restart the animation
    field.classList.add("flash");
  }

  function fillField(id, value) {
    const el = $(id);
    el.value = value || "";
    if (value) flashField(el);
  }

  async function runSearch() {
    const q = $("songSearch").value.trim();
    const status = $("searchStatus");
    if (!q) { $("songSearch").focus(); return; }

    const btn = $("searchBtn");
    btn.disabled = true;
    status.className = "search-status muted";
    status.innerHTML = '<span class="spin"></span>Searching YouTube + lyrics&hellip;';

    try {
      const res = await fetch("/api/search?q=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("server " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.title) fillField("songTitle", data.title);
      fillField("originalUrl", data.original && data.original.url);
      fillField("instrumentalUrl", data.instrumental && data.instrumental.url);
      fillField("lyricVideoUrl", data.lyricVideo && data.lyricVideo.url);
      if (data.lyrics) fillField("lyricsInput", data.lyrics);
      if (data.syncedLyrics) $("syncedLyricsData").value = data.syncedLyrics;

      const missing = [];
      if (!data.original) missing.push("original video");
      if (!data.instrumental) missing.push("instrumental");
      if (!data.lyricVideo) missing.push("lyric video");
      if (!data.lyrics) missing.push("lyrics");

      const name = data.title || q;
      status.className = "search-status ok";
      status.textContent = missing.length
        ? `Filled “${name}”. Couldn’t find: ${missing.join(", ")} — add those manually if you like. Review below, then Start Session.`
        : `Filled “${name}” — review and tweak below, then Start Session.`;

      ctx.setManualOpen(true); // reveal fields so the user can review the auto-fill
      ctx.saveSetup({ silent: true }); // persists the filled setup + re-renders
    } catch (err) {
      status.className = "search-status error";
      status.textContent = "Search needs the local server (run server.py). You can still fill everything in manually below.";
    } finally {
      btn.disabled = false;
    }
  }

  function bindEvents() {
    $("searchBtn").addEventListener("click", runSearch);
    $("songSearch").addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); runSearch(); }
    });
    $("recordBtn").addEventListener("click", startRecording);
    $("stopBtn").addEventListener("click", stopRecording);
    $("micSelect").addEventListener("change", onMicChange);
    if (navigator.mediaDevices && "ondevicechange" in navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", () => { refreshMicList(); });
    }
    $("prepareGuide").addEventListener("click", prepareLiveGuide);
    $("refreshGuide").addEventListener("click", refreshLiveGuide);
    $("startGuide").addEventListener("click", startLiveGuide);
    $("stopGuide").addEventListener("click", stopLiveGuide);
    $("historyBtn").addEventListener("click", openHistory);
    $("closeHistory").addEventListener("click", closeHistory);
    $("endSessionBtn").addEventListener("click", openReflect);
    $("reflectCancel").addEventListener("click", closeReflect);
    $("reflectSave").addEventListener("click", saveSession);
    for (const star of document.querySelectorAll("#reflectStars .star")) {
      star.addEventListener("click", () => setStars(Number(star.dataset.rating)));
    }
    for (const button of document.querySelectorAll("[data-tempo]")) {
      button.addEventListener("click", () => {
        state.takeTempo = button.dataset.tempo;
        for (const b of document.querySelectorAll("[data-tempo]")) {
          b.classList.toggle("active", b === button);
        }
        $("takeNote").placeholder = `Note for ${state.takeTempo.toLowerCase()} take: what to improve next time?`;
      });
    }
    $("lyricToggle").addEventListener("click", () => {
      state.lyricsOverlay.hidden = !state.lyricsOverlay.hidden;
      renderLyricOverlay();
    });
    $("analyzeClose").addEventListener("click", closeAnalyze);
    $("analyzeModal").addEventListener("click", (event) => {
      if (event.target === $("analyzeModal")) closeAnalyze();
    });
    $("historyList").addEventListener("click", async (event) => {
      const analyzeBtn = event.target.closest("[data-analyze]");
      if (analyzeBtn) { analyzeTake(analyzeBtn.dataset.analyze); return; }
      const target = event.target.closest("[data-delete]");
      if (!target) return;
      await deleteTake(target.dataset.delete);
      await renderHistory();
    });
  }

  // Legacy services still owned by app.js, callable from migrated features.
  ctx.setRecordingStatus = setRecordingStatus;
  ctx.startNewSession = startNewSession;
  ctx.analyzeTake = analyzeTake;
  ctx.showToast = showToast;
  ctx.setGuideStatus = setGuideStatus;
  ctx.renderLyricOverlay = renderLyricOverlay;

  // Leaving the sing stage stops a running live guide (was inside setStep()).
  store.subscribe((s) => s.step, (step) => {
    if (step !== "song" && state.liveGuide.running) stopLiveGuide();
  });

  ensureSession();
  bindEvents();
  refreshMicList();  // populate mic list (labels fill in after first permission grant)
}
