// Control panel shell: boot, router, header (on-air, jobs, connection), global keyboard.
import { h, setKids, keyedList, isTextTarget } from './dom.js';
import { icon } from './icons.js';
import { t } from './strings.js';
import { store, connectStream } from './store.js';
import { api } from './api.js';
import { syncJobs, allJobs, onAnyJob, onJobFinished } from './jobs.js';
import { toast, toastError, drawerState, closeDrawer, drawerSave, drawerOnState, isDialogOpen, jobKindLabel, jobView } from './ui.js';
import { describe } from './scenes.js';
import * as live from './sections/live.js';
import * as teams from './sections/teams.js';
import * as players from './sections/players.js';
import * as matches from './sections/matches.js';
import * as matchups from './sections/matchups.js';
import * as sponsors from './sections/sponsors.js';
import * as importer from './sections/import.js';
import * as graphics from './sections/graphics.js';
import * as settings from './sections/settings.js';
import * as help from './sections/help.js';
import * as designer from './sections/designer.js';
import * as wizard from './wizard.js';
import { createTournamentControls } from './tournaments.js';

const SECTIONS = [live, teams, players, matches, matchups, sponsors, importer, graphics, settings, help, designer];
const byId = new Map([...SECTIONS, wizard].map((s) => [s.id, s]));
const pages = new Map(); // id → { el, mounted, stale }
let current = null;
let navEls = new Map();
let hdr = null;
let loadedTournamentId = null;
let tournamentChanging = false;
const SOCIAL_SECTIONS = new Set(['teams', 'players', 'matches', 'graphics', 'designer', 'help']);
const isSocial = () => store.access?.edition === 'social';

/* ------------------------------------------------------------- boot */

async function boot() {
  const bootEl = document.getElementById('boot');
  setKids(bootEl, h('div.boot-card', h('span.spinner.spinner-lg'), h('span', t('common.loading'))));
  try {
    const [access] = await Promise.all([api.get('/api/whoami'), store.load()]);
    store.access = { ...access, edition: access.edition === 'social' || new URLSearchParams(location.search).get('edition') === 'social' ? 'social' : 'full' };
    document.body.dataset.edition = store.access.edition;
  } catch (e) {
    setKids(bootEl, h('div.boot-card.is-error',
      icon('alert', 28),
      h('p', t('app.loadFail', { error: e.message ?? String(e) })),
      h('button.btn.btn-primary', { type: 'button', onclick: () => boot() }, icon('refresh', 16), h('span', t('app.retry')))));
    return;
  }
  bootEl.remove();
  loadedTournamentId = store.state.activeTournamentId;
  document.getElementById('app').hidden = false;
  buildHeader();
  buildNav();
  syncJobs(store.state.jobs);
  store.on('state', onState);
  store.on('live', onLiveChange);
  store.on('conn', paintConn);
  onAnyJob(paintJobs);
  onJobFinished((job) => {
    if (job.status === 'done') toast(t('jobs.done', { kind: jobKindLabel(job.kind) }), 'ok');
    else toast(t('jobs.failed', { kind: jobKindLabel(job.kind), error: job.error ?? job.message ?? '' }), 'error');
  });
  connectStream();
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', (e) => {
    if (!tournamentChanging && (drawerState()?.isDirty() || settings.isDirty())) { e.preventDefault(); e.returnValue = ''; }
  });
  route();
  paintOnAir(store.live);
  paintJobs();
  paintConn();
  paintBadges(store.state);
}

/* ------------------------------------------------------------- router */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const id = byId.has(path) ? path : 'live';
  return { id, opts: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}

function route() {
  const { id, opts } = parseHash();
  show(id, Object.keys(opts).length ? opts : null);
}

/** Navigate to a section (used by sections: goto('players', { team })). */
function goto(id, opts = null) {
  const want = `#/${id}`;
  if (location.hash !== want) history.pushState(null, '', want);
  show(id, opts);
}

