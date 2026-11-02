// LIVE: scene picker, Preview / Program monitors, Take / Hide, PNG export, score control.
import { h, setKids, keyedList, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtDate } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { toast, toastError, busy, btn, thumb, ctlSelect, ctlSegmented, ctlText, copyField, field, emptyState, confirmDialog } from '../ui.js';
import { quickCards, sceneUrl, cueText, describe, sameCue, cleanParams, matchOptions } from '../scenes.js';
import { sceneBuilder } from '../builder.js';
import { MASTER_URL } from '../../../shared/scenes.js';

let cue = null; // { scene, params }
let els = null;
let builder = null;
let scoreMatchId = null; // null → follow state.nextMatch
let lastExport = null;
let goto = () => {};

export const id = 'live';

export function mount(root, nav) {
  goto = nav;
  const preview = monitor('preview');
  const program = monitor('program');
  const takeBtn = h('button.btn.btn-take', { type: 'button', onclick: () => take(), title: `${t('live.take')} (Enter)` }, icon('play', 18), h('span', t('live.take')), h('kbd', t('live.takeHint')));
  const exportBtn = btn(t('live.exportPng'), { iconName: 'image' });
  exportBtn.addEventListener('click', () => exportPng(exportBtn));
  const exportInfo = h('div.export-info');
  setKids(preview.foot, h('div.foot-left', exportBtn, exportInfo), takeBtn);

  const hideBtn = h('button.btn.btn-hide', { type: 'button', onclick: () => hide(), title: `${t('live.hide')} (Esc)` }, icon('eyeOff', 16), h('span', t('live.hide')), h('kbd', t('live.hideHint')));
  const showBtn = btn(t('live.showAgain'), { iconName: 'eye', onclick: () => showAgain() });
  const reloadBtn = h('button.btn.btn-icon.btn-ghost', { type: 'button', title: t('live.reload'), 'aria-label': t('live.reload'), onclick: () => { program.frames[0].src = MASTER_URL; } }, icon('refresh', 16));
  setKids(program.foot, h('div.foot-left', reloadBtn, showBtn), hideBtn);
  program.frames[0].src = MASTER_URL;

  const groups = {
    saved: pickerGroup(t('live.groupSaved')),
    match: pickerGroup(t('live.groupMatch')),
    rosters: pickerGroup(t('live.groupRosters')),
    matchups: pickerGroup(t('live.groupMatchups')),
    other: pickerGroup(t('live.groupOther')),
    social: pickerGroup(t('live.groupSocial')),
  };
  const picker = h('div.picker', { 'aria-label': 'Scenes' }, Object.values(groups).map((g) => g.el));
  picker.addEventListener('keydown', onPickerKey);

  builder = sceneBuilder({ onChange: (c) => setCue(c, { fromBuilder: true }) });
  const graphicName = ctlText({ placeholder: t('live.graphicName'), maxlength: 100 });
  const saveBtn = btn(t('live.saveGraphic'), { iconName: 'plus' });
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    if (!cue) return;
    try {
      await api.post('/api/graphics', { name: graphicName.get() || cueText(cue.scene, cue.params), ...cue });
      graphicName.set(''); store.refresh(); toast(t('live.graphicSaved'), 'ok');
    } catch (error) { toastError(error); }
  }));
  const builderPanel = h('section.panel.builder-panel', h('h2.panel-title', t('live.builder')), h('p.panel-sub', t('live.builderHint')), builder.el, field(t('live.graphicName'), graphicName), saveBtn);
  const search = h('input.input', { type: 'search', placeholder: t('live.searchGraphics'), 'aria-label': t('live.searchGraphics') });
  const category = ctlSelect({ options: [{ value: '', label: t('live.allGraphics') }, ...Object.keys(groups).map(key => ({ value: key, label: ({ saved: t('live.groupSaved'), match: t('live.groupMatch'), rosters: t('live.groupRosters'), matchups: t('live.groupMatchups'), other: t('live.groupOther'), social: t('live.groupSocial') })[key] }))] });
  const count = h('span.field-hint');
  search.addEventListener('input', () => update(store.state));
  category.el.addEventListener('change', () => update(store.state));

  const score = scorePanel();

  const keys = h('p.live-keys', icon('key', 14), t('live.keys'));
  root.append(h('div.live',
    h('section.panel.master-panel', h('div', h('h1.panel-title', t('live.masterTitle')), h('p.panel-sub', t('live.masterHint'))), copyField(`${location.origin}${MASTER_URL}`, { open: true }), h('span.master-size', 'OBS / vMix · 1920 × 1080')),
    h('div.monitors', preview.el, program.el),
    h('div.dashboard-toolbar', h('h2.panel-title', t('live.dashboardTitle')), search, category.el, count),
    h('div.live-lower',
      h('div.live-picker', picker, keys),
      h('aside.live-side', score.el, builderPanel))));

  els = { preview, program, takeBtn, exportBtn, exportInfo, hideBtn, showBtn, groups, picker, score, search, category, count };
  for (const m of [preview, program]) new ResizeObserver(() => fit(m)).observe(m.screen);
  if (store.live?.scene) setCue({ scene: store.live.scene, params: store.live.params });
  else paintPreview();
  update(store.state);
  onLive(store.live);
}

