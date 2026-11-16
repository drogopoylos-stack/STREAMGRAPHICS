// DOM builder + broadcast components shared by all scenes.
import { luminance, plateUrl } from './core.js';
import { iconSvg } from '../../shared/icon-sets.js';

/**
 * h('div', { class, style: {...}, in: 'up', d: 300, ...attrs }, ...children)
 * `in` / `d` / `dur` map to data-in / data-d / data-dur (entrance animation type, delay, duration).
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (val == null) continue;
        if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val;
      }
    } else if (k === 'html') el.innerHTML = v;
    else if (k === 'in') el.dataset.in = v;
    else if (k === 'd') el.dataset.d = String(Math.round(v));
    else if (k === 'dur') el.dataset.dur = String(Math.round(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c.nodeType ? c : String(c));
  }
  return el;
}

/** Parse an SVG string into an element. */
export function svg(str, cls) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  return el;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Text that shrinks to fit its box (see core.fitText). */
export function fit(cls, text, props = {}) {
  return h('div', { ...props, class: `fit ${cls}` }, text ?? '');
}

// ---------- plates ----------

export function plate(theme, kind, ctx, extra = '') {
  if (!ctx.bg) return null;
  const url = plateUrl(theme, kind, ctx);
  const el = h('div', { class: `plate plate-${kind} ${extra}`, in: 'plate', d: 0, dur: 900 },
    h('div', { class: 'plate-img', style: { backgroundImage: `url("${url}")` } }),
    h('div', { class: 'plate-shade' }));
  if (ctx.bgMotion && ctx.bgMotion !== 'none') {
    const time = { slow: 1.5, normal: 1, fast: .75 }[ctx.bgSpeed] ?? 1;
    const intensity = { subtle: .6, normal: 1, strong: 1.35 };
    el.dataset.bga = ctx.bgMotion;
    el.dataset.bgaLevel = intensity[ctx.bgIntensity] ? ctx.bgIntensity : 'normal';
    if (['main', 'social'].includes(kind) && url.startsWith('/brand/')) el.dataset.framed = '';
    el.classList.toggle('bga-force', !!ctx.bgForce);
    el.style.setProperty('--bga-t', `${-((Date.now() % (48000 * time)) / 1000).toFixed(3)}s`);
    el.style.setProperty('--bga-time', String(time));
    el.style.setProperty('--bga-k', String(intensity[ctx.bgIntensity] ?? 1));
    el.append(h('div', { class: 'bga-fx', 'aria-hidden': 'true' }, ctx.bgMotion === 'embers' ? Array.from({ length: 32 }, () => h('i')) : []));
  }
  return el;
}

// ---------- team logo / monogram ----------

export function initials(text, n = 2) {
  const s = String(text || '').trim();
  if (!s) return '?';
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, n).map((w) => [...w][0]).join('').toUpperCase();
  return [...s].slice(0, n).join('').toUpperCase();
}

function teamMonogram(team) {
  const col = team?.colors?.primary || '#c8102e';
  const light = luminance(col) > 0.45;
  const fill = col;
  const ink = light ? '#141414' : '#ffffff';
  const text = (team?.tag || initials(team?.name, 3) || '?').slice(0, 5).toUpperCase();
  const len = [...text].length;
  const fs = len <= 2 ? 40 : len === 3 ? 33 : len === 4 ? 26 : 21;
  const el = svg(`<svg viewBox="0 0 100 100" class="mono" aria-label="${esc(text)}">
    <path d="M50 4 L90 16 V50 C90 72 72 88 50 96 C28 88 10 72 10 50 V16 Z" fill="${esc(fill)}" />
    <path d="M50 10 L84 20.5 V50 C84 69 69 83 50 90 C31 83 16 69 16 50 V20.5 Z" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1.6" />
    <text x="50" y="${52 + fs * 0.35}" text-anchor="middle" font-family="Fira Sans Extra Condensed, sans-serif" font-weight="900" font-size="${fs}" fill="${ink}" letter-spacing="1">${esc(text)}</text>
  </svg>`);
  // A place with no team yet ("TBD", "Winner 1-1"); a real team without a logo keeps its tag.
  if (!team || team.placeholder) el.dataset.iconSlot = 'Team';
  return el;
}

