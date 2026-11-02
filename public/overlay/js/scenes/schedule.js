// Day schedule: header (Today's / Tomorrow's matches + Greek date), one row per match.
// Row height adapts to the number of matches (1–8+ rows) through the --rh custom property.
import { h, fit, plate, teamLogo, hasScore, scoreBlock, boText, stageText } from '../ui.js';
import { isoDay } from '../core.js';
import { sceneHeader, sponsorsFor, leagueLine } from './common.js';

const AREA_TOP = 286;
const AREA_BOTTOM = 996;
const GAP = 14;

function titleFor(date) {
  if (date === isoDay(0)) return "Today's Matches";
  if (date === isoDay(1)) return "Tomorrow's Matches";
  return 'Match Day';
}

function centreCell(m) {
  if (hasScore(m)) {
    return h('div', { class: 'sc-mid' },
      m.status === 'live' ? h('span', { class: 'badge badge-live sc-live' }, h('i', { class: 'dot' }), 'LIVE') : null,
      scoreBlock(m, 'sc-score'),
      m.status === 'done' ? h('span', { class: 'sc-final' }, 'Final') : null);
  }
  if (m.status === 'live') {
    return h('div', { class: 'sc-mid' }, h('span', { class: 'badge badge-live sc-live sc-live-only' }, h('i', { class: 'dot' }), 'LIVE'));
  }
  return h('div', { class: 'sc-mid' }, h('span', { class: 'sc-vs' }, 'VS'));
}

function row(m, i, lines, showDates = false) {
  const nameProps = lines > 1 ? { 'data-lines': lines } : {};
  const live = m.status === 'live';
  const done = m.status === 'done';
  const aWin = done && Number(m.scoreA) > Number(m.scoreB);
  const bWin = done && Number(m.scoreB) > Number(m.scoreA);
  return h('div', { class: `srow ${live ? 'is-live' : ''} ${done ? 'is-done' : ''}`, in: 'left', d: 560 + i * 90, dur: 650 },
    h('div', { class: 'sc-time' }, h('span', {}, m.time || 'TBD'), showDates ? h('span', { class: 'sc-date-small' }, m.date ? `${m.date.slice(8, 10)}/${m.date.slice(5, 7)}` : 'Date TBD') : null),
    h('div', { class: `sc-team sc-a ${bWin ? 'is-lose' : ''}` },
      fit('sc-name display', m.teamA?.name || 'TBD', nameProps),
      teamLogo(m.teamA, 'sc-logo')),
    centreCell(m),
    h('div', { class: `sc-team sc-b ${aWin ? 'is-lose' : ''}` },
      teamLogo(m.teamB, 'sc-logo'),
      fit('sc-name display', m.teamB?.name || 'TBD', nameProps)),
    h('div', { class: 'sc-info' },
      stageText(m) ? fit('sc-stage', stageText(m), { 'data-lines': 2 }) : null,
      boText(m.bestOf) ? h('span', { class: 'sc-bo' }, boText(m.bestOf)) : null));
}

export default {
  render(data, ctx) {
    const matches = data.matches || [];
    const spons = sponsorsFor(data, { label: 'Partners', max: 4, cls: 'sch-spons' });
    const n = matches.length;
    const avail = AREA_BOTTOM - AREA_TOP;
    const rh = n ? Math.max(64, Math.min(176, Math.floor((avail - GAP * (n - 1)) / n))) : 0;
    const gap = n > 6 ? 10 : GAP;

    return h('div', { class: `${n ? '' : 'is-empty'} ${n > 5 ? 'dense' : ''} ${data.showDates ? 'has-dates' : ''}`, style: { '--rh': `${rh}px`, '--gap': `${gap}px` } },
      plate(data.theme, 'main', ctx),
      sceneHeader({
        league: data.league,
        kicker: leagueLine(data.league),
        title: data.showDates ? 'Tournament Schedule' : titleFor(data.date),
        sub: data.dateLabel || '',
        subLang: 'el',
        right: spons,
      }),
      h('div', { class: 'sch-rule rule', in: 'wipec', d: 420, dur: 800 }),
      n
        ? h('div', { class: `sch-rows n${n}` }, matches.map((m, i) => row(m, i, rh >= 150 ? 3 : rh >= 110 ? 2 : 1, data.showDates)))
        : h('div', { class: 'sch-empty glass ticks', in: 'up', d: 520 },
          h('div', { class: 'sch-empty-k' }, 'Schedule'),
          h('div', { class: 'sch-empty-t display' }, 'No matches scheduled'),
          h('div', { class: 'sch-empty-s', lang: 'el' }, data.dateLabel || '')));
  },
};
