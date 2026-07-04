// web/js/features/history.js
// Session lifecycle + history panel + finish-and-reflect modal + toast.
// Owns "singing-practice-current-session-v1".
import { byId as $ } from "../core/dom.js";
import { readTakes, deleteTake, writeSession, readSessions } from "../core/db.js";

export function initHistory(store, ctx) {
  const sessionKey = "singing-practice-current-session-v1";
  let timerInterval = 0;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  // ---------- Session lifecycle ----------
  function persistCurrentSession() {
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: store.get().sessionId,
      sessionStartedAt: store.get().sessionStartedAt,
    }));
  }

  function formatSessionDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getSessionElapsedMs(now = Date.now()) {
    const startedAt = store.get().sessionStartedAt || now;
    return Math.max(0, now - startedAt);
  }

  function updateSessionTimer() {
    const el = $("sessionTimer");
    if (el) el.textContent = `Session ${formatSessionDuration(getSessionElapsedMs())}`;
  }

  function startSessionTimer() {
    updateSessionTimer();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateSessionTimer, 1000);
  }

  function ensureSession() {
    const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
    if (saved && saved.sessionId) {
      store.dispatch({ type: "setSession", payload: { id: saved.sessionId, startedAt: saved.sessionStartedAt || Date.now() } });
      startSessionTimer();
    } else {
      startNewSession();
    }
  }

  function startNewSession() {
    store.dispatch({ type: "setSession", payload: { id: crypto.randomUUID(), startedAt: Date.now() } });
    persistCurrentSession();
    startSessionTimer();
  }

  // ---------- History panel ----------
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
      const durationMs = Number.isFinite(session.durationMs)
        ? session.durationMs
        : Math.max(0, (session.endedAt || 0) - (session.startedAt || session.endedAt || 0));
      const reflectBits = [];
      if (session.wins) reflectBits.push(`<p class="r"><b>Went well:</b> ${escapeHtml(session.wins)}</p>`);
      if (session.focus) reflectBits.push(`<p class="r"><b>Next time:</b> ${escapeHtml(session.focus)}</p>`);
      const goal = session.practiceGoal ? `<div class="goal-chip">${escapeHtml(session.practiceGoal)}</div>` : "";
      card.innerHTML = `
        <summary>
          <div class="sc-top">
            <span class="sc-song">${escapeHtml(session.songTitle || "Practice session")}</span>
            <span class="sc-date">${date}</span>
          </div>
          ${goal}
          <div class="sc-stars">${starsMarkup(session.rating || 0)}</div>
          <div class="sc-meta">${formatSessionDuration(durationMs)} · ${takes.length} take${takes.length === 1 ? "" : "s"}</div>
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

  // ---------- Finish & reflect ----------
  function setStars(rating) {
    store.dispatch({ type: "setReflectRating", payload: rating });
    for (const star of document.querySelectorAll("#reflectStars .star")) {
      star.classList.toggle("lit", Number(star.dataset.rating) <= rating);
    }
  }

  async function openReflect() {
    const takes = (await readTakes()).filter((t) => t.sessionId === store.get().sessionId);
    const duration = formatSessionDuration(getSessionElapsedMs());
    const setup = ctx.getSetup();
    const song = setup.songTitle || "this song";
    const goal = setup.practiceGoal ? ` · ${setup.practiceGoal}` : "";
    $("reflectSummary").textContent =
      `${song}${goal} · ${duration} · ${takes.length} take${takes.length === 1 ? "" : "s"} recorded.`;
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
    const endedAt = Date.now();
    const durationMs = getSessionElapsedMs(endedAt);
    const session = {
      id: store.get().sessionId,
      songTitle: ctx.getSetup().songTitle || "Practice session",
      practiceGoal: ctx.getSetup().practiceGoal || "",
      startedAt: store.get().sessionStartedAt,
      endedAt,
      durationMs,
      rating: store.get().reflectRating,
      wins: $("reflectWins").value.trim(),
      focus: $("reflectFocus").value.trim(),
      takeCount: takes.length,
    };
    await writeSession(session);
    startNewSession();   // fresh session for next time
    closeReflect();
    await ctx.renderTakes();
    store.dispatch({ type: "setStep", payload: "home" });
    showToast("Session saved to your history ✓");
  }

  $("historyBtn").addEventListener("click", openHistory);
  $("closeHistory").addEventListener("click", closeHistory);
  $("endSessionBtn").addEventListener("click", openReflect);
  $("reflectCancel").addEventListener("click", closeReflect);
  $("reflectSave").addEventListener("click", saveSession);
  for (const star of document.querySelectorAll("#reflectStars .star")) {
    star.addEventListener("click", () => setStars(Number(star.dataset.rating)));
  }
  $("historyList").addEventListener("click", async (event) => {
    const analyzeBtn = event.target.closest("[data-analyze]");
    if (analyzeBtn) { ctx.analyzeTake(analyzeBtn.dataset.analyze); return; }
    const target = event.target.closest("[data-delete]");
    if (!target) return;
    await deleteTake(target.dataset.delete);
    await renderHistory();
  });

  ctx.startNewSession = startNewSession;
  ctx.formatSessionDuration = formatSessionDuration;
  ctx.getSessionElapsedMs = getSessionElapsedMs;
  ctx.showToast = showToast;

  ensureSession();
}
