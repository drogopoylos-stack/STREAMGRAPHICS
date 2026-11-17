// GRAPHICS & EXPORT: render all, single render, output folder, and every PNG already in it.
import { h, setKids, copyText, keyedList } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtStamp } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { trackJob, latestJob, onAnyJob, getJob, watchJob } from '../jobs.js';
import { toast, toastError, busy, btn, sectionHead, panel, field, ctlText, ctlSelect, ctlSegmented, copyField, jobView, imgBox, emptyState, badge } from '../ui.js';
import { sceneBuilder } from '../builder.js';
import { cueText, sceneUrl, sceneName } from '../scenes.js';
import { backgroundPanel } from '../background-panel.js';
import { feedPanel } from '../feed-panel.js';
import { filterMenu, applyFacets } from '../filter-menu.js';
import { guessScene } from '../../../shared/output-types.js';
import { dimensionsFor, isPortrait, SCENE_DEFINITIONS } from '../../../shared/scenes.js';

export const id = 'graphics';
let els = null;
let shownJob = null;
let files = null; // [{ name, file, url, mtime }] newest first; null = not loaded yet
const fresh = new Set(); // file names rendered by this panel since it was opened
let loading = null;

const baseName = (r) => r.name ?? String(r.file ?? '').split(/[\\/]/).pop();

