import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from './strings.js';
import { api } from './api.js';
import { store } from './store.js';
import { btn, busy, badge, ctlText, ctlSelect, ctlCheck, createForm, field, openDrawer, closeDrawer, confirmDialog, toast, toastError } from './ui.js';

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let hasDrafts = () => false;

export function createTournamentControls({ isDirty }) {
  hasDrafts = isDirty;
  const select = ctlSelect();
  select.el.id = 'active-tournament';
  select.el.setAttribute('aria-label', t('tournaments.active'));
  const manage = btn(t('tournaments.manage'), { iconName: 'bracket', size: 'sm', onclick: openManager });
  const el = h('div.tournament-controls', h('label.tournament-picker', { for: 'active-tournament' }, h('span', t('tournaments.active')), select.el), manage);
  select.el.addEventListener('change', async () => {
    const id = select.get();
    select.el.disabled = true;
    try { await switchTournament(id); }
    finally { select.set(store.state.activeTournamentId); select.el.disabled = false; }
  });
  const update = state => {
    select.setOptions((state.tournaments ?? []).map(item => ({ value: item.id, label: [item.name, item.season].filter(Boolean).join(' · ') })));
    select.set(state.activeTournamentId);
  };
  update(store.state);
  return { el, update };
}

async function switchTournament(id) {
  if (!id || id === store.state.activeTournamentId) return;
  const target = store.state.tournaments.find(item => item.id === id);
  const drafts = hasDrafts();
  const approved = await confirmDialog({
    title: t('tournaments.switchTitle', { name: target?.name ?? '' }),
    body: `${t('tournaments.switchBody')}${drafts ? ' ' + t('tournaments.discardDrafts') : ''}`,
    ok: t('tournaments.switch'), danger: false,
  });
  if (!approved) return;
  try {
    await api.post(`/api/tournaments/${encodeURIComponent(id)}/activate`);
    await store.load(); // The shell reloads all forms and filters for the new workspace.
  } catch (error) { toastError(error); }
}

export async function openManager() {
  const list = h('div.tournament-list');
  const paint = state => {
    list.replaceChildren(...(state.tournaments ?? []).map(item => {
      const active = item.id === state.activeTournamentId;
      const schedule = item.broadcastDays?.length ? item.broadcastDays.map(day => dayNames[day - 1]).join(', ') : t('tournaments.anyDay');
      return h(`section.tournament-card${active ? '.is-active' : ''}`,
        h('div.tournament-title', h('strong', item.name), active ? badge(t('tournaments.activeBadge'), 'gold') : null),
        h('p.field-hint', [item.short, item.season].filter(Boolean).join(' · ')),
        h('p.tournament-counts', t('tournaments.counts', { teams: item.teams, players: item.players, matches: item.matches })),
        h('p.field-hint', icon('matches', 13), ' ', schedule),
        h('div.tournament-actions', btn(t('common.edit'), { size: 'sm', onclick: () => editTournament(item) }),
          active ? null : btn(t('tournaments.switch'), { size: 'sm', kind: 'primary', iconName: 'swap', onclick: () => switchTournament(item.id) })));
    }));
  };
  paint(store.state);
  await openDrawer({ key: 'tournaments', title: t('tournaments.manage'), subtitle: t('tournaments.sub'),
    body: h('div.form-stack', h('p.field-hint', t('tournaments.help')), list),
    footer: [btn(t('tournaments.add'), { kind: 'primary', iconName: 'plus', onclick: () => editTournament() }), h('div.spacer'), btn(t('common.close'), { onclick: () => closeDrawer() })],
    onState: paint,
  });
}

async function editTournament(item = null) {
  const form = createForm();
  const name = form.add('name', ctlText({ value: item?.name ?? '', maxlength: 100 }));
  const short = form.add('short', ctlText({ value: item?.short ?? '', maxlength: 8, upper: true }));
  const season = form.add('season', ctlText({ value: item?.season ?? '', maxlength: 80 }));
  const checks = dayNames.map((name, index) => ctlCheck({ label: name, value: item?.broadcastDays?.includes(index + 1) }));
  const weekdayControl = form.add('broadcastDays', { el: h('div.check-row.tournament-days', checks.map(check => check.el)), get: () => checks.flatMap((check, index) => check.get() ? [index + 1] : []), set: values => checks.forEach((check, index) => check.set(values?.includes(index + 1))) });
  form.snapshot();
  const saveBtn = btn(item ? t('common.save') : t('tournaments.create'), { kind: 'primary' });
  const save = () => busy(saveBtn, async () => {
    const values = form.values();
    if (!values.name) { toast(t('tournaments.needName'), 'error'); name.el.focus(); return; }
    if (!values.short) values.short = values.name.slice(0, 8).toUpperCase();
    try {
      if (item) await api.put(`/api/tournaments/${encodeURIComponent(item.id)}`, values);
      else await api.post('/api/tournaments', values);
      form.snapshot();
      await closeDrawer({ force: true });
      await store.load();
      toast(item ? t('common.saved') : t('tournaments.created'), 'ok');
      await openManager();
    } catch (error) { toastError(error); }
  });
  saveBtn.addEventListener('click', save);
  await openDrawer({ key: `tournament:${item?.id ?? 'new'}`, title: item ? t('tournaments.edit') : t('tournaments.add'),
    subtitle: item?.name ?? t('tournaments.newSub'),
    body: h('div.form-stack', field(t('tournaments.name'), name), field(t('tournaments.short'), short), field(t('settings.season'), season), field(t('tournaments.days'), weekdayControl, { hint: t('tournaments.daysHint') })),
    footer: [btn(t('common.cancel'), { onclick: openManager }), h('div.spacer'), saveBtn], isDirty: () => form.dirty(), onSave: save,
  });
}
