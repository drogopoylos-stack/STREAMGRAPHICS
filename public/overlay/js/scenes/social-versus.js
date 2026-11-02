import { h, fit, teamLogo, playerPhoto } from '../ui.js';
import { socialBase, socialHeader, socialFooter } from './social-common.js';

function player(player, team, side, effect) {
  const mask = player?.photo ? `url(${JSON.stringify(player.photo)})` : 'none';
  return h('div', { class: `so-fighter so-fighter-${side} effect-${effect}`, style: { '--team-colour': team?.colors?.primary || '#c8102e', '--photo-mask': mask } },
    h('div', { class: 'so-fighter-orbit' }),
    playerPhoto(player, 'so-player-photo'),
    player?.photo ? h('div', { class: 'so-player-ink', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'so-player-caption' }, h('span', { class: 'so-player-role' }, player?.role || 'PLAYER'), fit('so-player-nick', player?.nick || 'PLAYER TBA')));
}

export default {
  render(data, ctx) {
    return h('div', { class: 'social social-versus' },
      ...socialBase(data, ctx), socialHeader(data, 'HEAD TO HEAD', 'BUILT FOR THIS.'),
      h('div', { class: 'so-vs-kicker' }, fit('so-vs-stage', data.match.stage || 'MATCHDAY'), h('span', {}, `BEST OF ${data.match.bestOf || 1}`)),
      h('div', { class: 'so-fighters' }, player(data.playerA, data.teamA, 'a', data.effect), player(data.playerB, data.teamB, 'b', data.effect), h('div', { class: 'so-versus-mark' }, 'VS')),
      h('div', { class: 'so-versus-teams' },
        h('div', { class: 'so-versus-team' }, teamLogo(data.teamA, 'so-versus-logo'), fit('so-versus-team-name', data.teamA?.name || 'TBD', { 'data-lines': 2 })),
        h('div', { class: 'so-versus-divider' }),
        h('div', { class: 'so-versus-team' }, teamLogo(data.teamB, 'so-versus-logo'), fit('so-versus-team-name', data.teamB?.name || 'TBD', { 'data-lines': 2 }))),
      h('div', { class: 'so-vs-date' }, fit('so-vs-date-label', data.dateLabel), h('span', { class: 'so-vs-time' }, data.match.time || 'TIME TBA')),
      socialFooter(data));
  },
};
