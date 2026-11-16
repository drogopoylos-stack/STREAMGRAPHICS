import { h, fit, teamLogo, playerPhoto } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxFormat, sxRoot, sxHeader, sxMain, sxFooter, sxPlate, sxVs, sxCast, sxDate, sxTag, sxItem, sxRoundText, matchRef, teamRef } from './social-common.js';
import { socialLineupVersus } from './social-lineups.js';

function player(player, team, side, effect) {
  const mask = player?.photo ? `url(${JSON.stringify(player.photo)})` : 'none';
  return h('div', { class: `so-fighter so-fighter-${side} effect-${effect}`, 'data-ref': player?.id ? `player:${player.id}` : null, style: { '--team-colour': team?.colors?.primary || '#c8102e', '--photo-mask': mask } },
    h('div', { class: 'so-fighter-orbit' }),
    playerPhoto(player, 'so-player-photo'),
    player?.photo ? h('div', { class: 'so-player-ink', 'aria-hidden': 'true', 'data-image': 'player' }) : null,
    h('div', { class: 'so-player-caption' }, h('span', { class: 'so-player-role' }, player?.role || 'PLAYER'), fit('so-player-nick', player?.nick || 'PLAYER TBA')));
}

// SUPER CUP match poster (spec 5.2): post = two plates side by side, story = diagonal duel; ticket with date / time / broadcast.
function supercup(data, ctx) {
  const story = sxFormat(data) === 'story';
  const item = sxItem(data) ?? {};
  const { title, kicker } = sxRoundText(item);
  // story + image lockup: the header is 58 px taller than the typed one, so the plates give 18 px each
  const Z = story ? { plate: data.social?.logo ? 244 : 262, vs: 124 } : { plate: 330, vs: 120 };
  const words = (team) => [h('div', { class: 'sx-tagbig fit' }, sxTag(team)), h('div', { class: 'sx-fullname fit' }, team?.name || 'To be confirmed')];
  let duel;
  if (story) {
    const row = (team, key) => h('div', { class: `sx-team ${key}`, 'data-ref': teamRef(team) }, sxPlate(team, Z.plate, ctx, { side: key }), h('div', { class: 'sx-words' }, words(team)));
    duel = h('div', { class: 'sx-diag' }, row(item.teamA, 'a'), h('div', { class: 'sx-vsrow' }, sxVs(Z.vs)), row(item.teamB, 'b'));
  } else {
    const side = (team, key) => h('div', { class: `sx-team ${key}`, 'data-ref': teamRef(team) }, sxPlate(team, Z.plate, ctx, { side: key }), words(team));
    duel = h('div', { class: 'sx-duel' }, side(item.teamA, 'a'), h('div', { class: 'sx-center sx-vswrap', style: { top: `${Z.plate / 2 - Z.vs / 2 - 6}px` } }, sxVs(Z.vs)), side(item.teamB, 'b'));
  }
  const d = sxDate(item.date);
  const cast = sxCast(item.cast, true);
  const cell = (cls, label, value) => h('div', { class: `sx-cell ${cls}` }, h('span', { class: 'sx-ticket-lab' }, label), value);
  const ticket = h('div', { class: 'sx-ticket' },
    cell('is-day', h('span', { class: 'sx-ticket-dow' }, d ? d.dowLong : 'DATE'), h('span', { class: 'sx-ticket-big sx-ticket-date' }, d ? `${d.day} ${d.month}` : 'TBD')),
    h('i', { class: 'sx-ticket-rule' }),
    cell('is-time', h('span', { class: 'sx-live-at' }, 'LIVE AT'), h('span', { class: 'sx-ticket-big sx-ticket-time' }, item.time || 'TBD')),
    cast ? [h('i', { class: 'sx-ticket-rule' }), cell('is-cast', h('span', { class: 'sx-broadcast' }, 'BROADCAST'), h('span', { class: 'sx-ticket-cast' }, cast))] : null);
  return sxRoot(data, ctx, 'sx-poster', { 'data-ref': matchRef(item) },
    sxHeader(data, { size: 'compact', round: title, kicker }),
    sxMain(ctx, duel, ticket),
    sxFooter(data));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    if (data.rosterStyle === 'text') return socialLineupVersus(data, ctx);
    return h('div', { class: 'social social-versus', 'data-ref': data.match?.id ? `match:${data.match.id}` : null },
      ...socialBase(data, ctx), socialHeader(data, 'HEAD TO HEAD', 'BUILT FOR THIS.'),
      h('div', { class: 'so-vs-kicker' }, fit('so-vs-stage', data.match.stage || 'MATCHDAY'), h('span', {}, `BEST OF ${data.match.bestOf || 1}`)),
      h('div', { class: 'so-fighters' }, player(data.playerA, data.teamA, 'a', data.effect), player(data.playerB, data.teamB, 'b', data.effect), h('div', { class: 'so-versus-mark' }, 'VS')),
      h('div', { class: 'so-versus-teams' },
        h('div', { class: 'so-versus-team', 'data-ref': data.teamA?.id ? `team:${data.teamA.id}` : null }, teamLogo(data.teamA, 'so-versus-logo'), fit('so-versus-team-name', data.teamA?.name || 'TBD', { 'data-lines': 2 })),
        h('div', { class: 'so-versus-divider' }),
        h('div', { class: 'so-versus-team', 'data-ref': data.teamB?.id ? `team:${data.teamB.id}` : null }, teamLogo(data.teamB, 'so-versus-logo'), fit('so-versus-team-name', data.teamB?.name || 'TBD', { 'data-lines': 2 }))),
      h('div', { class: 'so-vs-date' }, fit('so-vs-date-label', data.dateLabel), h('span', { class: 'so-vs-time' }, data.match.time || 'TIME TBA')),
      socialFooter(data));
  },
};
