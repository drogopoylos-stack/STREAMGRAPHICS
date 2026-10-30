// TEAMS: grid of teams, side editor, logo upload (drag-and-drop on card or editor).
import { h, keyedList, setKids } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import {
  toast, toastError, busy, btn, badge, imgBox, droppable, dropZone, emptyState, sectionHead,
  openDrawer, closeDrawer, drawerState, confirmDialog, createForm, field, ctlText, ctlColor, ctlToggle,
} from '../ui.js';

export const id = 'teams';
let els = null;
let goto = () => {};

export function mount(root, nav, ctx) {
  goto = nav;
  const head = sectionHead(t('teams.title'), '', btn(t('teams.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }));
  const grid = h('div.grid.grid-teams');
  const empty = h('div', { hidden: true }, emptyState({ iconName: 'teams', title: t('teams.empty'), body: t('teams.emptyBody') }));
  root.append(head, grid, empty);
  els = { head, grid, empty, ctx };
  update(store.state);
}

export async function upload(teamId, file) {
  try {
    await api.upload('team', teamId, file);
    toast(t('common.uploaded'), 'ok');
    store.refresh();
    return true;
  } catch (e) { toastError(e); return false; }
}

function card(tm) {
  const n = store.state.players.filter((p) => p.teamId === tm.id).length;
  const box = imgBox(tm.logo, { ratio: '16 / 10', cls: 'card-img' });
  const busyEl = h('div.drop-busy', { hidden: true }, h('span.spinner'));
  const el = h('div.ent-card.team-card', { tabIndex: 0, role: 'button', 'aria-label': `${t('common.edit')} ${tm.name}`, dataset: { id: tm.id } },
    h('div.ent-media', box, busyEl, h('div.drop-hint', icon('upload', 18), t('common.dropRelease'))),
    h('div.ent-body',
      h('div.ent-title-row', h('span.ent-title', tm.name), h('span.tag-chip', tm.tag)),
      h('div.ent-meta',
        h('span.swatches', h('span.swatch', { style: { background: tm.colors?.primary }, title: tm.colors?.primary }), h('span.swatch', { style: { background: tm.colors?.secondary }, title: tm.colors?.secondary })),
        h('span', t('teams.players', { n })),
        tm.hidden ? badge(t('common.hidden'), 'muted') : null,
        tm.source === 'hllgr' ? badge('hll.gr', 'src') : null)));
  if (tm.hidden) el.classList.add('is-hidden');
  if (drawerState()?.key === `team:${tm.id}`) el.classList.add('is-editing');
  el.addEventListener('click', () => edit(tm.id));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(tm.id); } });
  droppable(el, async (file) => {
    busyEl.hidden = false;
    await upload(tm.id, file);
    busyEl.hidden = true;
  });
  return el;
}

export function update(state) {
  if (!els || !state) return;
  const list = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));
  els.head.setSub(t('teams.sub', { n: list.length }));
  els.empty.hidden = list.length > 0;
  const counts = {};
  for (const p of state.players) counts[p.teamId] = (counts[p.teamId] ?? 0) + 1;
  keyedList(els.grid, list, (x) => x.id, card, (x) => JSON.stringify([x, counts[x.id] ?? 0]));
  markEditing();
}

function markEditing() {
  const key = drawerState()?.key;
  for (const c of els.grid.children) c.classList.toggle('is-editing', key === `team:${c.dataset.id}`);
}

