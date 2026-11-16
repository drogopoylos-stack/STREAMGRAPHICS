import test from 'node:test';
import assert from 'node:assert/strict';
import { syncBracket, bracketTree, updateBracketDraw, resolveMatches } from '../server/bracket.js';
import { sceneData } from '../server/scenes.js';
import { graphicCatalog } from '../server/graphics.js';

function fixture() {
  const source = (matchId, outcome = 'winner') => ({ matchId, outcome });
  const match = (id, node, a, b) => ({ id, bracketCode: id, bracketNode: node, date: null, bestOf: 3, scoreA: null, scoreB: null, status: 'scheduled', teamA: null, teamB: null, teamASource: a, teamBSource: b, stats: [] });
  const matches = Array.from({ length: 4 }, (_, i) => ({ ...match(`q${i}`, null), teamA: 'abcdefgh'[i * 2], teamB: 'abcdefgh'[i * 2 + 1], scoreA: 2, scoreB: 0, status: 'done', date: '2026-11-21' }));
  matches.push(match('g1', 'openingA'), match('g2', 'openingB'), match('g3', 'winners', source('g1'), source('g2')), match('g4', 'losers', source('g1', 'loser'), source('g2', 'loser')), match('g5', 'decider', source('g3', 'loser'), source('g4')), match('gf', 'grandFinal', source('g3'), source('g5')));
  return { settings: { leagueName: 'Cup', leagueShort: 'CUP', theme: {}, timezone: 'Europe/Athens', enabledScenes: ['bracket', 'format', 'social-schedule', 'social-versus', 'social-roster'], rosterStyle: 'text',
    brackets: [{ id: 'single', name: 'Single Elimination', rounds: [{ id: 'q', name: 'Qualifying', matches: ['q0', 'q1', 'q2', 'q3'] }], qualifications: matches.slice(0, 4).map((m, i) => ({ id: `slot${i}`, source: source(m.id) })) },
      { id: 'gsl', name: 'Top 4 GSL', format: 'gsl', entrySources: matches.slice(0, 4).map(m => source(m.id)), championMatchId: 'gf', rounds: [{ id: 'all', name: 'GSL', matches: ['g1', 'g2', 'g3', 'g4', 'g5', 'gf'] }] }],
    tournamentFormat: { stages: [{ name: 'Single', headline: '12 → 4' }, { name: 'GSL', headline: '4 teams' }] } },
    teams: [...'abcdefgh'].map(id => ({ id, name: id.toUpperCase(), tag: id.toUpperCase() })), matches, players: [{ id: 'p1', teamId: 'a', role: 'Top', nick: 'Editable', lineup: 'starter' }], features: [], sponsors: [], graphics: [], backgrounds: [] };
}
const finish = (db, id, a, b) => { Object.assign(db.matches.find(m => m.id === id), { scoreA: a, scoreB: b, status: 'done' }); syncBracket(db); };

test('single elimination ends with four qualifiers and separate dashboard brackets', () => {
  const db = fixture();
  const single = bracketTree(db, 'single');
  assert.equal(single.champion, null);
  assert.deepEqual(single.qualifications.map(slot => slot.team.id), ['a', 'c', 'e', 'g']);
  assert.equal(bracketTree(db, 'gsl').rounds[0].matches.length, 6);
  assert.throws(() => sceneData('bracket', { bracket: 'foreign' }, db), /not found/);
  const cards = graphicCatalog(db, '2026-11-06');
  assert.deepEqual(cards.filter(c => c.scene === 'bracket').map(c => c.params.bracket), ['single', 'gsl']);
  assert.equal(cards.find(c => c.scene === 'format').ready, true);
  db.graphics.push({ id: 'saved-single', scene: 'bracket', name: 'Saved single', params: { bracket: 'single' } }, { id: 'saved-format', scene: 'format', name: 'Saved explainer', params: {} });
  const saved = graphicCatalog(db, '2026-11-06');
  assert.equal(saved.filter(c => c.scene === 'bracket').length, 2);
  assert.equal(saved.filter(c => c.scene === 'format').length, 1);
  assert.equal(saved.find(c => c.savedId === 'saved-single').automatic, true);
});

test('GSL advances winners and losers through elimination, lower final and Grand Final', () => {
  const db = fixture();
  updateBracketDraw(db, 'gsl', { revision: 0, sources: ['q0', 'q3', 'q1', 'q2'] });
  finish(db, 'g1', 2, 0); finish(db, 'g2', 2, 0);
  let byId = new Map(resolveMatches(db).map(m => [m.id, m]));
  assert.deepEqual([byId.get('g3').teamA, byId.get('g3').teamB], ['a', 'c']);
  assert.deepEqual([byId.get('g4').teamA, byId.get('g4').teamB], ['g', 'e']);
  assert.equal(byId.get('g4').teamALabel, 'Loser g1');
  finish(db, 'g3', 0, 2); finish(db, 'g4', 2, 0);
  byId = new Map(resolveMatches(db).map(m => [m.id, m]));
  assert.deepEqual([byId.get('g5').teamA, byId.get('g5').teamB], ['a', 'g']);
  finish(db, 'g5', 0, 2); finish(db, 'gf', 0, 2);
  assert.equal(bracketTree(db, 'gsl').champion.id, 'g');
  // A corrected opening result clears scores down both branches, including a completed Grand Final.
  finish(db, 'g1', 0, 2);
  for (const id of ['g3', 'g4', 'g5', 'gf']) {
    const match = db.matches.find(m => m.id === id);
    assert.equal(match.scoreA, null, id); assert.equal(match.status, 'scheduled', id);
  }
  assert.equal(bracketTree(db, 'gsl').champion, null);
});

test('GSL draw rejects duplicates, stale edits and changes after play starts', () => {
  const db = fixture(); const before = structuredClone(db);
  assert.throws(() => updateBracketDraw(db, 'gsl', { revision: 0, sources: ['q0', 'q0', 'q1', 'q2'] }), /exactly once/);
  assert.throws(() => updateBracketDraw(db, 'gsl', { revision: 0, sources: ['foreign', 'q3', 'q1', 'q2'] }), /exactly once/);
  assert.deepEqual(db, before);
  updateBracketDraw(db, 'gsl', { revision: 0, sources: ['q0', 'q3', 'q1', 'q2'] });
  assert.throws(() => updateBracketDraw(db, 'gsl', { revision: 0, sources: ['q0', 'q3', 'q1', 'q2'] }), /changed/);
  finish(db, 'g1', 2, 0);
  assert.throws(() => updateBracketDraw(db, 'gsl', { revision: 1, sources: ['q0', 'q3', 'q1', 'q2'] }), /started/);
});

test('social SUPERCUP screens share editable starters and represent undrawn opponents honestly', () => {
  const db = fixture();
  const poster = sceneData('social-versus', { match: 'q0' }, db);
  assert.equal(poster.rosterStyle, 'text'); assert.equal(poster.playersA[0].nick, 'Editable');
  assert.equal(sceneData('social-roster', { team: 'a' }, db).players[0].nick, 'Editable');
  db.players[0].nick = 'Updated';
  assert.equal(sceneData('social-versus', { match: 'q0' }, db).playersA[0].nick, 'Updated');
  assert.equal(sceneData('social-versus', { match: 'g1' }, db).dateLabel, 'Date TBD');
  db.players.push({ id: 'unassigned', teamId: null, nick: 'Unassigned player', role: 'Top' });
  assert.deepEqual(sceneData('social-versus', { match: 'g1' }, db).playersA, []);
  assert.deepEqual(sceneData('versus', { match: 'g1' }, db).playersB, []);
});