function show(id, opts) {
  if (isSocial() && !SOCIAL_SECTIONS.has(id)) { id = 'graphics'; opts = null; }
  const sec = byId.get(id);
  let page = pages.get(id);
  if (!page) {
    const el = h(`section.page.page-${id}`, { id: `page-${id}`, hidden: true, 'aria-labelledby': id === wizard.id ? 'wz-title' : `nav-${id}` });
    document.getElementById('main').append(el);
    page = { el, mounted: false, stale: false };
    pages.set(id, page);
  }
  if (!page.mounted) {
    try {
      sec.mount(page.el, goto, { goto });
      page.mounted = true;
    } catch (e) {
      console.error(e);
      setKids(page.el, h('div.empty', icon('alert', 28), h('div.empty-title', `${t(`nav.${id}`)}: ${e.message}`)));
    }
  } else if (page.stale) {
    page.stale = false;
    try { sec.update?.(store.state); } catch (e) { console.error(e); }
  }
  if (current !== id) {
    for (const [pid, p] of pages) p.el.hidden = pid !== id;
    current = id;
    document.body.dataset.section = id;
    for (const [nid, a] of navEls) {
      if (nid === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    document.title = `${id === wizard.id ? 'Create tournament' : t(`nav.${id}`)} · ${t('app.title')}`;
    document.getElementById('main').scrollTop = 0;
  }
  page.el.hidden = false;
  try { sec.show?.(opts); } catch (e) { console.error(e); }
}

/* ------------------------------------------------------------- state */

function onState(state) {
  if (!state) return;
  if (loadedTournamentId && state.activeTournamentId !== loadedTournamentId) {
    tournamentChanging = true;
    location.reload();
    return;
  }
  if (store.loadError) { paintConn(); return; }
  syncJobs(state.jobs);
  for (const [id, page] of pages) {
    if (!page.mounted) continue;
    if (id === current) {
      try { byId.get(id).update?.(state); } catch (e) { console.error(`[update ${id}]`, e); }
    } else page.stale = true;
  }
  drawerOnState(state);
  paintHeaderMeta(state);
  paintBadges(state);
  paintOnAir(store.live);
}

function onLiveChange(lv) {
  paintOnAir(lv);
  if (pages.get('live')?.mounted) live.onLive(lv);
}

/* ------------------------------------------------------------- header */

function buildHeader() {
  const s = store.state.settings;
  const logo = h('img.brand-logo', { src: s.leagueLogo || '/brand/hll-logo.png', alt: '', width: 36, height: 36 });
  const title = h('div.brand-text', h('span.brand-title', t('app.title')), h('span.brand-sub'));
  const onair = h('button.onair', { type: 'button', title: t('nav.live'), onclick: () => goto('live') },
    h('span.onair-dot'), h('span.onair-state'), h('span.onair-what'));
  const hideBtn = h('button.btn.btn-sm.btn-hide-mini', { type: 'button', title: t('onair.hideTitle'), onclick: () => live.hide() }, icon('eyeOff', 14), h('span', t('onair.hide')));
  const jobsBtn = h('button.jobs-chip', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, icon('refresh', 15, 'jobs-ico'), h('span.jobs-text', t('jobs.idle')));
  const jobsPop = h('div.jobs-pop', { hidden: true, role: 'dialog', 'aria-label': t('jobs.title') },
    h('div.jobs-pop-head', h('span', t('jobs.title'))), h('div.jobs-list'));
  jobsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleJobs(); });
  document.addEventListener('click', (e) => { if (!jobsPop.hidden && !jobsPop.contains(e.target)) toggleJobs(false); });
  const conn = h('span.conn', { role: 'status' }, h('span.conn-dot'), h('span.conn-text'));
  // Data sync with the other PCs: status, and a click uploads and gets updates now.
  const sync = h('button.jobs-chip.sync-chip', { type: 'button', hidden: true, onclick: () => syncClick() }, h('span.sync-dot'), h('span.sync-text'));
  window.addEventListener('hll:sync', (e) => paintSync(e.detail));
  if (!isSocial()) api.get('/api/sync').then(paintSync).catch(() => {});
  const tournament = createTournamentControls({ isDirty: () => !!drawerState()?.isDirty() || settings.isDirty() });
  const bar = h('div.topbar-inner',
    h('a.brand', { href: isSocial() ? '#/graphics' : '#/live' }, logo, title),
    isSocial() ? h('span.badge.badge-gold', t('remote.socialEdition')) : null,
    tournament.el,
    h('div.onair-wrap', { hidden: isSocial() }, onair, hideBtn),
    h('div.spacer'),
    h('div.jobs-wrap', jobsBtn, jobsPop),
    sync,
    conn);
  setKids(document.getElementById('topbar'), bar);
  hdr = { logo, title, onair, hideBtn, jobsBtn, jobsPop, conn, tournament, sync };
  paintHeaderMeta(store.state);
}

