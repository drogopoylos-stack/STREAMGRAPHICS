// Review 2: server side of the create-tournament wizard.
// Isolated server on its own port and temp data dir (never touches port 4610).
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 4633;
const folder = path.resolve('jobs/review2/test-data');
const output = path.resolve('jobs/review2/test-out');
const base = `http://127.0.0.1:${PORT}`;
let child;
let logs = '';
let A; // tournament used by the upload probes

const json = async (url, method = 'GET', body) => {
  const r = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
};
const upload = async (url, buffer, filename, type = 'application/octet-stream') => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), filename);
  const r = await fetch(base + url, { method: 'POST', body: form });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
};
const config = (over = {}) => ({
  name: 'Review2 Cup', short: 'R2', season: '', theme: 'aegean',
  teams: Array.from({ length: 4 }, (_, i) => ({ key: `k${i}`, name: `Team ${i}`, tag: `T${i}` })),
  seeds: ['k0', 'k1', 'k2', 'k3'], format: 'single-elimination',
  options: { bestOf: 3 }, schedule: null, ...over,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'db.json'), JSON.stringify({
    settings: { leagueName: 'Review2 League' }, teams: [], players: [], matches: [],
    live: { visible: true, scene: 'schedule', params: {}, rev: 1 },
  }));
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, HLL_DATA_DIR: folder, HLL_OUTPUT_DIR: output, PORT: String(PORT), HLL_TEST: '1' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/state')).ok) break; } catch { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs}`);
    await sleep(50);
  }
  const created = await json('/api/tournaments/wizard', 'POST', config());
  assert.equal(created.status, 200, JSON.stringify(created.data));
  A = created.data;
});

after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
});

// ---------------------------------------------------------------- regressions

test('review2: wizard stores broadcast days as 1=Mon..7=Sun after the engine conversion', async () => {
  const created = await json('/api/tournaments/wizard', 'POST', config({
    name: 'Review2 Sunday', schedule: { startDate: '2026-12-04', weekdays: [5, 6, 0], times: ['18:00'], perDay: 1 },
  }));
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const row = (await json('/api/tournaments')).data.tournaments.find((t) => t.id === created.data.tournament.id);
  assert.deepEqual(row.broadcastDays, [5, 6, 7]);
});

test('review2: deletion is blocked for the active tournament and backs up the rest', async () => {
  const state = (await json('/api/state')).data;
  const active = await json(`/api/tournaments/${state.activeTournamentId}`, 'DELETE', { confirm: 'Review2 League' });
  assert.equal(active.status, 409);

  const created = await json('/api/tournaments/wizard', 'POST', config({ name: 'Review2 Delete' }));
  const id = created.data.tournament.id;
  assert.equal((await json(`/api/tournaments/${id}`, 'DELETE', { confirm: 'wrong' })).status, 400);
  assert.equal((await json(`/api/tournaments/${id}`, 'DELETE', { confirm: 'Review2 Delete' })).status, 200);
  assert.ok(fs.readdirSync(path.join(folder, 'backups')).some((f) => f.startsWith(id)));
});

test('review2: regeneration is refused once a generated match has a score', async () => {
  const home = (await json('/api/state')).data.activeTournamentId;
  const created = await json('/api/tournaments/wizard', 'POST', config({ name: 'Review2 Regen' }));
  const id = created.data.tournament.id;
  const data = (await json(`/api/tournaments/${id}/wizard`)).data;
  const match = data.matches.find((m) => m.bracketCode);
  assert.equal((await json(`/api/tournaments/${id}/activate`, 'POST')).status, 200);
  assert.equal((await json(`/api/matches/${match.id}`, 'PUT', { scoreA: 2, scoreB: 0, status: 'done' })).status, 200);
  assert.equal((await json(`/api/tournaments/${id}/wizard`, 'PUT', {})).status, 409);
  const row = (await json('/api/tournaments')).data.tournaments.find((t) => t.id === id);
  assert.equal(row.canRegenerate, false);
  await json(`/api/tournaments/${home}/activate`, 'POST');
});

test('review2: an invalid wizard body is rejected without writing the database', async () => {
  const before = fs.readFileSync(path.join(folder, 'db.json'), 'utf8');
  const bad = await json('/api/tournaments/wizard', 'POST', { ...config(), seeds: ['k0', 'k0', 'k2', 'k3'] });
  assert.equal(bad.status, 400);
  assert.equal(fs.readFileSync(path.join(folder, 'db.json'), 'utf8'), before);
});

// ---------------------------------------------------------------- defects

test('review2: a non-image logo upload is rejected with 400, not 500', async () => {
  const teamId = A.teamIds.k0;
  const team = await upload(`/api/tournaments/${A.tournament.id}/teams/${teamId}/logo`, Buffer.from('this is not an image'), 'evil.txt', 'text/plain');
  assert.equal(team.status, 400, `team logo: ${team.status} ${JSON.stringify(team.data)}`);
  const brand = await upload(`/api/tournaments/${A.tournament.id}/brand/league-logo`, Buffer.from('this is not an image'), 'evil.txt', 'text/plain');
  assert.equal(brand.status, 400, `brand logo: ${brand.status} ${JSON.stringify(brand.data)}`);
});

test('review2: a raw upload cannot be served back as a same-origin HTML document', async () => {
  const teamId = A.teamIds.k1;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/><script>document.title="pwned"</script></svg>';
  const up = await upload(`/api/tournaments/${A.tournament.id}/teams/${teamId}/logo`, Buffer.from(svg), 'evil.html', 'image/svg+xml');
  assert.equal(up.status, 200);
  const raw = await fetch(`${base}/raw/teams/${teamId}.html`);
  assert.notEqual(raw.status, 200, 'GET /raw/teams/<id>.html must not serve the upload');
});

test('review2: a later logo upload removes the previous raw file', async () => {
  const teamId = A.teamIds.k2;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/><script>document.title="pwned"</script></svg>';
  assert.equal((await upload(`/api/tournaments/${A.tournament.id}/teams/${teamId}/logo`, Buffer.from(svg), 'evil.html', 'image/svg+xml')).status, 200);
  assert.equal((await upload(`/api/tournaments/${A.tournament.id}/teams/${teamId}/logo`, Buffer.from(svg), 'clean.png', 'image/svg+xml')).status, 200);
  assert.ok(!fs.existsSync(path.join(folder, 'raw', 'teams', `${teamId}.html`)), 'the .html raw file must be gone after the second upload');
});

test('review2: the stateless preview endpoint validates a missing body', async () => {
  const r = await fetch(base + '/api/formats/preview', { method: 'POST' });
  assert.equal(r.status, 400, `missing body answered ${r.status}`);
});
