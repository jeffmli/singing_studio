// web/js/features/live-guide.js
// Live pitch guide: reference melody prep (/api/reference), mic pitch tracking
// with sharp/flat feedback, the rolling pitch chart, the synced lyric caption,
// and the full-lyrics overlay toggle.
import { byId as $ } from "../core/dom.js";
import { detectPitchHz, hzToMidi, noteName, medianOf } from "../lib/pitch.js";
import { parseLrc, lyricLineAt } from "../lib/lyrics.js";

export function initLiveGuide(store, ctx) {
  // Live audio machinery is deliberately module-local, not in the store:
  // streams, analysers, RAF handles and rolling history are not UI state.
  let ref = null;
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let data = null;
  let raf = 0;
  let history = [];
  let startedAt = 0;
  let fallbackSongTime = 0;
  let recentMidi = [];
  let lrcRaw;
  let lrcLines;

  function lyricLines() {
    return $("lyricsInput").value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function renderLyricOverlay() {
    const overlay = $("lyricOverlay");
    if (!overlay) return;
    const lines = lyricLines();
    const hidden = store.get().lyricsHidden;
    const isVideo = store.get().step === "song" && store.get().activeTab !== "lyrics";
    overlay.classList.toggle("off", hidden || !isVideo);
    $("lyricToggle").textContent = hidden ? "Show lyrics" : "Hide lyrics";

    if (!lines.length) {
      $("overlayBody").textContent = "Paste lyrics in Setup to follow along.";
      return;
    }

    $("overlayBody").textContent = lines.join("\n");
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
      const payload = await res.json();
      if (!res.ok || payload.error) throw new Error(payload.error || ("server " + res.status));
      if (!payload.times || !payload.times.length) throw new Error("No reference melody was returned.");
      ref = payload;
      history = [];
      recentMidi = [];
      store.dispatch({ type: "setLiveGuideReady", payload: true });
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
      fallbackSongTime = t;
      return t;
    }
    if (!startedAt) return fallbackSongTime || 0;
    return fallbackSongTime + ((Date.now() - startedAt) / 1000) * store.get().playbackRate;
  }

  async function startLiveGuide() {
    if (!ref) {
      await prepareLiveGuide();
      if (!ref) return;
    }
    if (!navigator.mediaDevices) {
      setGuideStatus("Microphone is not available in this browser.");
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      stream = await ctx.openMic();
      await ctx.refreshMicList();
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      data = new Float32Array(analyser.fftSize);
      store.dispatch({ type: "setLiveGuideRunning", payload: true });
      startedAt = Date.now();
      fallbackSongTime = currentSongTime();
      history = [];
      recentMidi = [];
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
    store.dispatch({ type: "setLiveGuideRunning", payload: false });
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (audioContext) await audioContext.close();
    stream = null;
    audioContext = null;
    analyser = null;
    data = null;
    $("prepareGuide").disabled = false;
    $("refreshGuide").disabled = !ref;
    $("startGuide").disabled = !ref;
    $("stopGuide").disabled = true;
    setGuideStatus(ref ? "Live guide stopped. Start again when you replay the phrase." : "Prepare the guide before starting.");
  }

  function refreshLiveGuide() {
    if (!ref) {
      setGuideStatus("Prepare the guide first.");
      return;
    }
    const songTime = currentSongTime();
    fallbackSongTime = songTime;
    startedAt = Date.now();
    history = [];
    renderLyricOverlay();
    drawLivePitchChart();
    setGuideStatus(store.get().liveGuideRunning
      ? "Live guide resynced to the current video position."
      : "Guide resynced. Press Start live when you are ready.");
  }

  // Parse the saved synced lyrics once per distinct LRC string (cached).
  function syncedLyricLines() {
    const raw = $("syncedLyricsData").value || "";
    if (lrcRaw !== raw) {
      lrcRaw = raw;
      lrcLines = parseLrc(raw);
    }
    return lrcLines;
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
    if (!store.get().liveGuideRunning) return;
    analyser.getFloatTimeDomainData(data);
    const hz = detectPitchHz(data, audioContext.sampleRate);
    const songTime = currentSongTime();
    const target = targetMidiAt(songTime);

    // Median-smooth the last few readings: rejects a lone bad frame (e.g. a
    // transient octave slip) so the note/feedback doesn't twitch. Silence
    // clears the window so the readout drops out promptly when you stop.
    if (hz) {
      recentMidi.push(hzToMidi(hz));
      if (recentMidi.length > 5) recentMidi.shift();
    } else {
      recentMidi.length = 0;
    }
    const userMidi = recentMidi.length ? medianOf(recentMidi) : null;
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

    history.push({ t: songTime, target: target && target.midi, user: userMidi, cents });
    const minTime = songTime - 8;
    history = history.filter((p) => p.t >= minTime);
    updateLiveLyric(songTime);
    drawLivePitchChart();
    raf = requestAnimationFrame(liveGuideTick);
  }

  function drawLivePitchChart() {
    const canvas = $("livePitchChart");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 760;
    const cssH = 150;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, cssW, cssH);

    const points = history;
    g.fillStyle = "#8a7e6d";
    g.font = "12px ui-sans-serif, sans-serif";
    if (!points.length) {
      g.fillText(ref ? "Start the guide to draw live pitch." : "Prepare the pitch guide first.", 12, 24);
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

    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 2) continue;
      const y = Y(m);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(cssW, y);
      g.stroke();
    }

    g.strokeStyle = "#9b8e7c";
    g.lineWidth = 2;
    g.beginPath();
    let started = false;
    for (const p of points) {
      if (p.target == null) { started = false; continue; }
      if (!started) { g.moveTo(X(p.t), Y(p.target)); started = true; }
      else g.lineTo(X(p.t), Y(p.target));
    }
    g.stroke();

    for (const p of points) {
      if (p.user == null) continue;
      g.fillStyle = p.cents != null && Math.abs(p.cents) <= 35 ? "#1aa37a" : "#ff5b4d";
      g.beginPath();
      g.arc(X(p.t), Y(p.user), 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  $("prepareGuide").addEventListener("click", prepareLiveGuide);
  $("refreshGuide").addEventListener("click", refreshLiveGuide);
  $("startGuide").addEventListener("click", startLiveGuide);
  $("stopGuide").addEventListener("click", stopLiveGuide);
  $("lyricToggle").addEventListener("click", () => {
    store.dispatch({ type: "setLyricsHidden", payload: !store.get().lyricsHidden });
    renderLyricOverlay();
  });

  // Leaving the sing stage stops a running live guide.
  store.subscribe((s) => s.step, (step) => {
    if (step !== "song" && store.get().liveGuideRunning) stopLiveGuide();
  });

  ctx.setGuideStatus = setGuideStatus;
  ctx.renderLyricOverlay = renderLyricOverlay;
  ctx.updateLiveLyric = updateLiveLyric;
}
