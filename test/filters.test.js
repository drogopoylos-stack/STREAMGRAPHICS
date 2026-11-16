import test from 'node:test';
import assert from 'node:assert/strict';
import { guessScene } from '../public/shared/output-types.js';
import { applyFacets, matchPeriod } from '../public/control/js/filter-menu.js';

test('the type of an output file comes from its name', () => {
  const cases = {
    'schedule-today.png': 'schedule', 'SUPERCUP-2026-Social-Schedule-A.png': 'social-schedule', 'social-versus-m_1.png': 'social-versus',
    'simple-vs-m_389f3964.png': 'simple-vs', 'vs-1-1.png': 'simple-vs', 'versus-next.png': 'versus', 'roster-TP.png': 'roster',
    'matchup-f_1.png': 'matchup', 'bracket-single.png': 'bracket', 'sponsors.png': 'sponsors', 'supercup-2026-1200x630.png': 'other',
  };
  for (const [name, scene] of Object.entries(cases)) assert.equal(guessScene(name), scene, name);
});

test('each filter count uses the other filters, and the search narrows every count', () => {
  const items = [{ team: 'A', role: 'Top', nick: 'one' }, { team: 'A', role: 'Mid', nick: 'two' }, { team: 'B', role: 'Top', nick: 'three' }];
  const values = { team: 'A', role: 'all' };
  let query = '';
  const menu = { value: (id) => values[id], query: () => query };
  let r = applyFacets(items, menu, { team: (i) => i.team, role: (i) => i.role }, (i) => i.nick);
  assert.deepEqual(r.shown.map((i) => i.nick), ['one', 'two']);
  assert.equal(r.counts.team.get('B'), 1);
  assert.equal(r.counts.role.get('Top'), 1);
  query = 'tw';
  r = applyFacets(items, menu, { team: (i) => i.team, role: (i) => i.role }, (i) => i.nick);
  assert.deepEqual(r.shown.map((i) => i.nick), ['two']);
  assert.equal(r.counts.team.get('B') ?? 0, 0);
});

test('matches get the date and status groups of the Live page', () => {
  const today = '2026-11-12';
  assert.equal(matchPeriod({ status: 'live', date: '2026-11-01' }, today), 'live');
  assert.equal(matchPeriod({ status: 'done', date: today }, today), 'completed');
  assert.equal(matchPeriod({ status: 'scheduled', date: null }, today), 'tbd');
  assert.equal(matchPeriod({ status: 'scheduled', date: today }, today), 'today');
  assert.equal(matchPeriod({ status: 'scheduled', date: '2026-11-15' }, today), 'upcoming');
  assert.equal(matchPeriod({ status: 'scheduled', date: '2026-11-06' }, today), 'past');
});
