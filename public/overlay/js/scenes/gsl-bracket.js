import { h, fit, plate, teamLogo, svg } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

const WIDTH = 1712, HEIGHT = 650, GAP = 34;
function side(team, score, winnerId) {
  return h('div', { 'data-ref': team?.id ? `team:${team.id}` : null, class: `nb-team ${team?.id && winnerId === team.id ? 'is-winner' : ''}` }, teamLogo(team, 'nb-logo'), fit('nb-name', `${team?.seed ? `${team.seed} ` : ''}${team?.name || 'TBD'}`), h('b', { class: 'nb-score' }, score ?? '–'));
}
export default {
  render(data, ctx) {
    const tree = data.tree;
    const matches = tree.rounds.flatMap(round => round.matches);
    const final = matches.find(match => match.bracketNode === 'grandFinal');
    const columns = final ? 4 : 3;
    const width = (WIDTH - GAP * (columns - 1)) / columns;
    const definitions = {
      openingA: { column: 0, centre: 180, label: 'Opening A' },
      openingB: { column: 0, centre: 465, label: 'Opening B' },
      winners: { column: 1, centre: 180, label: 'Winners match' },
      losers: { column: 1, centre: 465, label: 'Elimination match' },
      decider: { column: 2, centre: 465, label: 'Lower final / Decider' },
      grandFinal: { column: 3, centre: 180, label: 'Grand Final' },
    };
    const positions = new Map();
    const cards = [];
    const headings = final ? ['Opening matches', 'Winners / Elimination', 'Lower Final', 'Grand Final'] : ['Opening matches', 'Winners / Elimination', 'Decider'];
    for (let column = 0; column < columns; column++) cards.push(h('div', { class: 'nb-round', style: { left: `${column * (width + GAP)}px`, width: `${width}px` } }, fit('nb-round-name', headings[column])));
    for (const match of matches) {
      const layout = definitions[match.bracketNode];
      if (!layout) continue;
      const x = layout.column * (width + GAP), centre = layout.centre;
      positions.set(match.id, { x, centre, match });
      cards.push(h('article', { 'data-ref': `match:${match.id}`, class: `nb-match gsl-match ${match.status === 'live' ? 'is-live' : ''}`, style: { left: `${x}px`, top: `${centre - 69}px`, width: `${width}px` } },
        h('div', { class: 'gsl-match-label' }, `${match.bracketCode} · ${layout.label}`),
        side(match.teamA, match.scoreA, match.winnerId), side(match.teamB, match.scoreB, match.winnerId),
        h('div', { class: 'gsl-when' }, match.date ? `${match.date.slice(8, 10)}/${match.date.slice(5, 7)} · ${match.time || 'Time TBD'}` : 'Date & time TBD', match.bestOf ? ` · BO${match.bestOf}` : '')));
    }
    const paths = { winner: [], loser: [] };
    for (const position of positions.values()) for (const [index, source] of [position.match.teamASource, position.match.teamBSource].entries()) {
      const parent = positions.get(source?.matchId);
      if (!parent) continue;
      const from = parent.x + width, to = position.x;
      const y = parent.centre + (source.outcome === 'loser' ? 25 : -18);
      const endY = position.centre + (index ? 17 : -19);
      const elbow = from + Math.min(GAP / 2, (to - from) / 2);
      // Long winner paths stay above the match row, keeping the lower-bracket path readable.
      const d = to - from > width ? `M${from} ${y}H${elbow}V62H${to - GAP / 2}V${endY}H${to}` : `M${from} ${y}H${elbow}V${endY}H${to}`;
      paths[source.outcome === 'loser' ? 'loser' : 'winner'].push(d);
    }
    const lines = svg(`<svg class="nb-lines gsl-lines" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}"><path class="gsl-winner-line" d="${paths.winner.join(' ')}"/><path class="gsl-loser-line" d="${paths.loser.join(' ')}"/></svg>`);
    return h('div', { class: 'has-gsl-bracket' }, plate(data.theme, 'main', ctx),
      sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: tree.title || tree.name || 'GSL groups', sub: tree.subtitle || 'Four teams · Winners and lower bracket paths' }),
      h('div', { class: 'brk-rule rule' }),
      h('div', { class: 'native-bracket gsl-bracket' }, lines, cards,
        tree.entries?.length ? h('div', { class: 'gsl-entries' }, tree.entries.map((entry, i) => h('div', { 'data-ref': entry.team?.id ? `team:${entry.team.id}` : null }, h('span', {}, entry.name || `Seed ${i + 1}`), teamLogo(entry.team, 'nb-logo'), fit('nb-name', entry.team.name)))) : null,
        !final ? h('div', { class: 'gsl-qualifiers' }, (tree.qualifications || []).map(item => h('div', { 'data-ref': item.team?.id ? `team:${item.team.id}` : null }, h('span', {}, item.name), fit('nb-name', item.team.name)))) : null),
      h('div', { class: 'nb-footer' }, h('span', { class: 'nb-footer-copy' }, tree.champion ? `CHAMPIONS · ${tree.champion.name}` : tree.footer || tree.name || 'GSL groups'),
        h('div', { class: 'gsl-legend' }, h('span', { class: 'gsl-win-key' }, '— Winner path'), h('span', { class: 'gsl-loss-key' }, '┄ Loser path'))));
  },
};
