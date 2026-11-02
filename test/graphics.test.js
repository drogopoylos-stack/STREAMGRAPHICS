import test from 'node:test';
import assert from 'node:assert/strict';
import { graphicCatalog, newGraphic } from '../server/graphics.js';
import { sceneData } from '../server/scenes.js';
import { SCENE_IDS, dimensionsFor } from '../public/shared/scenes.js';
import { SCENES as RENDERERS } from '../public/overlay/js/render.js';

function fixture() {
  return { settings: { leagueName: 'Test League', leagueShort: 'TEST', season: 'Autumn', timezone: 'UTC', mode: 'full', theme: { bgImage: '/media/default.png', socialBgImage: '/media/social.png' }, sponsorsOnGraphics: true, statDefs: [], bracketEmbed: '' },
    teams: [{ id: 'a', name: 'Alpha', tag: 'ALP' }, { id: 'b', name: 'Beta', tag: 'BET' }],
    players: [{ id: 'pa', nick: 'Alpha player', teamId: 'a', photo: '/media/pa.png', role: 'Mid' }, { id: 'pb', nick: 'Beta player', teamId: 'b', photo: '/media/pb.png', role: 'Mid' }, { id: 'hidden', nick: 'Hidden', teamId: 'a', hidden: true }],
    matches: Array.from({ length: 7 }, (_, index) => ({ id: `m${index}`, date: '2026-11-02', time: `1${index}:00`, teamA: 'a', teamB: 'b', status: 'scheduled', bestOf: 1 })),
    features: [{ id: 'f1', playerA: 'pa', playerB: 'pb', title: 'Mid lane matchup' }], sponsors: [], graphics: [], backgrounds: [{ id: 'bg1', url: '/media/one-off.png' }] };
}

test('every registered screen has a renderer and the correct export dimensions', () => {
  assert.deepEqual([...SCENE_IDS].sort(), Object.keys(RENDERERS).sort());
  assert.deepEqual(dimensionsFor('schedule'), { width: 1920, height: 1080 });
  assert.deepEqual(dimensionsFor('social-schedule'), { width: 1080, height: 1920 });
  assert.deepEqual(dimensionsFor('social-versus'), { width: 1080, height: 1920 });
});

test('dashboard includes every match, roster, saved matchup and paginated social schedule', () => {
  const cards = graphicCatalog(fixture(), '2026-11-02');
  assert.ok(cards.some(card => card.scene === 'schedule' && card.params.day === 'today'));
  assert.ok(cards.some(card => card.scene === 'schedule' && card.params.day === 'tomorrow'));
  assert.equal(cards.filter(card => card.scene === 'versus' && card.params.match).length, 7);
  assert.equal(cards.filter(card => card.scene === 'roster').length, 2);
  assert.equal(cards.filter(card => card.scene === 'matchup').length, 1);
  assert.equal(cards.filter(card => card.scene === 'social-schedule' && card.params.day === 'today').length, 2);
  assert.equal(cards.find(card => card.scene === 'bracket').ready, false);
  assert.equal(new Set(cards.map(card => card.key)).size, cards.length);
});

test('vertical schedules retain every match across bounded pages', () => {
  const db = fixture();
  const first = sceneData('social-schedule', { day: '2026-11-02', page: 1 }, db);
  const second = sceneData('social-schedule', { day: '2026-11-02', page: 2 }, db);
  assert.equal(first.matches.length, 6);
  assert.equal(second.matches.length, 1);
  assert.deepEqual(first.pagination, { page: 1, pages: 2, total: 7 });
  assert.equal(new Set([...first.matches, ...second.matches].map(match => match.id)).size, 7);
  assert.equal(sceneData('social-schedule', { day: '2026-11-02', page: 999 }, db).pagination.page, 2);
});

test('match posters select a player from each team and reject incorrect player assignments', () => {
  const db = fixture();
  const data = sceneData('social-versus', { match: 'm0' }, db);
  assert.equal(data.playerA.id, 'pa');
  assert.equal(data.playerB.id, 'pb');
  assert.equal(data.effect, 'halftone');
  assert.equal(sceneData('social-versus', { match: 'm0', effect: 'prism' }, db).effect, 'prism');
  assert.throws(() => sceneData('social-versus', { match: 'm0', playerA: 'pb' }, db), /matching team/);
  assert.throws(() => sceneData('social-versus', { match: 'm0', playerA: 'hidden' }, db), /matching team/);
  assert.throws(() => sceneData('social-versus', { match: 'missing' }, db), /match not found/);
});

test('per-graphic backgrounds override defaults without mutating tournament branding', () => {
  const db = fixture();
  const original = structuredClone(db.settings.theme);
  const custom = sceneData('schedule', { background: 'bg1' }, db);
  assert.equal(custom.theme.bgImage, '/media/one-off.png');
  assert.equal(custom.theme.versusBgImage, '/media/one-off.png');
  assert.equal(custom.theme.socialBgImage, '/media/one-off.png');
  assert.deepEqual(db.settings.theme, original);
  assert.equal(sceneData('social-schedule', { background: 'preset' }, db).theme.socialBgImage, null);
  assert.throws(() => sceneData('schedule', { background: 'other-tournament' }, db), /not found/);
});

test('saved graphics preserve choices and remain marked unavailable when their source disappears', () => {
  const db = fixture();
  const graphic = newGraphic({ name: 'Match poster', scene: 'social-versus', params: { match: 'm0', playerA: 'pa', playerB: 'pb', effect: 'prism', background: 'bg1' } }, db);
  db.graphics.push(graphic);
  let card = graphicCatalog(db).find(card => card.savedId === graphic.id);
  assert.equal(card.group, 'saved');
  assert.equal(card.ready, true);
  assert.equal(card.params.effect, 'prism');
  db.matches = [];
  card = graphicCatalog(db).find(card => card.savedId === graphic.id);
  assert.equal(card.ready, false);
  assert.throws(() => newGraphic({ name: '', scene: 'schedule' }, db), /name/);
  assert.throws(() => newGraphic({ name: 'Bad', scene: 'missing' }, db), /Unknown/);
});
