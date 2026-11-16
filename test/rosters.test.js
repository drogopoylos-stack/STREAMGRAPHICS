import test from 'node:test';
import assert from 'node:assert/strict';
import { updateRosters } from '../server/rosters.js';
import { sceneData } from '../server/scenes.js';
import { splitRoster } from '../public/overlay/js/scenes/common.js';
import { isoDay } from '../server/util.js';

function fixture() {
  return { settings: { leagueName: 'Cup', leagueShort: 'CUP', timezone: 'Europe/Athens', theme: {}, mode: 'full', rosterStyle: 'text', showBench: false },
    teams: [{ id: 'a', name: 'A', tag: 'A' }, { id: 'b', name: 'B', tag: 'B' }],
    players: [{ id: 'pa', teamId: 'a', nick: 'Old', role: 'Top', photo: '/media/player.png', captain: true }, { id: 'pb', teamId: 'b', nick: 'Beta', role: 'Top' }],
    matches: [{ id: 'm', date: isoDay(0, 'Europe/Athens'), time: '18:00', teamA: 'a', teamB: 'b' }, { id: 'future', date: '2099-01-01', teamA: 'a', teamB: 'b' }], features: [], sponsors: [] };
}
const row = (id, nick, role = 'Top', lineup = 'starter') => ({ id, nick, role, lineup });

test('saving rosters changes real player records and both roster and VS scene data', () => {
  const db = fixture();
  updateRosters(db, { teams: [{ teamId: 'a', revision: 0, players: [row('pa', 'Correct name'), row(null, 'Jungler', 'Jungle')] }] });
  assert.equal(db.players.find(p => p.id === 'pa').photo, '/media/player.png');
  assert.equal(db.players.find(p => p.id === 'pa').captain, true);
  assert.equal(db.teams[0].rosterRevision, 1);
  assert.equal(sceneData('roster', { team: 'a' }, db).players.find(p => p.id === 'pa').nick, 'Correct name');
  assert.equal(sceneData('versus', { match: 'm' }, db).playersA.find(p => p.id === 'pa').nick, 'Correct name');
  assert.equal(sceneData('versus', { match: 'm' }, db).rosterStyle, 'text');
  assert.equal(sceneData('roster', { team: 'a' }, db).showBench, false);
});

test('invalid second-team edits, stale revisions and foreign player IDs fail before any mutations', () => {
  const db = fixture(); const before = structuredClone(db);
  assert.throws(() => updateRosters(db, { teams: [{ teamId: 'a', revision: 0, players: [row('pa', 'Changed')] }, { teamId: 'b', revision: 0, players: [row('pb', '')] }] }), /name/);
  assert.deepEqual(db, before);
  assert.throws(() => updateRosters(db, { teams: [{ teamId: 'a', revision: 1, players: [] }] }), /another editor/);
  assert.throws(() => updateRosters(db, { teams: [{ teamId: 'a', revision: 0, players: [row('pb', 'Foreign')] }] }), /belong/);
  assert.throws(() => updateRosters(db, { teams: [{ teamId: 'a', revision: 0, players: [row('pa', 'Top'), row(null, 'Other top')] }] }), /one starter/);
  assert.deepEqual(db, before);
});

test('removed players remain available for historical stats and substitutes never fill a missing starter', () => {
  const db = fixture();
  updateRosters(db, { teams: [{ teamId: 'a', revision: 0, players: [row(null, 'Reserve', '', 'substitute')] }] });
  assert.equal(db.players.find(p => p.id === 'pa').hidden, true);
  const visible = sceneData('roster', { team: 'a' }, db).players;
  assert.equal(visible.length, 1);
  assert.deepEqual(splitRoster(visible).starters, []);
  assert.equal(splitRoster(visible).bench[0].nick, 'Reserve');
});

test('waiting scene follows the tournament timezone and shows only today’s actual fixtures', () => {
  const db = fixture();
  const waiting = sceneData('waiting', {}, db);
  assert.equal(waiting.scene, 'waiting');
  assert.equal(waiting.hllLogo, '/brand/hll-logo.png');
  assert.deepEqual(waiting.matches.map(m => m.id), ['m']);
  assert.equal(waiting.matches[0].teamA.name, 'A');
  db.matches = [];
  assert.deepEqual(sceneData('waiting', {}, db).matches, []);
});
