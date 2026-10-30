// MATCHUPS: featured player-vs-player comparisons.
import { h, keyedList } from '../dom.js';
import { t, fmtDate } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import {
  toast, toastError, busy, btn, emptyState, sectionHead, imgBox, iconBtn,
  openDrawer, closeDrawer, drawerState, confirmDialog, createForm, field, ctlText, ctlSelect, ctlCombo,
} from '../ui.js';
import { playerComboOptions, matchOptions, featureAutoTitle, matchLabel } from '../scenes.js';
import { cueAndShow } from './live.js';

export const id = 'matchups';
let els = null;

export function mount(root) {
  const head = sectionHead(t('matchups.title'), t('matchups.sub'), btn(t('matchups.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }));
  const grid = h('div.grid.grid-features');
  const empty = h('div', { hidden: true }, emptyState({ iconName: 'matchups', title: t('matchups.empty'), body: t('matchups.emptyBody'), action: btn(t('matchups.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }) }));
  root.append(head, grid, empty);
  els = { grid, empty };
  update(store.state);
}

function side(p, align) {
  const tm = store.team(p?.teamId);
  return h(`div.fx-side.fx-${align}`,
    imgBox(p?.photo ?? null, { ratio: '4 / 5', cls: 'fx-photo' }),
    h('div.fx-who',
      h('span.fx-nick', p?.nick ?? '?'),
      h('span.fx-meta', [tm?.tag, p?.role ? t(`roles.${p.role}`) : ''].filter(Boolean).join(' · '))));
}

function card(f) {
  const a = store.player(f.playerA), b = store.player(f.playerB);
  const m = store.match(f.matchId);
  const el = h('article.feature-card', { dataset: { id: f.id } },
    h('header.fx-head', h('h3.fx-title', f.title || featureAutoTitle(f)),
      m ? h('span.fx-match', `${matchLabel(m)} · ${fmtDate(m.date, 'short')}`) : null),
    h('div.fx-body', side(a, 'a'), h('span.fx-vs', 'VS'), side(b, 'b')),
    h('footer.fx-foot',
      btn(t('matchups.preview'), { kind: 'gold', size: 'sm', iconName: 'live', title: t('matchups.previewHint'), onclick: () => cueAndShow('matchup', { feature: f.id }) }),
      h('div.spacer'),
      btn(t('common.edit'), { size: 'sm', onclick: () => edit(f.id) }),
      iconBtn('trash', t('common.delete'), () => remove(f), { size: 'sm' })));
  return el;
}

async function remove(f) {
  const ok = await confirmDialog({ title: t('common.confirmDelete', { name: f.title || featureAutoTitle(f) }), body: t('common.confirmDeleteBody') });
  if (!ok) return;
  try {
    await api.del(`/api/features/${f.id}`);
    toast(t('common.deleted'), 'ok');
    if (drawerState()?.key === `feature:${f.id}`) await closeDrawer({ force: true });
    store.refresh();
  } catch (e) { toastError(e); }
}

export function update(state) {
  if (!els || !state) return;
  const list = state.features;
  els.empty.hidden = list.length > 0;
  const sig = (f) => JSON.stringify([f, store.player(f.playerA), store.player(f.playerB), store.match(f.matchId)?.date]);
  keyedList(els.grid, list, (f) => f.id, card, sig);
  const key = drawerState()?.key;
  for (const c of els.grid.children) c.classList.toggle('is-editing', key === `feature:${c.dataset.id}`);
}

export async function edit(featureId) {
  const isNew = !featureId;
  const ft = isNew ? null : store.feature(featureId);
  if (!isNew && !ft) return;
  const s = store.state;
  const f = createForm();
  const title = f.add('title', ctlText({ value: ft?.title ?? '', maxlength: 60, placeholder: t('matchups.titleHint') }));
  const opts = playerComboOptions(s);
  const pa = f.add('playerA', ctlCombo({ options: opts, value: ft?.playerA ?? null, placeholder: t('matchups.playerA'), searchPlaceholder: t('matchups.searchPlayer') }));
  const pb = f.add('playerB', ctlCombo({ options: opts, value: ft?.playerB ?? null, placeholder: t('matchups.playerB'), searchPlaceholder: t('matchups.searchPlayer') }));
  const match = f.add('matchId', ctlSelect({ options: matchOptions(s, { none: t('matchups.noMatch') }), value: ft?.matchId ?? '' }));
  f.snapshot();

  const sync = () => {
    const a = store.player(pa.get()), b = store.player(pb.get());
    title.el.placeholder = a?.role && b?.role && a.role === b.role ? `${t(`roles.${a.role}`)} — ${t('matchups.titleHint')}` : t('matchups.titleHint');
  };
  pa.el.addEventListener('change', sync);
  pb.el.addEventListener('change', sync);
  sync();

  const body = h('div.form-stack',
    h('div.form-grid',
      field(t('matchups.titleField'), title, { span: 2 }),
      field(t('matchups.playerA'), pa, { span: 2 }),
      field(t('matchups.playerB'), pb, { span: 2 }),
      field(t('matchups.match'), match, { span: 2 })));

  const saveBtn = btn(isNew ? t('common.create') : t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    const v = f.values();
    if (!v.playerA || !v.playerB) { toast(t('matchups.needPlayers'), 'error'); return; }
    try {
      if (isNew) {
        const created = await api.post('/api/features', v);
        toast(t('common.created'), 'ok');
        f.snapshot();
        store.state.features.push(created);
        store.idx.features.set(created.id, created);
        await closeDrawer({ force: true });
        edit(created.id);
      } else {
        await api.put(`/api/features/${featureId}`, f.changed());
        f.snapshot();
        toast(t('common.saved'), 'ok');
      }
      store.refresh();
    } catch (e) { toastError(e); }
  });
  saveBtn.addEventListener('click', save);
  const prevBtn = isNew ? null : btn(t('matchups.preview'), { kind: 'gold', iconName: 'live', onclick: () => closeDrawer().then((ok) => ok && cueAndShow('matchup', { feature: featureId })) });
  const delBtn = isNew ? null : iconBtn('trash', t('common.delete'), () => remove(ft), { kind: 'danger' });

  await openDrawer({
    key: isNew ? 'feature:new' : `feature:${featureId}`,
    title: isNew ? t('matchups.newTitle') : (ft.title || featureAutoTitle(ft)),
    subtitle: isNew ? null : t('matchups.editTitle'),
    body,
    footer: [delBtn, prevBtn, h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => f.dirty(),
    onSave: save,
    onState: () => {
      if (isNew) return;
      if (!store.feature(featureId)) { closeDrawer({ force: true }); toast(t('common.notFoundClosed'), 'info'); }
    },
    onClose: () => els && update(store.state),
  });
  if (els) update(store.state);
}

