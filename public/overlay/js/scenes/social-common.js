import { h, fit, svg, plate, leagueLogo, sponsorStrip, teamLogo } from '../ui.js';

export function socialHeader(data, category, title) {
  return h('header', { class: 'so-header' },
    h('div', { class: 'so-mast' }, leagueLogo(data.league, 'so-league-logo'), h('div', { class: 'so-brand' }, fit('so-league-name', data.league.name), h('div', { class: 'so-season' }, data.league.season)), h('span', { class: 'so-category' }, category)),
    h('div', { class: 'so-eyebrow' }, 'THE STAGE IS SET'),
    h('h1', { class: 'so-title' }, title));
}

export function socialBase(data, ctx) {
  if (!ctx.bg) return [];
  return [plate(data.theme, 'social', ctx), h('div', { class: 'so-shade' }), h('div', { class: 'so-grid', 'aria-hidden': 'true' })];
}

export function socialFooter(data, page = '') {
  return h('footer', { class: 'so-footer' }, h('div', { class: 'so-footer-line' }),
    h('div', { class: 'so-footer-row' }, h('span', {}, data.league.short), h('span', { class: 'so-footer-caption' }, page || 'EVERY GAME. EVERY MOMENT.')),
    sponsorStrip(data.sponsors, { max: 3, label: '', cls: 'so-sponsors' }));
}

// ======================================================================================
// SUPER CUP style (settings.socialStyle = 'supercup'). Spec: docs/specs/SOCIAL-SUPERCUP.md.
// Every builder returns DOM made with h(); user text only ever goes in as text nodes.
// Root: .scene.social-sc.fmt-post|fmt-story (styles in css/social-sc.css, all prefixed sx-).
// ======================================================================================

export const isSupercup = (data) => data?.social?.style === 'supercup';
export const sxFormat = (data) => (data?.social?.format === 'post' ? 'post' : 'story');

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_LONG = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/** 'YYYY-MM-DD' → { dow: 'THU', dowLong: 'THURSDAY', dm: '12/11', day: 12, month: 'NOVEMBER' } (no timezone shift). */
export function sxDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { dow: DOW[day], dowLong: DOW_LONG[day], dm: `${d}/${m}`, day: d, month: MONTHS[m - 1] };
}

/** 'Top 4 qualifying matches' → 'TOP 4 QUALIFYING'. */
export const sxRoundName = (name) => String(name ?? '').replace(/\s*matches\s*$/i, '').trim().toUpperCase();
export const sxBestOf = (n) => (Number(n) ? `BEST OF ${Number(n)}` : '');
export const sxJoin = (...bits) => bits.filter(Boolean).join(' · ');
export const sxTag = (team) => String(team?.tag || team?.name || 'TBD').toUpperCase();
export const teamRef = (team) => (team?.id && !team.placeholder ? `team:${team.id}` : null);
export const matchRef = (item) => (item?.id ? `match:${item.id}` : null);

/** The contract's match item, or one built from the older match/teamA/teamB fields. */
export function sxItem(data) {
  if (data.item) return data.item;
  const m = data.match;
  if (!m) return null;
  return { id: m.id, code: m.bracketCode || m.code || null, date: m.date ?? null, time: m.time ?? null, bestOf: m.bestOf ?? null, status: m.status ?? null, scoreA: m.scoreA ?? null, scoreB: m.scoreB ?? null, winnerId: m.winnerId ?? null, cast: m.streamWithCast ?? null, round: null, teamA: data.teamA ?? null, teamB: data.teamB ?? null };
}
export const hasResult = (item) => item?.status === 'done' && item.scoreA != null && item.scoreB != null;
export function winnerSide(item) {
  if (!hasResult(item)) return null;
  if (item.winnerId && item.winnerId === item.teamA?.id) return 'a';
  if (item.winnerId && item.winnerId === item.teamB?.id) return 'b';
  const a = Number(item.scoreA), b = Number(item.scoreB);
  return a > b ? 'a' : b > a ? 'b' : null;
}
/** Round title + kicker of a match: 'SECOND ROUND' / 'TOP 4 QUALIFYING · BEST OF 3'. */
export function sxRoundText(item, extra = '') {
  const round = item?.round;
  return {
    title: round?.title || 'MATCH DAY',
    kicker: sxJoin(sxRoundName(round?.name), extra || sxBestOf(item?.bestOf)),
  };
}

