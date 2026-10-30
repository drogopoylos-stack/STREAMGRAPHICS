// Sponsor wall: main-tier sponsors as large framed tiles, partners in a centred grid below.
// Tile sizes adapt to how many sponsors there are; a logo that fails to load falls back to the name.
import { h, plate, laurel } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

const AREA_TOP = 292;
const AREA_BOTTOM = 972;
const AREA_W = 1712;

function tile(s, cls, d, size) {
  const name = () => h('div', { class: 'sp-name display' }, s.name || '');
  const box = h('div', { class: `sp-tile glass ${cls}`, style: { width: `${size.w}px`, height: `${size.h}px`, '--th': `${size.h}px` }, in: 'scale', d, dur: 650 });
  if (s.logo) {
    const img = h('img', { src: s.logo, alt: s.name || '', draggable: 'false' });
    img.addEventListener('error', () => { img.replaceWith(name()); box.classList.add('is-text'); }, { once: true });
    box.append(img);
  } else {
    box.classList.add('is-text');
    box.append(name());
  }
  return box;
}

/** Columns / tile size for n tiles in a w×hMax box (logo tiles are ~16:9). */
function gridFor(n, w, hMax, { gap, maxH, ratio = 1.72 }) {
  let best = null;
  for (let cols = 1; cols <= Math.min(n, 6); cols++) {
    const rows = Math.ceil(n / cols);
    const th = Math.min(maxH, (hMax - gap * (rows - 1)) / rows, (w - gap * (cols - 1)) / cols / ratio);
    if (!best || th > best.h + 0.5) best = { cols, rows, h: Math.floor(th), w: Math.floor(th * ratio) };
  }
  return best;
}

function sectionLabel(text, d) {
  return h('div', { class: 'sp-label', in: 'fade', d },
    h('i', { class: 'sp-label-line' }), h('span', {}, text), h('i', { class: 'sp-label-line' }));
}

export default {
  render(data, ctx) {
    const list = (data.sponsors || []).filter((s) => s && (s.logo || s.name));
    const main = list.filter((s) => s.tier === 'main').slice(0, 3);
    const rest = list.filter((s) => s.tier !== 'main').slice(0, 18);
    const avail = AREA_BOTTOM - AREA_TOP;
    const kids = [];

    if (!list.length) {
      kids.push(h('div', { class: 'sp-empty glass ticks', in: 'up', d: 520 },
        h('div', { class: 'sp-empty-s' }, 'Partnership announcements'),
        h('div', { class: 'sp-empty-row' }, laurel('l', 'sp-laurel'), h('div', { class: 'sp-empty-t display' }, 'Coming Soon'), laurel('r', 'sp-laurel')),
        h('div', { class: 'sp-empty-g', lang: 'el' }, 'Γίνε μέρος του θρύλου')));
    } else {
      const LABEL = 52;
      const SPACER = 34;
      // Height split: main row gets the lion's share; partners share what is left.
      const mainH = main.length ? (rest.length ? Math.min(250, avail * 0.42) : Math.min(380, avail - LABEL)) : 0;
      const restH = rest.length ? avail - (main.length ? LABEL + mainH + SPACER : 0) - LABEL : 0;
      const step = Math.min(70, 520 / Math.max(1, list.length));
      let i = 0;

      const wrap = h('div', { class: 'sp-wall', style: { top: `${AREA_TOP}px`, height: `${avail}px` } });
      if (main.length) {
        const g = gridFor(main.length, AREA_W, mainH, { gap: 36, maxH: mainH, ratio: 1.9 });
        wrap.append(
          sectionLabel(main.length > 1 ? 'Main Sponsors' : 'Main Sponsor', 460),
          h('div', { class: 'sp-row sp-main-row', style: { gap: '36px', height: `${mainH}px` } },
            main.map((s) => tile(s, 'is-main ticks', 560 + step * i++, g))));
      }
      if (rest.length) {
        const g = gridFor(rest.length, AREA_W, restH, { gap: 22, maxH: main.length ? 150 : 230 });
        if (main.length) wrap.append(h('div', { style: { height: `${SPACER}px`, flex: 'none' } }));
        wrap.append(
          sectionLabel('Official Partners', 520),
          h('div', { class: 'sp-row sp-grid', style: { gap: '22px', width: `${g.cols * g.w + (g.cols - 1) * 22}px` } },
            rest.map((s) => tile(s, 'is-partner', 600 + step * i++, g))));
      }
      kids.push(wrap);
    }

    return h('div', { class: list.length ? '' : 'is-empty' },
      plate(data.theme, 'main', ctx),
      sceneHeader({
        league: data.league,
        kicker: leagueLine(data.league),
        title: 'Our Partners',
        sub: 'Με την υποστήριξη των χορηγών μας',
        subLang: 'el',
      }),
      h('div', { class: 'sp-rule rule', in: 'wipec', d: 420, dur: 800 }),
      ...kids);
  },
};
