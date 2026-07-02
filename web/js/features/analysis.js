// web/js/features/analysis.js
// Pitch-analysis modal: kicks a take to /api/analyze, staged progress loader,
// score summary, and the target-vs-you chart.
import { byId as $ } from "../core/dom.js";
import { getTake } from "../core/db.js";
import { noteName } from "../lib/pitch.js";

export function initAnalysis(store, ctx) {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

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


  function drawAnalysisChart(data) {
    const canvas = $("analyzeChart");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 760;
    const cssH = 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, cssW, cssH);

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

    g.strokeStyle = "rgba(255,255,255,0.06)";
    g.fillStyle = "#8a7e6d";
    g.font = "10px ui-sans-serif, sans-serif";
    g.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 2) continue;
      const yy = Y(m);
      g.beginPath();
      g.moveTo(pad.l, yy);
      g.lineTo(cssW - pad.r, yy);
      g.stroke();
      g.fillText(noteName(m), 6, yy + 3);
    }

    g.strokeStyle = "#9b8e7c";
    g.lineWidth = 2;
    g.beginPath();
    let started = false;
    for (let i = 0; i < times.length; i++) {
      if (ref[i] == null) { started = false; continue; }
      const px = X(times[i]), py = Y(ref[i]);
      if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
    }
    g.stroke();

    for (let i = 0; i < times.length; i++) {
      if (you[i] == null) continue;
      g.fillStyle = Math.abs(errs[i]) <= (data.inTuneCents || 35) ? "#1aa37a" : "#ff5b4d";
      g.beginPath();
      g.arc(X(times[i]), Y(you[i]), 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  $("analyzeClose").addEventListener("click", closeAnalyze);
  $("analyzeModal").addEventListener("click", (event) => {
    if (event.target === $("analyzeModal")) closeAnalyze();
  });

  ctx.analyzeTake = analyzeTake;
}
