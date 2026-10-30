// Reusable UI pieces: toasts, confirm dialog, drawer editor, form controls, searchable combo,
// image boxes on a checkerboard, drop zones, job progress views.
import { h, append, setKids, norm, getPath, setPath, copyText } from './dom.js';
import { icon } from './icons.js';
import { t } from './strings.js';
import { getJob, watchJob } from './jobs.js';

/* ------------------------------------------------------------------ toasts */

let toastHost = null;
export function toast(message, type = 'ok', { timeout } = {}) {
  toastHost ??= document.getElementById('toasts');
  const el = h(`div.toast.toast-${type}`, { role: type === 'error' ? 'alert' : 'status' },
    icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check', 16),
    h('div.toast-msg', message),
    h('button.toast-x', { type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, icon('x', 14)));
  toastHost.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const ms = timeout ?? (type === 'error' ? 8000 : 3200);
  let tm = setTimeout(close, ms);
  el.addEventListener('mouseenter', () => clearTimeout(tm));
  el.addEventListener('mouseleave', () => { tm = setTimeout(close, 2000); });
  function close() {
    clearTimeout(tm);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 200);
  }
  // keep the stack short
  while (toastHost.children.length > 5) toastHost.firstChild.remove();
  return close;
}

export const toastError = (e) => toast(e?.message ?? String(e ?? t('common.unknownError')), 'error');

/** Run an async write; toast success / the server error. Returns the result or undefined. */
export async function act(fn, okMessage) {
  try {
    const r = await fn();
    if (okMessage) toast(typeof okMessage === 'function' ? okMessage(r) : okMessage, 'ok');
    return r;
  } catch (e) {
    toastError(e);
    return undefined;
  }
}

/** Disable a button + show a spinner while `fn` runs. */
export async function busy(btn, fn) {
  if (btn.disabled) return undefined;
  btn.disabled = true;
  btn.classList.add('is-busy');
  try { return await fn(); } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
  }
}

/* ------------------------------------------------------------- confirm */

export function confirmDialog({ title, body = '', ok = t('common.delete'), cancel = t('common.cancel'), danger = true } = {}) {
  return new Promise((resolve) => {
    const okBtn = h(`button.btn.${danger ? 'btn-danger-solid' : 'btn-primary'}`, { type: 'button', value: 'ok' }, ok);
    const cancelBtn = h('button.btn', { type: 'button', value: 'cancel' }, cancel);
    const dlg = h('dialog.dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2.dialog-title', { id: 'dlg-title' }, title),
      body ? h('p.dialog-body', body) : null,
      h('div.dialog-actions', cancelBtn, okBtn));
    let result = false;
    okBtn.onclick = () => { result = true; dlg.close(); };
    cancelBtn.onclick = () => dlg.close();
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(dlg);
    dlg.showModal();
    cancelBtn.focus();
  });
}

export const isDialogOpen = () => !!document.querySelector('dialog[open]');

/* ------------------------------------------------------------- drawer */

let drawer = null; // { key, isDirty, onSave, onState, el }

export function drawerState() { return drawer; }

/**
 * Open the side editor. Content is built once per open and is never re-rendered by data
 * refreshes — `onState(state)` lets the caller update non-input parts (images, counts).
 */
export async function openDrawer({ key, title, subtitle, body, footer, isDirty, onSave, onState, onClose }) {
  if (drawer && drawer.key === key) { focusFirst(); return true; }
  if (!(await closeDrawer())) return false;
  const host = document.getElementById('drawer');
  const closeBtn = h('button.btn.btn-icon.btn-ghost', { type: 'button', 'aria-label': t('common.close'), title: `${t('common.close')} (Esc)`, onclick: () => closeDrawer() }, icon('x'));
  setKids(host,
    h('header.drawer-head',
      h('div.drawer-titles', h('h2.drawer-title', title), subtitle ? h('div.drawer-sub', subtitle) : null),
      closeBtn),
    h('div.drawer-body', body),
    footer ? h('footer.drawer-foot', footer) : null);
  host.hidden = false;
  host.setAttribute('aria-label', typeof title === 'string' ? title : '');
  document.body.classList.add('drawer-open');
  drawer = { key, isDirty: isDirty ?? (() => false), onSave, onState, onClose, el: host };
  requestAnimationFrame(() => host.classList.add('open'));
  focusFirst();
  return true;
}

