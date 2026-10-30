// Minimal versus band: [crest A | TAG A] [VS or score] [TAG B | crest B] plus a meta line.
// Designed to sit over gameplay / camera with bg=0; never shows sponsors.
import { h, fit, plate, crest, laurel, hasScore, scoreBlock, statusBadge, stageText } from '../ui.js';
import { whenBits, dotted, leagueLine } from './common.js';

function wing(team, key) {
  const label = team?.tag || team?.name || 'TBD';
  return h('div', { class: `sv-wing sv-${key}`, in: key === 'a' ? 'wipel' : 'wipe', d: 300, dur: 700 },
    h('div', { class: 'sv-wing-bg' }),
    crest(team, 'sv-crest', { in: 'scale', d: 560, dur: 700 }),
    h('div', { class: 'sv-text' },
      fit('sv-tag display', label),
      team?.tag && team?.name ? fit('sv-name', team.name) : null));
}

export default {
  render(data, ctx) {
    const m = data.match || {};
    const scored = hasScore(m);
    const badge = statusBadge(m.status, 'sv-badge');
    const meta = [stageText(m), ...whenBits(m, { weekday: 'short', day: 'numeric', month: 'long' })].filter(Boolean);

    return h('div', {},
      plate(data.theme, 'versus', ctx),
      h('div', { class: 'sv-kicker', in: 'fade', d: 200 },
        laurel('l', 'sv-laurel'), h('span', {}, leagueLine(data.league)), laurel('r', 'sv-laurel')),
      h('div', { class: 'sv-band' },
        wing(data.teamA, 'a'),
        wing(data.teamB, 'b'),
        h('div', { class: `sv-mid ${scored ? 'has-score' : ''}`, in: 'pop', d: 420 },
          scored ? scoreBlock(m, 'sv-score') : h('span', { class: 'sv-vs' }, 'VS'))),
      meta.length || badge
        ? h('div', { class: 'sv-meta', in: 'up', d: 760 },
          badge,
          meta.length ? dotted(meta, 'sv-when') : null)
        : null);
  },
};
