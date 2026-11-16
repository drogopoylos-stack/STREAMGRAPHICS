// Review 2: normalizeDesign for the new backgrounds block and per-icon picks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, resolveBackground, EMPTY_DESIGN, BG_DEFAULT } from '../public/shared/graphic-design.js';

const throws400 = (fn) => assert.throws(fn, (e) => e.status === 400 && typeof e.message === 'string');

test('review2: a design without backgrounds or icon picks keeps the legacy defaults', () => {
  const legacy = { fonts: { title: 'fira' }, assets: { frame: 'line', boxes: 'glass', radius: 12, opacity: 80, accent: '', accent2: '' }, screens: {}, layouts: {} };
  const config = normalizeDesign(legacy);
  assert.deepEqual(config.backgrounds, EMPTY_DESIGN.backgrounds);
  assert.deepEqual(config.assets.iconPicks, {});
  assert.deepEqual(resolveBackground(config, 'schedule'), BG_DEFAULT);
});

test('review2: unknown motion, screen and icon names are dropped, bad types are rejected', () => {
  const config = normalizeDesign({
    backgrounds: { default: { motion: 'lightning', show: false }, screens: { future: { show: false }, schedule: { motion: 'rays' } } },
  });
  assert.equal(config.backgrounds.default.motion, 'none');
  assert.equal(config.backgrounds.default.show, false);
  assert.deepEqual(config.backgrounds.screens, { schedule: { motion: 'rays' } });
  throws400(() => normalizeDesign({ backgrounds: { default: { show: 'yes' } } }));
  throws400(() => normalizeDesign({ backgrounds: { default: { motion: 5 } } }));
  throws400(() => normalizeDesign({ backgrounds: 'x' }));
  throws400(() => normalizeDesign({ backgrounds: { screens: { schedule: 'x' } } }));

  const picks = normalizeDesign({ assets: { iconPicks: { Foo: 'hoplite', Top: 'unknown-set', Jungle: 'hoplite' } } });
  assert.deepEqual(picks.assets.iconPicks, { Jungle: 'hoplite' });
  throws400(() => normalizeDesign({ assets: { iconPicks: ['hoplite'] } }));
});

test('review2: a per-icon pick equal to the final global style is removed, not stored', () => {
  assert.deepEqual(normalizeDesign({ assets: { icons: 'hoplite', iconPicks: { Top: 'hoplite' } } }).assets.iconPicks, {});
  assert.deepEqual(normalizeDesign({ assets: { icons: 'hoplite', iconPicks: { Top: 'classic' } } }).assets.iconPicks, { Top: 'classic' });
});

test('review2: an equal-to-default screen override is not stored', () => {
  const config = normalizeDesign({ backgrounds: { default: { motion: 'rays' }, screens: { schedule: { motion: 'rays' }, versus: { motion: 'embers' } } } });
  assert.deepEqual(config.backgrounds.screens, { versus: { motion: 'embers' } });
});
