/**
 * Colour maths on raw RGBA pixel buffers (sRGB, D65 reference white).
 * All functions are pure; buffers are never mutated.
 * @module server/lib/colour
 */

const Xn = 0.95047; // D65
const Yn = 1.0;
const Zn = 1.08883;
const EPS = 216 / 24389; // (6/29)^3
const KAPPA = 24389 / 27; // (29/3)^3

/** 256-entry sRGB -> linear-light lookup table. */
const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Clamp a number to an integer byte 0..255.
 * @param {number} v
 * @returns {number}
 */
function clampi(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Linear-light channel -> gamma-encoded sRGB 0..1.
 * @param {number} c
 * @returns {number}
 */
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * CIE Lab forward nonlinearity.
 * @param {number} t
 * @returns {number}
 */
function fLab(t) {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/**
 * CIE Lab inverse nonlinearity.
 * @param {number} t
 * @returns {number}
 */
function finvLab(t) {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

/**
 * Write Lab of an 8-bit sRGB triple into out[0..2].
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number[]} out
 * @returns {void}
 */
function labInto(r, g, b, out) {
  const R = SRGB_TO_LINEAR[clampi(r)];
  const G = SRGB_TO_LINEAR[clampi(g)];
  const B = SRGB_TO_LINEAR[clampi(b)];
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const fx = fLab(X / Xn);
  const fy = fLab(Y / Yn);
  const fz = fLab(Z / Zn);
  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
}

/**
 * Write 8-bit sRGB of a Lab triple into out[0..2].
 * @param {number} L
 * @param {number} a
 * @param {number} b
 * @param {number[]} out
 * @returns {void}
 */
function rgbInto(L, a, b, out) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const X = Xn * finvLab(fx);
  const Y = Yn * finvLab(fy);
  const Z = Zn * finvLab(fz);
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  out[0] = clampi(Math.round(linearToSrgb(r) * 255));
  out[1] = clampi(Math.round(linearToSrgb(g) * 255));
  out[2] = clampi(Math.round(linearToSrgb(bl) * 255));
}

/**
 * sRGB 0..255 -> CIE Lab (D65).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export function rgbToLab(r, g, b) {
  const out = [0, 0, 0];
  labInto(r, g, b, out);
  return out;
}

/**
 * CIE Lab (D65) -> sRGB 0..255, rounded and clamped.
 * @param {number} L
 * @param {number} a
 * @param {number} b
 * @returns {[number, number, number]}
 */
export function labToRgb(L, a, b) {
  const out = [0, 0, 0];
  rgbInto(L, a, b, out);
  return out;
}

/**
 * CIE76 colour difference between two Lab triples.
 * @param {ArrayLike<number>} lab1
 * @param {ArrayLike<number>} lab2
 * @returns {number}
 */
export function deltaE(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Median of a numeric array (null when empty).
 * @param {ArrayLike<number>} values
 * @returns {number|null}
 */
function median(values) {
  const len = values.length;
  if (len === 0) return null;
  const sorted = Float64Array.from(values);
  sorted.sort();
  const m = len >> 1;
  return len % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Compute mean and population std of Lab over opaque-enough pixels.
 * @param {Uint8Array|Buffer} rgba
 * @param {number} w
 * @param {number} h
 * @param {{alphaMin?:number, step?:number}} [opts]
 * @returns {{mean:[number,number,number]|null, std:[number,number,number]|null, count:number}}
 */
export function labStats(rgba, w, h, opts = {}) {
  const alphaMin = opts.alphaMin ?? 128;
  const step = Math.max(1, Math.floor(opts.step ?? 1));
  const n = w * h;
  let sL = 0;
  let sa = 0;
  let sb = 0;
  let qL = 0;
  let qa = 0;
  let qb = 0;
  let count = 0;
  const lab = [0, 0, 0];
  for (let i = 0; i < n; i += step) {
    const p = i * 4;
    if (rgba[p + 3] < alphaMin) continue;
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], lab);
    const L = lab[0];
    const a = lab[1];
    const b = lab[2];
    sL += L;
    sa += a;
    sb += b;
    qL += L * L;
    qa += a * a;
    qb += b * b;
    count++;
  }
  if (count === 0) return { mean: null, std: null, count: 0 };
  const mL = sL / count;
  const ma = sa / count;
  const mb = sb / count;
  return {
    mean: [mL, ma, mb],
    std: [
      Math.sqrt(Math.max(0, qL / count - mL * mL)),
      Math.sqrt(Math.max(0, qa / count - ma * ma)),
      Math.sqrt(Math.max(0, qb / count - mb * mb)),
    ],
    count,
  };
}

/**
 * Robust target look from many photo stats: per-channel median of means/stds.
 * @param {Array<{mean:number[]|null, std:number[]|null}>} statsList
 * @returns {{mean:number[], std:number[]}|null}
 */
export function targetLook(statsList) {
  const means = [[], [], []];
  const stds = [[], [], []];
  for (const s of statsList ?? []) {
    if (!s || !s.mean) continue;
    for (let c = 0; c < 3; c++) {
      means[c].push(s.mean[c]);
      if (s.std) stds[c].push(s.std[c]);
    }
  }
  if (means[0].length === 0) return null;
  return {
    mean: [median(means[0]), median(means[1]), median(means[2])],
    std: [median(stds[0]), median(stds[1]), median(stds[2])],
  };
}

/**
 * Whether an original Lab pixel looks like skin (hue 20..75 deg band).
 * @param {ArrayLike<number>} lab
 * @returns {boolean}
 */
function isSkin(lab) {
  const L = lab[0];
  const a = lab[1];
  const b = lab[2];
  if (L < 25 || L > 90 || a < 5 || a > 35 || b < 5 || b > 40) return false;
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return hue >= 20 && hue <= 75;
}

/**
 * Reinhard Lab colour transfer toward a target look, with optional skin guard.
 * @param {Uint8Array|Buffer} rgba
 * @param {number} w
 * @param {number} h
 * @param {{mean:number[], std:number[]}} source
 * @param {{mean:number[], std:number[]}} target
 * @param {{strength?:number, protectSkin?:boolean, alphaMin?:number}} [opts]
 * @returns {Buffer}
 */
export function harmonize(rgba, w, h, source, target, opts = {}) {
  const strength = opts.strength ?? 0.7;
  const protectSkin = opts.protectSkin ?? true;
  const alphaMin = opts.alphaMin ?? 8;
  const out = Buffer.alloc(rgba.length);
  const ratio = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    const ss = source.std[c];
    const ts = target.std[c];
    if (!ss || !ts) continue;
    ratio[c] = Math.min(1.6, Math.max(0.6, ts / ss));
  }
  const n = w * h;
  const lab = [0, 0, 0];
  const res = [0, 0, 0];
  const rgb = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[p + 3] = rgba[p + 3];
    if (rgba[p + 3] < alphaMin) {
      out[p] = rgba[p];
      out[p + 1] = rgba[p + 1];
      out[p + 2] = rgba[p + 2];
      continue;
    }
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], lab);
    const skin = protectSkin && isSkin(lab);
    for (let c = 0; c < 3; c++) {
      const x = lab[c];
      const shifted = (x - source.mean[c]) * ratio[c] + target.mean[c];
      const blend = strength * (skin && c > 0 ? 0.4 : 1);
      res[c] = x + (shifted - x) * blend;
    }
    rgbInto(res[0], res[1], res[2], rgb);
    out[p] = rgb[0];
    out[p + 1] = rgb[1];
    out[p + 2] = rgb[2];
  }
  return out;
}