/** Open the editor for a team id, or a new team (id = null). */
export async function edit(teamId) {
  const isNew = !teamId;
  const tm = isNew ? null : store.team(teamId);
  if (!isNew && !tm) return;
  const f = createForm();
  const name = f.add('name', ctlText({ value: tm?.name ?? '', maxlength: 80 }));
  const tag = f.add('tag', ctlText({ value: tm?.tag ?? '', maxlength: 8, upper: true }));
  const primary = f.add('colors.primary', ctlColor({ value: tm?.colors?.primary ?? '#444444' }));
  const secondary = f.add('colors.secondary', ctlColor({ value: tm?.colors?.secondary ?? '#888888' }));
  const hidden = f.add('hidden', ctlToggle({ value: !!tm?.hidden, label: t('teams.hidden'), hint: t('teams.hiddenHint') }));
  f.snapshot();

  const logoZone = dropZone({ src: tm?.logo ?? null, ratio: '16 / 10', disabled: isNew, onFile: (file) => upload(teamId, file) });
  const reBtn = btn(t('common.reprocess'), { size: 'sm', iconName: 'refresh' });
  reBtn.addEventListener('click', () => busy(reBtn, async () => {
    try { await api.post('/api/assets/reprocess', { kind: 'team', id: teamId }); toast(t('common.reprocessStarted'), 'info'); } catch (e) { toastError(e); }
  }));
  const nPlayers = isNew ? 0 : store.state.players.filter((p) => p.teamId === teamId).length;

  const body = h('div.form-stack',
    h('div.form-block',
      h('div.block-head', h('h3.block-title', t('teams.logo')), isNew ? null : reBtn),
      logoZone,
      h('p.field-hint', t('teams.logoHint'))),
    h('div.form-grid',
      field(t('teams.name'), name, { span: 2 }),
      field(t('teams.tag'), tag, { hint: t('teams.tagHint') }),
      h('div'),
      field(t('teams.primary'), primary),
      field(t('teams.secondary'), secondary),
      h('p.field-hint.span-2', t('teams.colorsHint')),
      h('div.span-2', hidden.el)),
    isNew ? null : h('div.form-links',
      h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { closeDrawer().then((ok) => ok && goto('players', { team: teamId })); } }, icon('players', 14), h('span', `${t('teams.viewPlayers')} (${nPlayers})`)),
      tm?.url ? h('a.btn.btn-sm.btn-ghost', { href: tm.url, target: '_blank', rel: 'noopener' }, icon('external', 14), h('span', t('common.hllgrLink'))) : null));

  const saveBtn = btn(isNew ? t('common.create') : t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    const v = f.values();
    if (!v.name) { toast(`${t('teams.name')}?`, 'error'); name.el.focus(); return; }
    try {
      if (isNew) {
        const created = await api.post('/api/teams', v);
        toast(t('common.created'), 'ok');
        f.snapshot();
        store.state.teams.push(created);
        store.idx.teams.set(created.id, created);
        await closeDrawer({ force: true });
        edit(created.id);
      } else {
        const patch = f.changed();
        if (patch.colors) patch.colors = v.colors;
        await api.put(`/api/teams/${teamId}`, patch);
        f.snapshot();
        toast(t('common.saved'), 'ok');
      }
      store.refresh();
    } catch (e) { toastError(e); }
  });
  saveBtn.addEventListener('click', save);
  const delBtn = isNew ? null : btn(t('common.delete'), { kind: 'danger', iconName: 'trash' });
  delBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('common.confirmDelete', { name: tm.name }), body: t('common.confirmDeleteBody') });
    if (!ok) return;
    try {
      await api.del(`/api/teams/${teamId}`);
      toast(t('common.deleted'), 'ok');
      await closeDrawer({ force: true });
      store.refresh();
    } catch (e) { toastError(e); }
  });

  await openDrawer({
    key: isNew ? 'team:new' : `team:${teamId}`,
    title: isNew ? t('teams.newTitle') : tm.name,
    subtitle: isNew ? null : t('teams.editTitle'),
    body,
    footer: [delBtn, h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => f.dirty(),
    onSave: save,
    onState: () => {
      if (isNew) return;
      const cur = store.team(teamId);
      if (!cur) { closeDrawer({ force: true }); toast(t('common.notFoundClosed'), 'info'); return; }
      logoZone.setSrc(cur.logo);
    },
    onClose: () => els && markEditing(),
  });
  if (els) markEditing();
}
