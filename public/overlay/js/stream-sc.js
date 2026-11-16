// SUPER CUP 2027 look for the live stream scenes (settings.streamStyle = 'supercup', 1920×1080).
// The scenes keep their DOM (design slots, layout elements, data-ref, .tlogo/.pphoto/.league-logo stay as they
// are); this module only adds the root class, the gold corner ornaments and the dark-logo halo.
// Styles: css/stream-sc.css (everything scoped under .scene.stream-sc, new nodes prefixed ss-).
import { h } from './ui.js';

/** SUPER CUP palette for the theme variables (the Graphics designer's accent colours still win). */
export const STREAM_SC_THEME = { primary: '#06123a', accent: '#2d5bff', accent2: '#fdc204' };

export const isStreamSc = (data) => data?.streamStyle === 'supercup';

/** A stream scene in this style uses player photos only when one of the shown players has one. */
export const hasPhotos = (players = []) => players.some((p) => p?.photo);

// Gold corner wedges (top-left / bottom-right, the corners without a light streak in the plate) + a hairline pair
// in the bottom-right corner (the top-left one would cross the header logo).
function ornaments() {
  const hair = (x, y, len, op) => h('div', { class: 'ss-hair', style: { left: `${x}px`, top: `${y}px`, width: `${len}px`, opacity: op } });
  return h('div', { class: 'ss-orn', 'aria-hidden': 'true' },
    h('div', { class: 'ss-wedge tl' }), h('div', { class: 'ss-wedge br' }),
    hair(1640, 1120, 330, 0.8), hair(1730, 1100, 200, 0.45));
}

const LIGHTNESS = new Map();

const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/** Mean perceived lightness (CIE L*, 0..100) of the opaque pixels of a decoded image; null when it cannot be read. */
function lightnessOf(img) {
  const key = img.currentSrc || img.src;
  if (LIGHTNESS.has(key)) return LIGHTNESS.get(key);
  let value = null;
  try {
    const k = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = hh;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, hh);
    const px = g.getImageData(0, 0, w, hh).data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const y = 0.2126 * linear(px[i]) + 0.7152 * linear(px[i + 1]) + 0.0722 * linear(px[i + 2]);
      sum += y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; n++;
    }
    value = n ? sum / n : null;
  } catch { value = null; }
  LIGHTNESS.set(key, value);
  return value;
}

/** Dark team logos (navy, purple, black marks) get a light halo so they read on the navy panels. */
function markDarkLogos(root, waits) {
  for (const img of root.querySelectorAll('.tlogo > img')) {
    const wrap = img.parentElement;
    waits.push(new Promise((resolve) => {
      // L* < 44: NGG, NXM-like purple / black marks; bright and saturated logos stay as they are.
      const done = () => { const l = lightnessOf(img); if (l != null && l < 44) wrap.classList.add('is-dark'); resolve(); };
      if (img.complete && img.naturalWidth) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    }));
  }
}

/** Turn a rendered stream scene root into its SUPER CUP version. */
export function decorateStreamSc(el, ctx) {
  el.classList.add('stream-sc');
  const plate = [...el.children].find((child) => child.classList.contains('plate'));
  if (plate) plate.after(ornaments());
  markDarkLogos(el, ctx.waits);
  return el;
}
