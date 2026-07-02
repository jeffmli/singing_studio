// web/js/core/dom.js
// Tiny DOM helpers: escaping, a tagged-template html builder, and mount/list
// helpers. No virtual DOM — components render markup then update surgically.
const RAW = Symbol("raw");

export function raw(str) { return { [RAW]: String(str) }; }

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export function escapeAttr(value) { return escapeHtml(value); }

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (v && typeof v === "object" && RAW in v) ? v[RAW] : escapeHtml(v);
    out += strings[i + 1];
  }
  return out;
}

export function byId(id) { return document.getElementById(id); }

export function mount(el, htmlString) { if (el) el.innerHTML = htmlString; return el; }

export function renderList(el, items, renderItem) {
  if (el) el.innerHTML = items.map(renderItem).join("");
  return el;
}
