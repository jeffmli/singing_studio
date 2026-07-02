// web/js/main.js
import { createStore } from "./core/store.js";
import { initialState, reducers } from "./core/actions.js";
import { initLegacy } from "./app.js";

const store = createStore(initialState, reducers);
initLegacy(store);
