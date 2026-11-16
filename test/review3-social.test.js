// Review 3 · SUPERCUP social graphics. DOM-free checks: server scene data with edge cases, the
// design-slot catalogue, and static guards over the overlay sources (XSS, classic branch, dead selectors).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SLOTS, DESIGN_ELEMENTS } from '../public/shared/graphic-design.js';
import { sceneData } from '../server/scenes.js';
import { isSupercup, sxFormat, sxDate, sxTag, sxRoundName, sxBestOf, sxJoin, sxItem, hasResult, winnerSide, sxRoundText, teamRef, matchRef } from '../public/overlay/js/scenes/social-common.js';

const SOCIAL = ['social-schedule', 'social-versus', 'social-roster', 'social-result', 'social-announce', 'social-bracket', 'social-live'];
const SCENES_DIR = fileURLToPath(new URL('../public/overlay/js/scenes/', import.meta.url));

const BASE_SETTINGS = {
  leagueName: 'HLL 2027 SUPER CUP', leagueShort: 'HLL', season: 'Season 1', timezone: 'Europe/Athens',
  socialStyle: 'supercup', socialLogo: '', sponsorsOnGraphics: true, statDefs: [], brackets: [],
};

function makeDb(over = {}) {
  return {
    settings: { ...BASE_SETTINGS, ...(over.settings || {}) },
    teams: over.teams ?? [], players: over.players ?? [], sponsors: over.sponsors ?? [],
    features: [], backgrounds: [], graphics: [], matches: over.matches ?? [],
  };
}

const match = (id, extra) => ({ id, date: '2026-11-06', time: '18:00', bestOf: 3, scoreA: null, scoreB: null, status: 'scheduled', stage: '', stats: [], ...extra });

// ---------- pure SUPER CUP helpers ----------

test('supercup detection and format fall back safely', () => {
  assert.equal(isSupercup({ social: { style: 'supercup' } }), true);
  assert.equal(isSupercup({ social: { style: 'classic' } }), false);
  assert.equal(isSupercup({}), false);
  assert.equal(isSupercup(null), false);
  assert.equal(sxFormat({ social: { format: 'post' } }), 'post');
  assert.equal(sxFormat({ social: { format: 'story' } }), 'story');
  assert.equal(sxFormat({}), 'story');
});

test('date, tag, round and best-of helpers tolerate missing data', () => {
  const d = sxDate('2026-11-16');
  assert.equal(d.dm, '16/11');
  assert.equal(d.day, 16);
  assert.equal(d.month, 'NOVEMBER');
  assert.equal(d.dow.length, 3);
  assert.equal(d.dow, d.dowLong.slice(0, 3));
  assert.equal(sxDate('nope'), null);
  assert.equal(sxDate(null), null);
  assert.equal(sxTag(null), 'TBD');
  assert.equal(sxTag({ name: 'Alpha' }), 'ALPHA');
  assert.equal(sxTag({ tag: 'alp' }), 'ALP');
  assert.equal(sxRoundName('Top 4 qualifying matches'), 'TOP 4 QUALIFYING');
  assert.equal(sxRoundName(null), '');
  assert.equal(sxBestOf(3), 'BEST OF 3');
  assert.equal(sxBestOf(null), '');
  assert.equal(sxJoin('A', '', null, 'B'), 'A · B');
  assert.equal(teamRef({ id: 'a' }), 'team:a');
  assert.equal(teamRef({ id: null, placeholder: true }), null);
  assert.equal(matchRef({ id: 'm1' }), 'match:m1');
  assert.equal(matchRef(null), null);
});

