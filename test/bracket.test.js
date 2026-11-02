import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatches, syncBracket, validateSources, bracketTree } from '../server/bracket.js';
import { sceneData, nextMatch } from '../server/scenes.js';
import { graphicCatalog } from '../server/graphics.js';

function fixture() {
  const source = matchId => ({ matchId, outcome: 'winner' });
  const match = (id, extra) => ({ id, bracketCode: id, date: '2026-11-06', time: '18:00', bestOf: 3, scoreA: null, scoreB: null, status: 'scheduled', stats: [], ...extra });
  return { settings: { leagueName: 'Cup', leagueShort: 'CUP', theme: {}, timezone: 'Europe/Athens', enabledScenes: ['simple-vs', 'schedule', 'bracket'], scheduleOverview: true,
    bracketTree: { rounds: [{ id: 'open', name: 'Opening', matches: ['1-1', '1-2'] }, { id: 'final', name: 'Final', matches: ['F'] }] } },
    teams: ['a', 'b', 'c', 'd'].map(id => ({ id, tag: id.toUpperCase(), name: id })), players: [], sponsors: [], features: [], backgrounds: [], graphics: [],
    matches: [match('1-1', { teamA: 'a', teamB: 'b' }), match('1-2', { teamA: 'c', teamB: 'd' }), match('F', { teamA: null, teamB: null, teamASource: source('1-1'), teamBSource: source('1-2'), date: null, time: '', bestOf: null })] };
}

test('bracket advances completed series and clears dependent results after a correction', () => {
  const db = fixture();
  Object.assign(db.matches[0], { scoreA: 2, scoreB: 1, status: 'done' });
  Object.assign(db.matches[1], { scoreA: 0, scoreB: 2, status: 'done' });
  syncBracket(db);
  assert.equal(db.matches[2].teamA, 'a');
  assert.equal(db.matches[2].teamB, 'd');
  Object.assign(db.matches[2], { bestOf: 3, scoreA: 2, scoreB: 0, status: 'done', stats: [{ old: true }] });
  assert.equal(bracketTree(db).champion.id, 'a');
  Object.assign(db.matches[0], { scoreA: 0, scoreB: 2 });
  syncBracket(db);
  assert.equal(db.matches[2].teamA, 'b');
  assert.equal(db.matches[2].scoreA, null);
  assert.equal(db.matches[2].scoreB, null);
  assert.equal(db.matches[2].status, 'scheduled');
  assert.deepEqual(db.matches[2].stats, []);
  assert.equal(bracketTree(db).champion, null);
});

test('ties, missing scores and incomplete/live series never advance', () => {
  for (const patch of [{ scoreA: 2, scoreB: 2 }, { scoreA: 2, scoreB: null }, { scoreA: 1, scoreB: 0 }, { scoreA: 2, scoreB: 0, status: 'live' }]) {
    const db = fixture();
    Object.assign(db.matches[0], { status: 'done' }, patch);
    assert.equal(resolveMatches(db)[2].teamA, null);
  }
});

test('winner sources reject cycles, missing matches and unsupported outcomes', () => {
  const db = fixture();
  assert.doesNotThrow(() => validateSources(db.matches));
  const bad = structuredClone(db.matches);
  bad[0].teamASource = { matchId: 'F', outcome: 'winner' };
  assert.throws(() => validateSources(bad), /cycle/);
  bad[0].teamASource.matchId = 'other-tournament';
  assert.throws(() => validateSources(bad), /in this tournament/);
  bad[0].teamASource = { matchId: '1-2', outcome: 'loser' };
  assert.throws(() => validateSources(bad), /winner source/);
});

test('logo-only dashboard, TBD fixtures and paginated schedule remain usable without players', () => {
  const db = fixture();
  const before = structuredClone(db);
  const final = sceneData('simple-vs', { match: 'F' }, db);
  assert.equal(final.teamA.name, 'Winner 1-1');
  assert.equal(final.teamB.name, 'Winner 1-2');
  assert.equal(final.match.date, null);
  assert.equal(sceneData('schedule', { day: 'all' }, db).matches.length, 3);
  assert.equal(sceneData('schedule', { day: 'all' }, db).matches.at(-1).date, null);
  const cards = graphicCatalog(db, '2026-11-02');
  assert.deepEqual([...new Set(cards.map(card => card.scene))].sort(), ['bracket', 'schedule', 'simple-vs']);
  assert.equal(cards.find(card => card.scene === 'bracket').ready, true);
  assert.equal(cards.find(card => card.params.match === 'F').ready, true);
  assert.deepEqual(db, before);
  assert.equal(nextMatch(db).id, '1-1');
  db.matches = Array.from({ length: 17 }, (_, i) => ({ ...db.matches[0], id: String(i) }));
  const pages = [1, 2, 3].map(page => sceneData('schedule', { day: 'all', page }, db));
  assert.deepEqual(pages.map(page => page.matches.length), [8, 8, 1]);
  assert.equal(new Set(pages.flatMap(page => page.matches.map(m => m.id))).size, 17);
});
