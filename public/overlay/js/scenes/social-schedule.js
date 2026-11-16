import { h, fit, teamLogo, hasScore } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxFormat, sxRoot, sxHeader, sxMain, sxFooter, sxLogo, sxVs, sxCast, sxDate, sxTag, sxBestOf, sxJoin, hasResult, winnerSide, matchRef, teamRef } from './social-common.js';

// SUPER CUP match rows (spec 4.4): bar / gap / tag / VS height per number of rows. Story 5-6 rows use the compact header.
const ROWS = {
  post: { 1: { bar: 140, gap: 0, tag: 72, vs: 100 }, 2: { bar: 132, gap: 52, tag: 68, vs: 96 }, 3: { bar: 120, gap: 36, tag: 64, vs: 88 }, 4: { bar: 108, gap: 22, tag: 60, vs: 80 } },
  story: { 1: { bar: 156, gap: 0, tag: 78, vs: 108 }, 2: { bar: 142, gap: 70, tag: 74, vs: 104 }, 3: { bar: 128, gap: 46, tag: 68, vs: 94 }, 4: { bar: 112, gap: 26, tag: 62, vs: 84 }, 5: { bar: 92, gap: 16, tag: 58, vs: 74, meta: 42 }, 6: { bar: 78, gap: 12, tag: 54, vs: 66, meta: 40 } },
};

function sxRow(item, M, ctx, showResults) {
  const d = sxDate(item.date);
  const done = showResults && hasResult(item);
  const win = done ? winnerSide(item) : null;
  const side = (key) => {
    const team = key === 'a' ? item.teamA : item.teamB;
    return h('div', { class: `sx-side ${key}${done && win !== key ? ' is-lose' : ''}`, 'data-ref': teamRef(team) },
      h('div', { class: 'sx-well' }, sxLogo(team, M.logo, ctx)), h('span', { class: 'sx-tag fit' }, sxTag(team)));
  };
  const when = h('span', { class: 'sx-meta-date' }, d ? h('b', {}, d.dow) : null, d ? d.dm : 'TBD');
  const meta = done
    ? [when, h('i', { class: 'sx-sep' }), h('span', { class: 'sx-meta-final' }, 'FINAL')]
    : [when, h('i', { class: 'sx-sep' }), h('span', { class: 'sx-meta-time' }, item.time || 'TBD'), item.cast != null ? [h('i', { class: 'sx-sep' }), sxCast(item.cast)] : null];
  const mid = done
    ? h('div', { class: 'sx-score' }, h('span', { class: `n${win === 'a' ? ' w' : ''}` }, String(item.scoreA)), h('span', { class: 'c' }), h('span', { class: `n${win === 'b' ? ' w' : ''}` }, String(item.scoreB)))
    : sxVs(M.vs);
  return h('div', { class: `sx-row${done ? ' is-done' : ''}`, 'data-ref': matchRef(item) },
    h('div', { class: 'sx-meta' }, meta),
    h('div', { class: 'sx-bar' }, h('div', { class: 'sx-barplate' }), side('a'), h('div', { class: 'sx-mid' }, mid), side('b')));
}

function supercup(data, ctx) {
  const fmt = sxFormat(data);
  const items = (data.items ?? []).slice(0, fmt === 'post' ? 4 : 6);
  const n = Math.max(1, items.length);
  const M = { meta: 44, ...ROWS[fmt][n] };
  M.well = M.bar + 15; // 10 px above the bar + 5 px into its gold bottom line
  M.logo = M.well - 26;
  const vsWidth = Math.max(M.vs * 2.25, 150);
  const tagMax = Math.round(952 / 2 - M.well - 26 - vsWidth / 2 - 18);
  const showResults = ctx.params?.results !== '0';
  const d = sxDate(data.date);
  const title = data.roundTitle || 'MATCH DAY';
  const page = data.pagination?.pages > 1 ? `${data.pagination.page}/${data.pagination.pages}` : '';
  const kicker = data.roundKicker
    ? sxJoin(data.roundKicker, page)
    : sxJoin(d ? `${d.dowLong} ${d.day} ${d.month}` : String(data.dateLabel || '').toUpperCase(), sxBestOf(items.find((item) => item.bestOf)?.bestOf), page);
  const size = fmt === 'post' ? 'full' : n >= 5 ? 'compact' : n >= 4 ? 'mid' : 'full';
  return sxRoot(data, ctx, `sx-schedule${n >= 5 ? ' is-dense' : ''}`, {},
    sxHeader(data, { size, round: title, kicker }),
    sxMain(ctx, items.length
      ? h('div', { class: 'sx-rows', style: { gap: `${M.gap}px`, '--bar-h': `${M.bar}px`, '--tag-size': `${M.tag}px`, '--well': `${M.well}px`, '--meta-h': `${M.meta}px`, '--tag-max': `${tagMax}px` } }, items.map((item) => sxRow(item, M, ctx, showResults)))
      : h('div', { class: 'sx-empty' }, h('strong', {}, 'STAY TUNED.'), h('span', {}, 'No matches scheduled for this day.'))),
    sxFooter(data));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    const matches = data.matches ?? [];
    const count = matches.length;
    return h('div', { class: 'social social-schedule', style: { '--fixture-count': Math.max(1, count) } },
      ...socialBase(data, ctx), socialHeader(data, 'MATCHDAY', 'THE LINEUP.'),
      h('div', { class: 'so-date' }, h('span', { class: 'so-date-marker' }), fit('so-date-text', data.dateLabel), h('span', { class: 'so-timezone' }, 'LOCAL TIME')),
      h('section', { class: `so-fixtures ${count <= 3 ? 'is-spacious' : ''}` }, count ? matches.map((match, index) => h('article', { 'data-ref': match.id ? `match:${match.id}` : null, class: `so-fixture ${match.status === 'live' ? 'is-live' : ''}` },
        h('span', { class: 'so-match-index' }, String((data.pagination.page - 1) * 6 + index + 1).padStart(2, '0')),
        h('div', { class: 'so-team so-team-a', 'data-ref': match.teamA?.id ? `team:${match.teamA.id}` : null }, teamLogo(match.teamA, 'so-team-logo'), fit('so-team-name', match.teamA?.name ?? 'TBD', { 'data-lines': 2 })),
        h('div', { class: 'so-match-centre' }, h('span', { class: 'so-fixture-time' }, match.time || 'TBA'), h('span', { class: 'so-fixture-vs' }, hasScore(match) ? `${match.scoreA} : ${match.scoreB}` : 'VS'), h('span', { class: 'so-fixture-bo' }, match.status === 'live' ? 'LIVE' : match.bestOf ? `BEST OF ${match.bestOf}` : 'FORMAT TBD')),
        h('div', { class: 'so-team so-team-b', 'data-ref': match.teamB?.id ? `team:${match.teamB.id}` : null }, teamLogo(match.teamB, 'so-team-logo'), fit('so-team-name', match.teamB?.name ?? 'TBD', { 'data-lines': 2 })))) : h('div', { class: 'so-no-matches' }, h('strong', {}, 'STAY TUNED.'), h('span', {}, 'No matches scheduled for this day.'))),
      socialFooter(data, data.pagination.pages > 1 ? `MATCHDAY · ${data.pagination.page} / ${data.pagination.pages}` : 'YOUR MATCHDAY STARTS HERE.'));
  },
};
