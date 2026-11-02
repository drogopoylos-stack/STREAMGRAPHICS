import { h, fit, plate, teamLogo, svg } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

const W = 1712, H = 650, GAP = 54, CARD_H = 118;
function when(match) {
  const date = match.date ? `${match.date.slice(8, 10)}/${match.date.slice(5, 7)}` : 'Date TBD';
  return `${date} · ${match.time || 'Time TBD'}${match.bestOf ? ` · BO${match.bestOf}` : ''}`;
}
function side(team, score, won) {
  return h('div', { class: `nb-team ${won ? 'is-winner' : ''}` }, teamLogo(team, 'nb-logo'), fit('nb-name', team?.name || 'TBD'), h('b', { class: 'nb-score' }, score ?? '–'));
}
export default {
  render(data, ctx) {
    const rounds = data.tree.rounds;
    const width = (W - GAP * (rounds.length - 1)) / rounds.length;
    const positions = new Map();
    const cards = [];
    for (let column = 0; column < rounds.length; column++) {
      const round = rounds[column];
      const x = column * (width + GAP);
      cards.push(h('div', { class: 'nb-round', style: { left: `${x}px`, width: `${width}px` } }, h('span', {}, String(column + 1).padStart(2, '0')), fit('nb-round-name', round.name)));
      for (let index = 0; index < round.matches.length; index++) {
        const match = round.matches[index];
        const parents = [match.teamASource, match.teamBSource].map(source => positions.get(source?.matchId)).filter(Boolean);
        const centre = parents.length ? parents.reduce((sum, parent) => sum + parent.centre, 0) / parents.length : 72 + (index + 0.5) * (H - 100) / round.matches.length;
        positions.set(match.id, { x, centre, width, match });
        cards.push(h('article', { class: `nb-match ${match.status === 'live' ? 'is-live' : ''}`, style: { left: `${x}px`, top: `${centre - CARD_H / 2}px`, width: `${width}px` } },
          h('div', { class: 'nb-meta' }, h('strong', {}, match.bracketCode || match.stage), h('span', {}, when(match))),
          side(match.teamA, match.scoreA, !!match.winnerId && match.winnerId === match.teamA?.id),
          side(match.teamB, match.scoreB, !!match.winnerId && match.winnerId === match.teamB?.id)));
      }
    }
    const paths = [];
    for (const position of positions.values()) for (const source of [position.match.teamASource, position.match.teamBSource]) {
      const parent = positions.get(source?.matchId);
      if (!parent) continue;
      const start = parent.x + parent.width, end = position.x, elbow = start + (end - start) / 2;
      paths.push(`M${start} ${parent.centre}H${elbow}V${position.centre}H${end}`);
    }
    const tree = h('div', { class: 'native-bracket' }, svg(`<svg class="nb-lines" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${paths.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`), cards);
    return h('div', { class: 'has-native-bracket' }, plate(data.theme, 'main', ctx),
      sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: 'Road to the Trophy', sub: 'Single elimination · Winners advance · Athens time' }),
      h('div', { class: 'brk-rule rule' }), tree,
      h('div', { class: 'nb-footer' }, data.tree.champion ? `CHAMPIONS · ${data.tree.champion.name}` : `${data.league.short} · EVERY SERIES COUNTS`, h('span', {}, 'TBD = to be confirmed')));
  },
};
