// web/js/main.js
import { createStore } from "./core/store.js";
import { initialState, reducers } from "./core/actions.js";
import { initSetup } from "./features/setup.js";
import { initWarmups } from "./features/warmups.js";
import { initTakes } from "./features/takes.js";
import { initPlayers } from "./features/players.js";
import { initSearch } from "./features/search.js";
import { initRecording } from "./features/recording.js";
import { initAnalysis } from "./features/analysis.js";
import { initHistory } from "./features/history.js";
import { initLiveGuide } from "./features/live-guide.js";
import { initLegacy } from "./app.js";

const store = createStore(initialState, reducers);

// Shared service registry: each feature registers its public functions here so
// cross-feature calls keep working while code migrates out of the legacy app.js.
const ctx = {};

initSetup(store, ctx);
initWarmups(store, ctx);
initTakes(store, ctx);
initPlayers(store, ctx);
initSearch(store, ctx);
initRecording(store, ctx);
initAnalysis(store, ctx);
initHistory(store, ctx);
initLiveGuide(store, ctx);
initLegacy(store, ctx);

// Initial paint for regions the store hasn't ticked yet.
ctx.renderWarmups();
ctx.renderSong();
ctx.refreshMicList(); // populate mic list (labels fill in after first permission grant)
ctx.renderTakes().catch((error) => {
  document.getElementById("takesList").innerHTML =
    `<p class="empty-takes">Could not load takes: ${String(error.message).replace(/[&<>]/g, "")}</p>`;
});
