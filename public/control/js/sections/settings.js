// SETTINGS: league, look, uploads, photo pipeline, stat definitions, bracket embed, paths.
import { h, setKids, debounce } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { trackJob } from '../jobs.js';
import {
  toast, toastError, busy, btn, sectionHead, panel, field, createForm, confirmDialog, iconBtn,
  ctlText, ctlNumber, ctlSegmented, ctlToggle, ctlRange, ctlColor, ctlTextarea, dropZone, jobView,
} from '../ui.js';

export const id = 'settings';
let els = null;
let form = null;

const TZ = ['Europe/Athens', 'Europe/Nicosia', 'Europe/London', 'Europe/Berlin', 'UTC'];

export function mount(root) {
  form = createForm();
  const F = (path, ctl) => form.add(path, ctl);

  // League
  const leaguePanel = panel(t('settings.league'),
    h('div.form-grid',
      field(t('settings.leagueName'), F('leagueName', ctlText()), { span: 2 }),
      field(t('settings.leagueShort'), F('leagueShort', ctlText({ maxlength: 8 }))),
      field(t('settings.season'), F('season', ctlText())),
      field(t('settings.timezone'), F('timezone', ctlText({ list: 'tz-list' })), { span: 2, hint: t('settings.timezoneHint') }),
      h('datalist', { id: 'tz-list' }, TZ.map((z) => h('option', { value: z })))));

  // Look
  const preset = F('theme.preset', ctlPreset());
  const bgZone = dropZone({ src: null, ratio: '16 / 9', fit: 'cover', onFile: (file) => brandUpload('bg', file) });
  const bgReset = btn(t('settings.usePreset'), { size: 'sm', iconName: 'refresh' });
  bgReset.addEventListener('click', () => busy(bgReset, async () => {
    try { await api.put('/api/settings', { theme: { bgImage: null } }); toast(t('settings.bgReset'), 'ok'); store.refresh(); } catch (e) { toastError(e); }
  }));
  const logoZone = dropZone({ src: null, ratio: '1 / 1', onFile: (file) => brandUpload('league-logo', file) });
  const logoReset = btn(t('settings.resetLogo'), { size: 'sm', iconName: 'refresh' });
  logoReset.addEventListener('click', () => busy(logoReset, async () => {
    try { await api.put('/api/settings', { leagueLogo: '/brand/hll-logo.png' }); toast(t('common.saved'), 'ok'); store.refresh(); } catch (e) { toastError(e); }
  }));
  const lookPanel = panel(t('settings.look'),
    field(t('settings.mode'), F('mode', ctlSegmented({ options: [{ value: 'full', label: t('settings.modeFull') }, { value: 'simple', label: t('settings.modeSimple') }] })), { hint: t('settings.modeHint') }),
    field(t('settings.preset'), preset, { hint: t('settings.presetHint') }),
    h('div.form-grid.cols-4',
      field(t('settings.primary'), F('theme.primary', ctlColor())),
      field(t('settings.accent'), F('theme.accent', ctlColor())),
      field(t('settings.accent2'), F('theme.accent2', ctlColor())),
      field(t('settings.text'), F('theme.text', ctlColor()))),
    h('div.upload-pair',
      h('div.form-block', h('div.block-head', h('h3.block-title', t('settings.background')), bgReset), bgZone, h('p.field-hint', t('settings.backgroundHint'))),
      h('div.form-block.logo-block', h('div.block-head', h('h3.block-title', t('settings.leagueLogo')), logoReset), logoZone, h('p.field-hint', t('settings.leagueLogoHint')))));

  // Photo pipeline
  const reAll = btn(t('settings.reprocessAll'), { iconName: 'refresh' });
  const reJob = h('div.job-host');
  reAll.addEventListener('click', () => busy(reAll, async () => {
    if (form.dirty()) {
      const ok = await confirmDialog({ title: t('settings.saveFirstQ'), body: t('settings.saveFirstBody'), ok: t('common.saveChanges'), danger: false });
      if (!ok) return;
      if (!(await save())) return;
    }
    try {
      const job = trackJob(await api.post('/api/assets/reprocess', { kind: 'all-players' }));
      setKids(reJob, jobView(job.id, { formatResult: (r) => h('div.result-line', icon('check', 14), `${r.players ?? 0} players`) }));
    } catch (e) { toastError(e); }
  }));
  const photoPanel = panel(t('settings.photo'), h('p.panel-sub', t('settings.photoSub')),
    h('div.form-grid',
      field(t('settings.width'), F('photo.width', ctlNumber({ min: 200, max: 3000, step: 10 }))),
      field(t('settings.height'), F('photo.height', ctlNumber({ min: 200, max: 3000, step: 10 }))),
      field(t('settings.framing'), F('photo.framing', ctlSegmented({ options: [{ value: 'upper', label: t('settings.framingUpper') }, { value: 'full', label: t('settings.framingFull') }], size: 'sm' })), { span: 2 }),
      h('div.span-2', F('photo.removeBg', ctlToggle({ label: t('settings.removeBg') })).el),
      h('div.span-2', F('photo.harmonize', ctlToggle({ label: t('settings.harmonize'), hint: t('settings.harmonizeHint') })).el),
      field(t('settings.strength'), F('photo.strength', ctlRange({ min: 0, max: 1, step: 0.05 })), { span: 2 })),
    h('div.panel-actions.split', h('p.field-hint', t('settings.reprocessAllHint')), reAll),
    reJob);

  // Stats
  const statsPanel = panel(t('settings.stats'), h('p.panel-sub', t('settings.statsSub')), F('statDefs', ctlStatDefs()).el, h('p.field-hint', t('settings.statKeyHint')));

  // Bracket
  const embed = F('bracketEmbed', ctlTextarea({ rows: 4, placeholder: '<iframe src="https://challonge.com/…/module" …></iframe>' }));
  const embedType = h('div.embed-type');
  const embedPrev = h('div.embed-preview.checker');
  const paintEmbed = () => {
    const e = parseEmbed(embed.get());
    embedType.className = `embed-type is-${e.type}`;
    setKids(embedType, icon(e.type === 'iframe' || e.type === 'url' ? 'check' : e.type === 'none' ? 'info' : 'alert', 14), t(`settings.bracketType.${e.type}`), e.src ? h('code', e.src) : null);
    const cur = embedPrev.querySelector('iframe');
    if (!e.src) { embedPrev.replaceChildren(h('div.screen-empty', icon('bracket', 26), h('span', t('settings.bracketType.none')))); return; }
    if (cur?.getAttribute('src') === e.src) return;
    embedPrev.replaceChildren(h('iframe', { src: e.src, title: t('settings.bracketPreview'), loading: 'lazy', referrerpolicy: 'no-referrer' }));
  };
  embed.el.addEventListener('input', debounce(paintEmbed, 500));
  const bracketPanel = panel(t('settings.bracket'), h('p.panel-sub', t('settings.bracketSub')), embed.el, embedType, embedPrev);

  // Files & sources
  const sysPanel = panel(t('settings.system'),
    h('div.form-grid',
      field(t('settings.outputDir'), F('outputDir', ctlText({ mono: true })), { span: 2, hint: t('settings.outputDirHint') }),
      field(t('settings.hllgrBase'), F('hllgr.baseUrl', ctlText({ mono: true, type: 'url' })), { span: 2 })));

  // Save bar
  const saveBtn = btn(t('common.saveChanges'), { kind: 'primary', kbd: 'Ctrl+S', onclick: () => save() });
  const discardBtn = btn(t('common.discard'), { onclick: () => { fillFromState(true); } });
  const bar = h('div.save-bar', { hidden: true, role: 'region', 'aria-label': t('common.unsaved') },
    h('span.save-bar-msg', icon('alert', 16), t('common.unsaved')), h('div.spacer'), discardBtn, saveBtn);

  const body = h('div.settings-grid',
    h('div.col', leaguePanel, lookPanel, sysPanel),
    h('div.col', photoPanel, statsPanel, bracketPanel));
  root.append(sectionHead(t('settings.title'), t('settings.sub')), body, bar);
  root.addEventListener('input', paintDirty);
  root.addEventListener('change', paintDirty);
  root.addEventListener('click', (e) => { if (e.target.closest('.stat-defs')) setTimeout(paintDirty, 0); });

  els = { bar, saveBtn, bgZone, bgReset, logoZone, logoReset, paintEmbed };
  fillFromState(true);
}