/**
 * Contrast around L=50, saturation on a/b, brightness offset on L.
 * @param {Uint8Array|Buffer} rgba
 * @param {number} w
 * @param {number} h
 * @param {{contrast?:number, saturation?:number, brightness?:number}} [opts]
 * @returns {Buffer}
 */
export function adjust(rgba, w, h, opts = {}) {
  const contrast = opts.contrast ?? 1;
  const saturation = opts.saturation ?? 1;
  const brightness = opts.brightness ?? 0;
  const out = Buffer.alloc(rgba.length);
  const n = w * h;
  const lab = [0, 0, 0];
  const rgb = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[p + 3] = rgba[p + 3];
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], lab);
    const L = 50 + (lab[0] - 50) * contrast + brightness;
    rgbInto(L, lab[1] * saturation, lab[2] * saturation, rgb);
    out[p] = rgb[0];
    out[p + 1] = rgb[1];
    out[p + 2] = rgb[2];
  }
  return out;
}

/**
 * Deterministic 32-bit PRNG (mulberry32).
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

/**
 * Squared Lab distance between flat triples at offsets i and j.
 * @param {ArrayLike<number>} a
 * @param {number} i
 * @param {ArrayLike<number>} b
 * @param {number} j
 * @returns {number}
 */
function distSq(a, i, b, j) {
  const d0 = a[i] - b[j];
  const d1 = a[i + 1] - b[j + 1];
  const d2 = a[i + 2] - b[j + 2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

/**
 * k-means dominant colours (deterministic k-means++, 12 iterations).
 * @param {Uint8Array|Buffer} rgba
 * @param {number} w
 * @param {number} h
 * @param {number} [k]
 * @returns {string[]}
 */
export function dominantColors(rgba, w, h, k = 3) {
  const total = w * h;
  if (total === 0 || k <= 0) return [];
  const stride = Math.max(1, Math.floor(total / 20000));
  const lab = [];
  const tmp = [0, 0, 0];
  for (let i = 0; i < total; i += stride) {
    const p = i * 4;
    if (rgba[p + 3] < 200) continue;
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], tmp);
    lab.push(tmp[0], tmp[1], tmp[2]);
  }
  const np = lab.length / 3;
  if (np === 0) return [];
  const kk = Math.min(k, np);
  const centers = new Float64Array(kk * 3);
  const rnd = mulberry32(42);
  const dist2 = new Float64Array(np).fill(Infinity);

  const first = Math.floor(rnd() * np);
  for (let c = 0; c < 3; c++) centers[c] = lab[first * 3 + c];
  for (let c = 1; c < kk; c++) {
    const off = (c - 1) * 3;
    let sum = 0;
    for (let i = 0; i < np; i++) {
      const d = distSq(lab, i * 3, centers, off);
      if (d < dist2[i]) dist2[i] = d;
      sum += dist2[i];
    }
    let pick;
    if (sum <= 0) {
      pick = Math.floor(rnd() * np);
    } else {
      let target = rnd() * sum;
      pick = np - 1;
      for (let i = 0; i < np; i++) {
        target -= dist2[i];
        if (target <= 0) {
          pick = i;
          break;
        }
      }
    }
    for (let ch = 0; ch < 3; ch++) centers[c * 3 + ch] = lab[pick * 3 + ch];
  }

  const sums = new Float64Array(kk * 3);
  const counts = new Int32Array(kk);
  for (let it = 0; it < 12; it++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < np; i++) {
      const off = i * 3;
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < kk; c++) {
        const d = distSq(lab, off, centers, c * 3);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      counts[best]++;
      sums[best * 3] += lab[off];
      sums[best * 3 + 1] += lab[off + 1];
      sums[best * 3 + 2] += lab[off + 2];
    }
    for (let c = 0; c < kk; c++) {
      if (counts[c] === 0) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
  }

  counts.fill(0);
  for (let i = 0; i < np; i++) {
    const off = i * 3;
    let best = 0;
    let bd = Infinity;
    for (let c = 0; c < kk; c++) {
      const d = distSq(lab, off, centers, c * 3);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    counts[best]++;
  }

  const result = [];
  const rgb = [0, 0, 0];
  for (let c = 0; c < kk; c++) {
    if (counts[c] === 0) continue;
    const L = centers[c * 3];
    const A = centers[c * 3 + 1];
    const B = centers[c * 3 + 2];
    const chroma = Math.sqrt(A * A + B * B);
    const weight = counts[c] * (chroma < 8 && (L < 12 || L > 92) ? 0.25 : 1);
    rgbInto(L, A, B, rgb);
    result.push({ hex: hex(rgb[0], rgb[1], rgb[2]), weight });
  }
  result.sort((x, y) => y.weight - x.weight);
  return result.map((r) => r.hex);
}

/**
 * Unique pixel indices of the outer 1-pixel frame.
 * @param {number} w
 * @param {number} h
 * @returns {number[]}
 */
function borderIndices(w, h) {
  const idx = [];
  if (w <= 0 || h <= 0) return idx;
  if (h === 1) {
    for (let x = 0; x < w; x++) idx.push(x);
    return idx;
  }
  if (w === 1) {
    for (let y = 0; y < h; y++) idx.push(y * w);
    return idx;
  }
  for (let x = 0; x < w; x++) idx.push(x);
  for (let x = 0; x < w; x++) idx.push((h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w);
  for (let y = 1; y < h - 1; y++) idx.push(y * w + w - 1);
  return idx;
}

/**
 * Median of one Lab channel across a flat triple array.
 * @param {Float64Array} flat
 * @param {number} offset
 * @returns {number}
 */
function medianChannel(flat, offset) {
  const len = flat.length / 3;
  const vals = new Float64Array(len);
  for (let i = 0; i < len; i++) vals[i] = flat[i * 3 + offset];
  vals.sort();
  const m = len >> 1;
  return len % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
}

/**
 * Remove a flat logo background via border-median colour and soft flood fill.
 * @param {Uint8Array|Buffer} rgba
 * @param {number} w
 * @param {number} h
 * @param {{tolerance?:number, feather?:number}} [opts]
 * @returns {{rgba:Buffer, removed:boolean, bg:string|null}}
 */
export function keyOutBackground(rgba, w, h, opts = {}) {
  const tolerance = opts.tolerance ?? 22;
  const feather = opts.feather ?? 6;
  const out = Buffer.from(rgba);
  const n = w * h;
  const border = borderIndices(w, h);
  if (n === 0 || border.length === 0) return { rgba: out, removed: false, bg: null };

  let lowAlpha = 0;
  for (const i of border) if (rgba[i * 4 + 3] < 250) lowAlpha++;
  if (lowAlpha / border.length >= 0.02) return { rgba: out, removed: false, bg: null };

  const borderLab = new Float64Array(border.length * 3);
  const tmp = [0, 0, 0];
  for (let j = 0; j < border.length; j++) {
    const p = border[j] * 4;
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], tmp);
    borderLab[j * 3] = tmp[0];
    borderLab[j * 3 + 1] = tmp[1];
    borderLab[j * 3 + 2] = tmp[2];
  }
  const bg = [
    medianChannel(borderLab, 0),
    medianChannel(borderLab, 1),
    medianChannel(borderLab, 2),
  ];

  let near = 0;
  for (let j = 0; j < border.length; j++) {
    const dL = borderLab[j * 3] - bg[0];
    const da = borderLab[j * 3 + 1] - bg[1];
    const db = borderLab[j * 3 + 2] - bg[2];
    if (Math.sqrt(dL * dL + da * da + db * db) <= tolerance) near++;
  }
  if (near / border.length < 0.8) return { rgba: out, removed: false, bg: null };

  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    labInto(rgba[p], rgba[p + 1], rgba[p + 2], tmp);
    const dL = tmp[0] - bg[0];
    const da = tmp[1] - bg[1];
    const db = tmp[2] - bg[2];
    dist[i] = Math.sqrt(dL * dL + da * da + db * db);
  }

  const limit = tolerance + feather;
  const queue = new Int32Array(n);
  const inRegion = new Uint8Array(n);
  let qh = 0;
  let qt = 0;
  for (const i of border) {
    if (dist[i] <= limit) {
      inRegion[i] = 1;
      queue[qt++] = i;
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    if (x > 0) {
      const j = i - 1;
      if (!inRegion[j] && dist[j] <= limit) {
        inRegion[j] = 1;
        queue[qt++] = j;
      }
    }
    if (x < w - 1) {
      const j = i + 1;
      if (!inRegion[j] && dist[j] <= limit) {
        inRegion[j] = 1;
        queue[qt++] = j;
      }
    }
    if (i >= w) {
      const j = i - w;
      if (!inRegion[j] && dist[j] <= limit) {
        inRegion[j] = 1;
        queue[qt++] = j;
      }
    }
    if (i < n - w) {
      const j = i + w;
      if (!inRegion[j] && dist[j] <= limit) {
        inRegion[j] = 1;
        queue[qt++] = j;
      }
    }
  }

  const bgRgb = [0, 0, 0];
  rgbInto(bg[0], bg[1], bg[2], bgRgb);
  for (let i = 0; i < n; i++) {
    if (!inRegion[i]) continue;
    const p = i * 4;
    const d = dist[i];
    const alpha =
      d <= tolerance
        ? 0
        : feather > 0
          ? Math.max(0, Math.min(255, Math.round((255 * (d - tolerance)) / feather)))
          : 255;
    out[p + 3] = alpha;
    if (alpha > 0) {
      const af = alpha / 255;
      if (af > 0.05) {
        out[p] = clampi(Math.round((rgba[p] - bgRgb[0] * (1 - af)) / af));
        out[p + 1] = clampi(Math.round((rgba[p + 1] - bgRgb[1] * (1 - af)) / af));
        out[p + 2] = clampi(Math.round((rgba[p + 2] - bgRgb[2] * (1 - af)) / af));
      }
    }
  }
  return { rgba: out, removed: true, bg: hex(bgRgb[0], bgRgb[1], bgRgb[2]) };
}

/**
 * Format an 8-bit RGB triple as a lowercase '#rrggbb' string.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function hex(r, g, b) {
  return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

/**
 * Clamp/round one channel to two hex digits.
 * @param {number} v
 * @returns {string}
 */
function byteHex(v) {
  return clampi(Math.round(v)).toString(16).padStart(2, '0');
}