/* ----------------------------------------------------------- monitors */

function monitor(kind) {
  const label = h('span.mon-label', kind === 'preview' ? t('live.preview') : t('live.program'));
  const status = h('span.mon-status');
  const screen = h('div.screen.checker');
  const frames = (kind === 'preview' ? [0, 1] : [0]).map((i) => {
    const f = h('iframe.screen-frame', { title: `${label.textContent} ${i}`, tabIndex: -1, 'aria-hidden': 'true', scrolling: 'no' });
    if (i === 0) f.classList.add('front');
    screen.append(f);
    return f;
  });
  const empty = h('div.screen-empty', icon(kind === 'preview' ? 'layers' : 'live', 26), h('span', kind === 'preview' ? t('live.previewEmpty') : t('live.programOff')));
  screen.append(empty);
  const foot = h('div.mon-foot');
  const el = h(`section.monitor.mon-${kind}`, h('header.mon-head', label, status), screen, foot);
  return { el, screen, frames, empty, foot, status, label, token: 0 };
}

function fit(m) {
  const w = m.screen.clientWidth;
  m.screen.style.setProperty('--s', String(w / 1920));
}

/** Double-buffered load: the new page loads in the hidden frame, then swaps in. */
function loadPreview(url) {
  const m = els.preview;
  const [a, b] = m.frames;
  const front = a.classList.contains('front') ? a : b;
  const back = front === a ? b : a;
  const token = ++m.token;
  if (!url) {
    front.removeAttribute('src');
    back.removeAttribute('src');
    m.empty.hidden = false;
    return;
  }
  m.empty.hidden = true;
  back.onload = () => {
    if (token !== m.token) return;
    back.classList.add('front');
    front.classList.remove('front');
  };
  back.src = url;
}

/* ----------------------------------------------------------- cue / take */

export function setCue(c, { fromBuilder = false } = {}) {
  cue = c?.scene ? { scene: c.scene, params: cleanParams(c.params) } : null;
  if (!fromBuilder && cue) builder?.set(cue);
  paintPreview();
  paintFlags();
}

/** Called by other pages ("Preview in Live"). */
export function cueAndShow(scene, params) {
  setCue({ scene, params });
  goto('live');
}

function paintPreview() {
  if (!els) return;
  const m = els.preview;
  if (!cue) {
    setKids(m.status, h('span.mon-hint', t('live.nothingCued')));
    loadPreview(null);
    els.takeBtn.disabled = true;
    els.exportBtn.disabled = true;
    return;
  }
  const d = describe(cue.scene, cue.params);
  setKids(m.status, h('strong', d.title), d.detail ? h('span.mon-detail', d.detail) : null);
  loadPreview(sceneUrl(cue.scene, cue.params, { static: 1 }));
  els.takeBtn.disabled = false;
  els.exportBtn.disabled = false;
}

