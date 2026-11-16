import { h } from './dom.js';
import { store } from './store.js';
import { api } from './api.js';
import { matchLabel } from './scenes.js';
import { btn, ctlSelect, field, openDrawer, closeDrawer, toast, toastError, busy } from './ui.js';

export async function editBracketDraw(id) {
  if (store.state?.settings?.matchSheet?.enabled) {
    toast('Set the GSL draw in the Google Sheet: source_a / source_b for G1 and G2.', 'info');
    return;
  }
  const config = store.state.settings.brackets?.find(bracket => bracket.id === id && bracket.format === 'gsl');
  if (!config) return;
  const entries = (config.entrySources || []).map(source => {
    const match = store.match(source.matchId);
    const winner = store.team(match?.winnerId);
    return { value: source.matchId, label: winner ? `${winner.name} · Winner ${match.bracketCode}` : `Winner ${match?.bracketCode || 'TBD'} · ${matchLabel(match)}` };
  });
  const matches = ['openingA', 'openingB'].map(node => store.state.matches.find(match => match.bracketNode === node && config.rounds.some(round => round.matches.includes(match.id))));
  const sources = matches.flatMap(match => [match?.teamASource?.matchId, match?.teamBSource?.matchId]);
  const controls = sources.map(value => ctlSelect({ value: value || '', options: [{ value: '', label: 'Choose qualifying path…' }, ...entries] }));
  const initial = JSON.stringify(controls.map(control => control.get()));
  const saveBtn = btn('Save draw', { kind: 'primary' });
  const save = () => busy(saveBtn, async () => {
    try {
      await api.put(`/api/brackets/${encodeURIComponent(id)}/draw`, { revision: config.drawRevision ?? 0, sources: controls.map(control => control.get()) });
      await store.load(); await closeDrawer({ force: true }); toast('GSL draw saved', 'ok');
    } catch (error) { toastError(error); }
  });
  saveBtn.addEventListener('click', save);
  await openDrawer({ key: `bracket-draw:${id}`, title: 'Top 4 · GSL opening draw', body: h('div.form-stack',
    h('p.field-hint', 'Choose one qualifying path in each slot. Winners advance automatically from single elimination. Each path must be used once.'),
    ...controls.map((control, index) => field(`${index < 2 ? 'Opening A' : 'Opening B'} · Team ${index % 2 ? 'B' : 'A'}`, control))),
    footer: [h('div.spacer'), btn('Cancel', { onclick: () => closeDrawer() }), saveBtn], onSave: save,
    isDirty: () => initial !== JSON.stringify(controls.map(control => control.get())) });
}