// ---------- icons ----------
const ICON_TWITCH = '<svg class="sx-twitch-glyph" viewBox="0 0 2400 2800" aria-hidden="true"><path class="g" d="M500 0 0 500v1800h600v500l500-500h400l900-900V0z"/><path class="n" d="M2200 1300l-400 400h-400l-350 350v-350H600V200h1600z"/><path class="g" d="M1700 550h200v600h-200zM1150 550h200v600h-200z"/></svg>';
const ICON_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>';
const ICON_MIC_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-2a5 5 0 0 1-.68 2.5l1.46 1.46A6.96 6.96 0 0 0 19 11zM15 11V5a3 3 0 0 0-5.94-.6L15 10.34zM4.27 3 3 4.27l6 6V11a3 3 0 0 0 4.47 2.6l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.9 6.9 0 0 0 3.02-1.15L19.73 21 21 19.73z"/></svg>';

/** Angular VS mark: white face over a gold extrusion; width = 2.25 × height. */
export function sxVs(height) {
  const V = 'M0 0H32L52 62L72 0H104L68 100H36Z';
  const S = 'M14 0H96V24H28V38H82L96 52V86L82 100H0V76H68V62H14L0 48V14Z';
  const g = (cls, dx, dy) => `<g class="${cls}" transform="translate(${30 + dx} ${5 + dy}) skewX(-14)"><path d="${V}"/><path transform="translate(112 0)" d="${S}"/></g>`;
  return svg(`<svg class="sx-vs" width="${Math.round(height * 2.25)}" height="${height}" viewBox="0 0 250 112" role="img" aria-label="VS">${g('ex', 7, 6)}${g('fg', 0, 0)}</svg>`);
}

/** Cast badge: gold W/ CAST, outlined NO CAST, nothing when unknown. */
export function sxCast(cast, large = false) {
  if (cast == null) return null;
  return h('span', { class: `sx-cast ${cast ? 'is-on' : 'is-off'}${large ? ' is-lg' : ''}` }, svg(cast ? ICON_MIC : ICON_MIC_OFF), h('span', { class: 'sx-cast-t' }, cast ? 'W/ CAST' : 'NO CAST'));
}

// ---------- team logos: equal optical size (spec 4.3) ----------
const METRICS = new Map();

/** Trimmed box, aspect, ink density and mean luminance of a decoded logo (null when unreadable). */
function analyse(img) {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const k = Math.min(1, 512 / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k)), hh = Math.max(1, Math.round(nh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = hh;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, hh);
  let px;
  try { px = g.getImageData(0, 0, w, hh).data; } catch { return null; }
  let x0 = w, y0 = hh, x1 = -1, y1 = -1, ink = 0, lum = 0, n = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = px[i + 3];
      if (a <= 2) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      ink += a / 255;
      if (a > 127) { lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; n++; }
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  return { nw, nh, box: { x: x0 / k, y: y0 / k, w: bw / k, h: bh / k }, aspect: bw / bh, density: ink / (bw * bh), luminance: n ? lum / n : 0.6 };
}

/** Size the trimmed logo inside its square box S: 'optical' = same "effective ink area" for every logo, 'contain' = fill the box. */
function placeLogo(wrap, img, size, m, mode = 'optical') {
  const K = 0.55, a = m.aspect, d = Math.sqrt(Math.max(m.density, 0.12));
  let hgt = size * Math.sqrt(K / (a * d)), wid = a * hgt;
  if (mode === 'contain') { hgt = a >= 1 ? size / a : size; wid = a * hgt; }
  if (hgt > size) { hgt = size; wid = a * hgt; }
  if (wid > size * 1.15) { wid = size * 1.15; hgt = wid / a; }
  const k = wid / m.box.w;
  Object.assign(img.style, {
    width: `${(m.nw * k).toFixed(1)}px`, height: `${(m.nh * k).toFixed(1)}px`,
    left: `${((size - wid) / 2 - m.box.x * k).toFixed(1)}px`, top: `${((size - hgt) / 2 - m.box.y * k).toFixed(1)}px`,
  });
  wrap.classList.add('is-measured');
  wrap.classList.toggle('is-dark', m.luminance < 0.3);
}

