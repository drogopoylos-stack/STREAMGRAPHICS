import { h, fit, plate, teamLogo, svg } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

const W = 1712, H = 650, GAP = 54, CARD_H = 118;
function when(match) {
  const date = match.date ? `${match.date.slice(8, 10)}/${match.date.slice(5, 7)}` : 'Date TBD';
  return `${date} · ${match.time || 'Time TBD'}${match.bestOf ? ` · BO${match.bestOf}` : ''}`;
}
function side(team, score, won) {
  return h('div', { 'data-ref': team?.id ? `team:${team.id}` : null, class: `nb-team ${won ? 'is-winner' : ''}` }, teamLogo(team, 'nb-logo'), fit('nb-name', `${team?.seed ? `${team.seed} ` : ''}${team?.name || 'TBD'}`), h('b', { class: 'nb-score' }, score ?? '–'));
}
function doubleElimination(data, ctx) {
  const upper = data.tree.rounds.filter(r => r.side === 'upper');
  const lower = data.tree.rounds.filter(r => r.side === 'lower');
  const finals = data.tree.rounds.filter(r => r.side === 'final');
  const columns = Math.max(upper.length, lower.length);
  const gap = 24, finalWidth = 280, area = W - finalWidth - 44;
  const width = (area - gap * (columns - 1)) / columns;
  const positions = new Map(), cards = [];
  const heading = (text, x, y, width) => h('div', { class: 'nb-round', style: { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: '28px' } }, fit('nb-round-name', text));
  function row(rounds, top, height, label) {
    cards.push(h('b', { style: { position: 'absolute', left: '0', top: `${top}px`, color: 'var(--accent)', fontSize: '20px', textTransform: 'uppercase', letterSpacing: '.15em' } }, label));
    for (const [column, round] of rounds.entries()) {
      const x = column * (width + gap);
      cards.push(heading(round.name, x, top + 32, width));
      const cardHeight = Math.min(100, (height - 76) / round.matches.length - 6);
      for (const [index, match] of round.matches.entries()) {
        const centre = top + 72 + (index + .5) * (height - 76) / round.matches.length;
        positions.set(match.id, { x, centre, width, match });
        cards.push(compactCard(match, x, centre - cardHeight / 2, width, cardHeight));
      }
    }
  }
  function compactCard(match, x, y, width, height) {
    const teamRow = (team, score) => h('div', { 'data-ref': team?.id ? `team:${team.id}` : null, class: 'nb-team', style: { height: `${(height - 22) / 2}px`, padding: '0 8px', gap: '7px' } }, teamLogo(team, 'nb-logo'), fit('nb-name', `${team?.seed ? `${team.seed} ` : ''}${team?.name || 'TBD'}`), h('b', { class: 'nb-score', style: { fontSize: '18px' } }, score ?? '–'));
    const card = h('article', { class: 'nb-match', 'data-ref': `match:${match.id}`, style: { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, padding: '0', boxSizing: 'border-box' } },
      h('div', { class: 'nb-meta', style: { height: '22px', padding: '0 8px', fontSize: '12px' } }, h('b', {}, `${match.bracketCode}${match.optional ? ' · only if needed' : ''}`), h('span', {}, when(match))), teamRow(match.teamA, match.scoreA), teamRow(match.teamB, match.scoreB));
    for (const logo of card.querySelectorAll('.nb-logo')) Object.assign(logo.style, { width: `${Math.min(26,height / 3)}px`, height: `${Math.min(26,height / 3)}px` });
    for (const name of card.querySelectorAll('.nb-name')) name.style.fontSize = `${Math.min(22,Math.max(12,height / 4))}px`;
    return card;
  }
  row(upper, 0, 400, 'Upper bracket'); row(lower, 408, 240, 'Lower bracket');
  const finalX = W - finalWidth;
  cards.push(heading('Grand final', finalX, 20, finalWidth));
  for (const [i, round] of finals.entries()) for (const match of round.matches) {
    const centre = 245 + i * 190;
    positions.set(match.id, { x: finalX, centre, width: finalWidth, match });
    cards.push(compactCard(match, finalX, centre - 60, finalWidth, 120));
  }
  const paths = [];
  for (const p of positions.values()) for (const source of [p.match.teamASource, p.match.teamBSource]) {
    const parent = positions.get(source?.matchId);
    if (!parent || source.outcome === 'loser' || parent.x >= p.x) continue;
    const start = parent.x + parent.width, elbow = (start + p.x) / 2;
    paths.push(`M${start} ${parent.centre}H${elbow}V${p.centre}H${p.x}`);
  }
  return h('div', { class: 'has-native-bracket' }, plate(data.theme, 'main', ctx),
    sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: data.tree.title || 'Double elimination', sub: data.tree.subtitle }), h('div', { class: 'brk-rule rule' }),
    h('div', { class: 'native-bracket' }, svg(`<svg class="nb-lines" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${paths.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`), cards),
    h('div', { class: 'nb-footer' }, h('span', { class: 'nb-footer-copy' }, data.tree.champion ? `CHAMPIONS · ${data.tree.champion.name}` : data.tree.footer), h('span', { class: 'nb-footer-note' }, `Losers drop into the lower bracket${finals.some(r=>r.matches.some(m=>m.optional))?' · GF2 only if needed':''}`)));
}
export default {
  render(data, ctx) {
    if (data.tree.rounds.some(r => r.side === 'upper')) return doubleElimination(data, ctx);
    const rounds = [...data.tree.rounds, ...(data.tree.qualifications?.length ? [{ id: 'qualified', name: data.tree.qualifications.map(q => q.name).join(' / '), matches: [], qualifications: data.tree.qualifications }] : [])];
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
        cards.push(h('article', { 'data-ref': `match:${match.id}`, class: `nb-match ${match.status === 'live' ? 'is-live' : ''}`, style: { left: `${x}px`, top: `${centre - CARD_H / 2}px`, width: `${width}px` } },
          h('div', { class: 'nb-meta' }, h('strong', {}, `${match.bracketCode || match.stage}${match.optional ? ' · only if needed' : ''}`), h('span', {}, when(match))),
          side(match.teamA, match.scoreA, !!match.winnerId && match.winnerId === match.teamA?.id),
          side(match.teamB, match.scoreB, !!match.winnerId && match.winnerId === match.teamB?.id)));
      }
      for (let index = 0; index < (round.qualifications?.length || 0); index++) {
        const item = round.qualifications[index];
        const parent = positions.get(item.source?.matchId);
        const centre = parent?.centre ?? 72 + (index + .5) * (H - 100) / round.qualifications.length;
        positions.set(item.id, { x, centre, width, match: { teamASource: item.source } });
        cards.push(h('article', { class: 'nb-qualified', style: { left: `${x}px`, top: `${centre - 48}px`, width: `${width}px` } },
          h('span', { class: 'nb-qualified-label' }, item.name || 'Qualified'),
          h('div', { class: 'nb-team', 'data-ref': item.team?.id ? `team:${item.team.id}` : null }, teamLogo(item.team, 'nb-logo'), fit('nb-name', item.team.name))));
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
      sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: data.tree.title || 'Road to the Trophy', sub: data.tree.subtitle || 'Single elimination · Winners advance · Athens time' }),
      h('div', { class: 'brk-rule rule' }), tree,
      h('div', { class: 'nb-footer' }, h('span', { class: 'nb-footer-copy' }, data.tree.champion ? `CHAMPIONS · ${data.tree.champion.name}` : data.tree.footer || `${data.league.short} · EVERY SERIES COUNTS`), h('span', { class: 'nb-footer-note' }, 'TBD = to be confirmed')));
  },
};
