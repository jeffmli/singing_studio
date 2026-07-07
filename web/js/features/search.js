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

  function applySearchData(data) {
    if (data.title) fillField("songTitle", data.title);
    fillField("originalUrl", data.original && data.original.url);
    fillField("instrumentalUrl", data.instrumental && data.instrumental.url);
    fillField("lyricVideoUrl", data.lyricVideo && data.lyricVideo.url);
    if (data.lyrics) fillField("lyricsInput", data.lyrics);
    if (data.syncedLyrics) $("syncedLyricsData").value = data.syncedLyrics;
  }

  async function searchSong(query) {
    const res = await fetch("/api/search?q=" + encodeURIComponent(query));
    if (!res.ok) throw new Error("server " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function missingParts(data) {
    const missing = [];
    if (!data.original) missing.push("original video");
    if (!data.instrumental) missing.push("instrumental");
    if (!data.lyricVideo) missing.push("lyric video");
    if (!data.lyrics) missing.push("lyrics");
    return missing;
  }

  async function runSetupSearch() {
    const q = $("songSearch").value.trim();
    const status = $("searchStatus");
    if (!q) { $("songSearch").focus(); return; }

    const btn = $("searchBtn");
    btn.disabled = true;
    status.className = "search-status muted";
    status.innerHTML = '<span class="spin"></span>Searching YouTube + lyrics&hellip;';

    try {
      const data = await searchSong(q);
      applySearchData(data);
      const missing = missingParts(data);
      const name = data.title || q;
      status.className = "search-status ok";
      status.textContent = missing.length
        ? `Filled “${name}”. Couldn’t find: ${missing.join(", ")} — add those manually if you like. Review below, then Start Session.`
        : `Filled “${name}” — review and tweak below, then Start Session.`;

      ctx.setManualOpen(true); // reveal fields so the user can review the auto-fill
      ctx.clearRecentSongSelection?.(); // searched results are no longer the highlighted recent song
      ctx.saveSetup({ silent: true }); // persists the filled setup + re-renders
    } catch (err) {
      status.className = "search-status error";
      status.textContent = "Search needs the local server (run server.py). You can still fill everything in manually below.";
    } finally {
      btn.disabled = false;
    }
  }

  async function runSingSearch() {
    const input = $("singSongSearch");
    const status = $("singSongSearchStatus");
    const q = input?.value.trim();
    if (!q) { input?.focus(); return; }

    const btn = $("singSongSearchBtn");
    btn.disabled = true;
    status.className = "search-status muted";
    status.innerHTML = '<span class="spin"></span>Searching YouTube + lyrics&hellip;';
    try {
      const data = await searchSong(q);
      applySearchData(data);
      const missing = missingParts(data);
      const name = data.title || q;
      ctx.clearRecentSongSelection?.();
      ctx.saveSetupToLibrary?.();
      store?.dispatch({ type: "setActiveTab", payload: "original" });
      $("singSongPicker")?.classList.add("hidden");
      status.className = "search-status ok";
      status.textContent = missing.length
        ? `Using “${name}”. Missing: ${missing.join(", ")}.`
        : `Using “${name}”.`;
      ctx.showToast?.(`Changed song to ${name}.`);
    } catch (err) {
      status.className = "search-status error";
      status.textContent = "Could not search from here. Check that the local server is running.";
    } finally {
      btn.disabled = false;
    }
  }

  function openSingPicker() {
    $("singSongPicker")?.classList.remove("hidden");
    $("singSongSearch")?.focus();
  }

  function closeSingPicker() {
    $("singSongPicker")?.classList.add("hidden");
  }

  $("searchBtn").addEventListener("click", runSetupSearch);
  $("songSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); runSetupSearch(); }
  });
  $("changeSongInSession")?.addEventListener("click", openSingPicker);
  $("singSongPickerClose")?.addEventListener("click", closeSingPicker);
  $("singSongSearchBtn")?.addEventListener("click", runSingSearch);
  $("singSongSearch")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); runSingSearch(); }
  });
}
