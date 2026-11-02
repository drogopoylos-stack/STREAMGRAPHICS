// PLAYERS: filter + search, cards with photo on checkerboard, editor with photo pipeline actions.
import { h, keyedList, norm, debounce } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { trackJob } from '../jobs.js';
import {
  toast, toastError, busy, btn, badge, imgBox, droppable, dropZone, emptyState, sectionHead, thumb,
  openDrawer, closeDrawer, drawerState, confirmDialog, createForm, field, ctlText, ctlToggle, ctlSelect,
  ctlSegmented, jobView,
} from '../ui.js';
import { ROLES, roleRank, teamOptions } from '../scenes.js';

export const id = 'players';
let els = null;
const filter = { team: '', role: '', q: '', showHidden: true };

export function mount(root) {
  const teamSel = ctlSelect({ options: teamFilterOptions(store.state) });
  const roleSel = ctlSelect({ options: [{ value: '', label: t('players.allRoles') }, ...ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) })), { value: '-', label: t('roles.') }] });
  const search = h('input.input.search-input', { type: 'search', placeholder: t('players.search'), 'aria-label': t('players.search'), dataset: { search: '1' } });
  const showHidden = ctlToggle({ value: true, label: t('common.showHidden') });
  teamSel.el.setAttribute('aria-label', t('players.team'));
  roleSel.el.setAttribute('aria-label', t('players.role'));
  teamSel.el.addEventListener('change', () => { filter.team = teamSel.el.value; render(); });
  roleSel.el.addEventListener('change', () => { filter.role = roleSel.el.value; render(); });
  search.addEventListener('input', debounce(() => { filter.q = search.value; render(); }, 120));
  showHidden.input.addEventListener('change', () => { filter.showHidden = showHidden.get(); render(); });

  const head = sectionHead(t('players.title'), '', btn(t('players.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }));
  const bar = h('div.toolbar', h('div.search-wrap', icon('search', 16), search), teamSel.el, roleSel.el, showHidden.el);
  const list = h('div.player-groups');
  const empty = h('div', { hidden: true });
  root.append(head, bar, list, empty);
  els = { head, list, empty, teamSel, roleSel, search };
  update(store.state);
}

/** Navigation option: { team } preselects a team filter. */
export function show(opts) {
  if (!els || !opts) return;
  if (opts.team !== undefined) { filter.team = opts.team; els.teamSel.el.value = opts.team; render(); }
}

function teamFilterOptions(state) {
  return [{ value: '', label: t('players.allTeams') }, ...teamOptions(state), { value: '-', label: t('common.teamless') }];
}

export async function upload(playerId, file) {
  try {
    await api.upload('player', playerId, file);
    toast(t('common.uploaded'), 'ok');
    store.refresh();
    return true;
  } catch (e) { toastError(e); return false; }
}

function card(p) {
  const box = imgBox(p.photo, { ratio: '4 / 5', cls: 'card-img' });
  const busyEl = h('div.drop-busy', { hidden: true }, h('span.spinner'));
  const el = h('div.ent-card.player-card', { tabIndex: 0, role: 'button', 'aria-label': `${t('common.edit')} ${p.nick}`, dataset: { id: p.id } },
    h('div.ent-media', box, busyEl, h('div.drop-hint', icon('upload', 18), t('common.dropRelease')),
      p.captain ? h('span.captain-mark', { title: t('players.captainTitle') }, icon('star', 12)) : null),
    h('div.ent-body',
      h('div.ent-title-row', h('span.ent-title', p.nick), p.country ? h('span.country', p.country.toUpperCase()) : null),
      h('div.ent-name', p.name || ' '),
      h('div.ent-meta',
        p.role ? h(`span.role-chip.role-${p.role.toLowerCase()}`, t(`roles.${p.role}`)) : h('span.role-chip', '—'),
        p.hidden ? badge(t('common.hidden'), 'muted') : null,
        p.noHarmonize ? badge(t('players.noColorBadge'), 'gold', t('players.noHarmonizeHint')) : null)));
  if (p.hidden) el.classList.add('is-hidden');
  el.addEventListener('click', () => edit(p.id));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(p.id); } });
  droppable(el, async (file) => {
    busyEl.hidden = false;
    await upload(p.id, file);
    busyEl.hidden = true;
  });
  return el;
}

function groupEl(g) {
  const grid = h('div.grid.grid-players');
  const el = h('section.player-group',
    h('h2.group-head', g.team ? thumb(g.team.logo, 'logo-sm') : icon('players', 16), h('span', g.title), h('span.group-count', String(g.players.length))),
    grid);
  el._grid = grid;
  return el;
}