test('the item fallback, winner side and round text handle every state', () => {
  const item = sxItem({ match: { id: 'm', date: '2026-11-06', status: 'done', scoreA: 2, scoreB: 0 }, teamA: { id: 'a' }, teamB: { id: 'b' } });
  assert.equal(item.id, 'm');
  assert.equal(item.round, null);
  assert.equal(sxItem({ item: { id: 'given' } }).id, 'given');
  assert.equal(sxItem({}), null);
  assert.equal(hasResult({ status: 'done', scoreA: 1, scoreB: 0 }), true);
  assert.equal(hasResult({ status: 'scheduled', scoreA: 1, scoreB: 0 }), false);
  assert.equal(hasResult({ status: 'done', scoreA: null, scoreB: 0 }), false);
  assert.equal(winnerSide({ status: 'done', scoreA: 2, scoreB: 0, teamA: { id: 'a' }, teamB: { id: 'b' } }), 'a');
  assert.equal(winnerSide({ status: 'done', scoreA: 0, scoreB: 2, teamA: { id: 'a' }, teamB: { id: 'b' } }), 'b');
  assert.equal(winnerSide({ status: 'done', scoreA: 1, scoreB: 1, teamA: { id: 'a' }, teamB: { id: 'b' } }), null);
  assert.equal(winnerSide({ status: 'scheduled', scoreA: 2, scoreB: 0 }), null);
  assert.deepEqual(sxRoundText({ round: { name: 'Top 4 qualifying matches', title: 'SECOND ROUND' }, bestOf: 3 }), { title: 'SECOND ROUND', kicker: 'TOP 4 QUALIFYING · BEST OF 3' });
  assert.deepEqual(sxRoundText(null, 'FINAL RESULT'), { title: 'MATCH DAY', kicker: 'FINAL RESULT' });
});

// ---------- server scene data with missing data ----------

test('a tournament with no matches keeps every social scene data-safe', () => {
  const db = makeDb();
  const schedule = sceneData('social-schedule', {}, db);
  assert.deepEqual(schedule.items, []);
  assert.equal(schedule.roundTitle, null);
  assert.equal(schedule.roundKicker, null);
  const bracket = sceneData('social-bracket', {}, db);
  assert.equal(bracket.bracket, null);
  assert.deepEqual(bracket.lanes, []);
  assert.deepEqual(bracket.columns, ['FIRST ROUND', 'SECOND ROUND', 'TOP 4']);
  assert.match(bracket.kicker, /0 OF 4 PLACES DECIDED/);
  // Scenes that need a match answer with a 404 (the page shows its error scene; the catalogue marks them unavailable).
  for (const scene of ['social-versus', 'social-result', 'social-live']) {
    assert.throws(() => sceneData(scene, {}, db), (error) => error.status === 404 && /not found/.test(error.message), scene);
  }
});

test('TBD places and teams without a logo produce placeholder items, never a throw', () => {
  const teams = [{ id: 'a', tag: 'ALP', name: 'Alpha', logo: null }];
  const matches = [
    match('x', { teamA: 'a', teamB: null, teamBLabel: 'Winner 1-1', status: 'done', scoreA: 2, scoreB: 0 }),
    match('final', { date: null, time: null, bestOf: null }),
  ];
  const data = sceneData('social-versus', { match: 'x' }, makeDb({ teams, matches }));
  assert.equal(data.item.teamA.logo, null);
  assert.equal(data.item.teamB.placeholder, true);
  assert.equal(data.item.teamB.logo, null);
  assert.equal(sxTag(data.item.teamB), 'TBD');
  const poster = sceneData('social-versus', { match: 'final' }, makeDb({ teams, matches }));
  assert.equal(poster.item.teamA, null);
  assert.equal(poster.item.teamB, null);
  assert.equal(poster.item.bestOf, null);
});

test('no sponsors means an empty sponsor list for the supercup footer', () => {
  const data = sceneData('social-schedule', {}, makeDb({ matches: [match('m1')] }));
  assert.deepEqual(data.sponsors, []);
});

test('a bracket without qualifications reports zero decided places and no TOP 4 column', () => {
  const teams = [{ id: 'a', tag: 'ALP', name: 'Alpha', logo: null }, { id: 'b', tag: 'BET', name: 'Beta', logo: null }, { id: 'c', tag: 'GAM', name: 'Gamma', logo: null }, { id: 'd', tag: 'DEL', name: 'Delta', logo: null }];
  const matches = [match('r1m1', { teamA: 'a', teamB: 'b' }), match('r1m2', { teamA: 'c', teamB: 'd' }), match('r2m1', { teamA: 'a', teamB: 'c', teamBLabel: 'Winner r1m2' })];
  const settings = { brackets: [{ id: 'single', name: 'Single Elimination', format: 'single-elimination', rounds: [{ id: 'r1', name: 'Opening Round', matches: ['r1m1', 'r1m2'] }, { id: 'r2', name: 'Top 4 qualifying matches', matches: ['r2m1'] }] }] };
  const data = sceneData('social-bracket', {}, makeDb({ settings, teams, matches }));
  assert.deepEqual(data.columns, ['FIRST ROUND', 'SECOND ROUND']);
  assert.match(data.kicker, /0 OF 4 PLACES DECIDED/);
  assert.equal(data.lanes.length, 1);
  assert.equal(data.lanes[0].match.id, 'r2m1');
  assert.equal(data.lanes[0].slot.team, null);
});