export function mount(root) {
  const s = store.state;
  const social = store.access?.edition === 'social';
  const outField = copyField(s.settings.outputDir);
  const outPanel = panel(t('graphics.outputDir'),
    outField,
    h('p.panel-sub', t('graphics.outputHint')),
    h('p.field-hint', t('graphics.outputHint2')));
  outPanel.hidden = social;

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
  allPanel.hidden = social;

  const previewFrame = h('iframe.export-preview-frame', { title: t('graphics.preview'), scrolling: 'no' });
  const preview = h('div.export-preview.checker', previewFrame);
  let previewSize = { width: 1920, height: 1080 };
  const fitPreview = () => preview.style.setProperty('--preview-scale', String(preview.clientWidth / previewSize.width));
  const paintPreview = cue => {
    previewSize = dimensionsFor(cue.scene, cue.params);
    preview.style.aspectRatio = `${previewSize.width} / ${previewSize.height}`;
    preview.classList.toggle('is-portrait', isPortrait(cue.scene, cue.params));
    previewFrame.style.width = `${previewSize.width}px`;
    previewFrame.style.height = `${previewSize.height}px`;
    const url = sceneUrl(cue.scene, cue.params, { static: 1 });
    if (previewFrame.getAttribute('src') !== url) previewFrame.src = url;
    fitPreview();
  };
  // Animation preview: the same graphic with its animations, as in the MP4 video (Replay starts it again).
  const animFrame = h('iframe.export-preview-frame', { title: t('graphics.animTitle'), scrolling: 'no' });
  const animBox = h('div.export-preview.checker', animFrame);
  let animSize = { width: 1920, height: 1080 };
  const fitAnim = () => animBox.style.setProperty('--preview-scale', String(animBox.clientWidth / animSize.width));
  const paintAnim = cue => {
    animSize = dimensionsFor(cue.scene, cue.params);
    animBox.style.aspectRatio = `${animSize.width} / ${animSize.height}`;
    animBox.classList.toggle('is-portrait', isPortrait(cue.scene, cue.params));
    animFrame.style.width = `${animSize.width}px`;
    animFrame.style.height = `${animSize.height}px`;
    const url = sceneUrl(cue.scene, cue.params);
    if (animFrame.getAttribute('src') !== url) animFrame.src = url;
    fitAnim();
  };
  const replayBtn = btn(t('graphics.animReplay'), { size: 'sm', iconName: 'play', onclick: () => { try { animFrame.contentWindow.location.reload(); } catch { animFrame.src = animFrame.getAttribute('src'); } } });
  const animPanel = panel(t('graphics.animTitle'), h('p.panel-sub', t('graphics.animSub')), animBox, h('div.panel-actions', replayBtn));
  new ResizeObserver(fitAnim).observe(animBox);
  const builder = sceneBuilder({ onChange: cue => { paintPreview(cue); paintAnim(cue); }, sceneFilter: scene => !social || scene.startsWith('social-') });
  builder.set({ scene: social ? 'social-schedule' : 'schedule', params: { day: 'today' } });
  new ResizeObserver(fitPreview).observe(preview);
  const name = ctlText({ placeholder: t('graphics.fileNameHint'), mono: true });
  // PNG (still) or MP4 (animated, for videos on Instagram / TikTok).
  const outType = ctlSegmented({ options: [{ value: 'png', label: t('graphics.typePng') }, { value: 'mp4', label: t('graphics.typeMp4') }], value: 'png', size: 'sm' });
  const seconds = ctlSelect({ value: 'auto', options: [{ value: 'auto', label: t('graphics.lengthAuto') }, ...[5, 8, 10, 15].map(n => ({ value: String(n), label: t('graphics.lengthN', { n }) }))] });
  const secondsField = field(t('graphics.length'), seconds, { hint: t('graphics.lengthHint') });
  secondsField.hidden = true;
  const renderBtn = btn(t('graphics.render'), { kind: 'primary', iconName: 'image' });
  outType.el.addEventListener('change', () => {
    const video = outType.get() === 'mp4';
    secondsField.hidden = !video;
    renderBtn.querySelector('span:last-child').textContent = t(video ? 'graphics.renderVideo' : 'graphics.render');
  });
  const singleOut = h('div.grid.grid-renders');
  const saveBtn = btn(t('live.saveGraphic'), { iconName: 'plus' });
  saveBtn.hidden = social;
  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    const cue = builder.get();
    try { await api.post('/api/graphics', { name: name.get() || cueText(cue.scene, cue.params), ...cue }); store.refresh(); toast(t('live.graphicSaved'), 'ok'); }
    catch (error) { toastError(error); }
  }));
  renderBtn.addEventListener('click', () => busy(renderBtn, async () => {
    const cue = builder.get();
    const body = { scene: cue.scene, params: cue.params };
    if (name.get()) body.name = cue.params?.format ? `${name.get()}-${cue.params.format}` : name.get();
    if (outType.get() === 'mp4') {
      try {
        const job = trackJob(await api.post('/api/render/video', { ...body, seconds: seconds.get() }));
        setKids(singleOut, jobView(job.id, { compact: true }));
        const stop = watchJob(job.id, current => {
          if (current.status === 'running') return;
          stop();
          if (current.status !== 'done' || !current.result) { toastError(new Error(current.message || t('graphics.videoFailed'))); return; }
          fresh.add(baseName(current.result));
          setKids(singleOut, renderCard({ ...current.result, label: cueText(cue.scene, cue.params), mtime: Date.now() }, { lazy: false }));
          toast(t('live.exported', { name: baseName(current.result) }), 'ok');
          loadFiles();
        });
      } catch (e) { toastError(e); }
      return;
    }
    try {
      const r = await api.post('/api/render', body);
      fresh.add(baseName(r));
      setKids(singleOut, renderCard({ ...r, label: cueText(cue.scene, cue.params), mtime: Date.now() }, { lazy: false }));
      toast(t('live.exported', { name: baseName(r) }), 'ok');
      loadFiles();
    } catch (e) { toastError(e); }
  }));
  const singlePanel = panel(t('graphics.single'), h('p.panel-sub', t('graphics.singleSub')),
    builder.el, preview, field(t('graphics.output'), outType), secondsField, field(t('graphics.fileName'), name), h('div.panel-actions', renderBtn, saveBtn), singleOut);
  const backgrounds = backgroundPanel({ socialOnly: social });

  // Every PNG in the output folder (also renders from earlier sessions), with the menu of the Live page.
  const refreshBtn = btn(t('graphics.refresh'), { size: 'sm', iconName: 'refresh', onclick: () => busy(refreshBtn, () => loadFiles()) });
  const filesSub = h('span.files-sub');
  const filesGrid = h('div.grid.grid-renders.files-grid', { role: 'list' });
  const filesMsg = h('div.files-msg');
  const filesMore = h('button.btn.btn-sm.graphic-more', { type: 'button', hidden: true, onclick: () => { fileLimit += FILE_PAGE; paintFiles(); } });
  const filesMenu = filterMenu({
    searchLabel: t('graphics.filesFilter'), storageKey: 'output-files', extra: [refreshBtn], onChange: () => { fileLimit = FILE_PAGE; paintFiles(); },
    rows: [{ id: 'type', label: t('graphics.filesTypes'), allLabel: t('live.browse.allTypes') }, { id: 'when', label: t('graphics.filesWhen'), allLabel: t('live.browse.all'), secondary: true }],
  });
  const filesPanel = h('section.panel.files-panel',
    h('div.files-head', h('div.files-titles', h('h2.panel-title', t('graphics.files')), filesSub)),
    filesMenu.el, filesMsg, filesGrid, filesMore);

  root.append(sectionHead(t('graphics.title'), t(social ? 'remote.socialGraphicsSub' : 'graphics.sub')),
    h('div.graphics-grid', h('div.col', social ? feedPanel() : null, allPanel, animPanel, backgrounds.el, outPanel), h('div.col', singlePanel)),
    filesPanel);
  els = { outField, jobHost, builder, allBtn, filesSub, filesGrid, filesMsg, filesMenu, filesMore, backgrounds, paintPreview, paintAnim };
  paintPreview(builder.get());
  paintAnim(builder.get());
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
      files = Array.isArray(list) ? list.filter(f => store.access?.edition !== 'social' || fileType(f).startsWith('social-')).sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0)) : [];
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
  const menu = els.filesMenu;
  menu.forTournament(store.state?.activeTournamentId);
  const { shown, counts, totals } = applyFacets(files, menu, { type: fileType, when: (f) => fileWhen(f.mtime) }, (f) => `${f.name} ${typeLabel(fileType(f))}`);
  const types = [...counts.type.keys()].sort((a, b) => typeOrder(a) - typeOrder(b));
  menu.paintRow('type', types.map((id) => ({ id, label: typeLabel(id), count: counts.type.get(id) })), totals.type);
  menu.paintRow('when', WHEN.map((id) => ({ id, label: t(`graphics.when.${id}`), count: counts.when.get(id) ?? 0 })), totals.when);
  menu.setCount(t('graphics.filesCount', { n: shown.length }));
  els.filesSub.textContent = shown.length === files.length
    ? t('graphics.filesSub', { n: files.length })
    : t('graphics.filesFiltered', { shown: shown.length, n: files.length });
  if (!els.filesMsg.classList.contains('is-error')) {
    if (!files.length) setKids(els.filesMsg, emptyState({ iconName: 'image', title: t('graphics.filesEmpty'), body: t('graphics.filesEmptyBody') }));
    else if (!shown.length) setKids(els.filesMsg, h('p.muted', t('live.browse.empty')));
    else els.filesMsg.replaceChildren();
  }
  keyedList(els.filesGrid, shown.slice(0, fileLimit), (f) => f.name, (f) => renderCard(f, { lazy: true, role: 'listitem' }), (f) => JSON.stringify([f.url, f.mtime, fresh.has(f.name)]));
  els.filesMore.hidden = shown.length <= fileLimit;
  els.filesMore.textContent = t('live.browse.more', { n: shown.length - fileLimit });
}

