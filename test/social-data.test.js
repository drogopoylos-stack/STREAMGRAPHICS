import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_IDS, dimensionsFor, isPortrait, sceneFormats } from '../public/shared/scenes.js';
import { validateSettings } from '../server/db.js';
import { sceneData } from '../server/scenes.js';
import { graphicCatalog } from '../server/graphics.js';
import { organizeGraphics } from '../public/control/js/graphic-browser-model.js';
import { roundOptions, socialScheduleParams } from '../public/control/js/builder.js';

const SOCIAL = ['social-schedule', 'social-versus', 'social-roster', 'social-result', 'social-announce', 'social-bracket', 'social-live'];
const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

function players(teamId, tag) {
  const list = ROLES.map((role, index) => ({ id: `${teamId}p${index}`, teamId, nick: `${tag}${role}`, role, lineup: 'starter', photo: null, hidden: false }));
  list.push({ id: `${teamId}sub`, teamId, nick: `${tag}Sub`, role: 'Mid', lineup: 'sub', photo: null, hidden: false });
  return list;
}

function fixture(overrides = {}) {
  const teams = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, tag: ['ALP', 'BET', 'GAM', 'DEL'][index], name: ['Alpha', 'Beta', 'Gamma', 'Delta'][index], logo: `/media/teams/${id}.png` }));
  const match = (id, extra) => ({ id, bracketCode: id, date: '2026-11-06', time: '18:00', bestOf: 3, scoreA: null, scoreB: null, status: 'scheduled', stage: '', streamWithCast: null, stats: [], ...extra });
  const settings = {
    leagueName: 'HLL 2027 SUPER CUP', leagueShort: 'HLL', season: 'Season 1', timezone: 'Europe/Athens',
    socialStyle: 'supercup', socialLogo: '/brand/supercup/supercup-2027-logo.png',
    theme: { preset: 'aegean' }, sponsorsOnGraphics: true, statDefs: [],
    brackets: [{
      id: 'single', name: 'Single Elimination · Top 4', title: 'Single Elimination', format: 'single-elimination',
      rounds: [
        { id: 'opening', name: 'Opening Round', matches: ['1-1', '1-2'] },
        { id: 'qualifying', name: 'Top 4 qualifying matches', matches: ['3-1', '3-2'] },
      ],
      qualifications: [
        { name: 'ADVANCE TO TOP 4 · GSL', source: { matchId: '3-1', outcome: 'winner' } },
        { name: 'ADVANCE TO TOP 4 · GSL', source: { matchId: '3-2', outcome: 'winner' } },
      ],
    }],
  };
  const db = {
    settings: { ...settings, ...overrides.settings, theme: { ...settings.theme, ...overrides.settings?.theme } },
    teams,
    players: [...players('a', 'ALP'), ...players('b', 'BET'), ...players('c', 'GAM'), ...players('d', 'DEL')],
    sponsors: [], features: [], backgrounds: [], graphics: [],
    matches: [
      match('1-1', { teamA: 'a', teamB: 'b', date: '2026-11-06', scoreA: 2, scoreB: 1, status: 'done', stage: 'Day 1-1', streamWithCast: true }),
      match('1-2', { teamA: 'c', teamB: 'd', date: '2026-11-06', scoreA: 2, scoreB: 0, status: 'done', stage: 'Day 1-2 · No cast', streamWithCast: true }),
      match('3-1', { teamA: 'a', teamB: 'c', date: '2026-11-15', scoreA: 2, scoreB: 0, status: 'done', stage: 'Day 3-1', streamWithCast: false, teamBLabel: 'Winner 1-1' }),
      match('3-2', { teamA: 'b', teamB: 'd', date: '2026-11-21', status: 'scheduled', stage: 'Day 3-2', streamWithCast: null, teamBLabel: 'Winner 1-2' }),
      match('live', { teamA: 'b', teamB: 'c', date: '2026-11-20', status: 'live', scoreA: 1, scoreB: 0, stage: 'Day 4-1', streamWithCast: true }),
    ],
  };
  return db;
}