test('a roster with fewer than five starters still resolves', () => {
  const teams = [{ id: 'a', tag: 'ALP', name: 'Alpha', logo: null }];
  const players = [
    { id: 'p1', teamId: 'a', nick: 'One', role: 'Top', lineup: 'starter', hidden: false },
    { id: 'p2', teamId: 'a', nick: 'Two', role: 'Mid', lineup: 'starter', hidden: false },
  ];
  const data = sceneData('social-roster', { team: 'a' }, makeDb({ teams, players }));
  assert.deepEqual(data.lineup, [{ role: 'TOP', nick: 'One' }, { role: 'MID', nick: 'Two' }]);
  assert.deepEqual(data.subs, []);
  const none = sceneData('social-roster', { team: 'a' }, makeDb({ teams, players: [] }));
  assert.deepEqual(none.lineup, []);
  assert.deepEqual(none.subs, []);
});

test('social-live starts from the live match, else the next one, and reports a null next at the end', () => {
  const teams = [{ id: 'a', tag: 'ALP', name: 'Alpha', logo: null }, { id: 'b', tag: 'BET', name: 'Beta', logo: null }];
  const matches = [
    match('first', { date: '2999-01-01', teamA: 'a', teamB: 'b' }),
    match('second', { date: '2999-01-02', teamA: 'b', teamB: 'a' }),
    match('live', { date: '2999-01-03', teamA: 'a', teamB: 'b', status: 'live' }),
  ];
  const db = makeDb({ teams, matches });
  const live = sceneData('social-live', {}, db);
  assert.equal(live.item.id, 'live');
  assert.equal(live.next, null);
  const noLive = sceneData('social-live', {}, makeDb({ teams, matches: matches.slice(0, 2) }));
  assert.equal(noLive.item.id, 'first');
  assert.equal(noLive.next.id, 'second');
  const chosen = sceneData('social-live', { match: 'second' }, db);
  assert.equal(chosen.item.id, 'second');
  assert.equal(chosen.next, null);
  // Every match is done: the latest result is shown, never a crash.
  const done = sceneData('social-live', {}, makeDb({ teams, matches: [match('done', { date: '2000-01-01', teamA: 'a', teamB: 'b', status: 'done', scoreA: 2, scoreB: 0 })] }));
  assert.equal(done.item.id, 'done');
  assert.equal(done.next, null);
});

// ---------- design catalogue ----------

const EXPECTED_COMMON = ['eventYear', 'eventTitle', 'sponsorLabel', 'twitch'];
const SCENE_SLOTS = {
  'social-schedule': ['brand', 'title', 'footer', 'roundTitle', 'roundKicker', 'date', 'times', 'emptyTitle', 'empty', 'finalLabel', 'castLabel', 'noCastLabel'],
  'social-versus': ['brand', 'title', 'roundTitle', 'roundKicker', 'date', 'time', 'vs', 'liveAtLabel', 'broadcastLabel', 'castLabel', 'noCastLabel'],
  'social-roster': ['brand', 'title', 'roleTop', 'roleJungle', 'roleMid', 'roleBot', 'roleSupport', 'subLabel', 'subs'],
  'social-result': ['brand', 'title', 'roundTitle', 'roundKicker', 'finalLabel', 'qualification', 'meta'],
  'social-announce': ['brand', 'title', 'headline', 'kicker', 'day', 'month', 'weekday', 'time', 'info'],
  'social-bracket': ['brand', 'title', 'kicker', 'roundTitle', 'column1', 'column2', 'column3', 'finalLabel', 'labels'],
  'social-live': ['brand', 'title', 'cta', 'next', 'liveLabel', 'nowLabel', 'roundKicker', 'castLabel', 'noCastLabel'],
};

