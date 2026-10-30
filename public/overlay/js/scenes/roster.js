// Team roster: crest + name + record, the starting five as tall cards, the bench / coaches in a row.
import { h, fit, plate, crest, playerPhoto, roleIcon, roleLabel, flagBadge, meander, leagueLogo, recordText, sponsorStrip } from '../ui.js';
import { splitRoster } from './common.js';

function starterCard(p, i, simple) {
  const d = 520 + i * 85;
  return h('div', { class: `pcard ${simple ? 'pcard-simple' : ''}`, in: 'up', d, dur: 700 },
    h('div', { class: 'pc-glow' }),
    simple
      ? h('div', { class: 'pc-mark' }, roleIcon(p.role))
      : playerPhoto(p, 'pc-photo', { in: 'rise', d: d + 120, dur: 800 }),
    h('div', { class: 'pc-top' },
      h('span', { class: 'pc-role' }, roleIcon(p.role), roleLabel(p.role)),
      flagBadge(p.country)),
    h('div', { class: 'pc-info' },
      h('div', { class: 'pc-nickrow' },
        fit('pc-nick display', p.nick),
        p.captain ? h('span', { class: 'cap', title: 'Captain' }, 'C') : null),
      p.name ? fit('pc-name', p.name) : null),
    h('div', { class: 'pc-shine', in: 'flash', d: d + 260, dur: 700 }));
}

function benchChip(p, simple) {
  const isCoach = p.role === 'Coach';
  const sub = isCoach ? 'Coach' : p.role ? `Sub · ${roleLabel(p.role)}` : 'Substitute';
  return h('div', { class: `chip ${isCoach ? 'is-coach' : ''} ${simple ? 'chip-simple' : ''}` },
    simple ? h('div', { class: 'chip-mark' }, roleIcon(p.role)) : playerPhoto(p, 'chip-photo'),
    h('div', { class: 'chip-text' },
      fit('chip-nick display', p.nick),
      h('div', { class: 'chip-role' }, roleIcon(p.role), h('span', {}, sub))));
}

export default {
  render(data, ctx) {
    const simple = ctx.mode === 'simple';
    const { team, record, league } = data;
    const { starters, bench } = splitRoster(data.players || []);
    const spons = sponsorStrip(data.sponsors, { label: 'Partners', max: 3, cls: 'r-spons' });
    const compact = bench.length > 6 || (spons && bench.length > 4);

    return h('div', { class: `${spons ? 'has-spons' : ''} ${bench.length ? '' : 'no-bench'}` },
      plate(data.theme, 'stage', ctx),
      h('div', { class: 'r-vignette' }),
      h('header', { class: 'r-head' },
        crest(team, 'r-crest', { in: 'scale', d: 220, dur: 750 }),
        h('div', { class: 'r-title' },
          h('div', { class: 'kicker', in: 'left', d: 300 }, 'Team Roster', h('span', { class: 'r-season' }, league?.season || '')),
          fit('r-name display', team?.name || '', { in: 'left', d: 360 }),
          h('div', { class: 'r-meta', in: 'left', d: 440 },
            team?.tag ? h('span', { class: 'tag' }, team.tag) : null,
            record ? h('span', { class: 'r-record' }, recordText(record)) : null,
            h('span', { class: 'r-league' }, league?.name || ''))),
        leagueLogo(league, 'r-llogo', { in: 'scale', d: 380 })),
      meander('r-meander', { in: 'wipec', d: 330, dur: 900 }),
      h('div', { class: `r-cards n${starters.length}` }, starters.map((p, i) => starterCard(p, i, simple))),
      bench.length || spons
        ? h('div', { class: `r-bench glass ${compact ? 'compact' : ''}`, in: 'up', d: 980 },
          bench.length ? h('div', { class: 'bench-label' }, h('span', {}, 'Bench'), h('small', {}, 'Subs & Coach')) : null,
          bench.length ? h('div', { class: `bench-list n${bench.length}` }, bench.map((p) => benchChip(p, simple || compact))) : null,
          spons)
        : null);
  },
};