test('social scenes are post 1080×1350 and story 1080×1920, everything else keeps its size', () => {
  for (const id of SOCIAL) assert.ok(SCENE_IDS.includes(id), `${id} is registered`);
  assert.deepEqual(dimensionsFor('schedule'), { width: 1920, height: 1080 });
  assert.deepEqual(dimensionsFor('roster'), { width: 1920, height: 1080 });
  assert.deepEqual(dimensionsFor('social-schedule'), { width: 1080, height: 1920 });
  assert.deepEqual(dimensionsFor('social-schedule', { format: 'story' }), { width: 1080, height: 1920 });
  assert.deepEqual(dimensionsFor('social-schedule', { format: 'post' }), { width: 1080, height: 1350 });
  assert.deepEqual(dimensionsFor('social-result', { format: 'post' }), { width: 1080, height: 1350 });
  assert.deepEqual(dimensionsFor('social-bracket', { format: 'post' }), { width: 1080, height: 1350 });
  assert.deepEqual(dimensionsFor('social-live', { format: 'post' }), { width: 1080, height: 1920 });
  assert.equal(isPortrait('social-result', { format: 'post' }), true);
  assert.equal(isPortrait('schedule'), false);
  assert.deepEqual(sceneFormats('social-result'), ['post', 'story']);
  assert.deepEqual(sceneFormats('social-live'), ['story']);
  assert.deepEqual(sceneFormats('schedule'), []);
});

test('social settings validate style, logo URL and the format background plates', () => {
  assert.doesNotThrow(() => validateSettings({ socialStyle: 'classic' }));
  assert.doesNotThrow(() => validateSettings({ socialStyle: 'supercup' }));
  assert.throws(() => validateSettings({ socialStyle: 'neon' }), /classic or supercup/);
  assert.doesNotThrow(() => validateSettings({ socialLogo: '' }));
  assert.doesNotThrow(() => validateSettings({ socialLogo: '/brand/supercup/supercup-2027-logo.png' }));
  assert.doesNotThrow(() => validateSettings({ socialLogo: 'https://cdn.example.com/logo.png' }));
  assert.throws(() => validateSettings({ socialLogo: 'javascript:alert(1)' }), /image URL/);
  assert.throws(() => validateSettings({ socialLogo: 42 }), /image URL/);
  assert.doesNotThrow(() => validateSettings({ theme: { socialBgPost: '/brand/supercup/bg-post.jpg' } }));
  assert.doesNotThrow(() => validateSettings({ theme: { socialBgStory: null } }));
  assert.throws(() => validateSettings({ theme: { socialBgStory: 'nope' } }), /image URL/);
  assert.throws(() => validateSettings({ theme: ['nope'] }), /Theme must be an object/);
});

test('every social scene carries the shared social block and the SUPER CUP defaults', () => {
  const db = fixture();
  for (const scene of SOCIAL) {
    const data = sceneData(scene, {}, db);
    assert.deepEqual(data.social, {
      style: 'supercup', format: 'story', logo: '/brand/supercup/supercup-2027-logo.png',
      lettermark: '/brand/hll-lettermark-white.png', year: '2027', title: 'SUPER CUP', twitch: 'twitch.tv/HellenicLegends',
    }, scene);
    assert.equal(data.theme.socialBgPost, '/brand/supercup/bg-post.jpg', scene);
    assert.equal(data.theme.socialBgStory, '/brand/supercup/bg-story.jpg', scene);
    assert.equal(sceneData(scene, { format: 'post' }, db).social.format, scene === 'social-live' ? 'story' : 'post', scene);
  }
  const classic = sceneData('social-versus', {}, fixture({ settings: { socialStyle: 'classic', leagueName: 'SUPERCUP 2026' } }));
  assert.equal(classic.social.style, 'classic');
  assert.equal(classic.social.format, 'story');
  assert.equal(classic.social.year, '2026');
  assert.equal(classic.social.title, 'SUPERCUP');
  assert.equal(classic.social.logo, '/brand/supercup/supercup-2027-logo.png');
  assert.equal(classic.theme.socialBgPost, undefined);
  assert.equal(classic.theme.socialBgStory, undefined);
});

