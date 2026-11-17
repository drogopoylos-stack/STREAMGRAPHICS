import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createStore } from '../server/db.js';
import { merge3, mergeRoot, publishedRoot, usedAssets, parseFeedLink, createFeedClient, createFeedPublisher } from '../server/feed.js';
import { roleAllows, createAccessMiddleware } from '../server/remote-access.js';
import { videoSeconds } from '../server/video.js';
import worker from '../cloud/worker/src/index.js';

const tournament = (id, data = {}) => ({ id, createdAt: '2026-11-01T00:00:00.000Z', broadcastDays: [], data: {
  settings: { leagueName: id, socialStyle: 'classic', theme: { accent: '#c8102e', socialBgPost: null }, outputDir: `C:/broadcaster/${id}`, drive: { apiKey: 'SECRET', folderUrl: 'https://drive.google.com/drive/folders/x' }, hllgr: { cookie: 'COOKIE' }, photo: { engine: 'photocraft' } },
  teams: [{ id: 't1', name: 'Team One', tag: 'ONE', logo: '/media/teams/t1.png', logoRaw: 'C:/broadcaster/raw/t1.png' }],
  players: [{ id: 'p0', teamId: 't1', nick: 'Zero', photoProcessor: 'photocraft' }], matches: [{ id: 'm1', teamA: 't1', teamB: null, scoreA: null }], sponsors: [], features: [],
  live: { scene: 'versus', visible: true, rev: 4 }, unmatched: ['x.png'], backgrounds: [], graphics: [], rev: 3, ...data,
} });
const root = (...tournaments) => ({ schemaVersion: 2, activeTournamentId: tournaments[0].id, revision: 10, tournaments });

test('merge3: an unchanged side follows the other side; a conflict follows the preference', () => {
  assert.equal(merge3('a', 'a', 'b', true), 'b');
  assert.equal(merge3('a', 'x', 'a', false), 'x');
  assert.equal(merge3('a', 'x', 'b', true), 'x');
  assert.equal(merge3('a', 'x', 'b', false), 'b');
  assert.deepEqual(merge3({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }, false), { a: 2, b: 3 });
  const base = [{ id: 'g1', n: 1 }, { id: 'g2', n: 1 }];
  const local = [{ id: 'g1', n: 2 }, { id: 'mine', n: 1 }];
  const remote = [{ id: 'g1', n: 1 }, { id: 'g2', n: 1 }, { id: 'new', n: 1 }];
  assert.deepEqual(merge3(base, local, remote, true), [{ id: 'g1', n: 2 }, { id: 'new', n: 1 }, { id: 'mine', n: 1 }]);
});

test('the published copy: chosen tournaments, no secrets, PC paths, on-air state or PhotoCraft', () => {
  const out = publishedRoot(root(tournament('tr_a'), tournament('tr_b')), ['tr_b']);
  assert.deepEqual(out.tournaments.map(t => t.id), ['tr_b']);
  assert.equal(out.activeTournamentId, 'tr_b');
  const data = out.tournaments[0].data;
  assert.equal(data.settings.drive.apiKey, '');
  assert.equal(data.settings.drive.folderUrl, 'https://drive.google.com/drive/folders/x', 'the Drive folder link goes with the copy');
  assert.equal(data.settings.hllgr.cookie, '');
  assert.equal(data.settings.outputDir, undefined);
  assert.equal(data.settings.photo.engine, 'standard');
  assert.equal(data.players[0].photoProcessor, 'inherit');
  assert.equal(data.teams[0].logoRaw, undefined);
  assert.equal(data.live, undefined);
  assert.deepEqual(data.unmatched, []);
});

test('first update takes the copy; an empty local tournament goes away', () => {
  const local = root(tournament('tr_hll', { teams: [], matches: [] }));
  const remote = publishedRoot(root(tournament('tr_a'), tournament('tr_hll')));
  const merged = mergeRoot(null, local, remote);
  assert.deepEqual(merged.tournaments.map(t => t.id), ['tr_a', 'tr_hll']);
  assert.equal(merged.activeTournamentId, 'tr_a');
  assert.equal(merged.tournaments[1].data.teams[0].name, 'Team One');
});

