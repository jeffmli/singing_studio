// web/js/features/search.js
// Song search: /api/search auto-fill of the setup fields with status feedback.
// (The /api/alt embed-fallback lives with the players feature.)
import { byId as $ } from "../core/dom.js";

export function initSearch(store, ctx) {
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

  $("searchBtn").addEventListener("click", runSearch);
  $("songSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); runSearch(); }
  });
}