const WHEN = ['today', 'yesterday', 'week', 'older'];
const FILE_PAGE = 12;
let fileLimit = FILE_PAGE;
const fileType = (f) => f.scene || guessScene(f.name);
const typeOrder = (id) => { const i = SCENE_DEFINITIONS.findIndex((s) => s.id === id); return i < 0 ? 99 : i; };
function typeLabel(id) {
  if (id === 'other') return t('live.browse.other');
  const label = t(`live.browse.typeLabels.${id}`);
  return label.startsWith('live.browse.') ? sceneName(id) : label;
}
/** today / yesterday / last 7 days / older, from the local calendar day of the file. */
function fileWhen(mtime) {
  const day = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(Date.now()) - day(mtime || 0)) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? 'week' : 'older';
}

function renderCard(r, { lazy = true, role } = {}) {
  const nm = baseName(r);
  const video = r.video || /\.mp4$/i.test(nm);
  const downloadBtn = h('a.btn.btn-sm.btn-ghost', { href: r.url, download: nm }, icon(video ? 'play' : 'image', 14), h('span', t(video ? 'graphics.downloadMp4' : 'graphics.downloadPng')));
  const ratio = r.width && r.height ? `${r.width} / ${r.height}` : '16 / 9';
  const thumb = video
    ? h('div.render-thumb', h('video.render-video', { src: `${r.url}#t=3`, muted: true, loop: true, playsinline: true, controls: true, preload: 'metadata', style: { aspectRatio: ratio } }))
    : h('a.render-thumb', { href: r.url, target: '_blank', rel: 'noopener', title: t('graphics.openPng') }, imgBox(r.url, { ratio, lazy }));
  const copyBtn = h('button.btn.btn-sm.btn-ghost', { type: 'button', title: r.file }, icon('copy', 14), h('span', t('graphics.copyPath')));
  copyBtn.addEventListener('click', async () => { if (await copyText(r.file)) toast(t('common.copied'), 'ok', { timeout: 1200 }); });
  return h('article.render-card', role ? { role } : {},
    thumb,
    h('div.render-body',
      h('div.render-name', { title: nm }, nm),
      h('div.render-sub',
        r.mtime ? h('span', fmtStamp(r.mtime)) : null,
        r.label ? h('span', r.label) : null,
        fresh.has(nm) ? badge(t('graphics.newBadge'), 'gold', t('graphics.newTitle')) : null),
      h('div.render-actions', copyBtn, h('a.btn.btn-sm.btn-ghost', { href: r.url, target: '_blank', rel: 'noopener' }, icon('external', 14), h('span', t('graphics.openPng'))), downloadBtn)));
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
  els.backgrounds.update(state);
  els.paintPreview(els.builder.get());
  els.paintAnim(els.builder.get());
  paintJob();
}