function paintHeaderMeta(state) {
  if (!hdr || !state) return;
  const s = state.settings;
  hdr.tournament.update(state);
  const want = s.leagueLogo || '/brand/hll-logo.png';
  if (hdr.logo.getAttribute('src') !== want) hdr.logo.src = want;
  hdr.title.querySelector('.brand-sub').textContent = [s.leagueName, s.season].filter(Boolean).join(' · ');
}

function paintOnAir(lv) {
  if (!hdr) return;
  const on = !!lv?.visible && !!lv?.scene;
  hdr.onair.classList.toggle('is-on', on);
  hdr.onair.querySelector('.onair-state').textContent = on ? t('onair.on') : t('onair.off');
  let what = t('onair.nothing');
  if (lv?.scene && store.state) {
    const d = describe(lv.scene, lv.params);
    const txt = d.detail ? `${d.title} — ${d.detail}` : d.title;
    what = on ? txt : t('onair.hiddenScene', { scene: txt });
  }
  hdr.onair.querySelector('.onair-what').textContent = what;
  hdr.onair.setAttribute('aria-label', `${on ? t('onair.on') : t('onair.off')}: ${what}`);
  hdr.hideBtn.hidden = !on;
}

const SYNC_TEXT = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline · syncs later', error: 'Sync problem' };
function paintSync(s) {
  if (!hdr || !s) return;
  const el = hdr.sync;
  if (isSocial()) { el.hidden = true; return; }
  el.hidden = !s.enabled;
  const text = s.behind ? 'Updates from another PC' : s.pending && s.status === 'synced' ? 'Saving to cloud soon' : SYNC_TEXT[s.status] || 'Synced';
  el.dataset.status = s.behind ? 'behind' : s.status;
  el.querySelector('.sync-text').textContent = text;
  el.title = [s.message, s.lastUpload ? `Last upload: ${new Date(s.lastUpload).toLocaleString()}` : '', 'Click to sync now'].filter(Boolean).join(' · ');
}
async function syncClick() {
  hdr.sync.disabled = true;
  try {
    const s = await api.post('/api/sync/now');
    paintSync(s);
    if (s.status === 'synced') { toast(s.message || 'Data is synced with your other PCs.', s.message ? 'warn' : 'ok'); await store.load(); }
    else toast(s.message || 'Sync did not finish.', 'warn');
  } catch (e) { toastError(e); } finally { hdr.sync.disabled = false; }
}

function paintConn() {
  if (!hdr) return;
  const ok = store.connected && !store.loadError;
  hdr.conn.classList.toggle('is-ok', ok);
  hdr.conn.classList.toggle('is-bad', !ok);
  hdr.conn.querySelector('.conn-text').textContent = ok ? t('app.online') : store.connected ? t('app.loadFail', { error: store.loadError?.message ?? '' }) : t('app.offline');
  hdr.conn.title = hdr.conn.querySelector('.conn-text').textContent;
}

function toggleJobs(force) {
  const open = force ?? hdr.jobsPop.hidden;
  hdr.jobsPop.hidden = !open;
  hdr.jobsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) paintJobList();
}

function paintJobs() {
  if (!hdr) return;
  const list = allJobs();
  const n = list.filter((j) => j.status === 'running').length;
  hdr.jobsBtn.classList.toggle('is-running', n > 0);
  hdr.jobsBtn.querySelector('.jobs-text').textContent = n === 0 ? t('jobs.idle') : n === 1 ? t('jobs.one') : t('jobs.running', { n });
  if (!hdr.jobsPop.hidden) paintJobList();
}

function paintJobList() {
  const host = hdr.jobsPop.querySelector('.jobs-list');
  const list = allJobs().slice(0, 8);
  if (!list.length) { setKids(host, h('p.muted.jobs-none', t('jobs.none'))); return; }
  host.querySelector('.jobs-none')?.remove();
  keyedList(host, list, (j) => j.id, (j) => jobView(j.id, { compact: true }), (j) => j.id);
}

