import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createAccessMiddleware, resolveRole, roleAllows } from '../server/remote-access.js';
import { createRemoteManager } from '../server/remote.js';

const keys = { full: 'full-key', social: 'social-key', overlay: 'overlay-key' };
function request(url, { method = 'GET', headers = { 'x-hll-via': 'worker' }, body } = {}) {
  const req = { originalUrl: url, method, headers, body };
  const res = { locals: {}, statusCode: 200, headers: {}, cookies: [],
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; }, type() { return this; },
    json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; },
    cookie(...args) { this.cookies.push(args); }, redirect(code, url) { this.statusCode = code; this.location = url; } };
  let passed = false;
  createAccessMiddleware(() => keys)(req, res, () => { passed = true; });
  return { req, res, passed };
}

test('role resolution accepts only a current nonempty role key', () => {
  for (const role of Object.keys(keys)) assert.equal(resolveRole(keys[role], keys), role);
  for (const key of [undefined, '', 'invalid', ['full-key'], 'toString']) assert.equal(resolveRole(key, keys), null);
  assert.equal(resolveRole('anything'), null);
});

test('local and LAN requests require no key and retain the full edition', () => {
  const result = request('/api/remote', { headers: {} });
  assert.equal(result.passed, true);
  assert.deepEqual(result.req.access, { remote: false, role: 'local', edition: 'full' });
});

test('each proxy marker requires a key, even with an empty header value', () => {
  for (const name of ['x-hll-via', 'cf-ray', 'cf-connecting-ip']) {
    const { res } = request('/control/', { headers: { [name]: '' } });
    assert.equal(res.statusCode, 401);
    assert.match(res.body, /Ask the broadcaster for a new link/);
  }
});

test('query keys set a secure year-long cookie and redirect preserving other parameters', () => {
  const { res, req } = request('/control/?key=full-key&edition=social&key=invalid&other=1');
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, '/control/?edition=social&other=1');
  assert.deepEqual(res.cookies[0], ['hll_key', 'full-key', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000,
  }]);
  assert.equal(req.access.role, 'full');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('cookies authorize later requests and social keys select the social edition', () => {
  const { passed, req } = request('/api/whoami', { headers: { 'cf-ray': '1', cookie: 'other=x; hll_key=social-key' } });
  assert.equal(passed, true);
  assert.deepEqual(req.access, { remote: true, role: 'social', edition: 'social' });
  for (const cookie of ['hll_key=expired', 'hll_key=%ZZ', 'other=full-key']) {
    assert.equal(request('/control/', { headers: { 'x-hll-via': 'worker', cookie } }).res.statusCode, 401);
  }
});

test('remote management is forbidden before authentication for every role and method', () => {
  for (const role of Object.keys(keys)) for (const method of ['GET', 'PUT', 'POST']) {
    assert.equal(request(`/api/remote/rotate?key=${keys[role]}`, { method }).res.statusCode, 403);
    assert.equal(roleAllows(role, method, '/API/%72emote/rotate'), false);
  }
  assert.equal(request('/api/remote').res.statusCode, 403);
});

test('full control allows all other routes', () => {
  for (const [method, url, body] of [['DELETE', '/api/tournaments/a'], ['POST', '/api/sync/now'], ['PUT', '/api/settings', { outputDir: 'x' }], ['GET', '/control/']]) {
    assert.equal(roleAllows('full', method, url, body), true);
  }
});

test('social blocks sync, tournament deletion and output folder changes', () => {
  for (const method of ['GET', 'POST']) assert.equal(roleAllows('social', method, '/api/sync/now'), false);
  assert.equal(roleAllows('social', 'DELETE', '/API/tournaments/abc/'), false);
  assert.equal(roleAllows('social', 'PUT', '/api/settings', { outputDir: '' }), false);
  assert.equal(roleAllows('social', 'PUT', '/api/tournaments/abc', { settings: { outputDir: 'x' } }), false);
  assert.equal(roleAllows('social', 'PUT', '/api/settings', { theme: {} }), true);
  assert.equal(roleAllows('social', 'DELETE', '/api/players/abc'), true);
  assert.equal(roleAllows('social', 'POST', '/api/render', { scene: 'social-versus' }), true);
});