test('every social scene exposes unique design slot ids for its classic and supercup nodes', () => {
  for (const scene of SOCIAL) {
    const slots = DESIGN_SLOTS[scene];
    assert.ok(Array.isArray(slots) && slots.length > 3, scene);
    const ids = slots.map((slot) => slot.id);
    assert.equal(new Set(ids).size, ids.length, `${scene} repeats a slot id`);
    for (const slot of slots) {
      assert.ok(slot.label && slot.selector, `${scene}.${slot.id} needs a label and selector`);
      assert.ok(['title', 'body', 'label', 'numbers'].includes(slot.role), `${scene}.${slot.id} has role ${slot.role}`);
      assert.equal(typeof slot.editable, 'boolean', `${scene}.${slot.id} editable`);
    }
    for (const id of [...EXPECTED_COMMON, ...SCENE_SLOTS[scene]]) assert.ok(ids.includes(id), `${scene} is missing slot ${id}`);
  }
});

// Every selector's classes must exist in the overlay sources. A selector passes when at least one
// comma part has all of its classes present (state classes like is-w and dynamic r-<role> allowed).
const DYNAMIC_CLASS = /^[ab]$|^r-(top|jungle|mid|bot|support|player)$/;
function overlaySource() {
  const root = fileURLToPath(new URL('../public/overlay/', import.meta.url));
  const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(js|css)$/.test(entry.name)) files.push(full); } };
  walk(root);
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}
function selectorCanMatch(selector, source) {
  const has = (token) => new RegExp(`(^|[^\\w-])${token}([^\\w-]|$)`).test(source);
  return selector.split(',').some((part) => {
    const classes = [...part.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]);
    return classes.length > 0 && classes.every((cls) => has(cls) || DYNAMIC_CLASS.test(cls));
  });
}

test('every social design selector matches a node class in the overlay sources', () => {
  const source = overlaySource();
  const dead = [];
  for (const scene of SOCIAL) for (const def of [...DESIGN_SLOTS[scene], ...DESIGN_ELEMENTS[scene]]) if (!selectorCanMatch(def.selector, source)) dead.push(`${scene} ${def.id} ${def.selector}`);
  assert.deepEqual(dead, []);
});

// ---------- static XSS / classic-branch guards ----------

test('supercup scene modules never turn scene data into HTML', () => {
  const files = fs.readdirSync(SCENES_DIR).filter((file) => file.startsWith('social-') && file.endsWith('.js'));
  assert.ok(files.length >= 7);
  for (const file of files) {
    const src = fs.readFileSync(path.join(SCENES_DIR, file), 'utf8');
    assert.ok(!/[{,]\s*html\s*:/.test(src), `${file} passes an html prop to h()`);
    const writes = [...src.matchAll(/\.innerHTML\s*=/g)].length + [...src.matchAll(/insertAdjacentHTML/g)].length;
    if (file === 'social-bracket.js') { assert.equal(writes, 1, 'bracket wire is the only HTML write'); continue; }
    assert.equal(writes, 0, `${file} writes innerHTML`);
  }
  // The single write is the bracket wire geometry: only local numbers, never scene data.
  const bracket = fs.readFileSync(path.join(SCENES_DIR, 'social-bracket.js'), 'utf8');
  const line = bracket.split('\n').find((row) => row.includes('.innerHTML ='));
  assert.ok(line && !/\bdata\b|\bteam\b|\bsponsor\b|\bitem\./.test(line), line);
});

test('every social renderer keeps its classic path behind the style guard', () => {
  for (const file of ['social-schedule.js', 'social-versus.js', 'social-lineups.js', 'social-result.js', 'social-announce.js', 'social-bracket.js', 'social-live.js']) {
    const src = fs.readFileSync(path.join(SCENES_DIR, file), 'utf8');
    assert.match(src, /if \(isSupercup\(data\)\) return \w+\(data, ctx\);/, file);
  }
});
