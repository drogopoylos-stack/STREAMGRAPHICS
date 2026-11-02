import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/db.js';

function fixture(t, legacy) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-tournaments-test-'));
  const file = path.join(folder, 'db.json');
  if (legacy) fs.writeFileSync(file, JSON.stringify(legacy));
  const store = createStore({ file, outputRoot: path.join(folder, 'output') });
  t.after(() => {
    store.saveNow();
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('hll-tournaments-test-'));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  return { store, file, folder };
}

test('existing HLL data migrates without losing photos, stats, settings or on-air state', t => {
  const legacy = { settings: { leagueName: 'HLL', photo: { engine: 'photocraft' }, outputDir: 'G:/existing-output' },
    teams: [{ id: 'team-hll', name: 'Original team', logo: '/media/teams/original.png' }],
    players: [{ id: 'player-hll', nick: 'Original player', photoRaw: 'G:/original.png', photo: '/media/players/original.png' }],
    matches: [{ id: 'match-hll', stats: [{ playerId: 'player-hll', values: { kills: 9 } }] }],
    live: { scene: 'roster', params: { team: 'team-hll' }, visible: true, rev: 27 }, rev: 45 };
  const { store, file, folder } = fixture(t, legacy);
  const active = store.load();
  assert.deepEqual(active.players, legacy.players);
  assert.deepEqual(active.matches, legacy.matches);
  assert.deepEqual(active.live, legacy.live);
  assert.equal(active.settings.outputDir, legacy.settings.outputDir);
  assert.equal(active.settings.photo.engine, 'photocraft');
  assert.equal(store.activeId(), 'tr_hll');
  const backup = fs.readdirSync(folder).find(name => name.startsWith('db.json.before-tournaments-'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, backup))), legacy);
  assert.equal(JSON.parse(fs.readFileSync(file)).schemaVersion, 2);
});

test('tournaments keep rosters, settings, branding, output folders and persistence separate', t => {
  const { store, file, folder } = fixture(t);
  const hll = store.get();
  hll.players.push({ id: 'hll-player', nick: 'HLL player' });
  hll.settings.theme.bgImage = '/media/brand/hll-bg.png';
  hll.settings.photo.engine = 'photocraft';
  hll.settings.photo.look = { mean: [20, 5, 4] };
  store.changed();
  const second = store.createTournament({ name: 'Weekend Cup', short: 'CUP', season: 'Autumn', broadcastDays: [7, 6, 6] });
  assert.equal(store.activeId(), 'tr_hll');
  assert.deepEqual(second.broadcastDays, [6, 7]);
  store.activate(second.id);
  assert.deepEqual(store.get().players, []);
  assert.equal(store.get().settings.leagueName, 'Weekend Cup');
  assert.equal(store.get().settings.hllgr.baseUrl, '');
  assert.equal(store.get().settings.theme.bgImage, null);
  assert.equal(store.get().settings.photo.engine, 'photocraft');
  assert.equal(store.get().settings.photo.look, undefined);
  assert.equal(store.get().settings.outputDir, path.join(folder, 'output', 'tournaments', second.id));
  store.get().players.push({ id: 'cup-player', nick: 'Cup player' });
  store.get().settings.photo.strength = 0.25;
  store.changed();
  store.activate('tr_hll');
  assert.deepEqual(store.get().players, [{ id: 'hll-player', nick: 'HLL player' }]);
  assert.equal(store.get().settings.theme.bgImage, '/media/brand/hll-bg.png');
  store.saveNow();
  const restored = createStore({ file });
  assert.equal(restored.activeId(), 'tr_hll');
  restored.activate(second.id);
  assert.equal(restored.get().players[0].id, 'cup-player');
  assert.equal(restored.get().settings.photo.strength, 0.25);
  restored.saveNow();
});

test('switching hides both tournaments and keeps live revisions increasing for overlays', t => {
  const { store } = fixture(t);
  store.get().live = { scene: 'schedule', params: {}, visible: true, rev: 88 };
  const cup = store.createTournament({ name: 'Cup' });
  store.activate(cup.id);
  assert.equal(store.get().live.visible, false);
  assert.ok(store.get().live.rev > 88);
  const first = store.get().live.rev;
  store.get().live.visible = true;
  store.activate('tr_hll');
  assert.equal(store.get().live.visible, false);
  assert.ok(store.get().live.rev > first);
});

test('invalid tournament changes fail before altering the stored record', t => {
  const { store } = fixture(t);
  store.load();
  assert.throws(() => store.createTournament({ name: '  ' }), /Tournament name/);
  assert.throws(() => store.createTournament({ name: 'Cup', broadcastDays: [0, 9] }), /Broadcast days/);
  assert.throws(() => store.updateTournament('tr_hll', { name: 'Changed', broadcastDays: ['Mon'] }), /Broadcast days/);
  assert.equal(store.get().settings.leagueName, 'Hellenic Legends League');
  assert.equal(store.tournaments().length, 1);
  assert.throws(() => store.activate('missing'), /not found/);
  store.updateTournament('tr_hll', { name: 'HLL Autumn', broadcastDays: [2, 4] });
  assert.equal(store.tournaments()[0].name, 'HLL Autumn');
  assert.deepEqual(store.tournaments()[0].broadcastDays, [2, 4]);
});
