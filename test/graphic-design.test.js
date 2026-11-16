import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/db.js';
import { sceneData } from '../server/scenes.js';
import { designPreview } from '../server/design-preview.js';
import { normalizeDesign, EMPTY_DESIGN, BUILTIN_DESIGNS, DESIGN_SLOTS, DESIGN_ELEMENTS, expandDesignText } from '../public/shared/graphic-design.js';
import { SCENE_IDS } from '../public/shared/scenes.js';
import { ICON_SETS, ICON_SLOTS } from '../public/shared/icon-sets.js';
import { saveDesignIcon } from '../server/backgrounds.js';
import { ASSETS } from '../server/util.js';

function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-design-test-'));
  const file = path.join(folder, 'db.json');
  const store = createStore({ file }); store.load();
  t.after(() => { store.saveNow(); assert.equal(path.dirname(folder), path.resolve(os.tmpdir())); assert.ok(path.basename(folder).startsWith('hll-design-test-')); fs.rmSync(folder, { recursive: true, force: true }); });
  return { store, file };
}
test('preset library persists globally and applying snapshots never follows later library edits', t => {
  const { store, file } = fixture(t);
  const before = structuredClone(store.get());
  let result = store.saveDesignPreset({ name: 'My show', revision: 0, config: { fonts: { title: 'noto' }, screens: { waiting: { title: { text: '{short} STARTS SOON', enabled: true }, caption: { enabled: false } } } } });
  assert.deepEqual(store.get().live, before.live); assert.equal(store.get().settings.graphicDesign, undefined);
  const preset = result.preset;
  store.applyDesign({ presetId: preset.id, config: preset.config, revision: 0 });
  const applied = structuredClone(store.get().settings.graphicDesign);
  const cup = store.createTournament({ name: 'Cup' }); store.activate(cup.id);
  assert.ok(store.designLibrary().presets.some(p => p.id === preset.id));
  assert.equal(store.get().settings.graphicDesign, undefined);
  result = store.saveDesignPreset({ id: preset.id, name: 'My show', revision: 1, config: { fonts: { title: 'arial' } } });
  store.activate('tr_hll'); assert.deepEqual(store.get().settings.graphicDesign, applied);
  const restored = createStore({ file }); restored.load(); assert.equal(restored.designLibrary().presets.find(p => p.id === preset.id).config.fonts.title, 'arial'); restored.saveNow();
  store.deleteDesignPreset(preset.id, 2); assert.deepEqual(store.get().settings.graphicDesign, applied);
});
test('new tournament picker and global default apply the chosen design without changing existing tournaments', t => {
  const { store } = fixture(t);
  store.setDefaultDesign('neon', 0);
  const first = store.createTournament({ name: 'Default cup' });
  assert.equal(store.getTournament(first.id).settings.graphicDesign.presetId, 'neon');
  assert.equal(store.get().settings.graphicDesign, undefined);
  const second = store.createTournament({ name: 'Original cup', designPresetId: 'original' });
  assert.equal(store.getTournament(second.id).settings.graphicDesign, undefined);
  const third = store.createTournament({ name: 'Gold cup', designPresetId: 'classic' });
  assert.equal(store.getTournament(third.id).settings.graphicDesign.config.fonts.title, 'noto');
  const before = store.tournaments().length;
  assert.throws(() => store.createTournament({ name: 'Invalid cup', designPresetId: 'foreign' }));
  assert.equal(store.tournaments().length, before);
});
test('stale library writes, built-in changes and invalid drafts fail before mutations', t => {
  const { store } = fixture(t);
  const before = store.designLibrary();
  assert.throws(() => store.saveDesignPreset({ name: 'Draft', revision: 99, config: EMPTY_DESIGN }), /changed/);
  assert.throws(() => store.saveDesignPreset({ id: 'original', name: 'Overwrite', revision: 0, config: EMPTY_DESIGN }), /read-only/);
  assert.throws(() => store.applyDesign({ revision: 1, config: EMPTY_DESIGN }), /changed/);
  for (const config of [{ fonts: { title: 'url(https://evil.test)' } }, { assets: { accent: 'red' } }, { assets: { radius: -3 } }, { screens: { waiting: { title: { enabled: 'false' } } } }, { screens: { waiting: { title: { size: 1000 } } } }, { screens: { roster: { players: { text: 'Replace everyone' } } } }, { screens: { waiting: { title: { text: '{password}' } } } }, { screens: { unknown: {} } }]) assert.throws(() => normalizeDesign(config));
  assert.deepEqual(store.designLibrary(), before); assert.equal(store.get().settings.graphicDesign, undefined);
});
test('every screen has editable slots; previews of missing data remain isolated from real matches and rosters', t => {
  const { store } = fixture(t), db = store.get(), before = structuredClone(db);
  assert.deepEqual(Object.keys(DESIGN_SLOTS).sort(), [...SCENE_IDS].sort());
  for (const preset of BUILTIN_DESIGNS) assert.deepEqual(normalizeDesign(preset.config), preset.config);
  for (const scene of SCENE_IDS) {
    const data = designPreview(db, scene, {}, BUILTIN_DESIGNS[1].config);
    assert.equal(data.scene, scene); assert.equal(data.graphicDesign.fonts.title, 'commissioner');
  }
  assert.deepEqual(db, before);
  assert.equal(sceneData('waiting', {}, db).graphicDesign, null);
  assert.equal(expandDesignText('{tournament} — {teamA}', { league: { name: '<img onerror=alert(1)>' }, teamA: { name: 'A' } }), '<img onerror=alert(1)> — A');
});
test('every screen has a unique catalogue of layout elements', () => {
  for (const scene of SCENE_IDS) {
    const ids = DESIGN_ELEMENTS[scene].map(element => element.id);
    assert.ok(ids.length > 3, scene);
    assert.equal(new Set(ids).size, ids.length, `${scene} repeats an element id`);
  }
});
test('element layouts are saved per screen, without default values', () => {
  const design = normalizeDesign({ layouts: {
    versus: { 'crest-a': { x: 12.34, y: 0, s: 1.25 }, 'name-a': { x: 0, y: 0, s: 1 }, 'card-a#2': {}, 'card-a': { y: -40, w: 200.4 } },
    roster: {},
  } });
  assert.deepEqual(design.layouts, { versus: { 'crest-a': { x: 12.3, s: 1.25 }, 'card-a#2': {}, 'card-a': { y: -40, w: 200 } } });
  assert.deepEqual(normalizeDesign({}).layouts, {});
});
test('element layouts reject bad values and ignore elements that no longer exist', () => {
  assert.throws(() => normalizeDesign({ layouts: { nope: {} } }), /Unknown screen/);
  assert.throws(() => normalizeDesign({ layouts: { versus: { 'crest-a': { s: 99 } } } }), /Invalid element layout/);
  assert.throws(() => normalizeDesign({ layouts: { versus: { 'crest-a': { x: 'left' } } } }), /Invalid element layout/);
  assert.throws(() => normalizeDesign({ layouts: 'x' }), /must be an object/);
  assert.deepEqual(normalizeDesign({ layouts: { versus: { removedElement: { x: 5 } } } }).layouts, {});
});
test('every icon set draws every icon slot', () => {
  assert.ok(ICON_SETS.length >= 4);
  for (const set of ICON_SETS) for (const slot of ICON_SLOTS) assert.ok(set.icons[slot.id]?.includes('<'), `${set.id} has no ${slot.id}`);
});
test('icon choices are validated and old designs get the Classic icons', () => {
  assert.equal(normalizeDesign({ assets: { frame: 'line' } }).assets.icons, 'classic');
  const design = normalizeDesign({ assets: { icons: 'hoplite', iconTint: true, customIcons: { Top: '/media/design-icons/icon_a1.png' } } });
  assert.equal(design.assets.icons, 'hoplite');
  assert.equal(design.assets.iconTint, true);
  assert.deepEqual(design.assets.customIcons, { Top: '/media/design-icons/icon_a1.png' });
  assert.throws(() => normalizeDesign({ assets: { icons: 'nope' } }), /Unknown icon style/);
  for (const customIcons of [{ Nope: '/media/design-icons/a.png' }, { Top: 'https://example.com/a.png' }, { Top: '/media/design-icons/../../db.json' }, { Top: 'javascript:alert(1)' }]) {
    assert.throws(() => normalizeDesign({ assets: { customIcons } }), /Invalid custom icon/);
  }
});
test('an uploaded icon becomes a PNG, and a file that is not an image is refused', async t => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><circle cx="12" cy="12" r="10"/></svg>');
  const { url } = await saveDesignIcon(svg);
  assert.match(url, /^\/media\/design-icons\/[\w-]+\.png$/);
  const file = path.join(ASSETS, 'design-icons', path.basename(url));
  t.after(() => fs.rmSync(file, { force: true }));
  assert.deepEqual([...fs.readFileSync(file).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  await assert.rejects(() => saveDesignIcon(Buffer.from('not an image')), /valid PNG/);
});
