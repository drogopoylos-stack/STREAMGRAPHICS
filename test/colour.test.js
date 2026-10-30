import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rgbToLab,
  labToRgb,
  deltaE,
  labStats,
  targetLook,
  harmonize,
  adjust,
  dominantColors,
  keyOutBackground,
  hex,
} from '../server/lib/colour.js';

/**
 * Deterministic PRNG so the "noisy" fixtures never flake.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('rgbToLab: white is [100, 0, 0]', () => {
  const [L, a, b] = rgbToLab(255, 255, 255);
  assert.ok(Math.abs(L - 100) < 0.5, `L=${L}`);
  assert.ok(Math.abs(a) < 0.5, `a=${a}`);
  assert.ok(Math.abs(b) < 0.5, `b=${b}`);
});

test('rgbToLab: pure red matches CIE reference', () => {
  const [L, a, b] = rgbToLab(255, 0, 0);
  assert.ok(Math.abs(L - 53.24) < 0.5, `L=${L}`);
  assert.ok(Math.abs(a - 80.09) < 0.5, `a=${a}`);
  assert.ok(Math.abs(b - 67.2) < 0.5, `b=${b}`);
});

test('Lab round-trip stays within 1 per channel', () => {
  const colours = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [128, 128, 128],
    [200, 120, 30],
    [17, 200, 190],
    [90, 40, 220],
    [1, 2, 3],
  ];
  for (const [r, g, b] of colours) {
    const [L, a, bb] = rgbToLab(r, g, b);
    const [r2, g2, b2] = labToRgb(L, a, bb);
    assert.ok(Math.abs(r - r2) <= 1, `r ${r} -> ${r2}`);
    assert.ok(Math.abs(g - g2) <= 1, `g ${g} -> ${g2}`);
    assert.ok(Math.abs(b - b2) <= 1, `b ${b} -> ${b2}`);
  }
});

test('deltaE is zero for identical colours and positive otherwise', () => {
  assert.equal(deltaE(rgbToLab(10, 20, 30), rgbToLab(10, 20, 30)), 0);
  assert.ok(deltaE(rgbToLab(0, 0, 0), rgbToLab(255, 255, 255)) > 90);
});

test('labStats: opaque mean and alpha filtering', () => {
  const w = 2;
  const h = 2;
  const rgba = Buffer.from([
    255, 255, 255, 255,
    255, 255, 255, 255,
    0, 0, 0, 10,
    0, 0, 0, 10,
  ]);
  const stats = labStats(rgba, w, h, { alphaMin: 128 });
  assert.equal(stats.count, 2);
  assert.ok(Math.abs(stats.mean[0] - 100) < 0.5);
  assert.ok(Math.abs(stats.std[0]) < 0.5);

  const none = labStats(rgba, w, h, { alphaMin: 200, step: 1 });
  assert.equal(none.count, 2);
  const empty = labStats(rgba, w, h, { alphaMin: 255 + 1 });
  assert.equal(empty.count, 0);
  assert.equal(empty.mean, null);
  assert.equal(empty.std, null);
});

test('labStats: step samples every n-th pixel', () => {
  const rgba = Buffer.alloc(4 * 4 * 4, 255);
  // make pixel 0 black, rest white
  rgba[0] = 0;
  rgba[1] = 0;
  rgba[2] = 0;
  const s1 = labStats(rgba, 4, 4, { step: 1 });
  const s4 = labStats(rgba, 4, 4, { step: 4 });
  assert.equal(s1.count, 16);
  assert.equal(s4.count, 4);
});

test('targetLook: median of means, ignores null entries, null when empty', () => {
  const look = targetLook([
    { mean: [10, 0, 0], std: [1, 1, 1] },
    { mean: [20, 2, 4], std: [3, 3, 3] },
    { mean: [30, 4, 8], std: [5, 5, 5] },
    { mean: null, std: null },
  ]);
  assert.deepEqual(look.mean, [20, 2, 4]);
  assert.deepEqual(look.std, [3, 3, 3]);
  assert.equal(targetLook([]), null);
  assert.equal(targetLook([{ mean: null, std: null }]), null);
});

test('harmonize (strength 1) moves mean onto target', () => {
  const w = 4;
  const h = 4;
  const src = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < w * h; i++) {
    src[i * 4] = 100;
    src[i * 4 + 1] = 120;
    src[i * 4 + 2] = 140;
  }
  const source = labStats(src, w, h);
  const target = { mean: [60, 10, -10], std: [10, 10, 10] };
  const out = harmonize(src, w, h, source, target, { strength: 1, protectSkin: false });
  const stats = labStats(out, w, h);
  for (let c = 0; c < 3; c++) {
    assert.ok(
      Math.abs(stats.mean[c] - target.mean[c]) < 1,
      `channel ${c}: ${stats.mean[c]} vs ${target.mean[c]}`,
    );
  }
  assert.equal(out.length, src.length);
  assert.notEqual(out, src);
});

test('harmonize keeps alpha and leaves low-alpha pixels untouched', () => {
  const w = 2;
  const h = 1;
  const src = Buffer.from([100, 120, 140, 255, 50, 60, 70, 5]);
  const source = labStats(src, w, h, { alphaMin: 0 });
  const out = harmonize(
    src,
    w,
    h,
    source,
    { mean: [60, 0, 0], std: [10, 10, 10] },
    { strength: 1, alphaMin: 8 },
  );
  assert.equal(out[3], 255);
  assert.equal(out[7], 5);
  assert.deepEqual([...out.slice(4, 7)], [50, 60, 70]);
});

test('adjust: brightness raises L, alpha unchanged', () => {
  const w = 1;
  const h = 1;
  const src = Buffer.from([100, 100, 100, 77]);
  const before = rgbToLab(100, 100, 100)[0];
  const out = adjust(src, w, h, { brightness: 20 });
  const after = rgbToLab(out[0], out[1], out[2])[0];
  assert.ok(after > before);
  assert.equal(out[3], 77);
});

test('keyOutBackground: flat white with a red square', () => {
  const w = 20;
  const h = 20;
  const src = Buffer.alloc(w * h * 4, 255);
  for (let y = 6; y < 14; y++) {
    for (let x = 6; x < 14; x++) {
      const p = (y * w + x) * 4;
      src[p] = 255;
      src[p + 1] = 0;
      src[p + 2] = 0;
    }
  }
  const { rgba, removed, bg } = keyOutBackground(src, w, h);
  assert.equal(removed, true);
  assert.equal(bg, '#ffffff');
  assert.equal(rgba[3], 0, 'top-left corner alpha');
  assert.equal(rgba[(19 * w + 19) * 4 + 3], 0, 'bottom-right corner alpha');
  const centre = (10 * w + 10) * 4;
  assert.equal(rgba[centre + 3], 255, 'red centre alpha');
  assert.equal(rgba[centre], 255);
  assert.equal(rgba[centre + 1], 0);
  assert.equal(rgba[centre + 2], 0);
});

test('keyOutBackground: photo-like noisy border is rejected', () => {
  const w = 20;
  const h = 20;
  const src = Buffer.alloc(w * h * 4, 255);
  const rnd = mulberry32(7);
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) {
    const p = i * 4;
    src[p] = Math.floor(rnd() * 256);
    src[p + 1] = Math.floor(rnd() * 256);
    src[p + 2] = Math.floor(rnd() * 256);
  }
  const { removed, bg, rgba } = keyOutBackground(src, w, h);
  assert.equal(removed, false);
  assert.equal(bg, null);
  assert.deepEqual([...rgba.slice(0, 4)], [...src.slice(0, 4)]);
});

test('dominantColors: half red / half blue returns both', () => {
  const w = 40;
  const h = 20;
  const src = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (i % 2 === 0) {
      src[p] = 255;
      src[p + 1] = 0;
      src[p + 2] = 0;
    } else {
      src[p] = 0;
      src[p + 1] = 0;
      src[p + 2] = 255;
    }
  }
  const colours = dominantColors(src, w, h, 3);
  assert.ok(colours.includes('#ff0000'), colours.join(','));
  assert.ok(colours.includes('#0000ff'), colours.join(','));
});

test('hex formats and clamps channels', () => {
  assert.equal(hex(0, 0, 0), '#000000');
  assert.equal(hex(255, 255, 255), '#ffffff');
  assert.equal(hex(255, 0, 0), '#ff0000');
  assert.equal(hex(-5, 300, 15), '#00ff0f');
});