test('overlay allows only reads from the explicit roots, including SSE', () => {
  for (const root of ['overlay', 'shared', 'brand', 'media', 'raw', 'fonts', 'output', 'api']) {
    for (const method of ['GET', 'HEAD']) assert.equal(roleAllows('overlay', method, `/${root}/file`), true);
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) assert.equal(roleAllows('overlay', method, `/${root}/file`), false);
  }
  assert.equal(roleAllows('overlay', 'GET', '/api/live/stream'), true);
  for (const url of ['/', '/control/', '/overlays/file', '/data/remote.json', '/overlay/../control/', '/overlay/%2e%2e/control/', '/%ZZ']) assert.equal(roleAllows('overlay', 'GET', url), false);
  assert.equal(request('/control/?key=overlay-key').res.statusCode, 401);
  assert.equal(request('/overlay/master.html?key=overlay-key').res.statusCode, 302);
  assert.equal(request('/api/live', { method: 'POST', headers: { 'x-hll-via': 'worker', cookie: 'hll_key=overlay-key' } }).res.statusCode, 403);
});

function fixture(t, options = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-remote-test-'));
  const file = path.join(folder, 'remote.json');
  fs.writeFileSync(file, JSON.stringify({ workerUrl: 'https://worker.example', publishSecret: 'PRIVATE-PUBLISH-SECRET', custom: 'preserve-me', ...options.config }));
  t.after(() => {
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('hll-remote-test-'));
    fs.rmSync(folder, { recursive: true, force: true });
  });
  return { file, manager: createRemoteManager({ file, ...options.deps }) };
}

test('state never exposes publishSecret, persists random keys and preserves private fields', t => {
  const { file, manager } = fixture(t);
  const state = manager.remoteState();
  assert.equal(state.enabled, false);
  assert.equal(JSON.stringify(state).includes('PRIVATE-PUBLISH-SECRET'), false);
  assert.equal(JSON.stringify(state).includes('publishSecret'), false);
  const config = JSON.parse(fs.readFileSync(file));
  assert.equal(config.custom, 'preserve-me');
  assert.equal(config.publishSecret, 'PRIVATE-PUBLISH-SECRET');
  for (const role of Object.keys(keys)) assert.equal(Buffer.from(config.keys[role], 'base64url').length, 24);
  assert.match(state.links.overlay, /\/overlay\/master\.html\?key=/);
  const old = state.links.social;
  manager.rotateKey('social');
  assert.notEqual(manager.remoteState().links.social, old);
  assert.equal(manager.remoteState().links.full, state.links.full);
  assert.equal(resolveRole(config.keys.social, manager.accessKeys()), null);
  assert.throws(() => manager.rotateKey('local'), /Unknown access role/);
});

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function fakeProcess() {
  const proc = new EventEmitter();
  proc.pid = 12345; proc.stderr = new EventEmitter(); proc.stdout = new EventEmitter();
  proc.kill = () => { proc.killed = true; proc.emit('exit', 0); };
  return proc;
}

test('tunnel parses chunked stderr, publishes, retries after exit, and stops only its child', async t => {
  const proc = fakeProcess(), calls = [], timers = [], states = [];
  const { manager } = fixture(t, { config: { enabled: true }, deps: {
    executable: process.execPath,
    spawnChild: (exe, args, opts) => { assert.equal(opts.windowsHide, true); assert.ok(args.includes('http://127.0.0.1:4699')); return proc; },
    fetcher: async (url, opts) => { calls.push({ url, opts }); return { ok: true }; },
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  } });
  manager.startRemote({ port: 4699, onState: state => states.push(state.status) });
  proc.stderr.emit('data', Buffer.from('Requesting https://api.trycloudflare.com/tunnel\n'));
  await settle();
  assert.equal(calls.length, 0);
  proc.stderr.emit('data', Buffer.from('Connected https://one-two.'));
  proc.stderr.emit('data', Buffer.from('trycloudflare.com\n'));
  await settle();
  assert.equal(manager.remoteState().status, 'online');
  assert.deepEqual(JSON.parse(calls[0].opts.body).url, 'https://one-two.trycloudflare.com');
  assert.ok(states.includes('starting'));
  proc.emit('exit', 1);
  await settle();
  assert.equal(manager.remoteState().status, 'error');
  assert.equal(timers.at(-1).ms, 5000);
  assert.equal(JSON.parse(calls.at(-1).opts.body).url, null);
  await manager.setRemoteEnabled(false);
  assert.equal(manager.remoteState().enabled, false);
});

