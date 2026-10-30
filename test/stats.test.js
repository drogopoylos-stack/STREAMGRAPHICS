import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregatePlayer,
  compareRows,
  teamRecord,
  formatStat,
  headToHead,
} from '../server/lib/stats.js';

const statDefs = [
  { key: 'kills', label: 'Kills', better: 'high', fmt: 'int' },
  { key: 'deaths', label: 'Deaths', better: 'low', fmt: 'int' },
  { key: 'kd', label: 'K/D', better: 'high', fmt: 'dec2' },
  { key: 'accuracy', label: 'Accuracy', better: 'high', fmt: 'pct' },
];

const players = [
  { id: 'p1', teamId: 'T1' },
  { id: 'p2', teamId: 'T2' },
];

const matches = [
  {
    id: 'm1',
    date: '2024-05-01',
    time: '20:00',
    teamA: 'T1',
    teamB: 'T2',
    scoreA: 3,
    scoreB: 1,
    status: 'done',
    stats: [
      { playerId: 'p1', values: { kills: 10, deaths: 5, accuracy: 0.5 } },
      { playerId: 'p2', values: { kills: 7, deaths: 6, accuracy: 0.4 } },
    ],
  },
  {
    id: 'm2',
    date: '2024-05-02',
    time: '21:00',
    teamA: 'T1',
    teamB: 'T2',
    scoreA: 0,
    scoreB: 2,
    status: 'done',
    stats: [
      { playerId: 'p1', values: { kills: 8, deaths: 4, kd: 2, accuracy: 0.6 } },
      { playerId: 'p2', values: { kills: 4, deaths: 9, kd: 0.44, accuracy: 0.3 } },
    ],
  },
  {
    id: 'm3',
    date: '2024-05-03',
    time: '22:00',
    teamA: 'T1',
    teamB: 'T2',
    scoreA: null,
    scoreB: null,
    status: 'scheduled',
    stats: [],
  },
  {
    id: 'm4',
    date: '2024-05-04',
    time: '20:00',
    teamA: 'T1',
    teamB: 'T2',
    scoreA: 2,
    scoreB: 2,
    status: 'done',
    stats: [],
  },
];

test('aggregatePlayer: matches, totals, averages, W/L', () => {
  const agg = aggregatePlayer('p1', matches, statDefs, players);
  assert.equal(agg.matches, 2);
  assert.equal(agg.totals.kills, 18);
  assert.equal(agg.totals.deaths, 9);
  assert.equal(agg.averages.kills, 9);
  assert.equal(agg.averages.deaths, 4.5);
  assert.equal(agg.wins, 1);
  assert.equal(agg.losses, 1);
});

test('aggregatePlayer: pct total is the average, missing keys skipped', () => {
  const agg = aggregatePlayer('p1', matches, statDefs, players);
  assert.equal(agg.totals.accuracy, 0.55);
  assert.equal(agg.averages.accuracy, 0.55);
  // kd only appears in m2 -> averaged over the one match that has it
  assert.equal(agg.totals.kd, 2);
  assert.equal(agg.averages.kd, 2);
});

test('aggregatePlayer: no qualifying matches yields nulls and zeros', () => {
  const agg = aggregatePlayer('ghost', matches, statDefs, players);
  assert.equal(agg.matches, 0);
  assert.equal(agg.averages.kills, null);
  assert.equal(agg.totals.kills, 0);
  assert.equal(agg.wins, 0);
  assert.equal(agg.losses, 0);
});

test('aggregatePlayer: unknown team side is not counted for W/L', () => {
  const agg = aggregatePlayer('p1', matches, statDefs, [{ id: 'p1', teamId: 'T9' }]);
  assert.equal(agg.matches, 2);
  assert.equal(agg.wins, 0);
  assert.equal(agg.losses, 0);
});

test('compareRows: high/low/null/equal winners', () => {
  const a = { averages: { kills: 10, deaths: 3, kd: null, accuracy: 0.5 } };
  const b = { averages: { kills: 10, deaths: 5, kd: 1.2, accuracy: null } };
  const rows = compareRows(a, b, statDefs);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].winner, 'tie'); // kills equal
  assert.equal(rows[1].winner, 'a'); // deaths: lower is better
  assert.equal(rows[2].winner, 'tie'); // kd: a null → no winner
  assert.equal(rows[3].winner, 'tie'); // accuracy: b null → no winner
  assert.equal(rows[0].label, 'Kills');
  assert.equal(rows[0].fmt, 'int');
  assert.equal(rows[0].better, 'high');

  const tie = compareRows(a, a, statDefs);
  assert.equal(tie[0].winner, 'tie');
  assert.equal(tie[1].winner, 'tie');
});

test('teamRecord: wins, losses, draws still count as played', () => {
  assert.deepEqual(teamRecord('T1', matches), { w: 1, l: 1, played: 3 });
  assert.deepEqual(teamRecord('T2', matches), { w: 1, l: 1, played: 3 });
  assert.deepEqual(teamRecord('T9', matches), { w: 0, l: 0, played: 0 });
});

test('formatStat: every format and the null placeholder', () => {
  assert.equal(formatStat(3.6, 'int'), '4');
  assert.equal(formatStat(1234, 'int'), '1234');
  assert.equal(formatStat(1.25, 'dec1'), '1.3');
  assert.equal(formatStat(1.234, 'dec2'), '1.23');
  assert.equal(formatStat(0.5, 'pct'), '50%');
  assert.equal(formatStat(1, 'pct'), '100%');
  assert.equal(formatStat(54, 'pct'), '54%');
  assert.equal(formatStat(0, 'pct'), '0%');
  assert.equal(formatStat(null, 'int'), '—');
  assert.equal(formatStat(undefined, 'pct'), '—');
});

test('headToHead: ids where both players featured', () => {
  assert.deepEqual(headToHead('p1', 'p2', matches), ['m1', 'm2']);
  assert.deepEqual(headToHead('p1', 'ghost', matches), []);
});