test('the match item keeps teams, cast state, round and the winner', () => {
  const db = fixture();
  const schedule = sceneData('social-schedule', { round: 'qualifying' }, db);
  assert.equal(schedule.roundTitle, 'SECOND ROUND');
  assert.equal(schedule.roundKicker, 'TOP 4 QUALIFYING · BEST OF 3');
  assert.deepEqual(schedule.items.map((item) => item.id), ['3-1', '3-2']);
  const decided = schedule.items[0];
  assert.equal(decided.code, '3-1');
  assert.equal(decided.bestOf, 3);
  assert.equal(decided.status, 'done');
  assert.equal(decided.cast, false);
  assert.equal(decided.winnerId, 'a');
  assert.deepEqual(decided.round, { index: 1, name: 'Top 4 qualifying matches', title: 'SECOND ROUND' });
  assert.deepEqual([decided.teamA.tag, decided.teamB.tag], ['ALP', 'GAM']);
  assert.equal(schedule.items[1].cast, null);
  assert.equal(schedule.items[1].winnerId, null);

  const day = sceneData('social-schedule', { day: '2026-11-06' }, db);
  assert.deepEqual(day.items.map((item) => item.id), ['1-1', '1-2']);
  assert.equal(day.roundTitle, 'FIRST ROUND');
  assert.equal(day.roundKicker, 'OPENING ROUND · BEST OF 3');
  assert.equal(day.items[0].cast, true);
  assert.equal(day.items[1].cast, false);

  const poster = sceneData('social-versus', { match: '3-2' }, db);
  assert.equal(poster.item.id, '3-2');
  assert.equal(poster.item.teamA.tag, 'BET');
  assert.equal(poster.item.teamB.name, 'Delta');
  assert.equal(poster.item.round.title, 'SECOND ROUND');
});

test('the result default is the latest finished match and carries its qualification band', () => {
  const db = fixture();
  const data = sceneData('social-result', {}, db);
  assert.equal(data.item.id, '3-1');
  assert.deepEqual(data.qualification, { text: 'ALP ADVANCE TO TOP 4 · GSL', tag: 'ALP' });
  const chosen = sceneData('social-result', { match: '1-1' }, db);
  assert.equal(chosen.item.id, '1-1');
  assert.equal(chosen.qualification, null);
  assert.equal(chosen.item.cast, true);
  assert.throws(() => sceneData('social-result', { match: 'missing' }, db), /match not found/);
});

test('the roster exposes five starters in role order plus the substitutes', () => {
  const data = sceneData('social-roster', { team: 'a' }, fixture());
  assert.deepEqual(data.lineup.map((entry) => entry.role), ['TOP', 'JUNGLE', 'MID', 'BOT', 'SUPPORT']);
  assert.deepEqual(data.lineup.map((entry) => entry.nick), ['ALPTop', 'ALPJungle', 'ALPMid', 'ALPBot', 'ALPSupport']);
  assert.deepEqual(data.subs, ['ALPSub']);
  const { lineup, subs, ...rest } = data;
  assert.ok(rest.players.length === 6);
});

test('the bracket builds lanes from round two, its feeder and the qualified slot', () => {
  const data = sceneData('social-bracket', {}, fixture());
  assert.equal(data.title, 'ROAD TO TOP 4');
  assert.equal(data.kicker, 'SINGLE ELIMINATION · 1 OF 2 PLACES DECIDED');
  assert.deepEqual(data.columns, ['FIRST ROUND', 'SECOND ROUND', 'TOP 4']);
  assert.equal(data.lanes.length, 2);
  assert.equal(data.lanes[0].feeder.id, '1-1');
  assert.equal(data.lanes[0].match.id, '3-1');
  assert.equal(data.lanes[0].slot.team.tag, 'ALP');
  assert.equal(data.lanes[0].slot.label, 'ALP');
  assert.equal(data.lanes[1].feeder.id, '1-2');
  assert.equal(data.lanes[1].slot.team, null);
  assert.equal(data.lanes[1].slot.label, 'BET / DEL');
});

test('the live scene starts from the live match and points at the next fixture', () => {
  const db = fixture();
  const data = sceneData('social-live', {}, db);
  assert.equal(data.item.id, 'live');
  assert.equal(data.item.status, 'live');
  assert.equal(data.next.id, '3-2');
  const chosen = sceneData('social-live', { match: '1-1' }, db);
  assert.equal(chosen.item.id, '1-1');
  assert.equal(chosen.next.id, '3-2');
  assert.throws(() => sceneData('social-live', { match: 'missing' }, db), /match not found/);
});

