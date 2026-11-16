import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { localPaths } from '../server/db.js';
import { RAW } from '../server/util.js';

test('paths written on another PC point into the folders of this PC', () => {
  const out = path.join('Z:', 'nowhere-here', 'output');
  const data = {
    settings: { outputDir: 'Q:\\Other\\HLL\\output\\tournaments\\tr_x' },
    teams: [{ logoRaw: 'Q:\\Other\\HLL\\data\\raw\\teams\\t_1.png' }],
    players: [{ photoRaw: '/home/someone/HLL-Broadcast/data/raw/players/p_1.jpg' }, { photoRaw: null }],
    sponsors: [],
  };
  localPaths(data, out);
  assert.equal(data.teams[0].logoRaw, path.join(RAW, 'teams', 't_1.png'));
  assert.equal(data.players[0].photoRaw, path.join(RAW, 'players', 'p_1.jpg'));
  assert.equal(data.players[1].photoRaw, null);
  assert.equal(data.settings.outputDir, path.join(out, 'tournaments', 'tr_x'));
});

test('a path that is already local, or a custom folder that exists here, is kept', () => {
  const here = process.cwd();
  const data = { settings: { outputDir: here }, teams: [{ logoRaw: path.join(RAW, 'teams', 'a.png') }], players: [], sponsors: [] };
  localPaths(data, path.join(here, 'output'));
  assert.equal(data.settings.outputDir, here);
  assert.equal(data.teams[0].logoRaw, path.join(RAW, 'teams', 'a.png'));
});