export async function take() {
  if (!cue) return;
  els.takeBtn.classList.add('flash');
  setTimeout(() => els.takeBtn.classList.remove('flash'), 300);
  try {
    await api.post('/api/live', { scene: cue.scene, params: cue.params, visible: true });
    toast(t('live.taken', { scene: cueText(cue.scene, cue.params) }), 'ok', { timeout: 1800 });
  } catch (e) { toastError(e); }
}

async function takeCard(card, button) {
  setCue(card);
  await busy(button, () => take());
}

export async function hide() {
  try {
    await api.post('/api/live', { visible: false });
    toast(t('live.hiddenToast'), 'info', { timeout: 1600 });
  } catch (e) { toastError(e); }
}

async function showAgain() {
  try { await api.post('/api/live', { visible: true }); } catch (e) { toastError(e); }
}

async function exportPng(button) {
  if (!cue) return;
  const label = button.querySelector('span:not(.ico)');
  label.textContent = t('live.exporting');
  await busy(button, async () => {
    try {
      const r = await api.post('/api/render', { scene: cue.scene, params: cue.params });
      lastExport = r;
      window.dispatchEvent(new CustomEvent('hll:output', { detail: r })); // Graphics page refreshes its file list
      paintExport();
      toast(t('live.exported', { name: r.name ?? r.file }), 'ok');
    } catch (e) { toastError(e); }
  });
  label.textContent = t('live.exportPng');
}

function paintExport() {
  const r = lastExport;
  if (!r) { els.exportInfo.replaceChildren(); return; }
  const copyBtn = h('button.btn.btn-sm.btn-ghost', { type: 'button', title: r.file, onclick: async () => { if (await copyText(r.file)) toast(t('common.copied'), 'ok', { timeout: 1200 }); } }, icon('copy', 14), h('span', t('graphics.copyPath')));
  setKids(els.exportInfo,
    h('a.export-link', { href: r.url, target: '_blank', rel: 'noopener', title: r.file }, thumb(r.url, 'export-thumb'), h('span', r.name ?? r.file)),
    copyBtn);
}

/* ----------------------------------------------------------- live state */

export function onLive(live) {
  if (!els) return;
  const p = els.program;
  const on = !!live?.visible && !!live?.scene;
  p.el.classList.toggle('is-live', on);
  p.empty.hidden = !!live?.scene && on;
  if (live?.scene) {
    const d = describe(live.scene, live.params);
    setKids(p.status, on ? h('span.onair-dot') : null, h('strong', on ? t('onair.on') : t('onair.off')), h('span.mon-detail', d.detail ? `${d.title} — ${d.detail}` : d.title));
  } else {
    setKids(p.status, h('strong', t('onair.off')), h('span.mon-detail', t('onair.nothing')));
  }
  els.hideBtn.disabled = !on;
  els.showBtn.hidden = on || !live?.scene;
  paintFlags();
}

/* ----------------------------------------------------------- picker */

function pickerGroup(title) {
  const grid = h('div.card-grid');
  const el = h('section.picker-group', h('h2.picker-title', title), grid);
  return { el, grid };
}