function paintDirty() {
  if (!els) return;
  els.bar.hidden = !form.dirty();
}

function fillFromState(force) {
  const s = store.state?.settings;
  if (!s || !form) return;
  if (force || !form.dirty()) {
    form.fill(s);
    form.snapshot();
    els.paintEmbed();
  }
  els.bgZone.setSrc(s.theme?.bgImage || `/brand/${s.theme?.preset ?? 'sparta'}-main.jpg`);
  els.bgReset.hidden = !s.theme?.bgImage;
  els.logoZone.setSrc(s.leagueLogo || '/brand/hll-logo.png');
  els.logoReset.hidden = !s.leagueLogo || s.leagueLogo === '/brand/hll-logo.png';
  paintDirty();
}

/** Ctrl+S on this page. Resolves true when saved. */
export async function save() {
  if (!form.dirty()) return true;
  const patch = form.changed();
  if (patch.statDefs) {
    const bad = patch.statDefs.find((d) => !d.key);
    if (bad) { toast(`${t('settings.statKey')}?`, 'error'); return false; }
  }
  let ok = false;
  await busy(els.saveBtn, async () => {
    try {
      await api.put('/api/settings', patch);
      form.snapshot();
      paintDirty();
      toast(t('settings.savedToast'), 'ok');
      store.refresh();
      ok = true;
    } catch (e) { toastError(e); }
  });
  return ok;
}