function focusFirst() {
  const host = document.getElementById('drawer');
  const first = host.querySelector('.drawer-body input:not([type=hidden]):not([type=file]), .drawer-body select, .drawer-body textarea');
  (first ?? host.querySelector('button'))?.focus({ preventScroll: true });
}

/** Close the drawer (asks first when there are unsaved edits). Resolves false if kept open. */
export async function closeDrawer({ force = false } = {}) {
  if (!drawer) return true;
  if (!force && drawer.isDirty()) {
    const ok = await confirmDialog({ title: t('common.discardQ'), body: t('common.discardBody'), ok: t('common.discard'), cancel: t('common.keepEditing') });
    if (!ok) return false;
  }
  const host = drawer.el;
  const cb = drawer.onClose;
  drawer = null;
  host.classList.remove('open');
  document.body.classList.remove('drawer-open');
  host.hidden = true;
  host.replaceChildren();
  cb?.();
  return true;
}

export function drawerSave() { drawer?.onSave?.(); }
export function drawerOnState(state) { drawer?.onState?.(state); }

/* -------------------------------------------------------- form controls */
// Every control: { el, get(), set(v), focusEl? }

let uid = 0;
export const nextId = (p = 'f') => `${p}${++uid}`;

export function ctlText({ value = '', placeholder = '', maxlength, list, type = 'text', mono = false, autocomplete = 'off', upper = false } = {}) {
  const el = h(`input.input${mono ? '.mono' : ''}`, { type, placeholder, maxlength, list, autocomplete, spellcheck: 'false' });
  el.value = value ?? '';
  if (upper) el.addEventListener('input', () => { const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p); });
  return { el, focusEl: el, get: () => el.value.trim(), set: (v) => { el.value = v ?? ''; } };
}

export function ctlTextarea({ value = '', placeholder = '', rows = 4, mono = true } = {}) {
  const el = h(`textarea.input.textarea${mono ? '.mono' : ''}`, { rows, placeholder, spellcheck: 'false' });
  el.value = value ?? '';
  return { el, focusEl: el, get: () => el.value, set: (v) => { el.value = v ?? ''; } };
}

export function ctlNumber({ value = null, min, max, step = 1, allowEmpty = false, placeholder = '' } = {}) {
  const el = h('input.input.num', { type: 'number', min, max, step, placeholder });
  el.value = value ?? '';
  return {
    el, focusEl: el,
    get() {
      if (el.value === '') return allowEmpty ? null : Number(min ?? 0);
      const n = Number(el.value);
      return Number.isFinite(n) ? n : (allowEmpty ? null : 0);
    },
    set(v) { el.value = v ?? ''; },
  };
}

/** options: [{ value, label, group? }] — groups become <optgroup>. Values are strings; null ↔ ''. */
export function ctlSelect({ options = [], value = '' } = {}) {
  const el = h('select.input.select');
  fillSelect(el, options);
  const ctl = {
    el, focusEl: el,
    get: () => (el.value === '' ? null : el.value),
    set(v) { el.value = v ?? ''; },
    setOptions(opts) { const cur = el.value; fillSelect(el, opts); el.value = cur; if (el.selectedIndex < 0) el.selectedIndex = 0; },
  };
  ctl.set(value);
  if (el.selectedIndex < 0 && el.options.length) el.selectedIndex = 0;
  return ctl;
}

export function fillSelect(el, options) {
  el.replaceChildren();
  let group = null;
  let groupName = undefined;
  for (const o of options) {
    const opt = h('option', { value: o.value ?? '' }, o.label);
    if (o.disabled) opt.disabled = true;
    if (o.group != null) {
      if (o.group !== groupName) { group = h('optgroup', { label: o.group }); el.append(group); groupName = o.group; }
      group.append(opt);
    } else {
      groupName = undefined;
      el.append(opt);
    }
  }
}

