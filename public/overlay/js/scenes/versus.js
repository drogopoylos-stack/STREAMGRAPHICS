// Match versus: crests, names, records, central VS (or score + status), meta line; full mode adds
// both starting fives. Team A sits on the crimson side of the plate, team B on the gold side.
import { h, fit, plate, crest, playerPhoto, roleIcon, roleLabel, laurel, leagueLogo, recordText, hasScore, scoreBlock, statusBadge, stageText } from '../ui.js';
import { splitRoster, whenBits, dotted, sponsorsFor } from './common.js';
import { textVersus } from './text-lineups.js';
import { isStreamSc, hasPhotos } from '../stream-sc.js';

function miniCard(p, i, d) {
  return h('div', { class: 'mcard', 'data-ref': p.id ? `player:${p.id}` : null, in: 'up', d: d + i * 70, dur: 650 },
    h('div', { class: 'mc-glow' }),
    playerPhoto(p, 'mc-photo'),
    h('div', { class: 'mc-info' },
      h('div', { class: 'mc-role' }, roleIcon(p.role), h('span', {}, roleLabel(p.role))),
      fit('mc-nick display', p.nick)));
}

function side(team, record, key, simple) {
  const dir = key === 'a' ? 'left' : 'right';
  return h('div', { class: `vs-side vs-${key}`, 'data-ref': team?.id ? `team:${team.id}` : null },
    h('div', { class: 'vs-side-bg', in: 'fade', d: 250 }),
    crest(team, 'vs-crest', { in: 'scale', d: key === 'a' ? 320 : 400, dur: 800 }),
    fit('vs-name display', team?.name || 'TBD', { in: dir, d: 520, 'data-min': 34, 'data-wrap': 2 }),
    h('div', { class: 'vs-sub', in: 'fade', d: 640 },
      team?.tag ? h('span', { class: 'tag' }, team.tag) : null,
      record && recordText(record) ? h('span', { class: 'vs-record' }, recordText(record)) : null));
}

function centre(m) {
  const scored = hasScore(m);
  return h('div', { class: `vs-mid ${scored ? 'has-score' : ''}` },
    scored
      ? h('div', { class: 'vs-scorewrap', in: 'pop', d: 700 }, scoreBlock(m, 'vs-score'))
      : h('div', { class: 'vs-discwrap', in: 'pop', d: 700 }, h('div', { class: 'vs-disc' }, h('span', {}, 'VS'))),
    statusBadge(m.status) ? h('div', { class: 'vs-status', in: 'up', d: 860 }, statusBadge(m.status)) : null);
}

export default {
  render(data, ctx) {
    if (data.rosterStyle === 'text') return textVersus(data, ctx);
    // SUPER CUP: without player photos the full versus shows the text line-ups instead of empty silhouettes.
    if (isStreamSc(data) && ctx.mode !== 'simple' && !hasPhotos([...(data.playersA || []), ...(data.playersB || [])])) return textVersus(data, ctx);
    const simple = ctx.mode === 'simple';
    const m = data.match || {};
    const stage = stageText(m) || data.league?.name || '';
    const spons = sponsorsFor(data, { label: '', max: 3, cls: 'vs-spons' });
    const lineA = simple ? [] : splitRoster(data.playersA || []).starters;
    const lineB = simple ? [] : splitRoster(data.playersB || []).starters;
    const lineups = lineA.length || lineB.length;

    return h('div', { 'data-ref': m.id ? `match:${m.id}` : null, class: `${lineups ? 'has-lineups' : 'no-lineups'} ${spons ? 'has-spons' : ''}` },
      plate(data.theme, 'versus', ctx),
      h('header', { class: 'vs-top' },
        leagueLogo(data.league, 'vs-llogo', { in: 'scale', d: 150 }),
        h('div', { class: 'vs-meta', in: 'down', d: 220 },
          h('div', { class: 'vs-stage-row' },
            laurel('l', 'vs-laurel'),
            fit('vs-stage display', stage),
            laurel('r', 'vs-laurel')),
          dotted(whenBits(m), 'vs-when')),
        spons ? h('div', { class: 'vs-spons-wrap', in: 'fade', d: 400 }, spons) : null),
      side(data.teamA, data.recordA, 'a', simple),
      side(data.teamB, data.recordB, 'b', simple),
      centre(m),
      lineups ? h('div', { class: 'vs-lineup vs-la' },
        h('div', { class: 'vs-ltitle', in: 'fade', d: 860 }, h('span', {}, 'Starting Five')),
        h('div', { class: 'vs-cards' }, lineA.map((p, i) => miniCard(p, i, 900)))) : null,
      lineups ? h('div', { class: 'vs-lineup vs-lb' },
        h('div', { class: 'vs-ltitle', in: 'fade', d: 860 }, h('span', {}, 'Starting Five')),
        h('div', { class: 'vs-cards' }, lineB.map((p, i) => miniCard(p, i, 960)))) : null);
  },
};