test('later updates keep the social work and take the broadcaster data', () => {
  const base = publishedRoot(root(tournament('tr_a')));
  const local = structuredClone(base);
  const l = local.tournaments[0].data;
  l.settings.graphicDesign = { config: { layouts: { 'social-versus': { title: { x: 10 } } } }, revision: 1 };
  l.settings.socialStyle = 'supercup';
  l.settings.matchSheet = { enabled: true, url: 'https://docs.google.com/spreadsheets/d/mine/edit' };
  l.graphics = [{ id: 'g_mine', scene: 'social-versus', params: { match: 'm1' } }];
  l.teams[0].name = 'Typo fix';
  const remote = structuredClone(base);
  const r = remote.tournaments[0].data;
  r.settings.socialStyle = 'classic';
  r.settings.theme.accent = '#00ff00';
  r.settings.matchSheet = { enabled: false, url: '' };
  r.matches[0].scoreA = 2;
  r.teams[0].name = 'Team One Renamed';
  r.players.push({ id: 'p1', teamId: 't1', nick: 'New' });
  remote.tournaments.push(tournament('tr_new'));
  const merged = mergeRoot(base, local, remote);
  const m = merged.tournaments[0].data;
  assert.deepEqual(m.settings.graphicDesign, l.settings.graphicDesign, 'designer changes stay');
  assert.equal(m.settings.socialStyle, 'supercup', 'a social setting changed here stays');
  assert.equal(m.settings.theme.accent, '#00ff00', 'an untouched setting follows the broadcaster');
  assert.equal(m.settings.matchSheet.enabled, true, 'the match source of this PC stays');
  assert.deepEqual(m.graphics.map(g => g.id), ['g_mine'], 'saved graphics of this PC stay');
  assert.equal(m.matches[0].scoreA, 2, 'results arrive');
  assert.equal(m.teams[0].name, 'Team One Renamed', 'the broadcaster wins a conflict in team data');
  assert.equal(m.players.length, 2);
  assert.deepEqual(merged.tournaments.map(t => t.id), ['tr_a', 'tr_new']);
  // A copy without a tournament: the social PC keeps it.
  const after = mergeRoot(remote, merged, { ...remote, tournaments: [remote.tournaments[0]] });
  assert.deepEqual(after.tournaments.map(t => t.id), ['tr_a', 'tr_new']);
});

test('the Social PC key opens nothing on the broadcaster PC; copy management is local only', () => {
  for (const [method, p] of [['GET', '/api/feed/publish'], ['GET', '/media/players/p1.png'], ['GET', '/api/state'], ['GET', '/control/']]) {
    assert.equal(roleAllows('feed', method, p), false, `${method} ${p}`);
  }
  for (const role of ['full', 'social', 'overlay']) {
    assert.equal(roleAllows(role, 'PUT', '/api/feed/client'), false);
    assert.equal(roleAllows(role, 'POST', '/api/feed/publish'), false);
  }
  const res = { statusCode: 200, set() { return this; }, status(c) { this.statusCode = c; return this; }, json() { return this; }, locals: {} };
  let passed = false;
  createAccessMiddleware(() => ({ full: 'F' }))({ originalUrl: '/api/feed/publish', method: 'POST', headers: { 'x-hll-via': 'worker', cookie: 'hll_key=F' } }, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 403);
});

test('Social PC links: https, /__hll/feed and a key', () => {
  assert.deepEqual(parseFeedLink(' https://x.workers.dev/__hll/feed?key=abc '), { origin: 'https://x.workers.dev', key: 'abc' });
  assert.throws(() => parseFeedLink('https://x.workers.dev/control/?key=a'), /not a Social PC link/);
  assert.throws(() => parseFeedLink('http://x.workers.dev/__hll/feed?key=a'), /not a Social PC link/);
  assert.throws(() => parseFeedLink('nonsense'), /complete Social PC link/);
});

test('video length: automatic from the animation, or a chosen length', () => {
  assert.equal(videoSeconds('auto', 0), 4);
  assert.equal(videoSeconds('auto', 2400), 6);
  assert.equal(videoSeconds('auto', 60_000), 15);
  assert.equal(videoSeconds('8', 0), 8);
  assert.throws(() => videoSeconds('99', 0), /2 to 30/);
});