function render() {
  const state = store.state;
  if (!els || !state) return;
  const q = norm(filter.q).trim();
  const players = state.players.filter((p) => {
    if (!filter.showHidden && p.hidden) return false;
    if (filter.team === '-' ? store.team(p.teamId) : filter.team && p.teamId !== filter.team) return false;
    if (filter.role === '-' ? p.role : filter.role && p.role !== filter.role) return false;
    if (q && !norm(`${p.nick} ${p.name} ${p.extId ?? ''}`).includes(q)) return false;
    return true;
  });
  const sortP = (a, b) => roleRank(a.role) - roleRank(b.role) || a.nick.localeCompare(b.nick);
  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [];
  for (const tm of teams) {
    const ps = players.filter((p) => p.teamId === tm.id).sort(sortP);
    if (ps.length) groups.push({ key: tm.id, team: tm, title: `${tm.name}`, players: ps });
  }
  const loose = players.filter((p) => !store.team(p.teamId)).sort(sortP);
  if (loose.length) groups.push({ key: '-', team: null, title: t('common.teamless'), players: loose });

  els.head.setSub(t('players.sub', { n: state.players.length }));
  keyedList(els.list, groups, (g) => g.key, groupEl, (g) => JSON.stringify([g.title, g.team?.logo]));
  for (const gEl of els.list.children) {
    const g = groups.find((x) => x.key === gEl._key);
    gEl.querySelector('.group-count').textContent = String(g.players.length);
    keyedList(gEl._grid, g.players, (p) => p.id, card);
  }
  const none = !players.length;
  els.empty.hidden = !none;
  if (none) {
    els.empty.replaceChildren(state.players.length
      ? emptyState({ iconName: 'search', title: t('common.noResults'), action: btn(t('common.clearFilter'), { onclick: clearFilter }) })
      : emptyState({ iconName: 'players', title: t('players.empty'), body: t('players.emptyBody') }));
  }
  const key = drawerState()?.key;
  for (const c of els.list.querySelectorAll('.player-card')) c.classList.toggle('is-editing', key === `player:${c.dataset.id}`);
}

function clearFilter() {
  Object.assign(filter, { team: '', role: '', q: '', showHidden: true });
  els.teamSel.el.value = '';
  els.roleSel.el.value = '';
  els.search.value = '';
  render();
}

export function update(state) {
  if (!els || !state) return;
  els.teamSel.setOptions(teamFilterOptions(state));
  els.teamSel.el.value = filter.team;
  render();
}

