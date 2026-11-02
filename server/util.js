import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.HLL_DATA_DIR ? path.resolve(process.env.HLL_DATA_DIR) : path.join(ROOT, 'data');
export const ASSETS = path.join(DATA, 'assets');
export const RAW = path.join(DATA, 'raw');
export const OUTPUT_DEFAULT = process.env.HLL_OUTPUT_DIR ? path.resolve(process.env.HLL_OUTPUT_DIR) : path.join(ROOT, 'output');

/** Short random id with a type prefix, e.g. "t_9f3a1c". */
export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

const GREEK_TO_LATIN = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

/** Normalised key for fuzzy name matching: lower case, no accents, Greek → Latin, only a-z0-9. */
export function nameKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[α-ως]/g, (c) => GREEK_TO_LATIN[c] ?? c)
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein distance (small strings only). */
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Best match of `name` among `items` (keys from `keysOf(item)`), or null.
 * Exact key → contains → small edit distance.
 */
export function bestMatch(name, items, keysOf) {
  const k = nameKey(name);
  if (!k) return null;
  let best = null, bestScore = Infinity;
  for (const it of items) {
    for (const cand of keysOf(it).map(nameKey).filter(Boolean)) {
      let score;
      if (cand === k) score = 0;
      else if (cand.length >= 3 && (k.includes(cand) || cand.includes(k))) score = 1 + Math.abs(cand.length - k.length) / 10;
      else {
        const d = lev(cand, k);
        if (d > Math.max(1, Math.floor(Math.min(cand.length, k.length) / 4))) continue;
        score = 2 + d;
      }
      if (score < bestScore) { bestScore = score; best = it; }
    }
  }
  return best;
}

/** Today / tomorrow as YYYY-MM-DD in a time zone. */
export function isoDay(offsetDays = 0, timeZone = 'Europe/Athens') {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "Πέμπτη 30 Οκτωβρίου" style label for a YYYY-MM-DD date. */
export function dayLabel(iso, locale = 'el-GR') {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dt);
}

export function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|tiff?|bmp|svg|heic|heif)$/i;
