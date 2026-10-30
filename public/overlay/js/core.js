// Shared plumbing for the overlay pages: query flags, stage scaling, data, SSE, fonts, auto-fit, readiness.
export const W = 1920;
export const H = 1080;
export const TZ = 'Europe/Athens';

const RESERVED = new Set(['scene', 'static', 'bg', 'mode', 'data']);

/** Parse the page query: scene + params + flags (static, bg, mode, data). */
export function readFlags(search = location.search) {
  const q = new URLSearchParams(search);
  const params = {};
  for (const [k, v] of q) if (!RESERVED.has(k)) params[k] = v;
  const mode = q.get('mode');
  return {
    scene: q.get('scene') || null,
    params,
    static: q.get('static') === '1',
    bg: q.get('bg') !== '0',
    mode: mode === 'simple' || mode === 'full' ? mode : null,
    data: q.get('data') || null, // dev aid: load scene data from a JSON file instead of the API
  };
}

/** Fixed 1920×1080 stage, scaled (letterboxed) to the window when the window is another size. */
export function mountStage() {
  const stage = document.getElementById('stage');
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H) || 1;
    const x = (innerWidth - W * s) / 2;
    const y = (innerHeight - H * s) / 2;
    stage.style.transform = Math.abs(s - 1) < 1e-4 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5
      ? '' : `translate(${x}px, ${y}px) scale(${s})`;
  };
  addEventListener('resize', fit);
  fit();
  return stage;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET /api/scene-data for a scene (or a fixture JSON when ?data= is set). */
export async function fetchSceneData(scene, params = {}, flags = {}) {
  if (flags.data) {
    const r = await fetch(flags.data, { cache: 'no-store' });
    if (!r.ok) throw new Error(`fixture ${flags.data}: HTTP ${r.status}`);
    const d = await r.json();
    if (flags.mode) d.mode = flags.mode;
    return d;
  }
  const qs = new URLSearchParams();
  qs.set('scene', scene);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && !RESERVED.has(k)) qs.set(k, v);
  const mode = flags.mode || (params.mode === 'simple' || params.mode === 'full' ? params.mode : null);
  if (mode) qs.set('mode', mode);
  const r = await fetch(`/api/scene-data?${qs}`, { cache: 'no-store' });
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
  return body;
}

/** Server-Sent Events from /api/live/stream. EventSource reconnects by itself; we reopen if it gives up. */
export function subscribe({ onLive, onState } = {}) {
  let es = null;
  const open = () => {
    es = new EventSource('/api/live/stream');
    es.addEventListener('live', (e) => { try { onLive?.(JSON.parse(e.data)); } catch (err) { console.warn('[overlay] live event', err); } });
    es.addEventListener('state', (e) => { try { onState?.(JSON.parse(e.data || '{}')); } catch (err) { console.warn('[overlay] state event', err); } });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) { es = null; setTimeout(open, 3000); }
    };
  };
  open();
  return () => es?.close();
}

// ---------- theme ----------

