// web/js/core/store.js
// Minimal reactive store: single state tree, pure reducers, selector subscriptions.
export function createStore(initialState, reducers = {}) {
  let state = initialState;
  const subs = [];  // { selector, fn, last }

  function get() { return state; }

  function dispatch(action) {
    const reducer = reducers[action.type];
    if (!reducer) throw new Error(`Unknown action: ${action.type}`);
    state = reducer(state, action.payload);
    for (const sub of subs) {
      const next = sub.selector(state);
      if (next !== sub.last) { const prev = sub.last; sub.last = next; sub.fn(next, prev); }
    }
  }

  function subscribe(selector = (s) => s, fn) {
    const sub = { selector, fn, last: selector(state) };
    subs.push(sub);
    return function unsubscribe() {
      const i = subs.indexOf(sub);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  return { get, dispatch, subscribe };
}
