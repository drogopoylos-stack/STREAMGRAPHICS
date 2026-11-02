import { h, fit, teamLogo, hasScore } from '../ui.js';
import { socialBase, socialHeader, socialFooter } from './social-common.js';

export default {
  render(data, ctx) {
    const matches = data.matches ?? [];
    const count = matches.length;
    return h('div', { class: 'social social-schedule', style: { '--fixture-count': Math.max(1, count) } },
      ...socialBase(data, ctx), socialHeader(data, 'MATCHDAY', 'THE LINEUP.'),
      h('div', { class: 'so-date' }, h('span', { class: 'so-date-marker' }), fit('so-date-text', data.dateLabel), h('span', { class: 'so-timezone' }, 'LOCAL TIME')),
      h('section', { class: `so-fixtures ${count <= 3 ? 'is-spacious' : ''}` }, count ? matches.map((match, index) => h('article', { class: `so-fixture ${match.status === 'live' ? 'is-live' : ''}` },
        h('span', { class: 'so-match-index' }, String((data.pagination.page - 1) * 6 + index + 1).padStart(2, '0')),
        h('div', { class: 'so-team so-team-a' }, teamLogo(match.teamA, 'so-team-logo'), fit('so-team-name', match.teamA?.name ?? 'TBD', { 'data-lines': 2 })),
        h('div', { class: 'so-match-centre' }, h('span', { class: 'so-fixture-time' }, match.time || 'TBA'), h('span', { class: 'so-fixture-vs' }, hasScore(match) ? `${match.scoreA} : ${match.scoreB}` : 'VS'), h('span', { class: 'so-fixture-bo' }, match.status === 'live' ? 'LIVE' : `BEST OF ${match.bestOf || 1}`)),
        h('div', { class: 'so-team so-team-b' }, teamLogo(match.teamB, 'so-team-logo'), fit('so-team-name', match.teamB?.name ?? 'TBD', { 'data-lines': 2 })))) : h('div', { class: 'so-no-matches' }, h('strong', {}, 'STAY TUNED.'), h('span', {}, 'No matches scheduled for this day.'))),
      socialFooter(data, data.pagination.pages > 1 ? `MATCHDAY · ${data.pagination.page} / ${data.pagination.pages}` : 'YOUR MATCHDAY STARTS HERE.'));
  },
};