function measureLogo(wrap, img, size, mode) {
  return new Promise((resolve) => {
    const done = () => {
      const key = img.currentSrc || img.src;
      if (!METRICS.has(key)) METRICS.set(key, analyse(img));
      const m = METRICS.get(key);
      if (m) placeLogo(wrap, img, size, m, mode);
      resolve();
    };
    if (img.complete && img.naturalWidth) { done(); return; }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

/** Team logo in a square box (dashed "?" for a place without a team). */
export function sxLogo(team, size, ctx, cls = '') {
  const box = { width: `${size}px`, height: `${size}px` };
  if (!team || team.placeholder) return h('div', { class: `sx-logo is-tbd ${cls}`, style: { ...box, fontSize: `${Math.round(size * 0.42)}px` } }, '?');
  const wrap = teamLogo(team, `sx-logo ${cls}`);
  Object.assign(wrap.style, box);
  const img = wrap.querySelector('img');
  if (img) {
    const wait = measureLogo(wrap, img, size);
    ctx?.waits?.push(wait);
  }
  return wrap;
}

/** Big faded team logo behind the roster table (trimmed, fills its square). */
export function sxGhost(team, size, ctx) {
  if (!team?.logo) return null;
  const img = h('img', { src: team.logo, alt: '', draggable: 'false' });
  const wrap = h('div', { class: 'sx-ghost', 'aria-hidden': 'true' }, img);
  img.addEventListener('error', () => wrap.remove(), { once: true });
  ctx?.waits?.push(measureLogo(wrap, img, size, 'contain'));
  return wrap;
}

/** Big chamfered logo plate (poster, result, live). side 'a' | 'b' mirrors the chamfers; state 'win' | 'lose'. */
export function sxPlate(team, size, ctx, { side = 'a', state = '' } = {}) {
  return h('div', { class: `sx-plate ${side} ${state ? `is-${state}` : ''}`, style: { width: `${size}px`, height: `${size}px`, '--ch': `${Math.round(size * 0.1)}px` } },
    sxLogo(team, Math.round(size * 0.74), ctx));
}

// ---------- frame: plate + ornaments + content column ----------

function ornaments(fmt) {
  const H = fmt === 'post' ? 1350 : 1920;
  const hair = (x, y, len, op) => h('div', { class: 'sx-hair', style: { left: `${x}px`, top: `${y}px`, width: `${len}px`, opacity: op } });
  return h('div', { class: 'sx-orn', 'aria-hidden': 'true' },
    h('div', { class: 'sx-wedge tl' }), h('div', { class: 'sx-wedge br' }),
    hair(-40, 250, 380, 0.85), hair(30, 300, 260, 0.5), hair(840, H + 40, 380, 0.85), hair(900, H - 10, 260, 0.5));
}

/** Scene root. Background on: plate (photo + veil, motion) and the gold ornaments; off: transparent. */
export function sxRoot(data, ctx, cls, props, ...kids) {
  const fmt = sxFormat(data);
  return h('div', { ...props, class: `social-sc fmt-${fmt} ${cls}${data.social?.logo ? ' has-logo-img' : ''}` },
    ctx.bg ? plate(data.theme, 'social', { ...ctx, format: fmt }) : null,
    ctx.bg ? ornaments(fmt) : null,
    h('div', { class: 'sx-in' }, ...kids));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 16));

/**
 * Safety net: the body is designed to fit, but if unforeseen content (a very tall logo, more lanes) is taller
 * than the room between header and footer, scale it down around its centre instead of running into the
 * footer or the story safe zones. Static exports wait for it (ctx.waits).
 */
function keepInside(main, box, ctx) {
  let observer = null;
  const measure = () => {
    if (!main.isConnected) { observer?.disconnect(); return; }
    const room = main.clientHeight, need = box.offsetHeight;
    box.style.transform = need > room + 1 && room > 0 ? `scale(${(room / need).toFixed(4)})` : '';
  };
  const settle = (async () => {
    for (let i = 0; i < 300 && !main.isConnected; i++) await tick();
    if (!main.isConnected) return;
    await document.fonts?.ready;
    await Promise.all([...box.querySelectorAll('img')].map((img) => img.decode().catch(() => null)));
    await tick();
    measure();
    if (main.isConnected && typeof ResizeObserver === 'function') { observer = new ResizeObserver(measure); observer.observe(box); }
  })();
  ctx?.waits?.push(settle);
}

/** Main area between header and footer; its content is centred and kept inside (see keepInside). */
export function sxMain(ctx, ...kids) {
  const box = h('div', { class: 'sx-fit' }, ...kids);
  const main = h('main', { class: 'sx-main' }, box);
  keepInside(main, box, ctx);
  return main;
}

// ---------- header: ONE swappable logo element ----------

function typeLock(data, compact) {
  const s = data.social || {};
  const title = s.title || String(data.league?.name || '').toUpperCase();
  const words = [s.year ? h('div', { class: 'sx-year' }, s.year) : null, h('div', { class: 'sx-title fit' }, title)];
  const mark = h('img', { class: 'sx-mark', src: s.lettermark || '/brand/hll-lettermark-white.png', alt: '', draggable: 'false' });
  return h('div', { class: 'sx-lock is-type' }, mark, compact ? h('div', { class: 'sx-stack' }, words) : words);
}

/** size: full | mid | compact. The lockup is data.social.logo (one image) or the typed HLL mark + year + title. */
export function sxHeader(data, { size = 'full', round = '', kicker = '' } = {}) {
  const logo = data.social?.logo;
  let lock;
  if (logo) {
    const img = h('img', { class: 'sx-lock-img', src: logo, alt: '', draggable: 'false' });
    lock = h('div', { class: 'sx-lock is-image' }, img);
    img.addEventListener('error', () => lock.replaceWith(typeLock(data, size === 'compact')), { once: true });
  } else {
    lock = typeLock(data, size === 'compact');
  }
  return h('header', { class: `sx-head is-${size}` }, lock,
    round ? h('div', { class: 'sx-round fit' }, round) : null,
    kicker ? h('div', { class: 'sx-kicker fit' }, kicker) : null);
}

// ---------- footer: sponsor line + Twitch ----------

export function sxSponsors(data) {
  const list = (data.sponsors || []).filter((s) => s.logo);
  if (!list.length) return null;
  list.sort((a, b) => (a.tier === 'main' ? 0 : 1) - (b.tier === 'main' ? 0 : 1));
  return h('div', { class: 'sx-sponsor' }, h('span', { class: 'sx-sponsor-label' }, 'POWERED BY'),
    h('div', { class: 'sx-sponsor-logos' }, list.slice(0, 3).map((s) => {
      const img = h('img', { src: s.logo, alt: s.name || '', draggable: 'false' });
      img.addEventListener('error', () => img.replaceWith(h('span', { class: 'sx-sponsor-name' }, s.name || '')), { once: true });
      return h('div', { class: 'spons-item sx-sponsor-logo', 'data-ref': s.id ? `sponsor:${s.id}` : null }, img);
    })));
}

export function sxTwitch(data, cls = '') {
  return h('div', { class: `sx-twitch ${cls}` }, svg(ICON_TWITCH), h('span', { class: 'sx-twitch-url' }, data.social?.twitch || 'twitch.tv/HellenicLegends'));
}

export function sxFooter(data) {
  return h('footer', { class: 'sx-foot' }, sxSponsors(data), sxTwitch(data));
}
