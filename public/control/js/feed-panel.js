// Social PC copy (see server/feed.js).
// feedPanel: HLL Social connects to the broadcaster's copy and gets updates when the operator asks.
// publishPanel: the broadcaster publishes a copy of the chosen tournaments to the online address.
import { h } from './dom.js';
import { t, fmtStamp } from './strings.js';
import { api } from './api.js';
import { store } from './store.js';
import { trackJob, watchJob } from './jobs.js';
import { panel, btn, ctlText, ctlCheck, copyField, toast, toastError, confirmDialog, badge, jobView } from './ui.js';

const KIND = { ok: 'gold', updating: 'muted', offline: 'warn', error: 'warn', idle: 'muted', off: '' };

export function feedPanel() {
  // Only the operator at this PC connects it: remote links never manage the copy.
  if (store.access?.remote !== false) return null;
  const status = h('div.inline-row', { role: 'status', 'aria-live': 'polite' });
  const detail = h('p.panel-sub');
  const copyInfo = h('p.field-hint');
  const link = ctlText({ placeholder: 'https://…/__hll/feed?key=…', mono: true });
  const connectBtn = btn(t('feed.connect'), { kind: 'primary', size: 'sm', onclick: async () => {
    connectBtn.disabled = true;
    try { paint(await api.put('/api/feed/client', { link: link.get() })); link.set(''); toast(t('feed.connecting'), 'ok'); }
    catch (error) { toastError(error); }
    finally { connectBtn.disabled = false; }
  } });
  const updateBtn = btn(t('feed.update'), { kind: 'primary', size: 'sm', iconName: 'refresh', onclick: async () => {
    try { paint(await api.post('/api/feed/client/update')); } catch (error) { toastError(error); }
  } });
  const disconnectBtn = btn(t('feed.disconnect'), { size: 'sm', onclick: async () => {
    if (!await confirmDialog({ title: t('feed.disconnectTitle'), body: t('feed.disconnectBody'), ok: t('feed.disconnect') })) return;
    try { paint(await api.del('/api/feed/client')); } catch (error) { toastError(error); }
  } });
  const connectRow = h('div.form-stack', link.el, h('div.inline-row', connectBtn));
  const connectedRow = h('div.inline-row', updateBtn, disconnectBtn);

  function paint(state) {
    if (!state) return;
    connectRow.hidden = state.connected;
    connectedRow.hidden = !state.connected;
    updateBtn.disabled = state.status === 'updating';
    const label = state.connected ? t(`feed.status.${state.status}`) : t('feed.status.off');
    status.replaceChildren(badge(label, KIND[state.status] ?? ''), state.lastUpdate ? h('span.muted', t('feed.lastUpdate', { when: fmtStamp(state.lastUpdate) })) : null);
    detail.textContent = state.message || (state.connected ? t('feed.connectedHint') : t('feed.intro'));
    copyInfo.textContent = state.publishedAt ? `${t('feed.published', { when: fmtStamp(state.publishedAt) })} · ${state.tournaments.join(' · ')}` : '';
  }

  api.get('/api/feed/client').then(paint).catch(() => {});
  window.addEventListener('hll:feed', event => paint(event.detail));
  return panel(t('feed.title'), detail, status, copyInfo, connectRow, connectedRow);
}

export function publishPanel() {
  if (store.access?.remote !== false) return null;
  const intro = h('p.panel-sub', t('feed.publishIntro'));
  const info = h('p.field-hint');
  const linkField = copyField('');
  const choices = h('div.feed-tournaments');
  const jobHost = h('div.job-host');
  const checks = new Map();
  const publishBtn = btn(t('feed.publishBtn'), { kind: 'primary', iconName: 'upload', onclick: async () => {
    const tournaments = [...checks].filter(([, c]) => c.get()).map(([id]) => id);
    publishBtn.disabled = true;
    try {
      const job = trackJob(await api.post('/api/feed/publish', { tournaments }));
      jobHost.replaceChildren(jobView(job.id, { compact: true }));
      const stop = watchJob(job.id, current => {
        if (current.status === 'running') return;
        stop(); publishBtn.disabled = false;
        if (current.status === 'done') toast(t('feed.publishDone'), 'ok'); else toastError(new Error(current.message));
        load();
      });
    } catch (error) { publishBtn.disabled = false; toastError(error); }
  } });

  function paint(state) {
    linkField.setValue(state.link || '');
    publishBtn.disabled = !state.configured || state.publishing;
    info.textContent = !state.configured ? t('feed.notConfigured')
      : state.lastPublished ? t('feed.lastPublished', { when: fmtStamp(state.lastPublished), n: state.tournaments?.length ?? 0, files: state.files }) : t('feed.neverPublished');
    checks.clear();
    choices.replaceChildren(...state.all.map(tr => {
      const check = ctlCheck({ value: !state.tournaments || state.tournaments.includes(tr.id), label: `${tr.name} · ${tr.teams} teams · ${tr.matches} matches` });
      checks.set(tr.id, check);
      return check.el;
    }));
  }
  const load = () => api.get('/api/feed/publish').then(paint).catch(error => { info.textContent = error.message; });
  load();
  window.addEventListener('hll:remote', () => load());
  return panel(t('feed.publishTitle'), intro, h('div.field-label', t('feed.choose')), choices, h('div.panel-actions', publishBtn), info, jobHost,
    h('div.field-label', t('feed.linkLabel')), linkField);
}
