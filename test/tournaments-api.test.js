import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('tournament HTTP workflow preserves HLL and isolates the second tournament', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-tournament-api-'));
  const hllOutput = path.join(folder, 'hll-output');
  fs.mkdirSync(hllOutput);
  fs.writeFileSync(path.join(hllOutput, 'hll.png'), 'hll-export');
  fs.writeFileSync(path.join(folder, 'db.json'), JSON.stringify({ settings: { leagueName: 'HLL', leagueShort: 'HLL', outputDir: hllOutput, photo: { strength: 0.7 } }, teams: [{ id: 'legacy-hll-team', name: 'HLL team' }], players: [{ id: 'legacy-hll-player', nick: 'HLL player', photo: '/media/players/original.png', photoRaw: 'G:/original.png' }], matches: [], live: { scene: 'schedule', visible: true, params: {}, rev: 41 } }));
  const config = path.join(ROOT, 'data', 'photocraft.json');
  if (fs.existsSync(config)) fs.copyFileSync(config, path.join(folder, 'photocraft.json'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HLL_DATA_DIR: folder, HLL_OUTPUT_DIR: path.join(folder, 'output'), HLL_TEST: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('hll-tournament-api-'));
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(`${base}/api/state`); if (response.ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await delay(50);
  }
  assert.ok(ready, logs);
  const request = async (url, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  let cup;
  let hllLogo;
  let cupBackground;

  await t.test('old data is preserved and creation does not switch the current broadcast', async () => {
    const initial = (await request('/api/state')).data;
    assert.equal(initial.activeTournamentId, 'tr_hll');
    assert.equal(initial.players[0].photoRaw, 'G:/original.png');
    assert.equal(initial.live.visible, true);
    const created = await request('/api/tournaments', 'POST', { name: 'Weekend Cup', short: 'CUP', broadcastDays: [6, 7] });
    assert.equal(created.status, 200);
    cup = created.data;
    const state = (await request('/api/state')).data;
    assert.equal(state.activeTournamentId, 'tr_hll');
    assert.equal(state.tournaments.length, 2);
    assert.equal(state.teams.length, 1);
  });

  await t.test('PhotoCraft is discoverable and per-player processor selection is saved', async () => {
    const capability = (await request('/api/photocraft/status')).data;
    assert.equal(typeof capability.available, 'boolean');
    const updated = await request('/api/players/legacy-hll-player', 'PUT', { photoProcessor: capability.available ? 'photocraft' : 'standard' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.photoProcessor, capability.available ? 'photocraft' : 'standard');
    assert.equal((await request('/api/settings', 'PUT', { photo: { engine: 'unknown' } })).status, 400);
    assert.equal((await request('/api/players/legacy-hll-player', 'PUT', { photoProcessor: 'unknown' })).status, 400);
  });

  const uploadLogo = async content => {
    const body = new FormData();
    body.append('slot', 'league-logo');
    body.append('file', new Blob([content], { type: 'image/svg+xml' }), 'logo.svg');
    return request('/api/brand/upload', 'POST', body);
  };

  await t.test('switch takes graphics off air and the live stream updates', async () => {
    const uploaded = await uploadLogo('<svg xmlns="http://www.w3.org/2000/svg"><title>HLL</title></svg>');
    hllLogo = uploaded.data.leagueLogo;
    const controller = new AbortController();
    const stream = await fetch(base + '/api/live/stream', { signal: controller.signal });
    const reader = stream.body.getReader();
    await reader.read();
    try {
      assert.equal((await request(`/api/tournaments/${cup.id}/activate`, 'POST')).status, 200);
      const next = await reader.read();
      assert.match(new TextDecoder().decode(next.value), /"visible":false/);
    } finally { controller.abort(); }
    const state = (await request('/api/state')).data;
    assert.equal(state.activeTournamentId, cup.id);
    assert.equal(state.players.length, 0);
    assert.equal(state.live.visible, false);
    assert.ok(state.live.rev > 41);
    assert.equal((await request('/api/scene-data?scene=schedule')).data.league.name, 'Weekend Cup');
    assert.equal((await request('/api/hllgr/sync', 'POST')).status, 400);
  });

  await t.test('stale operator forms cannot modify the newly active tournament', async () => {
    const stale = await request('/api/teams', 'POST', { name: 'Wrong tournament' }, { 'X-Tournament-Id': 'tr_hll' });
    assert.equal(stale.status, 409);
    const good = await request('/api/teams', 'POST', { name: 'Cup team', tag: 'CUP' }, { 'X-Tournament-Id': cup.id });
    assert.equal(good.status, 200);
    assert.equal((await request('/api/state')).data.teams.length, 1);
    assert.equal((await request('/api/teams/legacy-hll-team', 'PUT', { name: 'Should not change' })).status, 404);
  });

  await t.test('branding uploads and output folders stay separate', async () => {
    const uploaded = await uploadLogo('<svg xmlns="http://www.w3.org/2000/svg"><title>Cup</title></svg>');
    assert.notEqual(uploaded.data.leagueLogo, hllLogo);
    const original = await (await fetch(base + hllLogo)).text();
    assert.match(original, /HLL/);
    await request('/api/settings', 'PUT', { photo: { strength: 0.2 }, theme: { bgImage: '/media/cup-bg.png' } });
    const state = (await request('/api/state')).data;
    assert.notEqual(state.settings.outputDir, hllOutput);
    fs.mkdirSync(state.settings.outputDir, { recursive: true });
    fs.writeFileSync(path.join(state.settings.outputDir, 'cup.png'), 'cup-export');
    assert.deepEqual((await request('/api/output')).data.map(file => file.name), ['cup.png']);
    assert.equal((await fetch(base + '/output/hll.png')).status, 404);
  });

  await t.test('switching waits for a multipart upload that is still arriving', async () => {
    const pending = http.request(base + '/api/assets/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=hll-test-boundary', 'X-Tournament-Id': cup.id } });
    pending.on('error', () => {});
    pending.write('--hll-test-boundary\r\nContent-Disposition: form-data; name="file"; filename="pending.png"\r\nContent-Type: image/png\r\n\r\n');
    await delay(80);
    const blocked = await request('/api/tournaments/tr_hll/activate', 'POST');
    assert.equal(blocked.status, 409);
    pending.destroy();
    await delay(80);
  });

  await t.test('Master URL serves all scenes and saved graphic/background choices stay tournament-scoped', async () => {
    const master = await fetch(base + '/overlay/master.html');
    assert.equal(master.status, 200);
    assert.match(await master.text(), /js\/live-page.js/);
    assert.equal((await fetch(base + '/shared/scenes.js')).status, 200);
    const backgroundBody = new FormData();
    backgroundBody.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="navy"/></svg>'], { type: 'image/svg+xml' }), 'backdrop.svg');
    const uploaded = await request('/api/backgrounds', 'POST', backgroundBody);
    assert.equal(uploaded.status, 200);
    cupBackground = uploaded.data;
    assert.equal(cupBackground.width, 20);
    assert.ok(cupBackground.url.includes(cup.id));
    const saved = await request('/api/graphics', 'POST', { name: 'Cup schedule', scene: 'social-schedule', params: { day: 'today', background: cupBackground.id } });
    assert.equal(saved.status, 200);
    const state = (await request('/api/state')).data;
    assert.equal(state.graphics.length, 1);
    assert.ok(state.screenCatalog.some(card => card.savedId === saved.data.id && card.width === 1080 && card.height === 1920));
    const take = await request('/api/live', 'POST', { scene: saved.data.scene, params: saved.data.params, visible: true });
    assert.equal(take.status, 200);
    assert.equal(take.data.scene, 'social-schedule');
    const scene = (await request(`/api/scene-data?scene=social-schedule&background=${cupBackground.id}`)).data;
    assert.equal(scene.theme.socialBgImage, cupBackground.url);
    const invalid = new FormData();
    invalid.append('file', new Blob(['not an image']), 'bad.png');
    assert.equal((await request('/api/backgrounds', 'POST', invalid)).status, 400);
    assert.equal((await request('/api/graphics', 'POST', { name: 'Unknown', scene: 'no-such-scene' })).status, 400);
  });

  await t.test('returning to HLL restores its original roster, settings, logo and exports', async () => {
    assert.equal((await request('/api/tournaments/tr_hll/activate', 'POST')).status, 200);
    const state = (await request('/api/state')).data;
    assert.equal(state.players.length, 1);
    assert.equal(state.teams[0].id, 'legacy-hll-team');
    assert.equal(state.settings.photo.strength, 0.7);
    assert.equal(state.settings.leagueLogo, hllLogo);
    assert.equal(state.live.visible, false);
    assert.deepEqual(state.graphics, []);
    assert.deepEqual(state.backgrounds, []);
    assert.equal((await request(`/api/scene-data?scene=schedule&background=${cupBackground.id}`)).status, 404);
    assert.deepEqual((await request('/api/output')).data.map(file => file.name), ['hll.png']);
    assert.equal((await fetch(base + '/output/cup.png')).status, 404);
    const saved = JSON.parse(fs.readFileSync(path.join(folder, 'db.json')));
    assert.equal(saved.activeTournamentId, 'tr_hll');
    assert.equal(saved.tournaments.find(tournament => tournament.id === cup.id).data.settings.photo.strength, 0.2);
  });
});
