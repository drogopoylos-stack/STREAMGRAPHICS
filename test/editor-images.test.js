import test from 'node:test';
import assert from 'node:assert/strict';
import { imageKind, imageLabel, changeLabel, pickTarget, IMAGE_KINDS } from '../public/overlay/js/editor-images.js';
import { normalizeDesign, BUILTIN_DESIGNS, DESIGN_IMAGES } from '../public/shared/graphic-design.js';

const node = (dataset = {}, classes = []) => ({ dataset, classList: { contains: (c) => classes.includes(c) } });

test('image kinds come from data-icon-slot, data-image, then the older class names', () => {
  assert.equal(imageKind(node({ iconSlot: 'Top' })), 'icon');
  assert.equal(imageKind(node({ iconSlot: 'Team' }, ['tlogo'])), 'icon');
  for (const kind of ['team', 'player', 'league', 'sponsor', 'event', 'mark']) assert.equal(imageKind(node({ image: kind })), kind);
  assert.equal(imageKind(node({}, ['tlogo', 'sx-logo'])), 'team');
  assert.equal(imageKind(node({}, ['pphoto'])), 'player');
  assert.equal(imageKind(node({}, ['league-logo'])), 'league');
  assert.equal(imageKind(node({}, ['spons-item'])), 'sponsor');
  assert.equal(imageKind(node({}, ['sp-tile'])), 'sponsor');
  assert.equal(imageKind(node({ image: 'future' }, ['tlogo'])), 'team');
  assert.equal(imageKind(node({}, ['sx-lock'])), null);
  assert.equal(imageKind(null), null);
  assert.ok(IMAGE_KINDS.includes('event') && IMAGE_KINDS.includes('mark'));
});

test('image labels and the toolbar wording', () => {
  assert.equal(imageLabel('icon', 'Top'), 'Top icon');
  assert.equal(imageLabel('icon', 'Team'), 'Unknown team icon');
  assert.equal(imageLabel('icon', 'Emblem'), 'Tournament emblem');
  assert.equal(imageLabel('team'), 'Team logo');
  assert.equal(imageLabel('event'), 'Event logo');
  assert.equal(imageLabel('mark', 'lettermark'), 'Header mark');
  assert.equal(imageLabel('mark', 'hllLogo'), 'HLL logo');
  assert.equal(changeLabel('icon'), 'Change icon…');
  assert.equal(changeLabel('team'), 'Change image…');
});

// A tiny tree: each node knows its parent; flags say what it is.
function tree() {
  const make = (name, parent, flags = {}) => ({ name, parent, ...flags });
  const scene = make('scene', null);
  const card = make('card', scene, { item: true });
  const photo = make('photo', card, { image: true });
  const shine = make('shine', card);
  const name = make('name', card, { slot: true });
  const other = make('other', scene, { item: true });
  const otherLogo = make('otherLogo', other, { image: true });
  const orn = make('orn', scene);
  const up = (n, flag) => { for (let p = n; p; p = p.parent) if (p[flag]) return p; return null; };
  const contains = (a, b) => { for (let p = b; p; p = p.parent) if (p === a) return true; return false; };
  return { scene, card, photo, shine, name, other, otherLogo, orn, accessors: { image: (n) => up(n, 'image'), slot: (n) => up(n, 'slot'), item: (n) => up(n, 'item'), contains } };
}

test('a double-click finds the photo under a shine layer of the same card', () => {
  const t = tree();
  assert.equal(pickTarget([t.shine, t.photo, t.card, t.scene], t.accessors), t.photo);
  assert.equal(pickTarget([t.shine, t.name, t.card], t.accessors), t.name);
});

test('the first image or text wins; decorations outside elements are skipped', () => {
  const t = tree();
  assert.equal(pickTarget([t.photo, t.card, t.scene], t.accessors), t.photo);
  assert.equal(pickTarget([t.orn, t.otherLogo, t.other], t.accessors), t.otherLogo);
});

test('an image of another element below does not steal the click', () => {
  const t = tree();
  assert.equal(pickTarget([t.shine, t.card, t.otherLogo, t.other], t.accessors), t.card);
  assert.equal(pickTarget([t.orn, t.scene], t.accessors), null);
});

test('design images: stored only when used, unknown ones dropped, bad files rejected', () => {
  assert.equal('customImages' in normalizeDesign({}).assets, false);
  for (const preset of BUILTIN_DESIGNS) assert.deepEqual(normalizeDesign(preset.config), preset.config);
  const url = '/media/design-icons/icon_a1.png';
  assert.deepEqual(normalizeDesign({ assets: { customImages: { lettermark: url, hllLogo: url, future: url } } }).assets.customImages, { lettermark: url, hllLogo: url });
  assert.equal('customImages' in normalizeDesign({ assets: { customImages: { future: url } } }).assets, false);
  for (const bad of ['https://example.com/a.png', '/media/design-icons/../../db.json', 'javascript:alert(1)', 5]) {
    assert.throws(() => normalizeDesign({ assets: { customImages: { lettermark: bad } } }), /Invalid custom image/);
  }
  assert.throws(() => normalizeDesign({ assets: { customImages: [] } }), /Custom images must be an object/);
  assert.deepEqual(DESIGN_IMAGES.map((d) => d.id), ['lettermark', 'hllLogo']);
  const design = normalizeDesign({ assets: { customImages: { lettermark: url } } });
  assert.deepEqual(normalizeDesign(design), design);
});
