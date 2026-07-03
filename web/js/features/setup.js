// web/js/features/setup.js
// Setup form: field persistence to localStorage, stage/stepper rendering,
// tab + step navigation, manual-section toggle, recent-songs library.
// Owns "singing-practice-setup-v1" and "singing-song-library-v1".
import { byId as $ } from "../core/dom.js";
import { upsertSong } from "../lib/song-library.js";

const setupKey = "singing-practice-setup-v1";
const libraryKey = "singing-song-library-v1";
const fields = ["songTitle", "warmupLinks", "originalUrl", "instrumentalUrl", "lyricVideoUrl", "lyricsInput"];
const defaultPracticeGoal = "Improve pitch";

function valueOf(id) {
  return $(id)?.value ?? "";
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
  function getSetup() {
    return {
      songTitle: valueOf("songTitle").trim(),
      warmups: valueOf("warmupLinks").split(/\n+/).map((line) => line.trim()).filter(Boolean),
      originalUrl: valueOf("originalUrl").trim(),
      instrumentalUrl: valueOf("instrumentalUrl").trim(),
      lyricVideoUrl: valueOf("lyricVideoUrl").trim(),
      lyrics: valueOf("lyricsInput").trim(),
      syncedLyrics: valueOf("syncedLyricsData"),
      practiceGoal: valueOf("practiceGoal") || defaultPracticeGoal,
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
    $("warmupLinks").value = (saved.warmups || []).join("\n");
    $("originalUrl").value = saved.originalUrl || "";
    $("instrumentalUrl").value = saved.instrumentalUrl || "";
    $("lyricVideoUrl").value = saved.lyricVideoUrl || "";
    $("lyricsInput").value = saved.lyrics || "";
    $("syncedLyricsData").value = saved.syncedLyrics || "";
    setPracticeGoal(saved.practiceGoal || defaultPracticeGoal, { silent: true });
  }

  function readLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(libraryKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function applySong(song) {
    $("songTitle").value = song.songTitle || "";
    $("originalUrl").value = song.originalUrl || "";
    $("instrumentalUrl").value = song.instrumentalUrl || "";
    $("lyricVideoUrl").value = song.lyricVideoUrl || "";
    $("lyricsInput").value = song.lyrics || "";
    $("syncedLyricsData").value = song.syncedLyrics || "";
    setPracticeGoal(song.practiceGoal || defaultPracticeGoal, { silent: true });
    if (Array.isArray(song.warmups) && song.warmups.length) {
      $("warmupLinks").value = song.warmups.join("\n");
    }
    saveSetup({ silent: true });
  }

  function renderRecentSongs() {
    const library = readLibrary();
    $("recentSongs").hidden = !library.length;
    const list = $("recentSongList");
    list.innerHTML = "";
    library.forEach((song, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recent-song";
      btn.dataset.index = String(index);
      btn.innerHTML = `<span class="rs-title"></span><span class="rs-meta"></span>`;
      btn.querySelector(".rs-title").textContent = song.songTitle || "Untitled song";
      btn.querySelector(".rs-meta").textContent = song.savedAt
        ? new Date(song.savedAt).toLocaleDateString([], { dateStyle: "medium" })
        : "";
      list.appendChild(btn);
    });
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

  function setPracticeGoal(goal, { silent = false } = {}) {
    const next = goal || defaultPracticeGoal;
    if ($("practiceGoal")) $("practiceGoal").value = next;
    for (const button of document.querySelectorAll("[data-practice-goal]")) {
      button.classList.toggle("active", button.dataset.practiceGoal === next);
    }
    if (!silent) saveSetup({ silent: true });
  }

  $("startSession").addEventListener("click", () => {
    saveSetup({ silent: true });
    const snapshot = getSetup();
    localStorage.setItem(libraryKey, JSON.stringify(upsertSong(readLibrary(), snapshot)));
    renderRecentSongs();
    ctx.startNewSession?.();
    store.dispatch({ type: "setWarmupIndex", payload: 0 });
    setStep("warmups");
    ctx.renderTakes?.();
  });
  $("recentSongList").addEventListener("click", (event) => {
    const btn = event.target.closest(".recent-song");
    if (!btn) return;
    const song = readLibrary()[Number(btn.dataset.index)];
    if (song) applySong(song);
  });
  $("editSetup").addEventListener("click", () => setStep("setup"));
  $("homeStartBottom")?.addEventListener("click", () => setStep("setup"));
  for (const btn of document.querySelectorAll(".step[data-step]")) {
    btn.addEventListener("click", () => setStep(btn.dataset.step));
  }
  $("manualToggle").addEventListener("click", () => {
    setManualOpen(!$("manualSetup").classList.contains("open"));
  });
  for (const id of fields) {
    $(id)?.addEventListener("input", () => saveSetup({ silent: true }));
  }
  for (const button of document.querySelectorAll("[data-practice-goal]")) {
    button.addEventListener("click", () => setPracticeGoal(button.dataset.practiceGoal));
  }
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => store.dispatch({ type: "setActiveTab", payload: button.dataset.tab }));
  }

  store.subscribe((s) => s.step, renderStages);

  ctx.getSetup = getSetup;
  ctx.saveSetup = saveSetup;
  ctx.setManualOpen = setManualOpen;
  ctx.renderRecentSongs = renderRecentSongs;

  loadSetup();
  renderRecentSongs();
  renderStages();
}
