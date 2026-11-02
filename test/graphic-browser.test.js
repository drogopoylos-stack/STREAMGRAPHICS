import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeGraphics, graphicTypes, graphicSections } from '../public/control/js/graphic-browser-model.js';

function fixture() {
  const state = { today: '2026-11-02', nextMatch: 'today', features: [{ id: 'feature', matchId: 'tomorrow' }], matches: [
    { id: 'old', date: '2026-10-01', time: '19:00', status: 'done' },
    { id: 'old2', date: '2026-10-02', status: 'done' },
    { id: 'missed', date: '2026-10-30', status: 'scheduled' },
    { id: 'live', date: '2026-11-02', status: 'live' },
    { id: 'today', date: '2026-11-02', status: 'scheduled' },
    { id: 'doneToday', date: '2026-11-02', status: 'done' },
    { id: 'tomorrow', date: '2026-11-03', status: 'scheduled' },
    { id: 'future', date: '2026-11-10', status: 'scheduled' },
    { id: 'tbd', date: null, status: 'scheduled' },
  ] };
  const cards = state.matches.map(m => ({ key: m.id, scene: 'versus', params: { match: m.id }, title: m.id, sub: '' }));
  cards.push({ key: 'saved', savedId: 's1', scene: 'simple-vs', params: { match: 'today' }, title: 'Custom Alpha VS Beta', sub: '' });
  cards.push({ key: 'auto', scene: 'versus', params: {}, title: 'Next', sub: '' });
  cards.push({ key: 'bracket', scene: 'bracket', params: {}, title: 'Bracket', sub: '' });
  cards.push({ key: 'feature', scene: 'matchup', params: { feature: 'feature' }, title: 'Matchup', sub: '' });
  for (const day of ['today', 'tomorrow', '2026-10-01', 'all']) cards.push({ key: `schedule:${day}`, scene: 'schedule', params: { day }, title: 'Intentionally misleading title', sub: '' });
  return { state, cards };
}

test('graphics are classified by match status and tournament date, including saved presets and linked features', () => {
  const { state, cards } = fixture();
  const organized = organizeGraphics(cards, state);
  const period = key => organized.find(card => card.key === key).period;
  assert.equal(period('old'), 'completed');
  assert.equal(period('doneToday'), 'completed');
  assert.equal(period('missed'), 'past');
  assert.equal(period('live'), 'live');
  assert.equal(period('today'), 'today');
  assert.equal(period('saved'), 'today');
  assert.equal(period('auto'), 'today');
  assert.equal(period('tomorrow'), 'upcoming');
  assert.equal(period('tbd'), 'tbd');
  assert.equal(period('bracket'), 'general');
  assert.equal(period('feature'), 'upcoming');
  assert.equal(period('schedule:today'), 'live');
  assert.equal(period('schedule:2026-10-01'), 'completed');
  assert.equal(period('schedule:all'), 'general');
  assert.equal(cards.find(card => card.key === 'old').period, undefined);
  state.matches.find(m => m.id === 'today').status = 'done';
  assert.equal(organizeGraphics(cards, state).find(card => card.key === 'saved').period, 'completed');
});

test('type and date filters combine, while upcoming is chronological and completed is newest first', () => {
  const { state, cards } = fixture();
  const all = organizeGraphics(cards, state);
  const result = graphicSections(all, { type: 'versus' });
  assert.deepEqual(result.sections.map(section => section.id), ['live', 'today', 'upcoming', 'tbd', 'completed', 'past']);
  assert.deepEqual(result.sections.find(s => s.id === 'upcoming').cards.map(c => c.key), ['tomorrow', 'future']);
  assert.deepEqual(result.sections.find(s => s.id === 'completed').cards.map(c => c.key), ['doneToday', 'old2', 'old']);
  assert.equal(graphicSections(all, { type: 'versus', date: '2026-11-03' }).shown, 1);
  assert.equal(graphicSections(all, { type: 'versus', date: '2026-11-03', period: 'completed' }).shown, 0);
  assert.equal(graphicSections(all, { type: 'simple-vs', query: 'alpha', saved: true }).shown, 1);
  assert.equal(graphicSections(all, { type: 'versus', saved: true }).shown, 0);
});

test('the menu distinguishes schedule and VS and automatically includes future scene types', () => {
  const { cards } = fixture();
  cards.push({ key: 'new', scene: 'future-scene', params: {}, title: 'Future' });
  const types = graphicTypes(cards);
  assert.equal(types[0].count, cards.length);
  assert.ok(types.some(type => type.id === 'schedule'));
  assert.ok(types.some(type => type.id === 'versus'));
  assert.ok(types.some(type => type.id === 'simple-vs'));
  assert.equal(types.find(type => type.id === 'future-scene').count, 1);
});

test('tomorrow schedules roll across year boundaries and empty today schedules remain available', () => {
  const state = { today: '2026-12-31', matches: [], features: [] };
  const cards = ['today', 'tomorrow'].map(day => ({ key: day, scene: 'schedule', params: { day }, title: day }));
  const all = organizeGraphics(cards, state);
  assert.deepEqual(all.map(c => [c.date, c.period]), [['2026-12-31', 'today'], ['2027-01-01', 'upcoming']]);
});
