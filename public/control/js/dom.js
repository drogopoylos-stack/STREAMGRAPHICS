// Tiny DOM helpers: hyperscript, keyed list reconciliation, misc utilities.

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate', 'multiple', 'readOnly', 'required', 'tabIndex', 'open']);

/** h('div.card.selected', { onclick, title, dataset }, ...children) */
export function h(tag, props, ...kids) {
  const parts = tag.split('.');
  const el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  if (props) setProps(el, props);
  append(el, kids);
  return el;
}

export function setProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = el.className ? `${el.className} ${v}` : v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

/** Replace all children. */
export function setKids(el, ...kids) {
  el.replaceChildren();
  return append(el, kids);
}

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Reconcile `container` children with `items`, reusing nodes by key. A node is rebuilt only
 * when its signature (default JSON of the item) changes — so images do not reload and a
 * focused element stays focused when unrelated data arrives.
 */
export function keyedList(container, items, keyOf, render, sigOf = (x) => JSON.stringify(x)) {
  const old = new Map();
  for (const el of [...container.children]) {
    if (el._key != null) old.set(el._key, el);
    else el.remove();
  }
  let prev = null;
  for (const item of items) {
    const key = keyOf(item);
    const sig = sigOf(item);
    let el = old.get(key);
    if (el) {
      old.delete(key);
      if (el._sig !== sig) {
        const fresh = render(item);
        fresh._key = key;
        fresh._sig = sig;
        restoreFocus(el, fresh);
        el = fresh;
      }
    } else {
      el = render(item);
      el._key = key;
      el._sig = sig;
    }
    const want = prev ? prev.nextSibling : container.firstChild;
    if (el !== want) container.insertBefore(el, want);
    prev = el;
  }
  for (const el of old.values()) el.remove();
}

function restoreFocus(oldEl, fresh) {
  const active = document.activeElement;
  const had = oldEl.contains(active);
  let idx = -1;
  if (had && active !== oldEl) idx = [...oldEl.querySelectorAll(FOCUSABLE)].indexOf(active);
  oldEl.replaceWith(fresh);
  if (!had) return;
  if (idx < 0) fresh.focus?.({ preventScroll: true });
  else fresh.querySelectorAll(FOCUSABLE)[idx]?.focus({ preventScroll: true });
}

export function debounce(fn, ms) {
  let tm = null;
  const d = (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(tm);
  return d;
}

export function isTextTarget(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range', 'file'].includes(el.type);
  return false;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const byId = (list, id) => (id == null ? null : list?.find((x) => x.id === id) ?? null);

/** Get nested value by dotted path. */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Set nested value by dotted path (creates objects). */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  return obj;
}

export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function plural(n, one, many) {
  return n === 1 ? one : many.replace('{n}', n);
}