function cardEl(c) {
  const select = h('button.scene-card-select', { type: 'button', 'aria-label': `${t('live.preview')} ${c.title}` }, h('div.card-art', art(c.art)), h('div.card-text', h('span.card-title', c.title), h('span.card-sub', c.sub)), h('span.card-flags'));
  const takeButton = btn(t('live.take'), { size: 'sm', kind: 'primary', iconName: 'play', disabled: c.ready === false });
  const previewButton = btn(t('live.preview'), { size: 'sm', onclick: () => setCue(c) });
  takeButton.addEventListener('click', () => takeCard(c, takeButton));
  const remove = c.savedId ? btn(t('common.delete'), { size: 'sm', iconName: 'trash', onclick: async () => {
    if (!(await confirmDialog({ title: t('common.confirmDelete', { name: c.title }), body: t('live.removeGraphicHint') }))) return;
    try { await api.del(`/api/graphics/${encodeURIComponent(c.savedId)}`); store.refresh(); } catch (error) { toastError(error); }
  } }) : null;
  const b = h('article.scene-card', { tabIndex: 0, dataset: { key: c.key } }, select, h('div.scene-card-actions', previewButton, takeButton, remove));
  if (c.warn) b.classList.add('is-warn');
  select.addEventListener('click', () => setCue(c));
  select.addEventListener('dblclick', () => { if (c.ready !== false) { setCue(c); take(); } });
  b._card = c;
  return b;
}

function art(a) {
  switch (a.type) {
    case 'logos': return h(`div.art-logos${a.simple ? '.is-simple' : ''}`, logo(a.teams[0]), h('span.art-vs', 'VS'), logo(a.teams[1]));
    case 'logo': return h('div.art-logo', logo(a.team), h('span.art-swatch', { style: { background: a.team.colors?.primary ?? '#444' } }));
    case 'photos': return h('div.art-photos', photo(a.players[0]), h('span.art-vs', 'VS'), photo(a.players[1]));
    default: return h('div.art-icon', icon(a.icon, 26));
  }
}
const logo = (tm) => (tm?.logo ? h('img.art-img', { src: tm.logo, alt: '', loading: 'lazy' }) : h('span.art-tag', tm?.tag ?? '?'));
const photo = (p) => (p?.photo ? h('img.art-photo', { src: p.photo, alt: '', loading: 'lazy' }) : h('span.art-tag', p?.nick?.slice(0, 3) ?? '?'));

function paintFlags() {
  if (!els) return;
  const live = store.live;
  for (const b of els.picker.querySelectorAll('.scene-card')) {
    const c = b._card;
    const isPvw = !!cue && sameCue(cue, c);
    const isPgm = !!live?.scene && sameCue(live, c);
    const onAir = isPgm && live.visible;
    b.classList.toggle('is-pvw', isPvw);
    b.classList.toggle('is-pgm', onAir);
    b.setAttribute('aria-pressed', isPvw ? 'true' : 'false');
    const flags = b.querySelector('.card-flags');
    const want = `${isPvw ? 'P' : ''}${onAir ? 'L' : ''}`;
    if (flags.dataset.v !== want) {
      flags.dataset.v = want;
      setKids(flags, onAir ? h('span.flag.flag-pgm', t('onair.on')) : null, isPvw ? h('span.flag.flag-pvw', t('live.preview')) : null);
    }
  }
}

function onPickerKey(e) {
  const cur = e.target.closest?.('.scene-card');
  if (!cur || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const all = [...els.picker.querySelectorAll('.scene-card')];
  const i = all.indexOf(cur);
  let next = null;
  if (e.key === 'ArrowRight') next = all[i + 1];
  else if (e.key === 'ArrowLeft') next = all[i - 1];
  else {
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const down = e.key === 'ArrowDown';
    let best = null, bestScore = Infinity;
    for (const c of all) {
      if (c === cur) continue;
      const q = c.getBoundingClientRect();
      const dy = down ? q.top - r.top : r.top - q.top;
      if (dy < 8) continue;
      const score = dy * 4 + Math.abs(q.left + q.width / 2 - cx);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    next = best;
  }
  if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); setCue(next._card); }
}

/** Enter on LIVE: take (a focused card is cued first). */
export function handleEnter(target) {
  const card = target?.closest?.('.scene-card');
  if (card) setCue(card._card);
  take();
}

/* ----------------------------------------------------------- score */

