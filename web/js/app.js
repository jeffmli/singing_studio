import { detectPitchHz, hzToMidi, noteName, medianOf } from "./lib/pitch.js";
import { parseLrc, lyricLineAt } from "./lib/lyrics.js";
import { micAudioConstraints, micOptions } from "./lib/mic.js";
import { parseYouTubeId } from "./features/setup.js";
import { writeTake, readTakes, getTake, writeSession, readSessions, deleteTake } from "./core/db.js";

export function initLegacy(store, ctx) {
  const sessionKey = "singing-practice-current-session-v1";
  const state = {
    reflectRating: 0,
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
      const stream = await ctx.openMic();
      await ctx.refreshMicList();
      const audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      state.liveGuide.stream = stream;
      state.liveGuide.audioContext = audioCtx;
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


  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

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

  function bindEvents() {
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
    $("lyricToggle").addEventListener("click", () => {
      state.lyricsOverlay.hidden = !state.lyricsOverlay.hidden;
      renderLyricOverlay();
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
  ctx.startNewSession = startNewSession;
  ctx.showToast = showToast;
  ctx.setGuideStatus = setGuideStatus;
  ctx.renderLyricOverlay = renderLyricOverlay;

  // Leaving the sing stage stops a running live guide (was inside setStep()).
  store.subscribe((s) => s.step, (step) => {
    if (step !== "song" && state.liveGuide.running) stopLiveGuide();
  });

  ensureSession();
  bindEvents();
}