export const onSave = save;
export const isDirty = () => !!form?.dirty();

async function brandUpload(slot, file) {
  try {
    await api.brandUpload(slot, file);
    toast(slot === 'bg' ? t('settings.uploadedBg') : t('settings.uploadedLogo'), 'ok');
    store.refresh();
  } catch (e) { toastError(e); }
}

export function update() {
  if (!els) return;
  fillFromState(false);
}

/* ---------------------------------------------------------- controls */

function ctlPreset() {
  let cur = 'sparta';
  const opts = [{ value: 'sparta', label: t('settings.presetSparta') }, { value: 'aegean', label: t('settings.presetAegean') }];
  const el = h('div.preset-pick', { role: 'radiogroup' });
  const btns = opts.map((o) => {
    const b = h('button.preset', { type: 'button', role: 'radio' },
      h('span.preset-img', { style: { backgroundImage: `url(/brand/${o.value}-main.jpg)` } }),
      h('span.preset-name', o.label));
    b._v = o.value;
    b.addEventListener('click', () => { cur = o.value; paint(); el.dispatchEvent(new Event('change', { bubbles: true })); });
    return b;
  });
  el.append(...btns);
  const paint = () => btns.forEach((b) => { b.setAttribute('aria-checked', b._v === cur ? 'true' : 'false'); });
  paint();
  return { el, focusEl: btns[0], get: () => cur, set: (v) => { cur = v ?? 'sparta'; paint(); } };
}

function ctlStatDefs() {
  const rows = h('div.stat-rows');
  const addBtn = btn(t('settings.addStat'), { size: 'sm', iconName: 'plus' });
  const head = h('div.stat-row.stat-head', h('span', t('settings.statKey')), h('span', t('settings.statLabel')), h('span', t('settings.statBetter')), h('span', t('settings.statFmt')), h('span'));
  const el = h('div.stat-defs', head, rows, addBtn);
  const mkRow = (d = { key: '', label: '', better: 'high', fmt: 'int' }) => {
    const key = h('input.input.mono', { type: 'text', 'aria-label': t('settings.statKey'), spellcheck: 'false' });
    key.value = d.key ?? '';
    const label = h('input.input', { type: 'text', 'aria-label': t('settings.statLabel') });
    label.value = d.label ?? '';
    const better = h('select.input.select', { 'aria-label': t('settings.statBetter') }, ['high', 'low'].map((v) => h('option', { value: v }, t(`settings.better.${v}`))));
    better.value = d.better ?? 'high';
    const fmt = h('select.input.select', { 'aria-label': t('settings.statFmt') }, ['int', 'dec1', 'dec2', 'pct'].map((v) => h('option', { value: v }, `${v} · ${t(`settings.fmt.${v}`)}`)));
    fmt.value = d.fmt ?? 'int';
    const row = h('div.stat-row', key, label, better, fmt,
      h('div.stat-btns',
        iconBtn('up', t('settings.moveUp'), () => { row.previousElementSibling?.before(row); changed(); }, { size: 'sm' }),
        iconBtn('down', t('settings.moveDown'), () => { row.nextElementSibling?.after(row); changed(); }, { size: 'sm' }),
        iconBtn('trash', t('settings.remove'), () => { row.remove(); changed(); }, { size: 'sm' })));
    row._get = () => ({ key: key.value.trim(), label: label.value.trim() || key.value.trim(), better: better.value, fmt: fmt.value });
    return row;
  };
  const changed = () => el.dispatchEvent(new Event('change', { bubbles: true }));
  addBtn.addEventListener('click', () => { const r = mkRow(); rows.append(r); r.querySelector('input').focus(); changed(); });
  return {
    el, focusEl: addBtn,
    get: () => [...rows.children].map((r) => r._get()),
    set: (arr) => { rows.replaceChildren(...(arr ?? []).map((d) => mkRow(d))); },
  };
}

/** Same rules as the server (scenes.js parseEmbed). */
function parseEmbed(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { type: 'none', src: '' };
  const m = v.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (m) return { type: 'iframe', src: m[1] };
  if (/^https?:\/\//i.test(v)) return { type: 'url', src: v };
  return { type: 'html', src: '' };
}

