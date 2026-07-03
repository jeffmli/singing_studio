// web/js/features/home.js
// Home dashboard: every saved session (expandable to its recordings) and the
// single "Start new session" entry point.
import { byId as $ } from "../core/dom.js";
import { readSessions, readTakes, deleteTake } from "../core/db.js";

export function initHome(store, ctx) {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function starsMarkup(rating) {
    let out = "";
    for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? "" : "off"}">&#9733;</span>`;
    return out;
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function sessionDurationMs(session) {
    if (Number.isFinite(session.durationMs)) return session.durationMs;
    const endedAt = session.endedAt || Date.now();
    const startedAt = session.startedAt || endedAt;
    return Math.max(0, endedAt - startedAt);
  }

  function sessionMeta(session, takes) {
    return `${formatDuration(sessionDurationMs(session))} · ${takes.length} take${takes.length === 1 ? "" : "s"}`;
  }

  async function renderExpandedTakes(card) {
    const wrap = card.querySelector("[data-session-takes]");
    if (!wrap || wrap.dataset.loaded === "true") return;
    const allTakes = await readTakes();
    const sessionTakes = allTakes.filter((take) => take.sessionId === card.dataset.sessionId);
    wrap.innerHTML = "";
    if (!sessionTakes.length) {
      wrap.innerHTML = "<p class=\"empty-takes\">No recordings for this session.</p>";
      wrap.dataset.loaded = "true";
      return;
    }
    for (const take of sessionTakes) wrap.appendChild(ctx.buildTakeEl(take));
    wrap.dataset.loaded = "true";
  }

  async function renderHome() {
    const list = $("homeSessionList");
    let sessions = [];
    let allTakes = [];
    try {
      [sessions, allTakes] = await Promise.all([readSessions(), readTakes()]);
    } catch (error) {
      list.innerHTML = `<p class="empty-takes">Could not load sessions: ${escapeHtml(error.message)}</p>`;
      return;
    }

    const takesBySession = {};
    for (const take of allTakes) {
      const key = take.sessionId || "_ungrouped";
      (takesBySession[key] = takesBySession[key] || []).push(take);
    }

    if (!sessions.length) {
      list.innerHTML = "<p class=\"empty-takes\">No sessions yet — start your first one below.</p>";
      return;
    }

    list.innerHTML = "";
    for (const session of sessions) {
      const takes = takesBySession[session.id] || [];
      const card = document.createElement("details");
      card.className = "session-card";
      card.dataset.sessionId = session.id;
      const reflectBits = [];
      if (session.wins) reflectBits.push(`<p class="r"><b>Went well:</b> ${escapeHtml(session.wins)}</p>`);
      if (session.focus) reflectBits.push(`<p class="r"><b>Next time:</b> ${escapeHtml(session.focus)}</p>`);
      card.innerHTML = `
        <summary>
          <div class="sc-top">
            <span class="sc-song">${escapeHtml(session.songTitle || "Practice session")}</span>
            <span class="sc-date">${escapeHtml(new Date(session.endedAt || Date.now()).toLocaleDateString([], { dateStyle: "medium" }))}</span>
          </div>
          <div class="sc-stars">${starsMarkup(session.rating || 0)}</div>
          <div class="sc-meta">${escapeHtml(sessionMeta(session, takes))}</div>
        </summary>
        ${reflectBits.length ? `<div class="sc-reflect">${reflectBits.join("")}</div>` : ""}
        <div class="sc-takes" data-session-takes="${escapeHtml(session.id)}"></div>
      `;
      list.appendChild(card);
    }
  }

  $("homeStartBottom").addEventListener("click", () => store.dispatch({ type: "setStep", payload: "setup" }));
  $("homeSessionList").addEventListener("click", async (event) => {
    const analyzeBtn = event.target.closest("[data-analyze]");
    if (analyzeBtn) { ctx.analyzeTake(analyzeBtn.dataset.analyze); return; }
    const deleteBtn = event.target.closest("[data-delete]");
    if (deleteBtn) {
      await deleteTake(deleteBtn.dataset.delete);
      await renderHome();
      return;
    }
    const summary = event.target.closest("summary");
    if (!summary) return;
    await renderExpandedTakes(summary.closest("[data-session-id]"));
  });
  store.subscribe((s) => `${s.step}|${s.setupRev}`, () => {
    if (store.get().step === "home") renderHome();
  });

  ctx.renderHome = renderHome;
}