function scorePanel() {
  const sel = ctlSelect({ options: matchOptions(store.state) });
  sel.el.addEventListener('change', () => { scoreMatchId = sel.get(); paintScore(); });
  const body = h('div.score-body');
  const status = ctlSegmented({ options: ['scheduled', 'live', 'done'].map((s) => ({ value: s, label: t(`status.${s}`) })), size: 'sm' });
  status.el.addEventListener('change', () => putMatch({ status: status.get() }));
  const el = h('section.panel.score-panel',
    h('h2.panel-title', t('live.scoreTitle')),
    field(null, sel),
    body,
    field(t('live.status'), status),
    h('p.panel-sub', t('live.scoreHint')));
  return { el, sel, body, status };
}

function scoreMatch() {
  return store.match(scoreMatchId) ?? store.match(store.state?.nextMatch);
}

async function putMatch(patch) {
  const m = scoreMatch();
  if (!m) return;
  try {
    const r = await api.put(`/api/matches/${m.id}`, patch);
    Object.assign(m, r);
    paintScore();
    store.refresh();
  } catch (e) { toastError(e); store.refresh(); }
}

function paintScore() {
  const s = els.score;
  const m = scoreMatch();
  if (!m) { setKids(s.body, emptyState({ iconName: 'matches', title: t('live.noMatch') })); s.status.el.hidden = true; return; }
  s.status.el.hidden = false;
  s.sel.set(m.id);
  s.status.set(m.status);
  const side = (teamId, key) => {
    const tm = store.team(teamId);
    const val = m[key];
    const step = (d) => {
      const n = Math.max(0, (val ?? 0) + d);
      if (d < 0 && val == null) return;
      putMatch({ [key]: n });
    };
    return h('div.score-side',
      thumb(tm?.logo ?? null, 'logo-lg'),
      h('span.score-tag', { title: tm?.name ?? '' }, tm?.tag ?? t('common.tbd')),
      h('div.stepper',
        h('button.btn.btn-icon.btn-sm', { type: 'button', 'aria-label': `${tm?.tag ?? ''} −1`, onclick: () => step(-1), disabled: !val }, icon('minus', 14)),
        h('span.score-val', val ?? '–'),
        h('button.btn.btn-icon.btn-sm', { type: 'button', 'aria-label': `${tm?.tag ?? ''} +1`, onclick: () => step(1) }, icon('plus', 14))));
  };
  setKids(s.body,
    h('div.score-meta', `${fmtDate(m.date, 'short')} · ${m.time ?? ''} · BO${m.bestOf}${m.stage ? ` · ${m.stage}` : ''}`),
    h('div.score-row', side(m.teamA, 'scoreA'), h('span.score-sep', ':'), side(m.teamB, 'scoreB')));
}

/* ----------------------------------------------------------- update */

export function update(state) {
  if (!els || !state) return;
  const all = quickCards(state);
  const query = els.search.value.trim().toLocaleLowerCase();
  const category = els.category.get();
  const cards = all.filter(card => (!category || card.group === category) && (!query || `${card.title} ${card.sub}`.toLocaleLowerCase().includes(query)));
  els.count.textContent = `${cards.length} / ${all.length}`;
  for (const [g, grp] of Object.entries(els.groups)) {
    const list = cards.filter((c) => c.group === g);
    grp.el.hidden = !list.length;
    if (g === 'matchups' && !list.length) {
      if (!grp.grid.querySelector('.picker-empty')) {
        setKids(grp.grid, h('div.picker-empty', t('live.noMatchups'), ' ', h('button.btn-link', { type: 'button', onclick: () => goto('matchups') }, t('live.createMatchup'))));
      }
      continue;
    }
    keyedList(grp.grid, list, (c) => c.key, cardEl);
  }
  builder.refresh(state);
  els.score.sel.setOptions(matchOptions(state));
  paintScore();
  paintFlags();
  // Cue text may change (renamed team etc.)
  if (cue) {
    const d = describe(cue.scene, cue.params);
    setKids(els.preview.status, h('strong', d.title), d.detail ? h('span.mon-detail', d.detail) : null);
  }
  onLive(store.live);
}

export function getCue() { return cue; }
