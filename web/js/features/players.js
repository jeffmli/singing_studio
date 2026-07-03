// web/js/features/players.js
// YouTube iframe players for warmup + song panes, embed-error fallback via
// /api/alt, and source tabs rendering.
import { byId as $, escapeHtml } from "../core/dom.js";
import { parseYouTubeId } from "./setup.js";

export function initPlayers(store, ctx) {
  const players = { warmup: null, song: null };
  const playerState = {
    warmup: { ready: false, currentId: null, wantId: undefined },
    song: { ready: false, currentId: null, wantId: undefined },
  };
  const SONG_KINDS = ["original", "instrumental", "lyricVideo"];
  const KIND_FIELD = { original: "originalUrl", instrumental: "instrumentalUrl", lyricVideo: "lyricVideoUrl" };
  const triedVideos = { original: new Set(), instrumental: new Set(), lyricVideo: new Set() };

  function makePlayer(which, onError) {
    return new YT.Player(which === "warmup" ? "warmupFrame" : "songFrame", {
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => {
          playerState[which].ready = true;
          if (playerState[which].wantId !== undefined) applyVideo(which, playerState[which].wantId);
        },
        onError,
      },
    });
  }

  function setupPlayers() {
    if (!window.YT || !window.YT.Player || players.song) return;
    players.warmup = makePlayer("warmup", onWarmupError);
    players.song = makePlayer("song", onSongError);
  }

  function applyVideo(which, videoId) {
    const ps = playerState[which];
    const player = players[which];
    if (!player || !ps.ready) { ps.wantId = videoId; return; }
    if (!videoId) {
      if (ps.currentId) { try { player.stopVideo(); } catch (e) {} }
      ps.currentId = null;
      return;
    }
    if (ps.currentId === videoId) return;
    ps.currentId = videoId;
    try { player.cueVideoById(videoId); } catch (e) {}
  }

  function showWarmupVideo(url) {
    const id = parseYouTubeId(url);
    $("warmupPlaceholder").classList.toggle("hidden", Boolean(id));
    applyVideo("warmup", id || "");
  }

  function showSongVideo(kind, url) {
    const id = parseYouTubeId(url);
    $("songPlaceholder").classList.toggle("hidden", Boolean(id));
    store.dispatch({ type: "setCurrentSongKind", payload: kind });
    if (id && triedVideos[kind]) triedVideos[kind].add(id);
    applyVideo("song", id || "");
  }

  function showSongPlaceholder(message) {
    const ph = $("songPlaceholder");
    ph.querySelector("div").innerHTML = `<div class="pi">&#9888;</div>${escapeHtml(message)}`;
    ph.classList.remove("hidden");
    applyVideo("song", "");
  }

  function onWarmupError() {
    $("warmupStatus").textContent = "This warmup video can't be embedded — try Next, or open it on YouTube.";
  }

  async function onSongError(event) {
    const kind = store.get().currentSongKind;
    if (!SONG_KINDS.includes(kind)) return;
    if (playerState.song.currentId) triedVideos[kind].add(playerState.song.currentId);

    const title = ctx.getSetup().songTitle;
    if (!title) { showSongPlaceholder("This video can't be embedded. Paste another link in Setup."); return; }

    ctx.showToast("That video couldn't be embedded — finding another…");
    try {
      const exclude = Array.from(triedVideos[kind]).join(",");
      const res = await fetch(`/api/alt?q=${encodeURIComponent(title)}&kind=${kind}&exclude=${encodeURIComponent(exclude)}`);
      const data = await res.json();
      const alt = data && data.result;
      if (alt && alt.url) {
        $(KIND_FIELD[kind]).value = alt.url;
        ctx.saveSetup({ silent: true });
        playerState.song.currentId = null; // force reload even if ids coincide
        showSongVideo(kind, alt.url);
        ctx.showToast("Switched to another video that plays ✓");
      } else {
        showSongPlaceholder("Couldn't find an embeddable video — paste one in Setup.");
      }
    } catch (e) {
      showSongPlaceholder("Couldn't fetch an alternate video — paste one in Setup.");
    }
  }

  function renderSong() {
    const setup = ctx.getSetup();
    const activeTab = store.get().activeTab;
    $("songHeading").textContent = setup.songTitle ? setup.songTitle : "Song Practice";
    $("lyricsPane").textContent = setup.lyrics || "Paste lyrics in Setup to see them here.";
    for (const button of document.querySelectorAll("[data-tab]")) {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    }

    const showLyrics = activeTab === "lyrics";
    $("videoPane").classList.toggle("hidden", showLyrics);
    $("lyricsPane").classList.toggle("hidden", !showLyrics);

    const videoMap = {
      original: setup.originalUrl,
      instrumental: setup.instrumentalUrl,
      lyricVideo: setup.lyricVideoUrl,
    };
    if (store.get().step === "song" && !showLyrics) {
      showSongVideo(activeTab, videoMap[activeTab] || "");
    } else {
      applyVideo("song", "");
    }
    ctx.renderLyricOverlay?.();
  }

  window.onYouTubeIframeAPIReady = setupPlayers;

  store.subscribe((s) => `${s.step}|${s.activeTab}|${s.setupRev}`, renderSong);

  // Raw song-player probes for the live guide's clock (null when unavailable).
  ctx.songPlayerTime = () => {
    const player = players.song;
    if (player && typeof player.getCurrentTime === "function") {
      try {
        const t = player.getCurrentTime();
        if (Number.isFinite(t) && t > 0) return t;
      } catch (e) {}
    }
    return null;
  };

  ctx.applyVideo = applyVideo;
  ctx.showWarmupVideo = showWarmupVideo;
  ctx.renderSong = renderSong;

  setupPlayers(); // in case the YT API loaded before this script ran

  // Test hook: lets the smoke test simulate an un-embeddable video.
  window.__studioTest = { forceSongError: () => onSongError({ data: 150 }) };
}
