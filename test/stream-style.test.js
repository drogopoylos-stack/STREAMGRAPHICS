import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createStore, validateSettings } from '../server/db.js';
import { sceneData } from '../server/scenes.js';
import { SCENE_DEFINITIONS } from '../public/shared/scenes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STREAM = SCENE_DEFINITIONS.filter((scene) => scene.group !== 'social').map((scene) => scene.id);
const SOCIAL = SCENE_DEFINITIONS.filter((scene) => scene.group === 'social').map((scene) => scene.id);
const PLATE = '/brand/supercup/bg-stream.jpg';
const CLEAN = '/brand/supercup/bg-stream-clean.jpg';

function fixture(settings = {}) {
  const team = (id, tag) => ({ id, tag, name: `${tag} Esports`, logo: `/media/teams/${id}.png` });
  const players = ['a', 'b'].flatMap((teamId) => ['Top', 'Jungle', 'Mid', 'Bot', 'Support'].map((role, i) => ({ id: `${teamId}${i}`, teamId, nick: `${teamId}${role}`, role, lineup: 'starter', photo: null, hidden: false })));
  return {
    settings: {
      leagueName: 'SUPER CUP 2027', leagueShort: 'SUPERCUP', season: '', timezone: 'Europe/Athens', mode: 'full', rosterStyle: 'text',
      theme: { preset: 'aegean', bgImage: null }, sponsorsOnGraphics: false, statDefs: [], bracketEmbed: '',
      tournamentFormat: { subtitle: 'Format', stages: [] }, ...settings, theme: { preset: 'aegean', bgImage: null, ...settings.theme },
    },
    teams: [team('a', 'ALP'), team('b', 'BET')],
    players,
    matches: [{ id: 'm1', bracketCode: '1-1', date: '2026-11-21', time: '18:00', bestOf: 3, teamA: 'a', teamB: 'b', scoreA: null, scoreB: null, status: 'scheduled', stage: 'Day 1-1', stats: [] }],
    sponsors: [{ id: 's1', name: 'GAMEATHLON', logo: '/media/sponsors/s1.png', tier: 'main' }],
    features: [{ id: 'f1', playerA: 'a0', playerB: 'b0', title: 'Top matchup' }],
    backgrounds: [{ id: 'bg1', url: '/media/backgrounds/bg1.jpg' }], graphics: [],
  };
}
const params = { roster: { team: 'a' }, matchup: { feature: 'f1' }, schedule: { day: '2026-11-21' } };

test('streamStyle is validated like socialStyle', () => {
  assert.doesNotThrow(() => validateSettings({ streamStyle: 'classic' }));
  assert.doesNotThrow(() => validateSettings({ streamStyle: 'supercup' }));
  assert.doesNotThrow(() => validateSettings({ socialStyle: 'supercup', streamStyle: 'classic' }));
  for (const bad of ['neon', 'SUPERCUP', '', 1, null, true]) {
    assert.throws(() => validateSettings({ streamStyle: bad }), /classic or supercup for the live stream graphics style/, String(bad));
  }
});

test('a new database and a new tournament default to the classic stream style', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-stream-style-'));
  t.after(() => { assert.ok(path.basename(folder).startsWith('hll-stream-style-')); fs.rmSync(folder, { recursive: true, force: true }); });
  const store = createStore({ file: path.join(folder, 'db.json'), outputRoot: path.join(folder, 'output') });
  store.load();
  assert.equal(store.get().settings.streamStyle, 'classic');
  const created = store.createTournament({ name: 'Weekend Cup', short: 'CUP', broadcastDays: [] });
  assert.equal(store.getTournament(created.id).settings.streamStyle, 'classic');
  store.saveNow();
});

test('every stream scene carries the stream style; social scenes carry their own social block instead', () => {
  const classic = fixture();
  const cup = fixture({ streamStyle: 'supercup' });
  for (const scene of STREAM) {
    assert.equal(sceneData(scene, params[scene] ?? {}, classic).streamStyle, 'classic', scene);
    assert.equal(sceneData(scene, params[scene] ?? {}, cup).streamStyle, 'supercup', scene);
  }
  // an unknown value never reaches the overlay as a style
  assert.equal(sceneData('versus', {}, fixture({ streamStyle: 'neon' })).streamStyle, 'classic');
  for (const scene of SOCIAL) {
    const data = sceneData(scene, params[scene] ?? {}, cup);
    assert.equal(data.streamStyle, undefined, scene);
    assert.ok(data.social, scene);
  }
});

test('SUPER CUP stream scenes default to the stream plate; a chosen background still wins; classic is untouched', () => {
  const cup = fixture({ streamStyle: 'supercup' });
  assert.equal(sceneData('versus', {}, cup).theme.bgImage, PLATE);
  assert.equal(sceneData('simple-vs', {}, cup).theme.bgImage, PLATE);
  assert.equal(sceneData('roster', { team: 'a' }, cup).theme.bgImage, PLATE);
  assert.equal(sceneData('waiting', {}, cup).theme.bgImage, PLATE);
  // the scenes full of panels sit on the smooth copy
  for (const scene of ['schedule', 'standings', 'bracket', 'format']) assert.equal(sceneData(scene, params[scene] ?? {}, cup).theme.bgImage, CLEAN, scene);
  // "preset" (no custom image) still means the style's own plate
  assert.equal(sceneData('versus', { background: 'preset' }, cup).theme.bgImage, PLATE);
  // a background picked for the graphic, or the tournament's own background, wins over the plate
  assert.equal(sceneData('versus', { background: 'bg1' }, cup).theme.bgImage, '/media/backgrounds/bg1.jpg');
  assert.equal(sceneData('schedule', params.schedule, fixture({ streamStyle: 'supercup', theme: { bgImage: '/media/custom.jpg' } })).theme.bgImage, '/media/custom.jpg');
  // the stream plate never leaks into the social scenes (their SUPER CUP plates are separate)
  assert.equal(sceneData('social-versus', {}, cup).theme.bgImage, null);
  // classic keeps the preset plates
  for (const scene of STREAM) assert.equal(sceneData(scene, params[scene] ?? {}, fixture()).theme.bgImage, null, scene);
});

test('the stream plates are 1920×1080 JPEGs next to the social plates', async () => {
  for (const url of [PLATE, CLEAN]) {
    const meta = await sharp(path.join(ROOT, 'public', url)).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1920, 1080], url);
  }
});

test('the SUPER CUP stream stylesheet is loaded by the overlay pages and scoped to its root class', () => {
  for (const page of ['scene.html', 'live.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'public/overlay', page), 'utf8');
    assert.match(html, /href="css\/stream-sc\.css"/, page);
    assert.ok(html.indexOf('css/stream-sc.css') < html.indexOf('css/graphic-design.css'), `${page}: the designer's styles load after it`);
  }
  // every rule starts with .scene.stream-sc, so the classic stream graphics cannot change
  const css = fs.readFileSync(path.join(ROOT, 'public/overlay/css/stream-sc.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 100);
  for (const list of selectors) {
    for (const selector of list.split(/,(?![^(]*\))/).map((s) => s.trim())) {
      assert.ok(selector.startsWith('.scene.stream-sc'), `unscoped selector: ${selector}`);
    }
  }
});
