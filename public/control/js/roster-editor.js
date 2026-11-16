import { h, setKids } from './dom.js';
import { t } from './strings.js';
import { store } from './store.js';
import { api } from './api.js';
import { ROLES } from './scenes.js';
import { splitRoster } from '../../overlay/js/scenes/common.js';
import { btn, ctlText, ctlSelect, openDrawer, closeDrawer, toast, toastError, busy } from './ui.js';

export async function editRosters(teamIds) {
  const teams = [...new Set(teamIds)].map(id => store.team(id)).filter(Boolean);
  if (!teams.length) return;
  const models = teams.map(team => {
    const players = store.state.players.filter(p => p.teamId === team.id && !p.hidden);
    const starters = new Set(splitRoster(players).starters.map(p => p.id));
    return { team, revision: team.rosterRevision ?? 0, rows: players.map(p => ({ id: p.id, nick: p.nick, role: p.role || '', lineup: starters.has(p.id) ? 'starter' : 'substitute' })) };
  });
  const value = () => models.map(model => ({ teamId: model.team.id, revision: model.revision, players: model.rows.map(row => ({ id: row.id, nick: row.nick, role: row.role, lineup: row.lineup })) }));
  let snapshot = JSON.stringify(value());
  const body = h('div.form-stack.roster-editor', h('p.field-hint', t('rosterEditor.hint')));
  const drawRows = (model, list) => {
    setKids(list, model.rows.map((row, index) => {
      const nick = ctlText({ value: row.nick, maxlength: 40, placeholder: t('rosterEditor.name') });
      const role = ctlSelect({ value: row.role, options: [{ value: '', label: t('rosterEditor.unspecified') }, ...ROLES.map(role => ({ value: role, label: t(`roles.${role}`) }))] });
      const lineup = ctlSelect({ value: row.lineup, options: [{ value: 'starter', label: t('rosterEditor.starter') }, { value: 'substitute', label: t('rosterEditor.substitute') }] });
      nick.el.setAttribute('aria-label', t('rosterEditor.name'));
      role.el.setAttribute('aria-label', t('players.role'));
      lineup.el.setAttribute('aria-label', t('rosterEditor.lineup'));
      nick.el.addEventListener('input', () => { row.nick = nick.get() || ''; });
      role.el.addEventListener('change', () => { row.role = role.get() || ''; if (row.role === 'Coach') { row.lineup = 'substitute'; lineup.set('substitute'); } });
      lineup.el.addEventListener('change', () => { row.lineup = lineup.get(); });
      return h('div.roster-edit-row', { dataset: { player: row.id || `new-${index}` } }, nick.el, role.el, lineup.el,
        btn(t('rosterEditor.remove'), { size: 'sm', onclick: () => { model.rows.splice(index, 1); drawRows(model, list); } }));
    }));
  };
  for (const model of models) {
    const list = h('div.roster-edit-list'); drawRows(model, list);
    body.append(h('section.form-block', h('h3.block-title', model.team.name),
      h('div.roster-edit-head', t('rosterEditor.columns')), list,
      btn(t('rosterEditor.add'), { size: 'sm', iconName: 'plus', onclick: () => { model.rows.push({ nick: '', role: '', lineup: 'substitute' }); drawRows(model, list); list.lastElementChild?.querySelector('input')?.focus(); } })));
  }
  const saveBtn = btn(t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    try {
      await api.put('/api/rosters', { teams: value() });
      snapshot = JSON.stringify(value());
      await store.load();
      await closeDrawer({ force: true });
      toast(t('rosterEditor.saved'), 'ok');
    } catch (error) { toastError(error); }
  });
  saveBtn.addEventListener('click', save);
  await openDrawer({ key: `roster:${teams.map(t => t.id).join(':')}`, title: t('rosterEditor.title'), subtitle: teams.map(t => t.tag).join(' vs '), body,
    footer: [h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => snapshot !== JSON.stringify(value()), onSave: save });
}
