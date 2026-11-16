import { h, fit, plate, teamLogo } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

export default {
  render(data, ctx) {
    const rows = data.rows ?? [];
    const rowHeight = Math.min(78, 630 / Math.max(1, rows.length));
    const grid = '70px minmax(0,1fr) repeat(5,130px)';
    const cell = value => h('span', { style: { textAlign: 'center' } }, value);
    return h('div', { class: 'has-standings' }, plate(data.theme, 'main', ctx),
      sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: data.title || 'League standings', sub: data.subtitle || '3 points per win · Head-to-head · Map difference' }),
      h('div', { class: 'brk-rule rule' }),
      h('div', { class: 'standings-table', role: 'table', 'aria-label': 'League standings', style: { position: 'absolute', left: '104px', right: '104px', top: '290px', fontSize: `${Math.min(30, rowHeight * .45)}px` } },
        h('div', { class: 'standings-columns', role: 'row', style: { display: 'grid', gridTemplateColumns: grid, color: 'var(--accent)', padding: '12px 0', fontSize: '22px' } }, cell('#'), h('span', {}, 'TEAM'), ...['PLAYED', 'WINS', 'LOSSES', 'MAP +/-', 'POINTS'].map(cell)),
        ...rows.map((row, i) => h('div', { class: 'standings-row', role: 'row', 'data-ref': row.team?.id ? `team:${row.team.id}` : null, style: { display: 'grid', gridTemplateColumns: grid, alignItems: 'center', height: `${rowHeight}px`, borderBottom: '1px solid rgba(255,255,255,.15)', background: i % 2 ? 'rgba(255,255,255,.04)' : 'transparent' } },
          cell(i + 1), h('div', { style: { display: 'flex', gap: '18px', alignItems: 'center', minWidth: 0 } }, teamLogo(row.team, 'nb-logo'), fit('standings-name nb-name', row.team?.name || `Seed ${row.seed}`)),
          ...[row.played, row.wins, row.losses, row.mapDifference > 0 ? `+${row.mapDifference}` : row.mapDifference].map(cell), h('b', { class: 'standings-points', style: { textAlign: 'center', color: 'var(--accent)' } }, row.points)))),
      h('div', { class: 'nb-footer' }, h('span', { class: 'nb-footer-copy' }, data.footer || `${data.league.short} · LEAGUE TABLE`)));
  },
};
