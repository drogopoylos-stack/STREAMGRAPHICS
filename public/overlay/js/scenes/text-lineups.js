import { h, fit, plate, teamLogo, roleIcon, roleLabel, hasScore, scoreBlock } from '../ui.js';
import { LANES, splitRoster, sceneHeader, leagueLine, whenBits } from './common.js';

function rows(players) {
  const { starters } = splitRoster(players);
  return LANES.map(role => starters.find(player => player.role === role) || { role, nick: 'TBD' });
}
function lineup(players, cls) {
  return h('div', { class: cls }, rows(players).map((player, index) => h('div', { class: 'tl-row', 'data-ref': player.id ? `player:${player.id}` : null, in: 'up', d: 420 + index * 65 },
    h('span', { class: 'tl-role' }, roleIcon(player.role), h('span', {}, roleLabel(player.role))),
    fit('tl-nick display', player.nick), player.captain ? h('span', { class: 'tl-captain' }, 'C') : null)));
}
function bench(players, cls = '') {
  const { bench } = splitRoster(players);
  if (!bench.length) return null;
  return h('div', { class: `tl-bench ${cls}` }, h('span', { class: 'tl-bench-label' }, 'Subs & staff'),
    fit('tl-bench-names', bench.map(player => `${player.nick}${player.role === 'Coach' ? ' (Coach)' : player.role ? ` (${roleLabel(player.role)})` : ''}`).join('  ·  '), { 'data-lines': 2 }));
}

export function textRoster(data, ctx) {
  return h('div', { class: 'text-roster' }, plate(data.theme, 'stage', ctx),
    sceneHeader({ league: data.league, kicker: `${leagueLine(data.league)} · TEAM ROSTER`, title: data.team.name, sub: 'Starting five · Roles & players' }),
    h('div', { class: 'tr-brand', 'data-ref': data.team?.id ? `team:${data.team.id}` : null }, teamLogo(data.team, 'tr-logo'), fit('tr-tag display', data.team.tag), h('span', { class: 'tr-label' }, 'TEAM ROSTER')),
    h('div', { class: 'tr-lineup' }, h('div', { class: 'tr-columns' }, h('span', {}, 'ROLE'), h('span', {}, 'PLAYER')), lineup(data.players, 'tr-rows')),
    data.showBench ? bench(data.players, 'tr-bench') : null);
}

function side(team, players, key, showBench) {
  return h('section', { class: `tv-panel tv-${key}`, 'data-ref': team?.id ? `team:${team.id}` : null },
    h('header', { class: 'tv-team' }, teamLogo(team, 'tv-logo'), h('div', { class: 'tv-team-text' }, fit('tv-tag display', team?.tag || 'TBD'), fit('tv-name', team?.name || 'To be confirmed'))),
    lineup(players, 'tv-rows'), showBench ? bench(players, 'tv-bench') : null);
}

export function textVersus(data, ctx) {
  return h('div', { class: 'text-versus', 'data-ref': data.match?.id ? `match:${data.match.id}` : null }, plate(data.theme, 'versus', ctx),
    sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: 'Match Lineups', sub: [data.match.stage, ...whenBits(data.match)].filter(Boolean).join(' · ') }),
    side(data.teamA, data.playersA || [], 'a', data.showBench), side(data.teamB, data.playersB || [], 'b', data.showBench),
    h('div', { class: 'tv-centre' }, hasScore(data.match) ? scoreBlock(data.match, 'tv-score') : h('span', { class: 'display' }, 'VS')));
}