/** The real Worker code with an in-memory KV, behind a fetch function. */
function fakeCloud(secret) {
  const kv = new Map();
  const HLL = {
    async get(key, opts) { const v = kv.get(key); return v === undefined ? null : opts?.type === 'json' ? JSON.parse(v.value) : v.value; },
    async getWithMetadata(key) { const v = kv.get(key); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }; },
    async put(key, value, opts) { kv.set(key, { value, metadata: opts?.metadata }); },
    async delete(key) { kv.delete(key); },
    async list({ prefix }) { return { keys: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
  const env = { HLL, PUBLISH_SECRET: secret };
  const fetcher = async (url, init = {}) => worker.fetch(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env);
  return { kv, fetcher };
}

test('publish to the online address, then the social PC gets the copy with the broadcaster PC off', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-feed-test-'));
  try {
    const pubData = path.join(folder, 'pub'), subData = path.join(folder, 'sub');
    fs.mkdirSync(path.join(pubData, 'assets', 'teams'), { recursive: true });
    fs.writeFileSync(path.join(pubData, 'assets', 'teams', 't1.png'), 'PNG-1');
    fs.writeFileSync(path.join(pubData, 'assets', 'unused.png'), 'NOT USED');
    fs.writeFileSync(path.join(pubData, 'db.json'), JSON.stringify(root(tournament('tr_a'), tournament('tr_private'))));
    const pub = createStore({ file: path.join(pubData, 'db.json'), outputRoot: path.join(folder, 'out1') });
    pub.load();
    assert.deepEqual(usedAssets(publishedRoot(pub.rootSnapshot()), path.join(pubData, 'assets')), ['teams/t1.png']);

    const cloud = fakeCloud('SECRET');
    const cloudConfig = () => ({ workerUrl: 'https://cloud.test', publishSecret: 'SECRET', feedKey: 'FEEDKEY' });
    const publisher = createFeedPublisher({ store: pub, cloudConfig, dataDir: pubData, assetsDir: path.join(pubData, 'assets'), fetcher: cloud.fetcher });
    const first = await publisher.publish(['tr_a']);
    assert.deepEqual(first, { tournaments: 1, files: 1, uploaded: 1 });
    assert.equal(publisher.state().link, 'https://cloud.test/__hll/feed?key=FEEDKEY');

    // A wrong key and a publish without the secret are refused by the online address.
    assert.equal((await cloud.fetcher('https://cloud.test/__hll/feed', { headers: { authorization: 'Bearer WRONG' } })).status, 401);
    assert.equal((await cloud.fetcher('https://cloud.test/__hll/feed/manifest', { method: 'PUT', body: '{}' })).status, 403);

    const sub = createStore({ file: path.join(subData, 'db.json'), outputRoot: path.join(folder, 'out2') });
    sub.load();
    let imported = 0;
    const client = createFeedClient({ store: sub, dataDir: subData, assetsDir: path.join(subData, 'assets'), fetcher: cloud.fetcher, onImported: () => imported++ });
    assert.throws(() => client.connect('https://cloud.test/control/?key=a'), /not a Social PC link/);
    assert.equal(client.connect('https://cloud.test/__hll/feed?key=FEEDKEY').status, 'updating');
    let state = await client.updateAndWait();
    assert.equal(state.status, 'ok', state.message);
    assert.equal(imported, 1);
    assert.equal(fs.readFileSync(path.join(subData, 'assets', 'teams', 't1.png'), 'utf8'), 'PNG-1');
    assert.deepEqual(sub.tournaments().map(t => t.id), ['tr_a'], 'only the chosen tournament');
    assert.ok(fs.readdirSync(path.join(subData, 'backups')).some(f => f.startsWith('before-feed-')));

    // No automatic updates: a new copy arrives only with Get updates.
    sub.get().settings.socialStyle = 'supercup'; sub.changed();
    pub.get().matches[0].scoreA = 3; pub.get().teams[0].name = 'Renamed'; pub.changed();
    fs.writeFileSync(path.join(pubData, 'assets', 'teams', 't1.png'), 'PNG-2');
    const second = await publisher.publish(['tr_a']);
    assert.equal(second.uploaded, 1, 'only the changed image is uploaded');
    assert.equal(sub.get().matches[0].scoreA, null);
    state = await client.updateAndWait();
    assert.equal(state.status, 'ok', state.message);
    assert.equal(sub.get().matches[0].scoreA, 3);
    assert.equal(sub.get().teams[0].name, 'Renamed');
    assert.equal(sub.get().settings.socialStyle, 'supercup', 'the social change stays');
    assert.equal(fs.readFileSync(path.join(subData, 'assets', 'teams', 't1.png'), 'utf8'), 'PNG-2');
    assert.equal([...cloud.kv.keys()].filter(k => k.startsWith('feed:file:')).length, 1, 'the old image is removed online');

    // A new Social PC key: the old link stops at once.
    const rotated = createFeedPublisher({ store: pub, cloudConfig: () => ({ ...cloudConfig(), feedKey: 'NEWKEY' }), dataDir: pubData, assetsDir: path.join(pubData, 'assets'), fetcher: cloud.fetcher });
    await rotated.publishKey();
    state = await client.updateAndWait();
    assert.equal(state.status, 'error');
    assert.match(state.message, /does not work any more/);
    assert.equal(sub.get().teams[0].name, 'Renamed', 'the copy stays');

    // A damaged file list cannot write outside the media folder.
    const sha = createHash('sha256').update('x').digest('hex');
    const evil = { feed: 2, publishedAt: 'z', root: publishedRoot(pub.rootSnapshot(), ['tr_a']), files: [{ p: '../evil.js', h: sha, s: 1 }] };
    const bad = createFeedClient({ store: sub, dataDir: subData, assetsDir: path.join(subData, 'assets'), fetcher: async url => url.endsWith('/__hll/feed') ? Response.json(evil) : new Response('x') });
    bad.connect('https://cloud.test/__hll/feed?key=K');
    state = await bad.updateAndWait();
    assert.equal(state.status, 'error');
    assert.equal(fs.existsSync(path.join(subData, 'evil.js')), false);
    assert.equal(client.disconnect().connected, false);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
