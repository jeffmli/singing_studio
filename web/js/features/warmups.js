// web/js/features/warmups.js
// Warm-up stage: exercise status line, progress dots, prev/next/finish nav.
// Reads warmup links from the saved setup; video embedding stays with players.
import { byId as $ } from "../core/dom.js";

export function initWarmups(store, ctx) {
  function renderWarmups() {
    const setup = ctx.getSetup();
    const total = setup.warmups.length;
    const wi = Math.min(store.get().warmupIndex, Math.max(0, total - 1));
    $("warmupStatus").textContent = total
      ? `Exercise ${wi + 1} of ${total} — take your time.`
      : "Add warmup videos in Setup to begin.";

    const dots = $("warmupDots");
    dots.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const d = document.createElement("span");
      d.className = "wd" + (i === wi ? " on" : i < wi ? " done" : "");
      dots.appendChild(d);
    }

    if (store.get().step === "warmups") {
      ctx.showWarmupVideo(setup.warmups[wi] || "");
    } else {
      ctx.applyVideo("warmup", "");
    }
    $("prevWarmup").disabled = wi <= 0;
    $("nextWarmup").disabled = wi >= total - 1;
  }

  $("prevWarmup").addEventListener("click", () => {
    store.dispatch({ type: "setWarmupIndex", payload: Math.max(0, store.get().warmupIndex - 1) });
  });
  $("nextWarmup").addEventListener("click", () => {
    const total = ctx.getSetup().warmups.length;
    store.dispatch({ type: "setWarmupIndex", payload: Math.min(Math.max(0, total - 1), store.get().warmupIndex + 1) });
  });
  $("finishWarmups").addEventListener("click", () => store.dispatch({ type: "setStep", payload: "song" }));

  store.subscribe((s) => `${s.step}|${s.setupRev}|${s.warmupIndex}`, renderWarmups);

  ctx.renderWarmups = renderWarmups;
}