test('the graphic catalogue offers post and story cards for the new social scenes', () => {
  const cards = graphicCatalog(fixture(), '2026-11-02');
  const formats = (scene) => cards.filter((card) => card.scene === scene).map((card) => card.params.format);
  assert.ok(formats('social-result').includes('post') && formats('social-result').includes('story'));
  assert.ok(formats('social-announce').includes('post') && formats('social-announce').includes('story'));
  assert.ok(formats('social-bracket').includes('post') && formats('social-bracket').includes('story'));
  assert.deepEqual([...new Set(formats('social-live'))], ['story']);
  assert.ok(cards.filter((card) => card.scene === 'social-result' && card.params.format === 'post').every((card) => card.width === 1080 && card.height === 1350));
  assert.ok(cards.filter((card) => card.scene === 'social-result' && card.params.format === 'story').every((card) => card.width === 1080 && card.height === 1920));
  assert.equal(new Set(cards.map((card) => card.key)).size, cards.length);
});

test('the graphic catalogue offers a post and story match-day card for every bracket round', () => {
  const cards = graphicCatalog(fixture(), '2026-11-02').filter((card) => card.scene === 'social-schedule' && card.params.round);
  assert.deepEqual(cards.map((card) => [card.params.round, card.params.format]).sort(), [['opening', 'post'], ['opening', 'story'], ['qualifying', 'post'], ['qualifying', 'story']]);
  for (const card of cards) {
    const round = card.params.round === 'opening' ? 'Opening Round' : 'Top 4 qualifying matches';
    assert.ok(card.title.includes(round), card.title);
    assert.equal(card.params.day, undefined);
    assert.equal(card.ready, true);
    assert.equal(card.width, 1080);
    assert.equal(card.height, card.params.format === 'post' ? 1350 : 1920);
  }
});

test('the builder round picker lists every bracket round and the results toggle only hides results', () => {
  const single = { settings: { brackets: [{ id: 'single', name: 'Single Elimination', rounds: [{ id: 'opening', name: 'Opening Round' }, { id: 'qualifying', name: 'Top 4 qualifying matches' }] }] } };
  assert.deepEqual(roundOptions(single), [{ value: 'opening', label: 'Opening Round' }, { value: 'qualifying', label: 'Top 4 qualifying matches' }]);
  const two = { settings: { brackets: [{ id: 'a', name: 'First', rounds: [{ id: 'r1', name: 'Round one' }] }, { id: 'b', name: 'Second', rounds: [{ id: 'r2', name: 'Round two' }] }] } };
  assert.deepEqual(roundOptions(two).map((option) => option.group), ['First', 'Second']);
  assert.deepEqual(roundOptions({ settings: { brackets: [] } }), []);

  assert.deepEqual(socialScheduleParams({ round: 'qualifying', day: 'today', results: true }), { round: 'qualifying' });
  assert.deepEqual(socialScheduleParams({ day: 'tomorrow', page: 2, results: true }), { day: 'tomorrow', page: 2 });
  assert.deepEqual(socialScheduleParams({ day: 'date', date: '2026-11-06', today: '2026-01-01', results: true }), { day: '2026-11-06' });
  assert.deepEqual(socialScheduleParams({ day: 'today', results: false }), { day: 'today', results: '0' });
});

test('bracket-round match-day cards are not filed under today in the dashboard', () => {
  const round = { key: 'round', scene: 'social-schedule', params: { round: 'opening', format: 'story' }, title: 'Social · Day schedule · Opening Round · Story' };
  const day = { key: 'day', scene: 'social-schedule', params: { day: 'today' }, title: 'Today' };
  const organized = organizeGraphics([round, day], { today: '2026-11-02', nextMatch: null, matches: [], features: [] });
  assert.deepEqual([organized.find((card) => card.key === 'round').period, organized.find((card) => card.key === 'round').date], ['general', null]);
  assert.equal(organized.find((card) => card.key === 'day').period, 'today');
});
