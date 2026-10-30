// IMPORT: HLL.GR sync, Google Drive / local folder image import, unmatched files.
import { h, keyedList, setKids } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { trackJob, latestJob, onAnyJob } from '../jobs.js';
import {
  toast, toastError, busy, btn, badge, imgBox, emptyState, sectionHead, panel, field,
  ctlText, ctlSelect, ctlCheck, ctlCombo, confirmDialog, jobView,
} from '../ui.js';
import { playerComboOptions } from '../scenes.js';

export const id = 'import';
let els = null;
const shownJob = { hllgr: null, import: null };

const KIND_OPTS = () => [
  { value: 'auto', label: t('import.kAuto') },
  { value: 'team', label: t('import.kTeam') },
  { value: 'player', label: t('import.kPlayer') },
  { value: 'sponsor', label: t('import.kSponsor') },
];

export function mount(root) {
  const s = store.state;
  // ---- HLL.GR
  const what = ['teams', 'players', 'matches', 'stats'].map((w) => [w, ctlCheck({ value: true, label: t(`import.w${w[0].toUpperCase()}${w.slice(1)}`) })]);
  const force = ctlCheck({ value: false, label: t('import.force') });
  const syncBtn = btn(t('import.sync'), { kind: 'primary', iconName: 'refresh' });
  const hllJob = h('div.job-host');
  const hllSub = h('p.panel-sub', t('import.hllgrSub', { url: s.settings.hllgr?.baseUrl ?? 'https://hll.gr' }));
  syncBtn.addEventListener('click', () => busy(syncBtn, async () => {
    const list = what.filter(([, c]) => c.get()).map(([w]) => w);
    if (!list.length) { toast(t('import.pickOne'), 'error'); return; }
    try {
      const job = trackJob(await api.post('/api/hllgr/sync', { what: list, force: force.get() }));
      showJob('hllgr', job.id);
    } catch (e) { toastError(e); }
  }));
  const hll = panel(t('import.hllgr'), hllSub,
    h('div.field', h('div.field-label', t('import.what')), h('div.check-row', what.map(([, c]) => c.el))),
    h('div.field', force.el, h('div.field-hint', t('import.forceHint'))),
    h('div.panel-actions', syncBtn),
    hllJob);

  // ---- Drive
  const driveUrl = ctlText({ placeholder: t('import.drivePlaceholder'), type: 'url' });
  const driveKind = ctlSelect({ options: KIND_OPTS(), value: 'auto' });
  const driveBtn = btn(t('import.importBtn'), { kind: 'primary', iconName: 'import' });
  driveBtn.addEventListener('click', () => busy(driveBtn, async () => {
    const url = driveUrl.get();
    if (!url) { toast(t('import.needUrl'), 'error'); driveUrl.el.focus(); return; }
    await startImport({ source: 'drive', url, kind: driveKind.get() });
  }));
  const apiKey = ctlText({ value: s.settings.drive?.apiKey ?? '', type: 'password', mono: true });
  const showKey = h('button.btn.btn-sm.btn-ghost', { type: 'button' }, t('import.show'));
  showKey.addEventListener('click', () => { const on = apiKey.el.type === 'password'; apiKey.el.type = on ? 'text' : 'password'; showKey.textContent = on ? t('import.hide') : t('import.show'); });
  const saveKey = btn(t('import.apiKeySave'), { size: 'sm' });
  saveKey.addEventListener('click', () => busy(saveKey, async () => {
    try { await api.put('/api/settings', { drive: { apiKey: apiKey.get() } }); toast(t('import.apiKeySaved'), 'ok'); store.refresh(); } catch (e) { toastError(e); }
  }));
  const drive = panel(t('import.drive'),
    h('div.form-grid',
      field(t('import.driveUrl'), driveUrl, { span: 2 }),
      field(t('import.kind'), driveKind),
      h('div.field.field-end', driveBtn)),
    h('div.callout',
      icon('info', 16),
      h('div', h('strong', t('import.driveHelpTitle')), h('p', t('import.driveHelp')), h('p', t('import.driveHelp2')))),
    h('details.disclosure',
      h('summary', icon('key', 14), t('import.apiKey')),
      h('div.field', h('div.inline-row', apiKey.el, showKey, saveKey), h('div.field-hint', t('import.apiKeyHint')))));

  // ---- Local
  const localPath = ctlText({ placeholder: t('import.localPlaceholder'), mono: true });
  const localKind = ctlSelect({ options: KIND_OPTS(), value: 'auto' });
  const localBtn = btn(t('import.importBtn'), { kind: 'primary', iconName: 'folder' });
  localBtn.addEventListener('click', () => busy(localBtn, async () => {
    const path = localPath.get();
    if (!path) { toast(t('import.needPath'), 'error'); localPath.el.focus(); return; }
    await startImport({ source: 'local', path, kind: localKind.get() });
  }));
  const local = panel(t('import.local'),
    h('div.form-grid',
      field(t('import.localPath'), localPath, { span: 2 }),
      field(t('import.kind'), localKind),
      h('div.field.field-end', localBtn)));
  const importJob = h('div.job-host');
  const importPanel = panel(null, importJob);
  importPanel.hidden = true;

  // ---- Rules
  const rules = panel(t('import.rulesTitle'), h('ul.rules', t('import.rules').map((r) => h('li', r))));

  // ---- Unmatched
  const unHead = h('header.subsection-head', h('h2.subsection-title', t('import.unmatched')), h('span.subsection-sub'));
  const unGrid = h('div.grid.grid-unmatched');
  const unEmpty = h('div', { hidden: true }, emptyState({ iconName: 'check', title: t('import.unmatchedEmpty'), body: t('import.unmatchedEmptyBody') }));

  root.append(
    sectionHead(t('import.title'), t('import.sub')),
    h('div.import-grid', h('div.col', hll, rules), h('div.col', drive, local, importPanel)),
    h('section.subsection', unHead, unGrid, unEmpty));
  els = { hllJob, importJob, importPanel, syncBtn, driveBtn, localBtn, unHead, unGrid, unEmpty, hllSub };

  onAnyJob(() => paintJobs());
  paintJobs();
  update(s);
}

