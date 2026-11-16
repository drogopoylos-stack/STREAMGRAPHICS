import { h, fit, plate, teamLogo, hasScore, scoreBlock } from '../ui.js';
import { leagueLine } from './common.js';
import { dayLabel } from '../core.js';
import { isStreamSc } from '../stream-sc.js';

export default {
  render(data, ctx) {
    const matches = data.matches || [];
    const sc = isStreamSc(data);
    return h('div', { class: 'waiting-screen' }, plate(data.theme, 'main', ctx),
      h('div', { class: 'wait-glow' }),
      h('div', { class: 'wait-brand', in: 'up', d: 150 }, h('img', { class: 'wait-logo', src: sc ? data.league?.logo || data.hllLogo : data.hllLogo, alt: 'HLL', 'data-image': sc ? 'league' : 'mark', 'data-image-slot': sc ? null : 'hllLogo' }),
        fit('wait-cup display', leagueLine(data.league)), h('div', { class: 'wait-rule' }), fit('wait-title display', 'STARTING SOON'),
        h('div', { class: 'wait-caption' }, 'THE NEXT CHAPTER BEGINS HERE')),
      h('section', { class: 'wait-schedule', in: 'up', d: 500 }, h('div', { class: 'wait-schedule-label' }, "TODAY’S MATCHES", h('span', { class: 'wait-date' }, sc && data.date ? dayLabel(data.date) : data.dateLabel)),
        matches.length ? h('div', { class: 'wait-matches', style: { '--wait-cols': Math.min(matches.length, 4) } }, matches.map(match => h('div', { class: 'wait-match', 'data-ref': match.id ? `match:${match.id}` : null },
          h('span', { class: 'wait-time' }, match.time || 'TBD'),
          teamLogo(match.teamA, 'wait-team-logo'), fit('wait-team', match.teamA?.tag || 'TBD', { 'data-ref': match.teamA?.id ? `team:${match.teamA.id}` : null }),
          hasScore(match) ? scoreBlock(match, 'wait-score') : h('span', { class: 'wait-vs' }, 'vs'),
          fit('wait-team', match.teamB?.tag || 'TBD', { 'data-ref': match.teamB?.id ? `team:${match.teamB.id}` : null }), teamLogo(match.teamB, 'wait-team-logo'))))
          : h('div', { class: 'wait-empty' }, 'Match schedule to be announced')));
  },
};
