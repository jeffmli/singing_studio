// web/js/features/setup.js
// Setup form: field persistence to localStorage, stage/stepper rendering,
// tab + step navigation, manual-section toggle, recent-songs library.
// Owns "singing-practice-setup-v1" and "singing-song-library-v1".
import { byId as $ } from "../core/dom.js";
import { upsertSong } from "../lib/song-library.js";
import { WARMUP_LIBRARY, warmupForUrl, warmupLabelForUrl } from "../lib/warmups.js";

const setupKey = "singing-practice-setup-v1";
const libraryKey = "singing-song-library-v1";
const fields = ["songTitle", "warmupLinks", "originalUrl", "instrumentalUrl", "lyricVideoUrl", "lyricsInput", "practiceGoal"];
const defaultPracticeGoal = "Improve pitch";

function valueOf(id) {
  return $(id)?.value ?? "";
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

export function parseYouTubeId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    const markers = ["embed", "shorts", "live"];
    const marker = parts.findIndex((part) => markers.includes(part));
    return marker >= 0 ? parts[marker + 1] || "" : "";
  } catch {
    return raw.length === 11 ? raw : "";
  }
}

export function initSetup(store, ctx) {
  let selectedRecentIndex = -1;

  function readWarmupQueue() {
    return valueOf("warmupLinks").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }

  function writeWarmupQueue(urls, { silent = false } = {}) {
    const deduped = [];
    for (const url of urls.map((u) => String(u || "").trim()).filter(Boolean)) {
      if (!deduped.includes(url)) deduped.push(url);
    }
    if ($("warmupLinks")) $("warmupLinks").value = deduped.join("\n");
    renderWarmupQueue();
    if (!silent) saveSetup({ silent: true });
  }

  function renderWarmupLibrary() {
    const select = $("warmupLibrarySelect");
    if (!select) return;
    const selected = new Set(readWarmupQueue());
    const previousValue = selected.has(select.value) ? "" : select.value;
    select.innerHTML = "<option value=\"\">Add a warm-up from the library...</option>";
    for (const item of WARMUP_LIBRARY) {
      const isSelected = selected.has(item.url);
      const option = document.createElement("option");
      option.value = item.url;
      option.disabled = isSelected;
      option.textContent = `${item.title} - ${item.type}${isSelected ? " (queued)" : ""}`;
      select.appendChild(option);
    }
    select.value = previousValue;
  }

  function renderWarmupQueue() {
    const list = $("warmupQueue");
    if (!list) return;
    const urls = readWarmupQueue();
    list.innerHTML = "";
    if (!urls.length) {
      list.innerHTML = "<p class=\"warmup-empty\">Choose warm-ups from the library or add a custom URL.</p>";
      renderWarmupLibrary();
      return;
    }
    urls.forEach((url, index) => {
      const item = warmupForUrl(url);
      const row = document.createElement("div");
      row.className = "warmup-queue-item";
      row.dataset.warmupUrl = url;
      row.innerHTML = `
        <div class="wq-main">
          <strong>${escapeHtml(warmupLabelForUrl(url))}</strong>
          <span>${escapeHtml(item ? item.type : url)}</span>
        </div>
        <div class="wq-actions">
          <button type="button" class="ghost" data-move-up ${index === 0 ? "disabled" : ""}>Up</button>
          <button type="button" class="ghost" data-move-down ${index === urls.length - 1 ? "disabled" : ""}>Down</button>
          <button type="button" class="danger" data-remove-warmup>Remove</button>
        </div>
      `;
      list.appendChild(row);
    });
    renderWarmupLibrary();
  }

  function getSetup() {
    return {
      songTitle: valueOf("songTitle").trim(),
      warmups: readWarmupQueue(),
      originalUrl: valueOf("originalUrl").trim(),
      instrumentalUrl: valueOf("instrumentalUrl").trim(),
      lyricVideoUrl: valueOf("lyricVideoUrl").trim(),
      lyrics: valueOf("lyricsInput").trim(),
      syncedLyrics: valueOf("syncedLyricsData"),
      practiceGoal: valueOf("practiceGoal").trim() || defaultPracticeGoal,
    };
  }

  function saveSetup({ silent = false } = {}) {
    localStorage.setItem(setupKey, JSON.stringify(getSetup()));
    if (!silent) ctx.setRecordingStatus?.("Setup saved.");
    store.dispatch({ type: "bumpSetupRev" });
  }

  function loadSetup() {
    const fallback = {
      songTitle: "Practice Song",
      warmups: [
        "https://www.youtube.com/watch?v=3eT2NoTYwNA",
        "https://www.youtube.com/watch?v=ck1pzgy07ZU"
      ],
      originalUrl: "",
      instrumentalUrl: "",
      lyricVideoUrl: "",
      lyrics: "",
      syncedLyrics: "",
      practiceGoal: defaultPracticeGoal,
    };
    const saved = JSON.parse(localStorage.getItem(setupKey) || "null") || fallback;
    $("songTitle").value = saved.songTitle || "";
    writeWarmupQueue(saved.warmups || [], { silent: true });
    $("originalUrl").value = saved.originalUrl || "";
    $("instrumentalUrl").value = saved.instrumentalUrl || "";
    $("lyricVideoUrl").value = saved.lyricVideoUrl || "";
    $("lyricsInput").value = saved.lyrics || "";
    $("syncedLyricsData").value = saved.syncedLyrics || "";
    $("practiceGoal").value = saved.practiceGoal || defaultPracticeGoal;
  }

  function readLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(libraryKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function applySong(song, index = -1) {
    selectedRecentIndex = index;
    $("songTitle").value = song.songTitle || "";
    $("originalUrl").value = song.originalUrl || "";
    $("instrumentalUrl").value = song.instrumentalUrl || "";
    $("lyricVideoUrl").value = song.lyricVideoUrl || "";
    $("lyricsInput").value = song.lyrics || "";
    $("syncedLyricsData").value = song.syncedLyrics || "";
    $("practiceGoal").value = song.practiceGoal || defaultPracticeGoal;
    writeWarmupQueue(Array.isArray(song.warmups) ? song.warmups : [], { silent: true });
    saveSetup({ silent: true });
    renderRecentSongs();
  }

  function renderRecentSongs() {
    const library = readLibrary();
    $("recentSongs").hidden = !library.length;
    const list = $("recentSongList");
    list.innerHTML = "";
    library.forEach((song, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `recent-song${index === selectedRecentIndex ? " active" : ""}`;
      btn.dataset.index = String(index);
      if (index === selectedRecentIndex) btn.setAttribute("aria-current", "true");
      btn.innerHTML = `<span class="rs-title"></span><span class="rs-meta"></span>`;
      btn.querySelector(".rs-title").textContent = song.songTitle || "Untitled song";
      btn.querySelector(".rs-meta").textContent = song.savedAt
        ? new Date(song.savedAt).toLocaleDateString([], { dateStyle: "medium" })
        : "";
      list.appendChild(btn);
    });
  }

  function clearRecentSongSelection() {
    selectedRecentIndex = -1;
    renderRecentSongs();
  }

  function setStep(step) {
    store.dispatch({ type: "setStep", payload: step });
  }

  function renderStages() {
    const step = store.get().step;
    const map = { home: "stageHome", setup: "stageSetup", warmups: "stageWarmups", song: "stageSong" };
    for (const [key, id] of Object.entries(map)) {
      $(id).classList.toggle("active", step === key);
    }
    // Stepper state
    const order = ["home", "setup", "warmups", "song"];
    const current = order.indexOf(step);
    [["stepHome", 0], ["stepSetup", 1], ["stepWarmups", 2], ["stepSong", 3]].forEach(([id, idx]) => {
      const el = $(id);
      el.classList.toggle("current", idx === current);
      el.classList.toggle("done", idx < current);
    });
    // Body mode for transport bar visibility
    document.body.classList.toggle("on-home", step === "home");
    document.body.classList.toggle("on-setup", step === "setup");
    document.body.classList.toggle("on-warmups", step === "warmups");
    document.body.classList.toggle("on-sing", step === "song");
    globalThis.scrollTo?.(0, 0); // each stage starts at its title, not mid-page
  }

  function setManualOpen(open) {
    $("manualSetup").classList.toggle("open", open);
    $("manualToggle").setAttribute("aria-expanded", String(open));
  }

  function saveSetupToLibrary() {
    saveSetup({ silent: true });
    const snapshot = getSetup();
    localStorage.setItem(libraryKey, JSON.stringify(upsertSong(readLibrary(), snapshot)));
    selectedRecentIndex = 0;
    renderRecentSongs();
  }

  $("startSession").addEventListener("click", () => {
    saveSetupToLibrary();
    ctx.startNewSession?.();
    store.dispatch({ type: "setWarmupIndex", payload: 0 });
    setStep("warmups");
    ctx.renderTakes?.();
  });
  $("recentSongList").addEventListener("click", (event) => {
    const btn = event.target.closest(".recent-song");
    if (!btn) return;
    const song = readLibrary()[Number(btn.dataset.index)];
    if (song) applySong(song, Number(btn.dataset.index));
  });
  $("editSetup").addEventListener("click", () => {
    setStep("setup");
  });
  $("homeStartBottom")?.addEventListener("click", () => {
    setStep("setup");
  });
  for (const btn of document.querySelectorAll(".step[data-step]")) {
    btn.addEventListener("click", () => setStep(btn.dataset.step));
  }
  $("manualToggle").addEventListener("click", () => {
    setManualOpen(!$("manualSetup").classList.contains("open"));
  });
  $("warmupLibrarySelect")?.addEventListener("change", (event) => {
    const url = event.target.value;
    if (!url) return;
    writeWarmupQueue([...readWarmupQueue(), url]);
    event.target.value = "";
  });
  $("warmupQueue")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-warmup-url]");
    if (!row) return;
    const urls = readWarmupQueue();
    const index = urls.indexOf(row.dataset.warmupUrl);
    if (index < 0) return;
    if (event.target.closest("[data-remove-warmup]")) {
      urls.splice(index, 1);
    } else if (event.target.closest("[data-move-up]") && index > 0) {
      [urls[index - 1], urls[index]] = [urls[index], urls[index - 1]];
    } else if (event.target.closest("[data-move-down]") && index < urls.length - 1) {
      [urls[index], urls[index + 1]] = [urls[index + 1], urls[index]];
    } else {
      return;
    }
    writeWarmupQueue(urls);
  });
  $("warmupCustomAdd")?.addEventListener("click", () => {
    const input = $("warmupCustomUrl");
    const url = input?.value.trim();
    if (!url) return;
    writeWarmupQueue([...readWarmupQueue(), url]);
    input.value = "";
  });
  for (const id of fields) {
    $(id)?.addEventListener("input", () => {
      if (id === "warmupLinks") renderWarmupQueue();
      saveSetup({ silent: true });
    });
  }
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => store.dispatch({ type: "setActiveTab", payload: button.dataset.tab }));
  }

  store.subscribe((s) => s.step, renderStages);

  ctx.getSetup = getSetup;
  ctx.saveSetup = saveSetup;
  ctx.saveSetupToLibrary = saveSetupToLibrary;
  ctx.setManualOpen = setManualOpen;
  ctx.clearRecentSongSelection = clearRecentSongSelection;
  ctx.renderRecentSongs = renderRecentSongs;
  ctx.renderWarmupQueue = renderWarmupQueue;

  loadSetup();
  renderWarmupQueue();
  renderRecentSongs();
  renderStages();
}
