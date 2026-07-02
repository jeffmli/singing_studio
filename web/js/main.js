// web/js/main.js
import { createStore } from "./core/store.js";
import { initialState, reducers } from "./core/actions.js";
import { initSetup } from "./features/setup.js";
import { initLegacy } from "./app.js";

const store = createStore(initialState, reducers);

// Shared service registry: each feature registers its public functions here so
// cross-feature calls keep working while code migrates out of the legacy app.js.
const ctx = {};

initSetup(store, ctx);
initLegacy(store, ctx);