function hexToRgb(hex, fallback) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance 0..1 of a hex colour (used to pick readable text on team colours). */
export function luminance(hex) {
  const rgb = hexToRgb(hex, [128, 128, 128]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** CSS custom properties for a theme (hex + "r,g,b" variants for rgba()). */
export function themeVars(theme = {}) {
  const t = {
    primary: theme.primary || '#141414',
    accent: theme.accent || '#c8102e',
    accent2: theme.accent2 || '#f2c230',
    text: theme.text || '#ffffff',
  };
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    out[`--${k}`] = v;
    out[`--${k}-rgb`] = hexToRgb(v, [255, 255, 255]).join(',');
  }
  return out;
}

/** Background plate URL. kind = main | versus | stage. theme.bgImage overrides the main plate. */
export function plateUrl(theme = {}, kind = 'main') {
  if (kind === 'main' && theme.bgImage) return theme.bgImage;
  const preset = theme.preset === 'aegean' ? 'aegean' : (theme.preset || 'sparta');
  return `/brand/${preset}-${kind}.jpg`;
}

// ---------- fonts / fit / readiness ----------

const FACES = [
  '400 20px "Fira Sans Extra Condensed"', '600 20px "Fira Sans Extra Condensed"', '700 20px "Fira Sans Extra Condensed"',
  '800 20px "Fira Sans Extra Condensed"', '900 20px "Fira Sans Extra Condensed"', 'italic 900 20px "Fira Sans Extra Condensed"',
  '400 20px "Fira Sans Condensed"', '500 20px "Fira Sans Condensed"', '600 20px "Fira Sans Condensed"', '700 20px "Fira Sans Condensed"',
  '600 20px "Commissioner Variable"', '800 20px "Commissioner Variable"',
  'italic 600 20px "Noto Serif Display"', '700 20px "Noto Serif Display"', 'italic 800 20px "Noto Serif Display"',
];
const SAMPLE = 'AaZz09ΑαΩωάńŞçÉ';
let fontsOnce = null;

/** Load every face we use (Latin, Latin-ext and Greek subsets), then wait for any pending font. */
export async function loadFonts() {
  fontsOnce ??= Promise.all(FACES.map((f) => document.fonts.load(f, SAMPLE).catch(() => null)));
  await fontsOnce;
  await document.fonts.ready;
}

/**
 * Shrink an element's font-size until its text fits its box.
 * Single line by default (white-space: nowrap); data-lines="2" allows wrapping to N lines.
 * data-wrap="2": stay on one line, but switch to N lines (class fit-wrapped) when that gives a
 * clearly bigger font than squeezing everything onto one line.
 * data-min sets the floor (px). The CSS font-size is the maximum.
 */
export function fitText(el) {
  if (!el.isConnected) return;
  const wrap = Number(el.dataset.wrap || 0);
  if (wrap > 1) { el.classList.remove('fit-wrapped'); delete el.dataset.lines; }
  el.classList.remove('fit-clip');
  el.style.fontSize = '';
  if (!el.clientWidth) return;
  const max = parseFloat(getComputedStyle(el).fontSize);
  const min = parseFloat(el.dataset.min || Math.max(10, max * 0.38));

  let best = solveFit(el, max, min, Number(el.dataset.lines || 1));
  if (wrap > 1 && best.size < max * 0.8) {
    el.classList.add('fit-wrapped');
    el.dataset.lines = String(wrap);
    const wrapped = solveFit(el, max, Math.min(min, best.size), wrap);
    if (wrapped.ok && wrapped.size > best.size * 1.12) {
      best = wrapped;
    } else {
      el.classList.remove('fit-wrapped');
      delete el.dataset.lines;
    }
  }
  el.style.fontSize = best.size === max ? '' : `${best.size}px`;
  if (!best.ok) el.classList.add('fit-clip');
}

/** Number of rendered text lines inside el (distinct line-box tops of its text). */
function lineCount(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const tops = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
  }
  return tops.length || 1;
}

/** Largest font-size in [min, max] at which el fits its box on at most `lines` lines. */
function solveFit(el, max, min, lines) {
  // Multi-line: count rendered lines, and check the line boxes (not scrollHeight - glyph boxes poke
  // out of tight line-heights) fit a fixed-height box. Auto-height boxes always pass the second test.
  const fits = (size) => {
    if (el.scrollWidth > el.clientWidth + 1) return false;
    if (lines <= 1) return true;
    const n = lineCount(el);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || size * 1.2;
    return n <= lines && n * lh <= el.clientHeight + 1;
  };
  el.style.fontSize = '';
  if (fits(max)) return { size: max, ok: true };
  let lo = min;
  let hi = max;
  for (let i = 0; i < 12 && hi - lo > 0.4; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  el.style.fontSize = `${lo}px`;
  return { size: lo, ok: fits(lo) };
}

export function fitAll(root) {
  for (const el of root.querySelectorAll('.fit')) fitText(el);
}

/** Resolve when every <img> under root has decoded or failed (optionally capped by a timeout). */
export function imagesReady(root, timeout = 0) {
  const imgs = [...root.querySelectorAll('img')];
  const all = Promise.all(imgs.map((img) => img.decode().catch(() => null)));
  return timeout ? Promise.race([all, sleep(timeout)]) : all;
}

export function markReady() {
  document.body.dataset.ready = '1';
}

// ---------- dates ----------

/** YYYY-MM-DD of today (+offset days) in the league timezone. */
export function isoDay(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "Σάββατο 12 Σεπτεμβρίου" for a YYYY-MM-DD date (same format as the server's dateLabel). */
export function dayLabel(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('el-GR', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
