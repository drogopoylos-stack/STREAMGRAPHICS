import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from './strings.js';
import { api } from './api.js';
import { store } from './store.js';
import { btn, busy, badge, ctlText, ctlSelect, ctlCheck, createForm, field, openDrawer, closeDrawer, confirmDialog, toast, toastError } from './ui.js';

import { openWizard, draftLabel, startOver, regenerate } from './wizard.js';

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
    if (id === '__create__') { select.set(store.state.activeTournamentId); await openWizard(); return; }
    select.el.disabled = true;
    try { await switchTournament(id); }
    finally { select.set(store.state.activeTournamentId); select.el.disabled = false; }
  });
  const update = state => {
    select.setOptions((state.tournaments ?? []).map(item => ({ value: item.id, label: [item.name, item.season].filter(Boolean).join(' · ') })).concat([{ value: '__create__', label: `＋ ${draftLabel()}…` }]));
    select.set(state.activeTournamentId);
  };
  update(store.state);
  window.addEventListener('wizard-draft-changed', () => {
    update(store.state);
    document.querySelectorAll('.wizard-empty .btn-primary').forEach(el => { el.textContent = draftLabel(); });
  });
  return { el, update };
}

export async function switchTournament(id, route = null) {
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
    if (route) location.hash = `#/${route}`;
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
        h('div.tournament-actions', item.wizard ? btn('Regenerate bracket…', { size: 'sm', disabled: !item.canRegenerate, title: item.canRegenerate ? '' : 'Matches have started. Change single matches in Matches.', onclick: () => regenerate(item.id) }) : null,
          btn('Delete tournament…', { size: 'sm', disabled: active || state.tournaments.length === 1, title: active ? 'Switch to another tournament first.' : state.tournaments.length === 1 ? 'The only tournament cannot be deleted.' : '', onclick: () => deleteTournament(item) }), btn(t('common.edit'), { size: 'sm', onclick: () => editTournament(item) }),
          active ? null : btn(t('tournaments.switch'), { size: 'sm', kind: 'primary', iconName: 'swap', onclick: () => switchTournament(item.id) })));
    }));
  };
  paint(store.state);
  await openDrawer({ key: 'tournaments', title: t('tournaments.manage'), subtitle: t('tournaments.sub'),
    body: h('div.form-stack', h('p.field-hint', t('tournaments.help')), list),
    footer: [btn(draftLabel(), { kind: 'primary', iconName: 'plus', onclick: openWizard }), btn('Start over', { size: 'sm', onclick: () => { startOver(); openWizard(); } }), btn('Add empty tournament', { onclick: () => editTournament() }), h('div.spacer'), btn(t('common.close'), { onclick: () => closeDrawer() })],
    onState: paint,
  });
}

async function editTournament(item = null) {
  const form = createForm();
  const name = form.add('name', ctlText({ value: item?.name ?? '', maxlength: 100 }));
  const short = form.add('short', ctlText({ value: item?.short ?? '', maxlength: 8, upper: true }));
  const season = form.add('season', ctlText({ value: item?.season ?? '', maxlength: 80 }));
  const design = !item ? form.add('designPresetId', ctlSelect({ value: store.state.designLibrary.defaultPresetId, options: store.state.designLibrary.presets.map(p => ({ value: p.id, label: `${p.name}${p.id === store.state.designLibrary.defaultPresetId ? ' · default' : ''}` })) })) : null;
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
    body: h('div.form-stack', field(t('tournaments.name'), name), field(t('tournaments.short'), short), field(t('settings.season'), season), design ? field('Graphics preset', design, { hint: 'Shared presets are created in Graphics designer. You can customize and apply another design after creating the tournament.' }) : null, field(t('tournaments.days'), weekdayControl, { hint: t('tournaments.daysHint') })),
    footer: [btn(t('common.cancel'), { onclick: openManager }), h('div.spacer'), saveBtn], isDirty: () => form.dirty(), onSave: save,
  });
}

async function deleteTournament(item) {
  const confirm = ctlText();
  const error = h('p.err', { role: 'alert' });
  const remove = btn('Delete tournament', { kind: 'danger', onclick: async () => {
    if (confirm.get() !== item.name) { error.textContent = 'Type the tournament name to delete it.'; confirm.el.focus(); return; }
    try { await api.del(`/api/tournaments/${item.id}`, { confirm: confirm.get() }); await store.load(); await openManager(); }
    catch (e) { error.textContent = e.message; }
  } });
  await openDrawer({ key: `delete:${item.id}`, title: 'Delete tournament…', body: h('div.form-stack', h('p', `Type ${item.name} to delete it. Its teams, players, matches and graphics settings are removed. A backup is saved first.`), field('Tournament name', confirm), error), footer: [btn('Cancel', { onclick: openManager }), remove] });
}

// These cards live here because the existing sections are owned by the editor task.
const emptyObserver = new MutationObserver(() => {
  if (!store.state || store.state.teams.length || store.state.matches.length) { document.querySelectorAll('.wizard-empty').forEach(el => el.remove()); return; }
  for (const id of ['teams', 'matches', 'live']) {
    const page = document.getElementById(`page-${id}`);
    if (!page || page.querySelector('.wizard-empty')) continue;
    page.prepend(h('div.wizard-empty', h('p', 'Start with the tournament wizard — teams, bracket and schedule in a few minutes.'), btn(draftLabel(), { kind: 'primary', onclick: openWizard }), btn('Start over', { onclick: () => { startOver(); openWizard(); } })));
  }
});
emptyObserver.observe(document.getElementById('main'), { childList: true, subtree: true });
