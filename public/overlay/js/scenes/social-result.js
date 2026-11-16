// Social · Result. SUPER CUP style: plates with win/lose states, big score, qualification band (spec 5.3).
// Classic style keeps a simple fallback.
import { h, fit, teamLogo } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxFormat, sxRoot, sxHeader, sxMain, sxFooter, sxPlate, sxDate, sxTag, sxItem, sxRoundText, sxBestOf, sxJoin, winnerSide, hasResult, matchRef, teamRef } from './social-common.js';

function supercup(data, ctx) {
  const story = sxFormat(data) === 'story';
  const item = sxItem(data) ?? {};
  const { title, kicker } = sxRoundText(item, 'FINAL RESULT');
  const win = winnerSide(item);
  const state = (key) => (win ? (win === key ? 'win' : 'lose') : '');
  const score = (key) => (hasResult(item) ? String(key === 'a' ? item.scoreA : item.scoreB) : '-');
  const d = sxDate(item.date);
  const band = data.qualification?.text
    ? h('div', { class: 'sx-band' }, h('i', { class: 'sx-chev' }), h('span', { class: 'sx-band-text fit' }, data.qualification.text), h('i', { class: 'sx-chev r' }))
    : null;
  const info = h('div', { class: 'sx-sub' }, sxJoin(d ? `${d.dow} ${d.dm}` : '', sxBestOf(item.bestOf)));
  let body;
  if (!story) {
    const side = (team, key) => h('div', { class: `sx-team ${key} ${state(key) ? `is-${state(key)}` : ''}`, 'data-ref': teamRef(team) },
      sxPlate(team, 300, ctx, { side: key, state: state(key) }),
      h('div', { class: 'sx-tagbig fit' }, sxTag(team)), h('div', { class: 'sx-fullname fit' }, team?.name || 'To be confirmed'));
    body = [h('div', { class: 'sx-duel' }, side(item.teamA, 'a'),
      h('div', { class: 'sx-center sx-result-c' },
        h('span', { class: 'sx-chip sx-final' }, 'FINAL'),
        h('div', { class: 'sx-bigscore' }, h('span', { class: `n${win === 'a' ? ' w' : ''}` }, score('a')), h('i', { class: 'dash' }), h('span', { class: `n${win === 'b' ? ' w' : ''}` }, score('b')))),
      side(item.teamB, 'b')), band, info];
  } else {
    const line = (team, key) => h('div', { class: `sx-ln ${key} ${state(key) ? `is-${state(key)}` : ''}`, 'data-ref': teamRef(team) },
      sxPlate(team, 250, ctx, { side: 'a', state: state(key) }),
      h('div', { class: 'sx-words' }, h('div', { class: 'sx-tagbig fit' }, sxTag(team)), h('div', { class: 'sx-fullname fit' }, team?.name || 'To be confirmed')),
      h('div', { class: 'sx-ln-score' }, score(key)));
    body = [h('span', { class: 'sx-chip sx-final' }, 'FINAL RESULT'), h('div', { class: 'sx-board' }, line(item.teamA, 'a'), line(item.teamB, 'b')), band, info];
  }
  return sxRoot(data, ctx, 'sx-result', { 'data-ref': matchRef(item) },
    sxHeader(data, { size: 'compact', round: title, kicker: story ? '' : kicker }),
    sxMain(ctx, body),
    sxFooter(data));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    const item = data.item ?? {};
    const score = item.scoreA != null && item.scoreB != null ? `${item.scoreA} : ${item.scoreB}` : 'VS';
    return h('div', { class: 'social social-result', 'data-ref': item.id ? `match:${item.id}` : null },
      ...socialBase(data, ctx), socialHeader(data, 'RESULT', data.roundTitle || 'FINAL RESULT'),
      h('div', { class: 'so-result-score' }, fit('so-result-number', score)),
      h('div', { class: 'so-versus-teams' },
        h('div', { class: 'so-versus-team', 'data-ref': item.teamA?.id ? `team:${item.teamA.id}` : null }, teamLogo(item.teamA, 'so-versus-logo'), fit('so-versus-team-name', item.teamA?.name || 'TBD')),
        h('div', { class: 'so-versus-divider' }),
        h('div', { class: 'so-versus-team', 'data-ref': item.teamB?.id ? `team:${item.teamB.id}` : null }, teamLogo(item.teamB, 'so-versus-logo'), fit('so-versus-team-name', item.teamB?.name || 'TBD'))),
      data.qualification ? h('div', { class: 'so-result-band' }, fit('so-result-band-text', data.qualification.text)) : null,
      socialFooter(data));
  },
};