export function ctlColor({ value = '#000000' } = {}) {
  const picker = h('input.color-swatch', { type: 'color', 'aria-label': 'colour picker' });
  const hex = h('input.input.mono.color-hex', { type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': 'hex' });
  const el = h('div.color-field', picker, hex);
  const valid = (v) => /^#[0-9a-f]{6}$/i.test(v);
  const set = (v) => { v = valid(v ?? '') ? v.toLowerCase() : '#000000'; picker.value = v; hex.value = v; };
  picker.addEventListener('input', () => { hex.value = picker.value; });
  hex.addEventListener('input', () => {
    let v = hex.value.trim();
    if (v && v[0] !== '#') v = `#${v}`;
    if (valid(v)) picker.value = v.toLowerCase();
  });
  hex.addEventListener('blur', () => { hex.value = picker.value; });
  set(value);
  return { el, focusEl: hex, get: () => picker.value.toLowerCase(), set };
}

export function ctlToggle({ value = false, label = '', hint = '' } = {}) {
  const input = h('input.switch-input', { type: 'checkbox', role: 'switch' });
  input.checked = !!value;
  const el = h('label.switch', input, h('span.switch-track', h('span.switch-thumb')),
    label ? h('span.switch-text', h('span.switch-label', label), hint ? h('span.switch-hint', hint) : null) : null);
  return { el, focusEl: input, input, get: () => input.checked, set: (v) => { input.checked = !!v; } };
}

export function ctlCheck({ value = false, label = '' } = {}) {
  const input = h('input.check-input', { type: 'checkbox' });
  input.checked = !!value;
  const el = h('label.check', input, h('span.check-box', icon('check', 12)), h('span', label));
  return { el, focusEl: input, input, get: () => input.checked, set: (v) => { input.checked = !!v; } };
}

/** Segmented buttons (radio group). options: [{ value, label }] */
export function ctlSegmented({ options = [], value = null, size = '' } = {}) {
  let cur = value;
  const el = h(`div.seg${size ? `.seg-${size}` : ''}`, { role: 'radiogroup' });
  const btns = options.map((o) => {
    const b = h('button.seg-btn', { type: 'button', role: 'radio', title: o.title }, o.label);
    b.addEventListener('click', () => { if (cur === o.value) return; cur = o.value; paint(); el.dispatchEvent(new Event('change', { bubbles: true })); });
    b.addEventListener('keydown', (e) => {
      const i = options.indexOf(o);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = btns[(i + d + btns.length) % btns.length];
      n.focus();
      n.click();
    });
    b._value = o.value;
    return b;
  });
  append(el, btns);
  function paint() {
    for (const b of btns) {
      const on = b._value === cur;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on || (cur == null && b === btns[0]) ? 0 : -1;
    }
  }
  paint();
  return { el, focusEl: btns[0], get: () => cur, set: (v) => { cur = v; paint(); } };
}

export function ctlRange({ value = 0, min = 0, max = 1, step = 0.05, fmt = (v) => v.toFixed(2) } = {}) {
  const input = h('input.range', { type: 'range', min, max, step });
  input.value = value;
  const out = h('output.range-out', fmt(Number(value)));
  input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); });
  const el = h('div.range-field', input, out);
  return { el, focusEl: input, get: () => Number(input.value), set: (v) => { input.value = v; out.textContent = fmt(Number(v)); } };
}

/** A labelled field wrapper. */
export function field(label, ctl, { hint, span, id, inline } = {}) {
  const fid = id ?? nextId();
  const target = ctl.focusEl ?? ctl.el;
  if (target && !target.id) target.id = fid;
  const isGroup = ctl.el.classList.contains('seg') || ctl.el.classList.contains('switch') || ctl.el.classList.contains('check');
  const lab = label
    ? (isGroup ? h('div.field-label', { id: `${fid}-l` }, label) : h('label.field-label', { for: target?.id ?? fid }, label))
    : null;
  if (isGroup && label) ctl.el.setAttribute('aria-labelledby', `${fid}-l`);
  return h(`div.field${span ? `.span-${span}` : ''}${inline ? '.field-inline' : ''}`, lab, ctl.el, hint ? h('div.field-hint', hint) : null);
}

/**
 * Small form model with dotted names. values() → nested object; dirty() compares with the
 * snapshot taken at reset().
 */
export function createForm() {
  const ctls = new Map();
  let snap = '{}';
  const form = {
    ctls,
    add(name, ctl) { ctls.set(name, ctl); return ctl; },
    flat() { const o = {}; for (const [k, c] of ctls) o[k] = c.get(); return o; },
    values() { const o = {}; for (const [k, c] of ctls) setPath(o, k, c.get()); return o; },
    fill(obj) { for (const [k, c] of ctls) c.set(getPath(obj, k)); },
    snapshot() { snap = JSON.stringify(form.flat()); },
    dirty() { return JSON.stringify(form.flat()) !== snap; },
    /** Nested object of only the changed fields. */
    changed() {
      const before = JSON.parse(snap);
      const now = form.flat();
      const out = {};
      for (const [k, v] of Object.entries(now)) if (JSON.stringify(v) !== JSON.stringify(before[k])) setPath(out, k, v);
      return out;
    },
    hasFocus() { for (const c of ctls.values()) if (c.el.contains(document.activeElement)) return true; return false; },
  };
  return form;
}