async function startImport(body) {
  try {
    const job = trackJob(await api.post('/api/assets/import', body));
    toast(t('import.started'), 'info');
    showJob('import', job.id);
  } catch (e) { toastError(e); }
}

function showJob(kind, jobId) {
  shownJob[kind] = jobId;
  paintJobs(true);
}

function paintJobs(force = false) {
  if (!els) return;
  for (const kind of ['hllgr', 'import']) {
    const job = latestJob(kind);
    const host = kind === 'hllgr' ? els.hllJob : els.importJob;
    const want = shownJob[kind] ?? job?.id ?? null;
    if (want && (force || host.dataset.job !== want)) {
      host.dataset.job = want;
      const fmt = kind === 'hllgr'
        ? (r) => h('div.result-line', icon('check', 14), Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · '))
        : (r) => h('div.result-line', icon('check', 14), `${r.files ?? 0} files`);
      setKids(host, h('div.job-label', t('import.lastRun')), jobView(want, { formatResult: fmt }));
    }
    if (kind === 'import') els.importPanel.hidden = !want;
  }
  const hRun = latestJob('hllgr')?.status === 'running';
  const iRun = latestJob('import')?.status === 'running';
  els.syncBtn.disabled = hRun;
  els.syncBtn.title = hRun ? t('import.syncRunning') : '';
  els.driveBtn.disabled = iRun;
  els.localBtn.disabled = iRun;
}

function targetOptions(kind) {
  const s = store.state;
  if (kind === 'team') return [...s.teams].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ value: x.id, label: x.name, sub: x.tag, img: x.logo ?? null }));
  if (kind === 'sponsor') return s.sponsors.map((x) => ({ value: x.id, label: x.name, img: x.logo ?? null }));
  return playerComboOptions(s);
}

function unmatchedCard(u) {
  const startKind = ['team', 'player', 'sponsor'].includes(u.kind) ? u.kind : 'player';
  const kind = ctlSelect({ options: [{ value: 'team', label: t('import.kTeam') }, { value: 'player', label: t('import.kPlayer') }, { value: 'sponsor', label: t('import.kSponsor') }], value: startKind });
  const target = ctlCombo({ options: targetOptions(startKind), placeholder: t('import.pickTarget'), searchPlaceholder: t('common.search') });
  kind.el.addEventListener('change', () => { target.setOptions(targetOptions(kind.get())); target.set(null); });
  kind.el.setAttribute('aria-label', t('import.assignAs'));
  const assign = btn(t('import.assign'), { kind: 'primary', size: 'sm', iconName: 'check' });
  assign.addEventListener('click', () => busy(assign, async () => {
    if (!target.get()) { toast(t('import.pickTarget'), 'error'); target.focusEl.focus(); return; }
    try {
      await api.post('/api/assets/assign', { file: u.file, kind: kind.get(), id: target.get() });
      toast(t('import.assigned', { file: u.name ?? u.file }), 'ok');
      store.refresh();
    } catch (e) { toastError(e); }
  }));
  const discard = btn(t('import.discardFile'), { kind: 'ghost', size: 'sm', iconName: 'trash' });
  discard.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('import.discardQ', { file: u.name ?? u.file }), body: t('common.confirmDeleteBody'), ok: t('import.discardFile') });
    if (!ok) return;
    try {
      await api.del(`/api/assets/unmatched/${encodeURIComponent(u.file)}`);
      toast(t('import.discarded'), 'ok');
      store.refresh();
    } catch (e) { toastError(e); }
  });
  return h('article.unmatched-card',
    imgBox(u.url, { ratio: '1 / 1' }),
    h('div.un-body',
      h('div.un-name', { title: u.file }, u.name ?? u.file),
      h('div.un-meta', u.folders?.length ? h('span.un-path', `${u.folders.join(' / ')} /`) : null, badge(t('import.hint', { kind: u.kind }), u.kind === 'unknown' ? 'muted' : 'src')),
      h('div.un-assign', kind.el, target.el),
      h('div.un-actions', discard, h('div.spacer'), assign)));
}

export function update(state) {
  if (!els || !state) return;
  els.hllSub.textContent = t('import.hllgrSub', { url: state.settings.hllgr?.baseUrl ?? 'https://hll.gr' });
  const list = state.unmatched ?? [];
  els.unHead.querySelector('.subsection-sub').textContent = list.length ? t('import.unmatchedSub', { n: list.length }) : '';
  els.unEmpty.hidden = list.length > 0;
  keyedList(els.unGrid, list, (u) => u.file, unmatchedCard);
  paintJobs();
}