export async function edit(playerId) {
  const isNew = !playerId;
  const p = isNew ? null : store.player(playerId);
  if (!isNew && !p) return;
  const f = createForm();
  const nick = f.add('nick', ctlText({ value: p?.nick ?? '', maxlength: 40 }));
  const name = f.add('name', ctlText({ value: p?.name ?? '', maxlength: 80 }));
  const role = f.add('role', ctlSegmented({ options: [...ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) })), { value: '', label: '—', title: t('roles.') }], value: p?.role ?? '', size: 'sm' }));
  const team = f.add('teamId', ctlSelect({ options: [{ value: '', label: t('common.teamless') }, ...teamOptions(store.state)], value: p?.teamId ?? (isNew && filter.team && filter.team !== '-' ? filter.team : '') }));
  const country = f.add('country', ctlText({ value: p?.country ?? '', maxlength: 2, placeholder: 'gr', list: 'country-codes' }));
  const captain = f.add('captain', ctlToggle({ value: !!p?.captain, label: t('players.captain') }));
  const hidden = f.add('hidden', ctlToggle({ value: !!p?.hidden, label: t('players.hidden') }));
  f.snapshot();

  const photo = dropZone({ src: p?.photo ?? null, ratio: '4 / 5', disabled: isNew, onFile: (file) => upload(playerId, file) });
  const jobHost = h('div.job-host');
  const runJob = async (patch, msg) => {
    try {
      if (patch) await api.put(`/api/players/${playerId}`, patch);
      const job = trackJob(await api.post('/api/assets/reprocess', { kind: 'player', id: playerId }));
      toast(msg, 'info');
      jobHost.replaceChildren(jobView(job.id, { compact: true }));
      store.refresh();
    } catch (e) { toastError(e); }
  };
  const noHarm = ctlToggle({ value: !!p?.noHarmonize, label: t('players.noHarmonize'), hint: t('players.noHarmonizeHint') });
  noHarm.input.addEventListener('change', () => runJob({ noHarmonize: noHarm.get() }, noHarm.get() ? t('players.noHarmonizeOn') : t('players.noHarmonizeOff')));
  const reBtn = btn(t('players.reprocess'), { size: 'sm', iconName: 'refresh' });
  reBtn.addEventListener('click', () => busy(reBtn, () => runJob(null, t('common.reprocessStarted'))));
  const defaultEngine = store.state.settings.photo.engine === 'photocraft' ? 'PhotoCraft' : t('settings.photoStandard');
  const processor = ctlSelect({ value: p?.photoProcessor ?? 'inherit', options: [
    { value: 'inherit', label: t('players.processorDefault', { engine: defaultEngine }) },
    { value: 'standard', label: t('settings.photoStandard') },
    { value: 'photocraft', label: 'PhotoCraft', disabled: !store.state.capabilities?.photocraft?.available },
  ] });
  let savedProcessor = p?.photoProcessor ?? 'inherit';
  const applyProcessor = btn(t('players.processorApply'), { size: 'sm', kind: 'primary', iconName: 'refresh', disabled: !p?.photoRaw });
  applyProcessor.addEventListener('click', () => busy(applyProcessor, () => runJob({ photoProcessor: processor.get() }, t('common.reprocessStarted'))));

  const photoBlock = h('div.form-block.photo-block',
    h('div.block-head', h('h3.block-title', t('players.photo')), isNew ? null : reBtn),
    h('div.photo-row', photo,
      isNew ? null : h('div.photo-side', noHarm.el, p?.bgRemoved ? h('p.field-hint', icon('check', 12), ' ', t('players.bgRemoved')) : null, jobHost)),
    isNew ? null : h('div.form-stack', field(t('players.processor'), processor, { hint: t('players.processorHint') }), h('div.inline-row', applyProcessor)),
    h('p.field-hint', t('players.photoHint')));

  const body = h('div.form-stack',
    photoBlock,
    h('div.form-grid',
      field(t('players.nick'), nick),
      field(t('players.name'), name),
      field(t('players.role'), role, { span: 2 }),
      field(t('players.team'), team),
      field(t('players.country'), country, { hint: t('players.countryHint') }),
      h('div.span-2.toggle-row', captain.el, hidden.el)),
    p?.url ? h('div.form-links', h('a.btn.btn-sm.btn-ghost', { href: p.url, target: '_blank', rel: 'noopener' }, icon('external', 14), h('span', t('common.hllgrLink')))) : null);

  const saveBtn = btn(isNew ? t('common.create') : t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    const v = f.values();
    if (!v.nick) { toast(`${t('players.nick')}?`, 'error'); nick.el.focus(); return; }
    v.country = v.country ? v.country.toLowerCase() : null;
    try {
      if (isNew) {
        const created = await api.post('/api/players', v);
        toast(t('common.created'), 'ok');
        f.snapshot();
        store.state.players.push(created);
        store.idx.players.set(created.id, created);
        await closeDrawer({ force: true });
        edit(created.id);
      } else {
        const patch = f.changed();
        if ('country' in patch) patch.country = v.country;
        await api.put(`/api/players/${playerId}`, patch);
        f.snapshot();
        toast(t('common.saved'), 'ok');
      }
      store.refresh();
    } catch (e) { toastError(e); }
  });
  saveBtn.addEventListener('click', save);
  const delBtn = isNew ? null : btn(t('common.delete'), { kind: 'danger', iconName: 'trash' });
  delBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('common.confirmDelete', { name: p.nick }), body: t('common.confirmDeleteBody') });
    if (!ok) return;
    try {
      await api.del(`/api/players/${playerId}`);
      toast(t('common.deleted'), 'ok');
      await closeDrawer({ force: true });
      store.refresh();
    } catch (e) { toastError(e); }
  });

  await openDrawer({
    key: isNew ? 'player:new' : `player:${playerId}`,
    title: isNew ? t('players.newTitle') : p.nick,
    subtitle: isNew ? null : [p.name, store.team(p.teamId)?.name].filter(Boolean).join(' · ') || t('players.editTitle'),
    body,
    footer: [delBtn, h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => f.dirty(),
    onSave: save,
    onState: () => {
      if (isNew) return;
      const cur = store.player(playerId);
      if (!cur) { closeDrawer({ force: true }); toast(t('common.notFoundClosed'), 'info'); return; }
      photo.setSrc(cur.photo);
      if (processor.get() === savedProcessor) processor.set(cur.photoProcessor ?? 'inherit');
      savedProcessor = cur.photoProcessor ?? 'inherit';
      if (document.activeElement !== noHarm.input) noHarm.set(!!cur.noHarmonize);
    },
    onClose: () => els && render(),
  });
  if (els) render();
}
