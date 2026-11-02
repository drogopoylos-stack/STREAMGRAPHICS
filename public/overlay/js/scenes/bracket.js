// Bracket: the league's bracket embed (iframe / URL / raw HTML) inside a framed panel.
// With no embed configured it draws a ghost 8-team bracket with a "coming soon" card in the final slot.
// Static renders wait for the embed's load event (max 4 s) before marking ready.
import { h, plate, laurel } from '../ui.js';
import { sceneHeader, sponsorsFor, leagueLine } from './common.js';
import nativeBracket from './native-bracket.js';

const EMBED_WAIT = 4000;

/** Frame document for raw-HTML embeds: transparent page, broadcast fonts, no scrollbars. */
function srcdoc(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="/fonts/fira-sans-condensed/400.css"><link rel="stylesheet" href="/fonts/fira-sans-condensed/600.css"><style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;color:#fff;font-family:'Fira Sans Condensed',sans-serif}
iframe{border:0;max-width:100%}
</style></head><body>${html}</body></html>`;
}

function embedFrame(embed, ctx) {
  const frame = h('iframe', {
    class: 'brk-iframe',
    title: 'Bracket',
    loading: 'eager',
    scrolling: 'no',
    allowtransparency: 'true',
    referrerpolicy: 'no-referrer-when-downgrade',
  });
  if (embed.type === 'html') frame.srcdoc = srcdoc(embed.html);
  else frame.src = embed.src;
  ctx.waits.push(new Promise((resolve) => {
    const done = () => resolve();
    frame.addEventListener('load', done, { once: true });
    frame.addEventListener('error', done, { once: true });
    setTimeout(done, EMBED_WAIT);
  }));
  return frame;
}

// ---------- ghost bracket (placeholder) ----------

const FW = 1712;   // frame inner width
const FH = 640;    // ghost area height
const BW = 236;    // match box
const BH = 100;
const QX = 44;     // quarter-final column (left)
const SX = QX + BW + 70;
const Y_QF = [150, 490];
const Y_SF = 320;

function slotBox(x, y, d, seedA, seedB) {
  return h('div', { class: 'brk-box', style: { left: `${x}px`, top: `${y - BH / 2}px` }, in: 'fade', d, dur: 500 },
    h('div', { class: 'brk-slot' }, h('b', {}, seedA), h('span', {}, 'TBD')),
    h('div', { class: 'brk-slot' }, h('b', {}, seedB), h('span', {}, 'TBD')));
}

function ghostLines() {
  const xr = FW - QX - BW; // right QF column x
  const sxr = FW - SX - BW;
  const ex = QX + BW;      // left QF right edge
  const mx = ex + 35;      // elbow
  const sx2 = SX + BW;     // left SF right edge
  const cardL = FW / 2 - 236;
  const cardR = FW / 2 + 236;
  const d = [
    `M${ex} ${Y_QF[0]}H${mx}V${Y_QF[1]}H${ex}`, `M${mx} ${Y_SF}H${SX}`,
    `M${xr} ${Y_QF[0]}H${xr - 35}V${Y_QF[1]}H${xr}`, `M${xr - 35} ${Y_SF}H${sxr + BW}`,
    `M${sx2} ${Y_SF}H${cardL}`, `M${sxr} ${Y_SF}H${cardR}`,
  ].join('');
  return `<svg class="brk-lines" viewBox="0 0 ${FW} ${FH}" width="${FW}" height="${FH}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function ghost(data) {
  const xr = FW - QX - BW;
  const sxr = FW - SX - BW;
  const wrap = h('div', { class: 'brk-ghost' });
  wrap.insertAdjacentHTML('afterbegin', ghostLines());
  wrap.append(
    h('div', { class: 'brk-col-l', style: { left: `${QX}px` } }, 'Quarterfinals'),
    h('div', { class: 'brk-col-l', style: { left: `${SX}px` } }, 'Semifinals'),
    h('div', { class: 'brk-col-l', style: { left: `${sxr}px` } }, 'Semifinals'),
    h('div', { class: 'brk-col-l', style: { left: `${xr}px` } }, 'Quarterfinals'),
    slotBox(QX, Y_QF[0], 640, 1, 8), slotBox(QX, Y_QF[1], 700, 4, 5),
    slotBox(xr, Y_QF[0], 670, 2, 7), slotBox(xr, Y_QF[1], 730, 3, 6),
    slotBox(SX, Y_SF, 780, '', ''), slotBox(sxr, Y_SF, 810, '', ''),
    h('div', { class: 'brk-final glass ticks', in: 'up', d: 560, dur: 750 },
      h('div', { class: 'brk-final-k' }, 'Grand Final'),
      h('div', { class: 'brk-final-row' },
        laurel('l', 'brk-laurel'),
        h('div', { class: 'brk-final-t display' }, 'Coming Soon'),
        laurel('r', 'brk-laurel')),
      h('div', { class: 'brk-final-s', lang: 'el' }, 'Ανακοινώνεται σύντομα'),
      data.league?.season ? h('div', { class: 'brk-final-season' }, data.league.season) : null));
  return wrap;
}

export default {
  render(data, ctx) {
    if (data.tree?.rounds?.length) return nativeBracket.render(data, ctx);
    const embed = data.embed || { type: 'none' };
    const hasEmbed = (embed.type === 'iframe' || embed.type === 'url') ? !!embed.src : embed.type === 'html' && !!embed.html;
    const spons = sponsorsFor(data, { label: 'Partners', max: 4, cls: 'brk-spons' });

    return h('div', { class: hasEmbed ? 'has-embed' : 'no-embed' },
      plate(data.theme, 'main', ctx),
      sceneHeader({
        league: data.league,
        kicker: leagueLine(data.league),
        title: 'Tournament Bracket',
        sub: 'Ο δρόμος προς τον τίτλο',
        subLang: 'el',
        right: spons,
      }),
      h('div', { class: 'brk-rule rule', in: 'wipec', d: 420, dur: 800 }),
      hasEmbed
        ? h('div', { class: 'brk-frame glass ticks', in: 'up', d: 520, dur: 750 }, embedFrame(embed, ctx))
        : ghost(data));
  },
};

