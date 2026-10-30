// SPONSORS: list, tier, logo upload, on-graphics toggle.
import { h, keyedList } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import {
  toast, toastError, busy, btn, badge, imgBox, droppable, dropZone, emptyState, sectionHead,
  openDrawer, closeDrawer, drawerState, confirmDialog, createForm, field, ctlText, ctlSegmented, ctlToggle,
} from '../ui.js';

export const id = 'sponsors';
let els = null;

export function mount(root) {
  const head = sectionHead(t('sponsors.title'), '', btn(t('sponsors.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }));
  const onG = ctlToggle({ value: !!store.state.settings.sponsorsOnGraphics, label: t('sponsors.onGraphics'), hint: t('sponsors.onGraphicsHint') });
  onG.input.addEventListener('change', async () => {
    const v = onG.get();
    try {
      await api.put('/api/settings', { sponsorsOnGraphics: v });
      toast(v ? t('sponsors.turnedOn') : t('sponsors.turnedOff'), 'ok');
      store.refresh();
    } catch (e) { toastError(e); onG.set(!v); }
  });
  const grid = h('div.grid.grid-sponsors');
  const empty = h('div', { hidden: true }, emptyState({ iconName: 'sponsors', title: t('sponsors.empty'), body: t('sponsors.emptyBody'), action: btn(t('sponsors.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }) }));
  root.append(head, h('div.panel.panel-inline', onG.el), grid, empty);
  els = { head, grid, empty, onG };
  update(store.state);
}

async function upload(sponsorId, file) {
  try {
    await api.upload('sponsor', sponsorId, file);
    toast(t('common.uploaded'), 'ok');
    store.refresh();
    return true;
  } catch (e) { toastError(e); return false; }
}

function card(s) {
  const busyEl = h('div.drop-busy', { hidden: true }, h('span.spinner'));
  const el = h('div.ent-card.sponsor-card', { tabIndex: 0, role: 'button', 'aria-label': `${t('common.edit')} ${s.name}`, dataset: { id: s.id } },
    h('div.ent-media', imgBox(s.logo, { ratio: '16 / 9', cls: 'card-img', label: t('sponsors.noLogo') }), busyEl, h('div.drop-hint', icon('upload', 18), t('common.dropRelease'))),
    h('div.ent-body',
      h('div.ent-title-row', h('span.ent-title', s.name), badge(s.tier === 'main' ? t('sponsors.main') : t('sponsors.partner'), s.tier === 'main' ? 'gold' : 'muted'))));
  el.addEventListener('click', () => edit(s.id));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(s.id); } });
  droppable(el, async (file) => { busyEl.hidden = false; await upload(s.id, file); busyEl.hidden = true; });
  return el;
}

export function update(state) {
  if (!els || !state) return;
  if (document.activeElement !== els.onG.input) els.onG.set(!!state.settings.sponsorsOnGraphics);
  const list = [...state.sponsors].sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === 'main' ? -1 : 1));
  els.head.setSub(t('sponsors.sub', { n: list.length }));
  els.empty.hidden = list.length > 0;
  keyedList(els.grid, list, (s) => s.id, card);
  const key = drawerState()?.key;
  for (const c of els.grid.children) c.classList.toggle('is-editing', key === `sponsor:${c.dataset.id}`);
}

export async function edit(sponsorId) {
  const isNew = !sponsorId;
  const sp = isNew ? null : store.sponsor(sponsorId);
  if (!isNew && !sp) return;
  const f = createForm();
  const name = f.add('name', ctlText({ value: sp?.name ?? '', maxlength: 60 }));
  const tier = f.add('tier', ctlSegmented({ options: [{ value: 'main', label: t('sponsors.main') }, { value: 'partner', label: t('sponsors.partner') }], value: sp?.tier ?? 'partner', size: 'sm' }));
  f.snapshot();
  const logo = dropZone({ src: sp?.logo ?? null, ratio: '16 / 9', disabled: isNew, onFile: (file) => upload(sponsorId, file) });
  const body = h('div.form-stack',
    h('div.form-block', h('div.block-head', h('h3.block-title', t('sponsors.logo'))), logo, h('p.field-hint', t('teams.logoHint'))),
    h('div.form-grid', field(t('sponsors.name'), name, { span: 2 }), field(t('sponsors.tier'), tier, { span: 2 })));

  const saveBtn = btn(isNew ? t('common.create') : t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    const v = f.values();
    if (!v.name) { toast(`${t('sponsors.name')}?`, 'error'); name.el.focus(); return; }
    try {
      if (isNew) {
        const created = await api.post('/api/sponsors', v);
        toast(t('common.created'), 'ok');
        f.snapshot();
        store.state.sponsors.push(created);
        store.idx.sponsors.set(created.id, created);
        await closeDrawer({ force: true });
        edit(created.id);
      } else {
        await api.put(`/api/sponsors/${sponsorId}`, f.changed());
        f.snapshot();
        toast(t('common.saved'), 'ok');
      }
      store.refresh();
    } catch (e) { toastError(e); }
  });
  saveBtn.addEventListener('click', save);
  const delBtn = isNew ? null : btn(t('common.delete'), { kind: 'danger', iconName: 'trash' });
  delBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('common.confirmDelete', { name: sp.name }), body: t('common.confirmDeleteBody') });
    if (!ok) return;
    try {
      await api.del(`/api/sponsors/${sponsorId}`);
      toast(t('common.deleted'), 'ok');
      await closeDrawer({ force: true });
      store.refresh();
    } catch (e) { toastError(e); }
  });

  await openDrawer({
    key: isNew ? 'sponsor:new' : `sponsor:${sponsorId}`,
    title: isNew ? t('sponsors.newTitle') : sp.name,
    subtitle: isNew ? null : t('sponsors.editTitle'),
    body,
    footer: [delBtn, h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => f.dirty(),
    onSave: save,
    onState: () => {
      if (isNew) return;
      const cur = store.sponsor(sponsorId);
      if (!cur) { closeDrawer({ force: true }); toast(t('common.notFoundClosed'), 'info'); return; }
      logo.setSrc(cur.logo);
    },
    onClose: () => els && update(store.state),
  });
  if (els) update(store.state);
}