test('publish failures stay offline, retry, and disabling kills the spawned pid and unpublishes', async t => {
  const proc = fakeProcess(), timers = [], calls = [];
  let fail = true;
  const { manager } = fixture(t, { deps: { executable: process.execPath, spawnChild: () => proc,
    fetcher: async (url, opts) => { calls.push(JSON.parse(opts.body)); if (fail) throw new Error('PRIVATE-PUBLISH-SECRET'); return { ok: true }; },
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  } });
  manager.startRemote({ port: 4699 });
  await manager.setRemoteEnabled(true);
  proc.stderr.emit('data', Buffer.from('https://one-two.trycloudflare.com'));
  await settle();
  assert.equal(manager.remoteState().status, 'offline');
  assert.ok(!JSON.stringify(manager.remoteState()).includes('PRIVATE-PUBLISH-SECRET'));
  assert.equal(timers.at(-1).ms, 5000);
  fail = false;
  timers.at(-1).fn();
  await settle();
  assert.equal(manager.remoteState().status, 'online');
  await manager.setRemoteEnabled(false);
  assert.equal(proc.killed, true);
  assert.equal(calls.at(-1).url, null);
  assert.equal(manager.remoteState().status, 'offline');
});

test('repeated child failures back off for 5s, 15s, then 60s', async t => {
  const processes = [], timers = [];
  const { manager } = fixture(t, { config: { enabled: true }, deps: {
    executable: process.execPath, spawnChild: () => { const proc = fakeProcess(); processes.push(proc); return proc; },
    fetcher: async () => ({ ok: true }), schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  } });
  manager.startRemote({ port: 4699 });
  for (const expected of [5000, 15000, 60000, 60000]) {
    processes.at(-1).emit('exit', 1);
    await settle();
    assert.equal(timers.at(-1).ms, expected);
    timers.at(-1).fn();
  }
  await manager.setRemoteEnabled(false);
});

test('disabling during an in-flight publication never brings the dead tunnel online', async t => {
  const proc = fakeProcess(), calls = [];
  let complete;
  const { manager } = fixture(t, { config: { enabled: true }, deps: {
    executable: process.execPath, spawnChild: () => proc,
    fetcher: async (url, opts) => { const body = JSON.parse(opts.body); calls.push(body); if (body.url) await new Promise(resolve => { complete = resolve; }); return { ok: true }; },
  } });
  manager.startRemote({ port: 4699 });
  proc.stderr.emit('data', Buffer.from('https://one-two.trycloudflare.com'));
  await settle();
  const stopped = manager.setRemoteEnabled(false);
  complete();
  await stopped;
  assert.equal(manager.remoteState().status, 'offline');
  assert.equal(calls.at(-1).url, null);
});

test('offline publication is retried even after disabling the tunnel', async t => {
  const proc = fakeProcess(), timers = [];
  let fail = true, calls = 0;
  const { manager } = fixture(t, { config: { enabled: true }, deps: {
    executable: process.execPath, spawnChild: () => proc,
    fetcher: async () => { calls++; if (fail) throw new Error('offline'); return { ok: true }; },
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, cancel: () => {},
  } });
  manager.startRemote({ port: 4699 });
  await manager.setRemoteEnabled(false);
  assert.equal(proc.killed, true);
  assert.match(manager.remoteState().message, /Retrying/);
  assert.equal(timers.at(-1).ms, 5000);
  fail = false;
  timers.at(-1).fn();
  await settle();
  assert.equal(calls, 2);
  assert.equal(manager.remoteState().message, '');
});