/** Team logo (transparent square PNG) or a shield monogram in the team colour. */
export function teamLogo(team, cls = '', props = {}) {
  const wrap = h('div', { ...props, class: `tlogo ${cls}`, 'data-ref': team?.id && !team.placeholder ? `team:${team.id}` : null });
  if (team?.logo) {
    const img = h('img', { src: team.logo, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(teamMonogram(team)), { once: true });
    wrap.append(img);
  } else {
    wrap.append(teamMonogram(team));
  }
  return wrap;
}

/** Shield circle (hoplite aspis) behind a logo: rings + inner glow. */
export function crest(team, cls = '', props = {}) {
  return h('div', { ...props, class: `crest ${cls}`, 'data-ref': team?.id && !team.placeholder ? `team:${team.id}` : null },
    h('div', { class: 'crest-ring' }),
    teamLogo(team, 'crest-logo'));
}

// ---------- players ----------

let silSeq = 0;
function silhouette(p) {
  const mono = esc(initials(p?.nick || p?.name, 2));
  const gid = `silg${++silSeq}`;
  return svg(`<svg viewBox="0 0 800 1000" class="ph-sil" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/></linearGradient></defs>
    <circle cx="400" cy="250" r="165" fill="url(#${gid})"/>
    <path d="M90 1000 C95 720 230 560 400 560 C570 560 705 720 710 1000 Z" fill="url(#${gid})"/>
    <text x="400" y="860" text-anchor="middle" font-family="Fira Sans Extra Condensed, sans-serif" font-weight="900" font-size="190" fill="#fff" fill-opacity=".22" letter-spacing="6">${mono}</text>
  </svg>`);
}

/** Cut-out player photo, or a silhouette placeholder with the nick monogram. */
export function playerPhoto(p, cls = '', props = {}) {
  const wrap = h('div', { ...props, class: `pphoto ${cls}`, 'data-ref': p?.id ? `player:${p.id}` : null });
  if (p?.photo) {
    const img = h('img', { src: p.photo, alt: '', draggable: 'false' });
    img.addEventListener('error', () => { img.replaceWith(silhouette(p)); wrap.classList.add('is-sil'); }, { once: true });
    wrap.append(img);
  } else {
    wrap.classList.add('is-sil');
    wrap.append(silhouette(p));
  }
  return wrap;
}

// ---------- role glyphs (24×24, currentColor) ----------

const ROLE_SLOTS = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach'];

/** A role icon of the Classic set. The Graphics designer swaps it by its slot (graphic-design.js). */
export function roleIcon(role, cls = 'role-ic') {
  const slot = ROLE_SLOTS.includes(role) ? role : 'Player';
  const el = svg(iconSvg('classic', slot), cls);
  el.dataset.iconSlot = slot;
  return el;
}

export function roleLabel(role) {
  return { Top: 'Top', Jungle: 'Jungle', Mid: 'Mid', Bot: 'Bot', Support: 'Support', Coach: 'Coach' }[role] || 'Player';
}

export function flagBadge(code, cls = '') {
  if (!code || !/^[a-z]{2}$/i.test(code)) return null;
  return h('span', { class: `flag ${cls}` }, code.toUpperCase());
}

// ---------- ornaments ----------

/** Thin Greek-key (meander) band. */
export function meander(cls = '', props = {}) {
  return h('div', { ...props, class: `meander ${cls}` });
}

/** Laurel branch (left by default; side 'r' mirrors it). */
export function laurel(side = 'l', cls = '') {
  const leaves = [];
  const cx = 60;
  const cy = 60;
  const r = 46;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const deg = 104 + (140 * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const tangent = deg + 90; // direction of travel (towards the tip)
    const s = 1 - i * 0.06;
    leaves.push(`<ellipse cx="0" cy="-9" rx="${(3.6 * s).toFixed(2)}" ry="${(9.5 * s).toFixed(2)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(tangent - 90 - 38).toFixed(1)})"/>`);
    leaves.push(`<ellipse cx="0" cy="-9" rx="${(3.6 * s).toFixed(2)}" ry="${(9.5 * s).toFixed(2)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(tangent - 90 + 38).toFixed(1)})" opacity=".8"/>`);
  }
  const a0 = (104 * Math.PI) / 180;
  const a1 = (244 * Math.PI) / 180;
  const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
  const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
  const stem = `<path d="M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${r} ${r} 0 0 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
  const flip = side === 'r' ? ' transform="translate(120 0) scale(-1 1)"' : '';
  return svg(`<svg viewBox="0 0 120 120" class="laurel ${side === 'r' ? 'laurel-r' : 'laurel-l'} ${cls}" fill="currentColor" aria-hidden="true"><g${flip}>${stem}${leaves.join('')}</g></svg>`);
}

/** League badge (the HLL card logo). */
export function leagueLogo(league, cls = '', props = {}) {
  const wrap = h('div', { ...props, class: `league-logo ${cls}` });
  const src = league?.logo || '/brand/hll-logo.png';
  const img = h('img', { src, alt: '', draggable: 'false' });
  if (src === '/brand/tournament.svg') img.dataset.iconSlot = 'Emblem';
  img.addEventListener('error', () => img.replaceWith(h('div', { class: 'league-mono' }, league?.short || 'HLL')), { once: true });
  wrap.append(img);
  return wrap;
}

/** Slim sponsor strip (main tier first). Returns null when there are no sponsors. */
export function sponsorStrip(sponsors, { label = 'Partners', max = 6, cls = '', ...props } = {}) {
  const list = (sponsors || []).filter((s) => s.logo);
  if (!list.length) return null;
  list.sort((a, b) => (a.tier === 'main' ? 0 : 1) - (b.tier === 'main' ? 0 : 1));
  return h('div', { ...props, class: `spons ${cls}` },
    label ? h('div', { class: 'spons-label' }, label) : null,
    h('div', { class: 'spons-logos' }, list.slice(0, max).map((s) => {
      const img = h('img', { src: s.logo, alt: s.name || '', draggable: 'false' });
      img.addEventListener('error', () => img.replaceWith(h('span', { class: 'spons-name' }, s.name || '')), { once: true });
      return h('div', { class: `spons-item ${s.tier === 'main' ? 'is-main' : ''}`, 'data-ref': s.id ? `sponsor:${s.id}` : null }, img);
    })));
}

// ---------- match helpers ----------

export function recordText(rec) {
  if (!rec || (rec.w == null && rec.l == null)) return '';
  return `${rec.w ?? 0}W – ${rec.l ?? 0}L`;
}

export function boText(bestOf) {
  const n = Number(bestOf);
  return n ? `BO${n}` : '';
}

export function hasScore(m) {
  return (m?.status === 'done' || m?.status === 'live') && m.scoreA != null && m.scoreB != null;
}

export function statusBadge(status, cls = '') {
  if (status === 'live') return h('span', { class: `badge badge-live ${cls}` }, h('i', { class: 'dot' }), 'LIVE');
  if (status === 'done') return h('span', { class: `badge badge-final ${cls}` }, 'FINAL');
  return null;
}

/** Score block "3 – 1" (winner bright, loser dimmed). */
export function scoreBlock(m, cls = '') {
  const a = Number(m.scoreA);
  const b = Number(m.scoreB);
  const done = m.status === 'done';
  return h('div', { class: `score ${cls}` },
    h('span', { class: `sc sc-a ${done && a < b ? 'lose' : ''}` }, String(a)),
    h('span', { class: 'sc-sep' }),
    h('span', { class: `sc sc-b ${done && b < a ? 'lose' : ''}` }, String(b)));
}

/** "Split 3 - Playoffs" → kept as is; null-safe. */
export function stageText(m) {
  return String(m?.stage || '').trim();
}