/* ----------------------------------------------------- searchable combo */

/**
 * Searchable single-select. options: [{ value, label, sub?, group?, img?, search? }]
 * Keyboard: Enter/Space/↓ opens, type to filter, ↑↓ move, Enter picks, Esc closes.
 */
export function ctlCombo({ options = [], value = null, placeholder = t('common.selectPlaceholder'), searchPlaceholder = t('common.search'), allowNone = false, noneLabel = t('common.none'), onChange } = {}) {
  let opts = options;
  let cur = value;
  let pop = null;
  let active = 0;
  let shown = [];
  const btnLabel = h('span.combo-label');
  const btn = h('button.input.combo-btn', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, btnLabel, icon('down', 16, 'combo-caret'));
  const el = h('div.combo', btn);

  function paintBtn() {
    const o = opts.find((x) => x.value === cur);
    setKids(btnLabel,
      o?.img !== undefined ? thumb(o.img, 'combo-thumb') : null,
      o ? h('span.combo-text', h('span.combo-main', o.label), o.sub ? h('span.combo-sub', o.sub) : null) : h('span.combo-ph', cur == null && allowNone ? noneLabel : placeholder));
  }

  function open() {
    if (pop) return;
    const search = h('input.input.combo-search', { type: 'text', placeholder: searchPlaceholder, 'aria-label': searchPlaceholder, autocomplete: 'off', spellcheck: 'false' });
    const list = h('ul.combo-list', { role: 'listbox', tabIndex: -1 });
    pop = h('div.combo-pop', search, list);
    document.body.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    const render = () => {
      const q = norm(search.value).trim();
      const all = allowNone ? [{ value: null, label: noneLabel }, ...opts] : opts;
      shown = q ? all.filter((o) => norm(`${o.label} ${o.sub ?? ''} ${o.group ?? ''} ${o.search ?? ''}`).includes(q)) : all;
      active = Math.max(0, shown.findIndex((o) => o.value === cur));
      list.replaceChildren();
      let g;
      shown.forEach((o, i) => {
        if (o.group && o.group !== g) { g = o.group; list.append(h('li.combo-group', { role: 'presentation' }, o.group)); }
        const li = h('li.combo-opt', { role: 'option', 'aria-selected': o.value === cur ? 'true' : 'false', dataset: { i } },
          o.img !== undefined ? thumb(o.img, 'combo-thumb') : null,
          h('span.combo-text', h('span.combo-main', o.label), o.sub ? h('span.combo-sub', o.sub) : null));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
        li.addEventListener('mousemove', () => { if (active !== i) { active = i; paintActive(); } });
        list.append(li);
      });
      if (!shown.length) list.append(h('li.combo-empty', t('common.noResults')));
      paintActive(true);
    };
    const paintActive = (scroll) => {
      for (const li of list.querySelectorAll('.combo-opt')) {
        const on = Number(li.dataset.i) === active;
        li.classList.toggle('active', on);
        if (on && scroll !== false) li.scrollIntoView({ block: 'nearest' });
      }
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); paintActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (shown[active]) pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') { close(false); }
    });
    search.addEventListener('blur', () => setTimeout(() => { if (pop && !pop.contains(document.activeElement)) close(false); }, 120));
    place();
    render();
    search.focus();
    window.addEventListener('resize', close0);
    document.addEventListener('scroll', place, true);
  }
  const close0 = () => close(false);
  function place() {
    if (!pop) return;
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const hgt = Math.min(360, Math.max(below, r.top) - 16);
    pop.style.left = `${Math.round(r.left)}px`;
    pop.style.width = `${Math.round(Math.max(r.width, 260))}px`;
    pop.style.maxHeight = `${Math.round(hgt)}px`;
    if (below < 240 && r.top > below) { pop.style.top = ''; pop.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`; }
    else { pop.style.bottom = ''; pop.style.top = `${Math.round(r.bottom + 4)}px`; }
  }
  function close(refocus) {
    if (!pop) return;
    pop.remove();
    pop = null;
    btn.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', close0);
    document.removeEventListener('scroll', place, true);
    if (refocus) btn.focus();
  }
  function pick(i) {
    const o = shown[i];
    close(true);
    if (!o || o.value === cur) return;
    cur = o.value;
    paintBtn();
    el.dispatchEvent(new Event('change', { bubbles: true }));
    onChange?.(cur);
  }
  btn.addEventListener('click', () => (pop ? close(true) : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      open();
      const s = pop?.querySelector('.combo-search');
      if (s) { s.value = e.key; s.dispatchEvent(new Event('input')); e.preventDefault(); }
    }
  });
  paintBtn();
  return {
    el, focusEl: btn,
    get: () => cur,
    set(v) { cur = v ?? null; paintBtn(); },
    setOptions(o) { opts = o; paintBtn(); },
  };
}

/* ----------------------------------------------------------- images */

/** Small rounded thumbnail on a checkerboard (src null → placeholder). */
export function thumb(src, cls = '') {
  return h(`span.thumb.checker${cls ? `.${cls}` : ''}`, src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : icon('image', 14));
}

/** Image box with fixed aspect ratio on a checkerboard so cut-outs can be judged. */
export function imgBox(src, { ratio = '1 / 1', fit = 'contain', label = t('common.noImage'), cls = '', lazy = false } = {}) {
  const img = h('img', { alt: '', decoding: 'async', draggable: 'false', loading: lazy ? 'lazy' : 'eager' });
  const empty = h('div.imgbox-empty', icon('image', 22), h('span', label));
  const el = h(`div.imgbox.checker${cls ? `.${cls}` : ''}`, { style: { aspectRatio: ratio } }, img, empty);
  img.style.objectFit = fit;
  const set = (s) => {
    if (s) { if (img.getAttribute('src') !== s) img.src = s; img.hidden = false; empty.hidden = true; }
    else { img.removeAttribute('src'); img.hidden = true; empty.hidden = false; }
  };
  img.addEventListener('error', () => { img.hidden = true; empty.hidden = false; });
  img.addEventListener('load', () => { img.hidden = false; empty.hidden = true; });
  set(src);
  el.setSrc = set;
  return el;
}

/** Make `el` accept dropped image files. Returns a function that opens the file chooser. */
export function droppable(el, onFile, { accept = 'image/*' } = {}) {
  const input = h('input', { type: 'file', accept, hidden: true, tabIndex: -1 });
  input.addEventListener('change', () => { const f = input.files?.[0]; input.value = ''; if (f) onFile(f); });
  el.append(input);
  let depth = 0;
  el.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.classList.add('drag-over'); });
  el.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('drag-over'); });
  el.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    el.classList.remove('drag-over');
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg|bmp|tiff?)$/i.test(x.name));
    if (f) onFile(f);
  });
  return () => input.click();
}

const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

/** Drop zone: image preview + "drop or click" + busy overlay. */
export function dropZone({ src = null, ratio = '1 / 1', fit = 'contain', onFile, disabled = false, disabledText = t('common.saveFirst'), cls = '' }) {
  const box = imgBox(src, { ratio, fit });
  const overlay = h('div.drop-overlay', icon('upload', 22), h('span.drop-text', t('common.dropImage')), h('span.drop-sub', t('common.dropHint')));
  const busyEl = h('div.drop-busy', { hidden: true }, h('span.spinner'), h('span', t('common.uploading')));
  const el = h(`div.dropzone${cls ? `.${cls}` : ''}`, { tabIndex: disabled ? -1 : 0, role: 'button', 'aria-label': t('common.dropImage') }, box, overlay, busyEl);
  if (disabled) {
    el.classList.add('is-disabled');
    overlay.replaceChildren(icon('info', 20), h('span.drop-text', disabledText));
    el.setSrc = box.setSrc;
    return el;
  }
  const run = async (file) => {
    busyEl.hidden = false;
    el.classList.add('is-busy');
    try { await onFile(file); } finally { busyEl.hidden = true; el.classList.remove('is-busy'); }
  };
  const choose = droppable(el, run);
  el.addEventListener('click', (e) => { if (!el.classList.contains('is-busy') && e.target.tagName !== 'INPUT') choose(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(); } });
  el.setSrc = box.setSrc;
  return el;
}

/* ------------------------------------------------------------- jobs */

const JOB_KIND = (k) => t(`jobs.kinds.${k}`) === `jobs.kinds.${k}` ? k : t(`jobs.kinds.${k}`);
export const jobKindLabel = JOB_KIND;

/** Live progress view for a job id: bar, message, last log lines, result. */
export function jobView(id, { formatResult, lines = 6, compact = false } = {}) {
  const bar = h('div.progress-bar');
  const status = h('span.job-status');
  const msg = h('div.job-msg');
  const log = h('pre.job-log', { hidden: compact });
  const result = h('div.job-result');
  const el = h(`div.job${compact ? '.job-compact' : ''}`,
    h('div.job-head', h('span.job-kind'), status),
    h('div.progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar),
    msg, log, result);
  const kindEl = el.querySelector('.job-kind');
  const paint = (job) => {
    if (!job) return;
    const pct = Math.round((job.progress ?? 0) * 100);
    kindEl.textContent = JOB_KIND(job.kind);
    el.dataset.status = job.status;
    status.textContent = job.status === 'running' ? `${t('jobs.statusRunning')} · ${pct}%` : job.status === 'done' ? t('jobs.statusDone') : t('jobs.statusError');
    bar.style.width = `${job.status === 'done' ? 100 : pct}%`;
    el.querySelector('.progress').setAttribute('aria-valuenow', String(pct));
    msg.textContent = job.message ?? '';
    if (!compact) {
      const l = (job.log ?? []).slice(-lines);
      log.textContent = l.join('\n');
      log.hidden = !l.length;
    }
    result.replaceChildren();
    if (job.status === 'done' && formatResult && job.result != null) append(result, [formatResult(job.result)]);
  };
  paint(getJob(id));
  const off = watchJob(id, (job) => {
    if (!el.isConnected && el._seen) { off(); return; }
    if (el.isConnected) el._seen = true;
    paint(job);
  });
  return el;
}

/* ------------------------------------------------------------- misc */

export function emptyState({ iconName = 'info', title, body, action } = {}) {
  return h('div.empty', icon(iconName, 28), h('div.empty-title', title), body ? h('div.empty-body', body) : null, action ?? null);
}

export function btn(label, { kind = '', iconName, onclick, title, size = '', type = 'button', disabled, kbd } = {}) {
  return h(`button.btn${kind ? `.btn-${kind}` : ''}${size ? `.btn-${size}` : ''}`, { type, onclick, title, disabled },
    iconName ? icon(iconName, size === 'sm' ? 14 : 16) : null, label ? h('span', label) : null, kbd ? h('kbd', kbd) : null);
}

export function iconBtn(name, label, onclick, { kind = 'ghost', size = '' } = {}) {
  return h(`button.btn.btn-icon.btn-${kind}${size ? `.btn-${size}` : ''}`, { type: 'button', 'aria-label': label, title: label, onclick }, icon(name, size === 'sm' ? 14 : 16));
}

/** Read-only URL/path with a Copy button. */
export function copyField(value, { open = false } = {}) {
  const input = h('input.input.mono.copy-input', { type: 'text', readOnly: true, 'aria-label': value });
  input.value = value;
  input.addEventListener('focus', () => input.select());
  const copyBtn = btn(t('common.copy'), { iconName: 'copy', size: 'sm' });
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(input.value);
    if (ok) {
      copyBtn.classList.add('is-copied');
      copyBtn.querySelector('span:not(.ico)').textContent = t('common.copied');
      setTimeout(() => { copyBtn.classList.remove('is-copied'); copyBtn.querySelector('span:not(.ico)').textContent = t('common.copy'); }, 1400);
    } else toast(t('common.copyFail'), 'error');
  });
  const el = h('div.copy-field', input, copyBtn,
    open ? h('a.btn.btn-sm.btn-ghost', { href: value, target: '_blank', rel: 'noopener' }, icon('external', 14), h('span', t('help.open'))) : null);
  el.setValue = (v) => { input.value = v; el.querySelector('a')?.setAttribute('href', v); };
  return el;
}

export function sectionHead(title, sub, ...actions) {
  const subEl = h('p.section-sub', sub ?? '');
  const el = h('header.section-head', h('div.section-titles', h('h1.section-title', title), subEl), h('div.section-actions', actions));
  el.setSub = (s) => { subEl.textContent = s; };
  return el;
}

export function panel(title, ...kids) {
  return h('section.panel', title ? h('h2.panel-title', title) : null, kids);
}

export function badge(text, kind = '', title) {
  return h(`span.badge${kind ? `.badge-${kind}` : ''}`, { title }, text);
}

/** Team logo chip: small logo + tag. */
export function teamChip(team, { size = 'sm', name = false } = {}) {
  if (!team) return h('span.team-chip.is-tbd', thumb(null, `logo-${size}`), h('span', t('common.tbd')));
  return h('span.team-chip', { title: team.name }, thumb(team.logo, `logo-${size}`), h('span.team-chip-tag', name ? team.name : team.tag || team.name));
}
