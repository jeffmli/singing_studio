// web/js/features/home.js
// Home dashboard: current focus song, previous sessions, and fresh-session entry.
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

  function hasFocus(setup) {
    const title = String(setup.songTitle || "").trim();
    const hasRealTitle = title && title !== "Practice Song";
    return Boolean(hasRealTitle || setup.originalUrl || setup.instrumentalUrl || setup.lyricVideoUrl);
  }

  function starsMarkup(rating) {
    let out = "";
    for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? "" : "off"}">&#9733;</span>`;
    return out;
  }

  function sessionMeta(session, takes) {
    const endedAt = session.endedAt || Date.now();
    const startedAt = session.startedAt || endedAt;
    const mins = Math.max(1, Math.round((endedAt - startedAt) / 60000));
    const date = new Date(endedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    return `${date} · ${mins} min · ${takes.length} take${takes.length === 1 ? "" : "s"}`;
  }

  async function startFromHome() {
    store.dispatch({ type: "setStep", payload: "setup" });
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
    const setup = ctx.getSetup();
    const focus = hasFocus(setup);
    $("homeFocusTitle").textContent = focus ? setup.songTitle || "Untitled song" : "Choose a song";
    $("homeFocusMeta").textContent = focus
      ? "Saved and ready to review before warmups."
      : "Set up a song once, then it will be ready here next time.";
    $("homeStartTop").textContent = focus ? "Review song" : "Choose a song";
    $("homeStartTop").disabled = false;
    $("homeStartBottom").disabled = !focus;

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
      list.innerHTML = "<p class=\"empty-takes\">No saved sessions yet.<br>Finish a session with Finish &amp; reflect.</p>";
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

  $("homeStartTop").addEventListener("click", startFromHome);
  $("homeStartBottom").addEventListener("click", startFromHome);
  $("homeChangeSong").addEventListener("click", () => store.dispatch({ type: "setStep", payload: "setup" }));
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
