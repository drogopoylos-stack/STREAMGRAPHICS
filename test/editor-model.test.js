import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, resolveBackground, BG_DEFAULT, BUILTIN_DESIGNS } from '../public/shared/graphic-design.js';
import { readFlags } from '../public/overlay/js/core.js';
import { animateOut } from '../public/overlay/js/anim.js';

test('old and built-in designs keep the original background and no icon picks', () => {
  assert.deepEqual(resolveBackground(normalizeDesign({}), 'schedule'), BG_DEFAULT);
  for (const preset of BUILTIN_DESIGNS) assert.deepEqual(normalizeDesign(preset.config), preset.config);
  assert.deepEqual(normalizeDesign({}).assets.iconPicks, {});
});
test('background overrides resolve per screen and store only differences', () => {
  const config = normalizeDesign({ backgrounds: { default: { motion: 'rays', speed: 'slow' }, screens: { schedule: { show: false, motion: 'rays', speed: 'fast' }, waiting: { motion: 'rays' } } } });
  assert.deepEqual(config.backgrounds.screens, { schedule: { show: false, speed: 'fast' } });
  assert.deepEqual(resolveBackground(config, 'schedule'), { show: false, motion: 'rays', speed: 'fast', intensity: 'normal' });
  assert.equal(resolveBackground(config, 'versus').speed, 'slow');
});
test('future background styles, fields and screens are discarded', () => {
  const config = normalizeDesign({ backgrounds: { default: { motion: 'lightning', speed: 'warp', intensity: 'ultra', future: 42 }, screens: { future: null, schedule: { motion: 'future', show: true } } } });
  assert.deepEqual(config.backgrounds, { default: BG_DEFAULT, screens: {} });
});
for (const value of [null, [], 'yes', 1]) test(`invalid background block ${JSON.stringify(value)} is rejected`, () => {
  assert.throws(() => normalizeDesign({ backgrounds: value }), /Background settings must be an object/);
  assert.throws(() => normalizeDesign({ backgrounds: { default: value } }), /Background settings must be an object/);
  assert.throws(() => normalizeDesign({ backgrounds: { screens: { schedule: value } } }), /Background settings must be an object/);
});
test('background visibility and enum value types are strict', () => {
  for (const show of ['yes', 0, null]) assert.throws(() => normalizeDesign({ backgrounds: { default: { show } } }), /Background visibility must be on or off/);
  for (const key of ['motion', 'speed', 'intensity']) for (const value of [true, null, 1]) assert.throws(() => normalizeDesign({ backgrounds: { default: { [key]: value } } }), /Invalid background motion/);
  assert.throws(() => normalizeDesign({ backgrounds: { screens: [] } }), /Background settings must be an object/);
});
test('per-icon styles preserve Classic picks inside Hoplite and discard unknown or redundant picks', () => {
  assert.deepEqual(normalizeDesign({ assets: { icons: 'hoplite', iconPicks: { Top: 'classic', Mid: 'hoplite', Foo: 'hoplite', Bot: 'future' } } }).assets.iconPicks, { Top: 'classic' });
  for (const iconPicks of [null, [], 2, 'classic']) assert.throws(() => normalizeDesign({ assets: { iconPicks } }), /Icon picks must be an object/);
});
test('normalization is idempotent and does not mutate input', () => {
  const input = { backgrounds: { default: { motion: 'embers', intensity: 'strong' }, screens: { schedule: { speed: 'slow' } } }, assets: { icons: 'hoplite', iconPicks: { Top: 'classic' } } };
  const before = structuredClone(input), config = normalizeDesign(input);
  assert.deepEqual(input, before); assert.deepEqual(normalizeDesign(config), config);
});
test('URL background is tri-state, motion is reserved and unknown motion follows the design', () => {
  assert.equal(readFlags('').bg, null);
  assert.equal(readFlags('?bg=0').bg, false);
  assert.equal(readFlags('?bg=1').bg, true);
  assert.equal(readFlags('?bg=yes').bg, null);
  assert.equal(readFlags('?motion=lightning').motion, null);
  const flags = readFlags('?scene=schedule&bg=0&motion=rays&day=all&static=1');
  assert.equal(flags.motion, 'rays'); assert.equal(flags.static, true); assert.deepEqual(flags.params, { day: 'all' });
});
test('animateOut skips infinite loops while finishing finite animations and resolving the exit', async () => {
  let finished = 0;
  const infinite = { effect: { getComputedTiming: () => ({ endTime: Infinity }) }, finish() { throw new Error('Infinite animation must keep running'); } };
  const finite = { effect: { getComputedTiming: () => ({ endTime: 800 }) }, finish() { finished++; } };
  const root = { isConnected: true, getAnimations: () => [infinite, finite], querySelectorAll: () => [], animate: () => ({ finished: Promise.resolve() }) };
  await animateOut(root); assert.equal(finished, 1);
});
