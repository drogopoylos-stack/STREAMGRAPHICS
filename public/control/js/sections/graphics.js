// GRAPHICS & EXPORT: render all, single render, output folder, and every PNG already in it.
import { h, setKids, copyText, keyedList } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtStamp } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { trackJob, latestJob, onAnyJob, getJob } from '../jobs.js';
import { toast, toastError, busy, btn, sectionHead, panel, field, ctlText, copyField, jobView, imgBox, emptyState, badge } from '../ui.js';
import { sceneBuilder } from '../builder.js';
import { cueText } from '../scenes.js';

export const id = 'graphics';
let els = null;
let shownJob = null;
let files = null; // [{ name, file, url, mtime }] newest first; null = not loaded yet
const fresh = new Set(); // file names rendered by this panel since it was opened
let filter = '';
let loading = null;

const baseName = (r) => r.name ?? String(r.file ?? '').split(/[\\/]/).pop();

export function mount(root) {
  const s = store.state;
  const outField = copyField(s.settings.outputDir);
  const outPanel = panel(t('graphics.outputDir'),
    outField,
    h('p.panel-sub', t('graphics.outputHint')),
    h('p.field-hint', t('graphics.outputHint2')));

  const allBtn = btn(t('graphics.renderAll'), { kind: 'primary', iconName: 'layers' });
  const jobHost = h('div.job-host');
  allBtn.addEventListener('click', () => busy(allBtn, async () => {
    try {
      const job = trackJob(await api.post('/api/render/all'));
      shownJob = job.id;
      paintJob(true);
    } catch (e) { toastError(e); }
  }));
  const allPanel = panel(t('graphics.renderAll'), h('p.panel-sub', t('graphics.renderAllSub')), h('div.panel-actions', allBtn), jobHost);

  const builder = sceneBuilder();
  builder.set({ scene: 'schedule', params: { day: 'today' } });
  const name = ctlText({ placeholder: t('graphics.fileNameHint'), mono: true });
  const renderBtn = btn(t('graphics.render'), { kind: 'primary', iconName: 'image' });
  const singleOut = h('div.grid.grid-renders');
  renderBtn.addEventListener('click', () => busy(renderBtn, async () => {
    const cue = builder.get();
    const body = { scene: cue.scene, params: cue.params };
    if (name.get()) body.name = name.get();
    try {
      const r = await api.post('/api/render', body);
      fresh.add(baseName(r));
      setKids(singleOut, renderCard({ ...r, label: cueText(cue.scene, cue.params), mtime: Date.now() }, { lazy: false }));
      toast(t('live.exported', { name: baseName(r) }), 'ok');
      loadFiles();
    } catch (e) { toastError(e); }
  }));
  const singlePanel = panel(t('graphics.single'), h('p.panel-sub', t('graphics.singleSub')),
    builder.el, field(t('graphics.fileName'), name), h('div.panel-actions', renderBtn), singleOut);

  // Every PNG in the output folder (also renders from earlier sessions).
  const search = h('input.input.search-input', { type: 'search', placeholder: t('graphics.filesFilter'), 'aria-label': t('graphics.filesFilter'), dataset: { search: '' } });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); paintFiles(); });
  const refreshBtn = btn(t('graphics.refresh'), { size: 'sm', iconName: 'refresh', onclick: () => busy(refreshBtn, () => loadFiles()) });
  const filesSub = h('span.files-sub');
  const filesGrid = h('div.grid.grid-renders.files-grid', { role: 'list' });
  const filesMsg = h('div.files-msg');
  const filesPanel = h('section.panel.files-panel',
    h('div.files-head',
      h('div.files-titles', h('h2.panel-title', t('graphics.files')), filesSub),
      h('div.spacer'),
      h('div.search-wrap.files-search', icon('search', 16), search),
      refreshBtn),
    filesMsg, filesGrid);

  root.append(sectionHead(t('graphics.title'), t('graphics.sub')),
    h('div.graphics-grid', h('div.col', allPanel, outPanel), h('div.col', singlePanel)),
    filesPanel);
  els = { outField, jobHost, builder, allBtn, filesSub, filesGrid, filesMsg };
  onAnyJob(() => paintJob());
  window.addEventListener('hll:output', (e) => { if (e.detail) fresh.add(baseName(e.detail)); loadFiles(); });
  paintJob();
  paintFiles();
  loadFiles();
}

