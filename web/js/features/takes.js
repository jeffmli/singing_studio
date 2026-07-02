// web/js/features/takes.js
// "This session" takes drawer: list rendering, count badge, delete/analyze
// delegation, and the shared open/close panel helpers.
import { byId as $ } from "../core/dom.js";
import { readTakes, deleteTake } from "../core/db.js";

export function initTakes(store, ctx) {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function fileNameForTake(take) {
    const safeTitle = String(take.title || "singing-take").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${safeTitle || "singing-take"}-${new Date(take.createdAt).toISOString().replace(/[:.]/g, "-")}.webm`;
  }

  function buildTakeEl(take) {
    const item = document.createElement("article");
    item.className = "take";
    const url = URL.createObjectURL(take.blob);
    const date = new Date(take.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const drillBits = [take.phraseFocus, take.takeTempo].filter(Boolean);
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(take.title || "Untitled take")}</strong>
        <p class="meta">${date}${take.note ? " &middot; " + escapeHtml(take.note) : ""}</p>
        ${drillBits.length ? `<p class="drill">${escapeHtml(drillBits.join(" · "))}</p>` : ""}
      </div>
      <audio controls src="${url}"></audio>
      <div class="take-actions">
        <button class="ghost analyze-btn" data-analyze="${escapeAttr(take.id)}">&#9835; Analyze pitch</button>
        <a download="${escapeAttr(fileNameForTake(take))}" href="${url}"><button class="ghost">Download</button></a>
        <button class="danger" data-delete="${escapeAttr(take.id)}">Delete</button>
      </div>
    `;
    return item;
  }

  async function renderTakes() {
    const list = $("takesList");
    const all = await readTakes();
    const takes = all.filter((take) => take.sessionId === store.get().sessionId);

    store.dispatch({ type: "setTakesCount", payload: takes.length });
    const badge = $("takesCount");
    badge.textContent = takes.length;
    badge.classList.toggle("zero", takes.length === 0);

    list.innerHTML = "";
    if (!takes.length) {
      list.innerHTML = "<p class=\"empty-takes\">No takes yet this session.<br>Record one while you sing.</p>";
      return;
    }
    for (const take of takes) list.appendChild(buildTakeEl(take));
  }

  // ---------- Panels (takes drawer, history, reflection) ----------
  function closePanels() {
    document.body.classList.remove("takes-open", "history-open", "reflect-open", "analyze-open");
  }
  function openDrawer() { closePanels(); document.body.classList.add("takes-open"); }
  function closeDrawer() { document.body.classList.remove("takes-open"); }

  $("takesToggle").addEventListener("click", openDrawer);
  $("closeDrawer").addEventListener("click", closeDrawer);
  $("drawerOverlay").addEventListener("click", closePanels);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });
  $("takesList").addEventListener("click", async (event) => {
    const analyzeBtn = event.target.closest("[data-analyze]");
    if (analyzeBtn) { ctx.analyzeTake(analyzeBtn.dataset.analyze); return; }
    const target = event.target.closest("[data-delete]");
    if (!target) return;
    await deleteTake(target.dataset.delete);
    await renderTakes();
  });

  ctx.renderTakes = renderTakes;
  ctx.buildTakeEl = buildTakeEl;
  ctx.closePanels = closePanels;
}
