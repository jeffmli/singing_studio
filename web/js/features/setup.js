// web/js/features/setup.js
// Setup form: field persistence to localStorage, stage/stepper rendering,
// tab + step navigation, manual-section toggle. Owns "singing-practice-setup-v1".
import { byId as $ } from "../core/dom.js";

const setupKey = "singing-practice-setup-v1";
const fields = ["songTitle", "warmupLinks", "originalUrl", "instrumentalUrl", "lyricVideoUrl", "lyricsInput", "phraseFocus"];

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
      songTitle: $("songTitle").value.trim(),
      warmups: $("warmupLinks").value.split(/\n+/).map((line) => line.trim()).filter(Boolean),
      originalUrl: $("originalUrl").value.trim(),
      instrumentalUrl: $("instrumentalUrl").value.trim(),
      lyricVideoUrl: $("lyricVideoUrl").value.trim(),
      lyrics: $("lyricsInput").value.trim(),
      syncedLyrics: $("syncedLyricsData").value || "",
      phraseFocus: $("phraseFocus").value.trim(),
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
      phraseFocus: "",
    };
    const saved = JSON.parse(localStorage.getItem(setupKey) || "null") || fallback;
    $("songTitle").value = saved.songTitle || "";
    $("warmupLinks").value = (saved.warmups || []).join("\n");
    $("originalUrl").value = saved.originalUrl || "";
    $("instrumentalUrl").value = saved.instrumentalUrl || "";
    $("lyricVideoUrl").value = saved.lyricVideoUrl || "";
    $("lyricsInput").value = saved.lyrics || "";
    $("syncedLyricsData").value = saved.syncedLyrics || "";
    $("phraseFocus").value = saved.phraseFocus || "";
  }

  function setStep(step) {
    store.dispatch({ type: "setStep", payload: step });
  }

  function renderStages() {
    const step = store.get().step;
    const map = { setup: "stageSetup", warmups: "stageWarmups", song: "stageSong" };
    for (const [key, id] of Object.entries(map)) {
      $(id).classList.toggle("active", step === key);
    }
    // Stepper state
    const order = ["setup", "warmups", "song"];
    const current = order.indexOf(step);
    [["stepSetup", 0], ["stepWarmups", 1], ["stepSong", 2]].forEach(([id, idx]) => {
      const el = $(id);
      el.classList.toggle("current", idx === current);
      el.classList.toggle("done", idx < current);
    });
    // Body mode for transport bar visibility
    document.body.classList.toggle("on-setup", step === "setup");
    document.body.classList.toggle("on-warmups", step === "warmups");
    document.body.classList.toggle("on-sing", step === "song");
  }

  function setManualOpen(open) {
    $("manualSetup").classList.toggle("open", open);
    $("manualToggle").setAttribute("aria-expanded", String(open));
  }

  $("saveSetup").addEventListener("click", () => saveSetup());
  $("startSession").addEventListener("click", () => {
    saveSetup({ silent: true });
    ctx.startNewSession?.();
    store.dispatch({ type: "setWarmupIndex", payload: 0 });
    setStep("warmups");
    ctx.renderTakes?.();
  });
  $("editSetup").addEventListener("click", () => setStep("setup"));
  for (const btn of document.querySelectorAll(".step[data-step]")) {
    btn.addEventListener("click", () => setStep(btn.dataset.step));
  }
  $("manualToggle").addEventListener("click", () => {
    setManualOpen(!$("manualSetup").classList.contains("open"));
  });
  for (const id of fields) {
    $(id).addEventListener("input", () => saveSetup({ silent: true }));
  }
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => store.dispatch({ type: "setActiveTab", payload: button.dataset.tab }));
  }

  store.subscribe((s) => s.step, renderStages);

  ctx.getSetup = getSetup;
  ctx.saveSetup = saveSetup;
  ctx.setManualOpen = setManualOpen;

  loadSetup();
  renderStages();
}