/** Re-list the output folder whenever the page is opened (files may have changed on disk). */
export function show() {
  if (files) loadFiles();
}

async function loadFiles() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const list = await api.get('/api/output');
      files = Array.isArray(list) ? [...list].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0)) : [];
      els?.filesMsg.classList.remove('is-error');
    } catch (e) {
      if (!files) files = [];
      if (els) { els.filesMsg.classList.add('is-error'); setKids(els.filesMsg, h('p.muted', icon('alert', 14), ' ', t('graphics.filesError'), ' ', h('span', e.message ?? ''))); }
    } finally {
      loading = null;
    }
    paintFiles();
  })();
  return loading;
}

function paintFiles() {
  if (!els) return;
  if (!files) {
    els.filesSub.textContent = '';
    setKids(els.filesMsg, h('div.files-loading', h('span.spinner'), h('span', t('common.loading'))));
    return;
  }
  const shown = filter ? files.filter((f) => f.name.toLowerCase().includes(filter)) : files;
  els.filesSub.textContent = filter
    ? t('graphics.filesFiltered', { shown: shown.length, n: files.length })
    : t('graphics.filesSub', { n: files.length });
  if (!els.filesMsg.classList.contains('is-error')) {
    if (!files.length) setKids(els.filesMsg, emptyState({ iconName: 'image', title: t('graphics.filesEmpty'), body: t('graphics.filesEmptyBody') }));
    else if (!shown.length) setKids(els.filesMsg, h('p.muted', t('graphics.filesNoMatch')));
    else els.filesMsg.replaceChildren();
  }
  keyedList(els.filesGrid, shown, (f) => f.name, (f) => renderCard(f, { lazy: true, role: 'listitem' }), (f) => JSON.stringify([f.url, f.mtime, fresh.has(f.name)]));
}

function renderCard(r, { lazy = true, role } = {}) {
  const nm = baseName(r);
  const copyBtn = h('button.btn.btn-sm.btn-ghost', { type: 'button', title: r.file }, icon('copy', 14), h('span', t('graphics.copyPath')));
  copyBtn.addEventListener('click', async () => { if (await copyText(r.file)) toast(t('common.copied'), 'ok', { timeout: 1200 }); });
  return h('article.render-card', role ? { role } : {},
    h('a.render-thumb', { href: r.url, target: '_blank', rel: 'noopener', title: t('graphics.openPng') }, imgBox(r.url, { ratio: '16 / 9', lazy })),
    h('div.render-body',
      h('div.render-name', { title: nm }, nm),
      h('div.render-sub',
        r.mtime ? h('span', fmtStamp(r.mtime)) : null,
        r.label ? h('span', r.label) : null,
        fresh.has(nm) ? badge(t('graphics.newBadge'), 'gold', t('graphics.newTitle')) : null),
      h('div.render-actions', copyBtn, h('a.btn.btn-sm.btn-ghost', { href: r.url, target: '_blank', rel: 'noopener' }, icon('external', 14), h('span', t('graphics.openPng'))))));
}

function paintJob(force = false) {
  if (!els) return;
  const want = shownJob ?? latestJob('render')?.id ?? null;
  const job = want ? getJob(want) : null;
  els.allBtn.disabled = job?.status === 'running';
  if (!want) { els.jobHost.replaceChildren(); return; }
  if (force || els.jobHost.dataset.job !== want) {
    els.jobHost.dataset.job = want;
    setKids(els.jobHost, jobView(want, { formatResult: (r) => h('div.result-line', icon('check', 14), t('graphics.results', { n: r.length ?? 0 })) }));
  }
  // When a render-all finishes, mark its files as new and re-list the folder.
  const key = `${want}:${job?.status}`;
  if (els.jobHost.dataset.key !== key) {
    const first = els.jobHost.dataset.key == null;
    els.jobHost.dataset.key = key;
    if (job?.status === 'done' && Array.isArray(job.result)) {
      if (!first || shownJob) for (const r of job.result) fresh.add(baseName(r));
      if (!first) loadFiles();
    }
  }
}

export function update(state) {
  if (!els || !state) return;
  els.outField.setValue(state.settings.outputDir);
  els.builder.refresh(state);
  paintJob();
}
