// Social · Bracket progress. SUPER CUP style "Road to Top 4" (spec 4.8 / 5.6): one lane per place =
// first-round match → second-round match → slot. Classic style keeps a simple fallback.
import { h, fit, teamLogo } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxFormat, sxRoot, sxHeader, sxMain, sxFooter, sxLogo, sxDate, sxTag, hasResult, winnerSide, matchRef, teamRef } from './social-common.js';

function side(team) {
  return h('span', { class: 'so-bracket-side', 'data-ref': team?.id ? `team:${team.id}` : null }, teamLogo(team, 'so-bracket-logo'), team?.tag || 'TBD');
}

const SIZES = {
  post: { c1: 318, c2: 318, c3: 196, gap: 60, hd: 30, row: 54, logo: 38, lane: 24, slotLogo: 66 },
  story: { c1: 318, c2: 318, c3: 196, gap: 60, hd: 32, row: 62, logo: 42, lane: 34, slotLogo: 76 },
};

function card(item, Z, ctx) {
  if (!item) return null;
  const d = sxDate(item.date);
  const done = hasResult(item);
  const win = winnerSide(item);
  const line = (team, key, score) => {
    const placeholder = !team || team.placeholder;
    return h('div', { class: `sx-cl${done ? (win === key ? ' is-w' : ' is-l') : ''}`, 'data-ref': teamRef(team) },
      sxLogo(team, Z.logo, ctx),
      h('span', { class: `sx-card-tag fit${placeholder ? ' is-ph' : ''}` }, placeholder ? String(team?.name || 'TBD').toUpperCase() : sxTag(team)),
      h('span', { class: 'sx-card-score' }, done ? String(score) : ''));
  };
  return h('div', { class: 'sx-card', 'data-ref': matchRef(item) },
    h('div', { class: 'sx-card-hd' }, h('span', { class: 'sx-card-date' }, d ? `${d.dow} ${d.dm}` : 'TBD'), done ? h('span', { class: 'sx-card-final' }, 'FINAL') : h('span', { class: 'sx-card-time' }, item.time || '')),
    line(item.teamA, 'a', item.scoreA), line(item.teamB, 'b', item.scoreB));
}

function slot(lane, Z, ctx) {
  const team = lane.slot?.team;
  if (team) return h('div', { class: 'sx-slot is-done', 'data-ref': teamRef(team) }, sxLogo(team, Z.slotLogo, ctx, 'has-glow'), h('span', { class: 'sx-slot-tag fit' }, sxTag(team)));
  return h('div', { class: 'sx-slot is-open' }, h('span', { class: 'sx-slot-q' }, '?'), h('span', { class: 'sx-slot-who fit' }, String(lane.slot?.label || 'TBD').toUpperCase()));
}

/** Wires: first-round card → the second-round card's lower team (the winner enters as team B); second round → slot. */
function wires(lane, Z) {
  const cardH = Z.hd + Z.row * 2 + 1;
  const x1 = Z.c1, x2 = Z.c1 + Z.gap, x3 = x2 + Z.c2, x4 = x3 + Z.gap, xm = x1 + Z.gap / 2;
  const yMid = Z.hd + Z.row, yB = Z.hd + Z.row * 1.5;
  const on = (item) => item?.status === 'done';
  const stroke = (lit) => (lit ? 'stroke="#fdc204" stroke-width="3"' : 'stroke="rgba(185,198,238,.45)" stroke-width="2" stroke-dasharray="6 6"');
  const arrow = on(lane.match) ? 'stroke="#fdc204" stroke-width="3"' : 'stroke="rgba(185,198,238,.45)" stroke-width="2"';
  const feeder = lane.feeder ? `<path d="M${x1} ${yMid}H${xm}V${yB}H${x2 - 2}" fill="none" ${stroke(on(lane.feeder))}/>` : '';
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', 'sx-wire');
  el.setAttribute('viewBox', `0 0 ${x4 + Z.c3} ${cardH}`);
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${feeder}<path d="M${x3} ${yMid}H${x4 - 2}" fill="none" ${stroke(on(lane.match))}/><path d="M${x4 - 12} ${yMid - 8}L${x4 - 2} ${yMid}L${x4 - 12} ${yMid + 8}" fill="none" ${arrow}/>`;
  return el;
}

function supercup(data, ctx) {
  const fmt = sxFormat(data);
  const Z = SIZES[fmt];
  const lanes = data.lanes ?? [];
  const columns = data.columns ?? [];
  const vars = { '--c1': `${Z.c1}px`, '--c2': `${Z.c2}px`, '--c3': `${Z.c3}px`, '--gap': `${Z.gap}px`, '--hd': `${Z.hd}px`, '--row': `${Z.row}px`, '--lane': `${Z.lane}px` };
  const body = lanes.length
    ? h('div', { class: 'sx-bk', style: vars },
      h('div', { class: 'sx-bk-cols' },
        h('div', { class: 'sx-ch c1' }, columns[0] || 'FIRST ROUND'), h('i'),
        h('div', { class: 'sx-ch c2' }, columns[1] || 'SECOND ROUND'), h('i'),
        h('div', { class: 'sx-ch c3' }, columns[2] || 'TOP 4')),
      lanes.map((lane) => h('div', { class: 'sx-lane' }, wires(lane, Z),
        lane.feeder ? card(lane.feeder, Z, ctx) : h('i'), h('i'), card(lane.match, Z, ctx), h('i'), slot(lane, Z, ctx))))
    : h('div', { class: 'sx-empty' }, h('strong', {}, 'STAY TUNED.'), h('span', {}, 'The bracket is announced soon.'));
  return sxRoot(data, ctx, 'sx-bracket', {},
    sxHeader(data, { size: 'compact', round: data.title || 'ROAD TO TOP 4', kicker: data.kicker || '' }),
    sxMain(ctx, body),
    sxFooter(data));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    const lanes = data.lanes ?? [];
    return h('div', { class: 'social social-bracket' },
      ...socialBase(data, ctx), socialHeader(data, 'BRACKET', data.title || 'ROAD TO TOP 4'),
      h('div', { class: 'so-bracket-kicker' }, fit('so-bracket-kicker-text', data.kicker || '')),
      h('section', { class: 'so-bracket-lanes' }, lanes.length ? lanes.map((lane) => h('article', { class: 'so-bracket-lane' },
        h('div', { class: 'so-bracket-match' }, side(lane.feeder?.teamA), h('span', { class: 'so-bracket-vs' }, 'VS'), side(lane.feeder?.teamB)),
        h('div', { class: 'so-bracket-match is-decided' }, side(lane.match?.teamA), h('span', { class: 'so-bracket-vs' }, `${lane.match?.scoreA ?? '-'} : ${lane.match?.scoreB ?? '-'}`), side(lane.match?.teamB)),
        h('div', { class: 'so-bracket-slot' }, teamLogo(lane.slot?.team, 'so-bracket-slot-logo'), fit('so-bracket-slot-label', lane.slot?.label || '?')))) : h('div', { class: 'so-no-matches' }, 'NO BRACKET')),
      socialFooter(data));
  },
};
