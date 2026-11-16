import { h, fit, teamLogo, roleIcon, roleLabel } from '../ui.js';
import { splitRoster, LANES } from './common.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxFormat, sxRoot, sxHeader, sxMain, sxFooter, sxLogo, sxGhost, sxTag, teamRef } from './social-common.js';

const SX_ROLES = { Top: 'TOP', Jungle: 'JUNGLE', Mid: 'MID', Bot: 'BOT', Support: 'SUPPORT' };

// SUPER CUP team roster (spec 4.8 / 5.4): team identity, gold role column, royal-blue names, faded logo, sub row. No photos.
function supercupRoster(data, ctx) {
  const story = sxFormat(data) === 'story';
  const team = data.team;
  const players = data.players || [];
  const lineup = data.lineup?.length
    ? data.lineup
    : LANES.map((role) => ({ role: SX_ROLES[role], nick: splitRoster(players).starters.find((p) => p.role === role)?.nick || 'TBD' }));
  const subs = data.subs ?? [];
  const playerRef = (nick) => { const p = players.find((x) => x.nick === nick); return p?.id ? `player:${p.id}` : null; };
  const cells = lineup.flatMap((row, index) => [
    h('div', { class: `sx-role r-${String(row.role || 'player').toLowerCase()}${index ? ' sep' : ''}` }, row.role || 'PLAYER'),
    h('div', { class: `sx-nick fit${index ? ' sep' : ''}`, 'data-ref': playerRef(row.nick) }, String(row.nick || 'TBD').toUpperCase()),
  ]);
  return sxRoot(data, ctx, 'sx-roster', {},
    sxHeader(data, { size: story ? 'mid' : 'full' }),
    sxMain(ctx,
      h('div', { class: 'sx-teamid', 'data-ref': teamRef(team) }, sxLogo(team, story ? 124 : 104, ctx, 'has-glow'),
        h('div', { class: 'sx-words' }, h('div', { class: 'sx-tagbig sx-team-tag fit' }, sxTag(team)), h('div', { class: 'sx-fullname fit' }, team?.name || 'To be confirmed'))),
      h('div', { class: 'sx-rwrap' },
        sxGhost(team, story ? 760 : 680, ctx),
        h('div', { class: 'sx-rtable' }, cells),
        subs.length ? h('div', { class: 'sx-subrow' }, h('span', { class: 'sx-sub-k' }, 'SUB'), h('span', { class: 'sx-sub-v fit' }, subs.map((nick) => String(nick).toUpperCase()).join(' · '))) : null)),
    sxFooter(data));
}

function list(players, cls) {
  const starters = splitRoster(players || []).starters;
  return h('div', { class: cls }, LANES.map(role => {
    const player = starters.find(p => p.role === role);
    return h('div', { class: 'so-lineup-row', 'data-ref': player?.id ? `player:${player.id}` : null }, h('span', { class: 'so-lineup-role' }, roleIcon(role), h('span', {}, roleLabel(role))), fit('so-lineup-nick', player?.nick || 'TBD'));
  }));
}
function teamBlock(team, players) {
  return h('section', { class: 'so-lineup-team', 'data-ref': team?.id ? `team:${team.id}` : null }, h('header', {}, teamLogo(team, 'so-lineup-logo'), h('div', { class: 'so-lineup-heading' }, fit('so-lineup-tag', team?.tag || 'TBD'), fit('so-lineup-team-name', team?.name || 'To be confirmed'))), list(players, 'so-lineup-list'));
}
export function socialLineupVersus(data, ctx) {
  return h('div', { class: 'social social-text-versus', 'data-ref': data.match?.id ? `match:${data.match.id}` : null }, ...socialBase(data, ctx), socialHeader(data, 'MATCH LINEUPS', 'HEAD TO HEAD.'),
    h('div', { class: 'so-lineup-match' }, fit('so-lineup-stage', data.match.stage || 'MATCHDAY'), h('span', {}, data.match.bestOf ? `BO${data.match.bestOf}` : 'FORMAT TBD')),
    h('div', { class: 'so-lineup-versus-panels' }, teamBlock(data.teamA, data.playersA), h('div', { class: 'so-lineup-vs' }, 'VS'), teamBlock(data.teamB, data.playersB)),
    h('div', { class: 'so-vs-date' }, fit('so-vs-date-label', data.dateLabel), h('span', { class: 'so-vs-time' }, data.match.time || 'TIME TBD')), socialFooter(data));
}
export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercupRoster(data, ctx);
    return h('div', { class: 'social social-text-roster' }, ...socialBase(data, ctx), socialHeader(data, 'TEAM ROSTER', 'STARTING FIVE.'),
      h('div', { class: 'so-roster-brand', 'data-ref': data.team?.id ? `team:${data.team.id}` : null }, teamLogo(data.team, 'so-roster-logo'), fit('so-roster-name', data.team.name, { 'data-lines': 2 })),
      list(data.players, 'so-roster-lineup'), socialFooter(data, 'ROLES · PLAYERS · STARTING FIVE'));
  },
};