/* ------------------------------------------------------------- nav */

function buildNav() {
  const nav = document.getElementById('nav');
  const items = SECTIONS.map((sec, i) => {
    const n = i === 9 ? 0 : i < 9 ? i + 1 : null;
    const a = h('a.nav-item', { href: `#/${sec.id}`, id: `nav-${sec.id}`, title: `${t(`nav.${sec.id}`)}${n != null ? ` (${t('nav.shortcut', { n })})` : ''}` },
      icon(sec.id === 'designer' ? 'layers' : sec.id, 18), h('span.nav-label', t(`nav.${sec.id}`)), h('span.nav-badge', { hidden: true }), n != null ? h('kbd.nav-kbd', String(n)) : null);
    navEls.set(sec.id, a);
    return a;
  });
  setKids(nav, isSocial()
    ? h('div.nav-list', items.filter((_, i) => SOCIAL_SECTIONS.has(SECTIONS[i].id)))
    : h('div.nav-list', items.slice(0, 1), h('div.nav-sep'), items.slice(1, 6), h('div.nav-sep'), items.slice(6, 8), items[10], items.slice(8, 10)));
}

function paintBadges(state) {
  if (!state) return;
  const set = (id, text, kind = '') => {
    const b = navEls.get(id)?.querySelector('.nav-badge');
    if (!b) return;
    b.hidden = !text;
    b.textContent = text ?? '';
    b.className = `nav-badge${kind ? ` is-${kind}` : ''}`;
  };
  set('teams', String(state.teams.length));
  set('players', String(state.players.length));
  const nToday = state.matches.filter((m) => m.date === state.today).length;
  set('matches', nToday ? `${nToday}` : '', 'gold');
  set('matchups', state.features.length ? String(state.features.length) : '');
  set('sponsors', state.sponsors.length ? String(state.sponsors.length) : '');
  set('import', state.unmatched?.length ? String(state.unmatched.length) : '', 'warn');
}

/* ------------------------------------------------------------- keyboard */

function onKey(e) {
  if (isDialogOpen()) return;
  const k = e.key;
  // Alt+1…9, Alt+0 → sections
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(k)) {
    const i = k === '0' ? 9 : Number(k) - 1;
    const sec = SECTIONS[i];
    if (sec) { e.preventDefault(); goto(sec.id); }
    return;
  }
  // Ctrl+S → save the drawer, else the settings page
  if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'S')) {
    e.preventDefault();
    if (drawerState()) drawerSave();
    else if (current === 'settings') settings.save();
    else if (current === 'designer') designer.save();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tgt = e.target;
  const inDrawer = !!tgt.closest?.('#drawer');
  const inPop = !!tgt.closest?.('.combo-pop, .jobs-pop');

  if (k === 'Escape') {
    if (!hdr.jobsPop.hidden) { toggleJobs(false); hdr.jobsBtn.focus(); return; }
    if (inPop) return;
    if (drawerState()) { e.preventDefault(); closeDrawer(); return; }
    if (isTextTarget(tgt) || tgt.tagName === 'SELECT') { tgt.blur(); return; }
    if (current === 'live') { e.preventDefault(); live.hide(); }
    return;
  }

  if (k === 'Enter' && current === 'live' && !inDrawer && !inPop && !e.repeat) {
    const card = tgt.closest?.('.scene-card');
    if (card) {
      if (tgt.closest?.('button, a, input, select')) return;
      e.preventDefault(); live.handleEnter(tgt); return;
    }
    if (isTextTarget(tgt) || ['SELECT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY', 'INPUT'].includes(tgt.tagName) || tgt.isContentEditable || tgt.closest?.('[role=button], .dropzone')) return;
    e.preventDefault();
    live.handleEnter(tgt);
    return;
  }

  // "/" focuses the search box of the page
  if (k === '/' && !isTextTarget(tgt) && tgt.tagName !== 'SELECT') {
    const s = pages.get(current)?.el.querySelector('[data-search]');
    if (s) { e.preventDefault(); s.focus(); s.select?.(); }
  }
}

boot();
