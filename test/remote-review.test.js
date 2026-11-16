// Security review probes for online access (Cloudflare Worker + access keys).
// Unit policy tests never touch the network; the HTTP probe test starts a second,
// disposable server instance on a free loopback port and never spawns cloudflared.
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
import { accessPath, roleAllows, resolveRole, createAccessMiddleware, ROLES } from '../server/remote-access.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const KEYS = { full: 'review-full-key', social: 'review-social-key', overlay: 'review-overlay-key' };
const PUBLISH_SECRET = 'PROBE-PUBLISH-SECRET';
const REMOTE = { 'x-hll-via': 'worker' };
const FULL = { ...REMOTE, cookie: `hll_key=${KEYS.full}` };
const SOCIAL = { ...REMOTE, cookie: `hll_key=${KEYS.social}` };
const OVERLAY = { ...REMOTE, cookie: `hll_key=${KEYS.overlay}` };

/** Drive the real middleware with a minimal Express-like request/response pair. */
function fakeRequest(url, { method = 'GET', headers = { 'x-hll-via': 'worker' }, body } = {}) {
  const req = { originalUrl: url, method, headers, body };
  const res = {
    locals: {}, statusCode: 200, headers: {}, cookies: [],
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    cookie(...args) { this.cookies.push(args); },
    redirect(code, target) { this.statusCode = code; this.location = target; },
  };
  let passed = false;
  createAccessMiddleware(() => KEYS)(req, res, () => { passed = true; });
  return { req, res, passed };
}

/* ------------------------------------------------------------------ policy */

test('only an exact, non-empty, configured role key resolves', () => {
  for (const role of ROLES) assert.equal(resolveRole(KEYS[role], KEYS), role);
  for (const value of [undefined, '', 'nope', ['review-full-key'], 'toString', '__proto__']) assert.equal(resolveRole(value, KEYS), null);
  assert.equal(resolveRole(KEYS.full), null);
  assert.equal(resolveRole(KEYS.full, {}), null);
});

test('every proxy marker makes a request remote, so dropping x-hll-via is not a bypass', () => {
  for (const name of ['x-hll-via', 'cf-ray', 'cf-connecting-ip']) {
    const { res } = fakeRequest('/control/', { headers: { [name]: '' } });
    assert.equal(res.statusCode, 401, `${name} must be treated as remote`);
  }
  // The Worker header removed but Cloudflare's own headers kept: still remote and key-gated.
  for (const name of ['cf-ray', 'cf-connecting-ip']) {
    assert.equal(fakeRequest('/control/', { headers: { [name]: 'abc' } }).res.statusCode, 401);
    assert.equal(fakeRequest(`/control/?key=${KEYS.full}`, { headers: { [name]: 'abc' } }).res.statusCode, 302);
  }
});

test('local and LAN requests keep today\'s behaviour (no key, full edition)', () => {
  for (const url of ['/control/', '/api/state', '/api/remote', '/overlay/master.html']) {
    const { passed, res, req } = fakeRequest(url, { headers: {} });
    assert.ok(passed, url);
    assert.deepEqual(req.access, { remote: false, role: 'local', edition: 'full' });
    assert.equal(res.headers['Cache-Control'], undefined);
  }
});

test('accessPath resolves traversal, slash, backslash and encoding tricks to one canonical path', () => {
  const cases = [
    ['/control/../api/remote', '/api/remote'],
    ['/overlay/../api/remote', '/api/remote'],
    ['/overlay/..%5c..%5capi/remote', '/api/remote'],
    ['/a//../api/remote', '/api/remote'],
    ['/%2e%2e/api/remote', '/api/remote'],
    ['/api%2fremote', '/api/remote'],
    ['//control', '/control'],
    ['/CONTROL/', '/control/'],
    ['/overlay/%2e%2e/control/', '/control/'],
    ['/control/%2e%2e/%2e%2e/etc/passwd', '/etc/passwd'],
    ['/api/remote%2f..%2fstate', '/api/state'],
  ];
  for (const [input, expected] of cases) assert.equal(accessPath(input), expected, input);
  assert.equal(accessPath('/%ZZ'), null);
  assert.ok(accessPath('/api/remote%00').startsWith('/api/remote'));
});

test('overlay path tricks never reach /control or remote management', () => {
  const tricks = [
    '/CONTROL/', '//control/', '/control/../api/remote', '/overlay/../api/remote',
    '/%2e%2e/api/remote', '/api%2fremote', '/api/remote/', '/API/REMOTE',
    '/overlay/%2e%2e/control/', '/api/remote%00', '/overlay/..%5c..%5capi/remote', '/a//../api/remote',
  ];
  for (const url of tricks) {
    const { passed, res } = fakeRequest(url, { headers: OVERLAY });
    assert.equal(passed, false, url);
    assert.ok([401, 403].includes(res.statusCode), `${url} -> ${res.statusCode}`);
  }
});

test('HEAD stays read-only and OPTIONS is not a write channel for overlay', () => {
  assert.equal(fakeRequest('/control/', { method: 'HEAD', headers: OVERLAY }).res.statusCode, 401);
  assert.ok(fakeRequest('/api/state', { method: 'HEAD', headers: OVERLAY }).passed);
  assert.ok(fakeRequest('/overlay/x', { method: 'HEAD', headers: OVERLAY }).passed);
  assert.equal(fakeRequest('/overlay/x', { method: 'OPTIONS', headers: OVERLAY }).res.statusCode, 403);
  assert.ok(fakeRequest('/api/state', { method: 'OPTIONS', headers: SOCIAL }).passed);
});

test('a method-override header can never upgrade a request', () => {
  // GET with the override header stays a read (allowed); POST with the override header stays a write (blocked).
  assert.ok(fakeRequest('/api/state', { method: 'GET', headers: { ...OVERLAY, 'x-http-method-override': 'POST' } }).passed);
  assert.equal(fakeRequest('/api/state', { method: 'POST', headers: { ...OVERLAY, 'x-http-method-override': 'GET' } }).res.statusCode, 403);
});

test('a query key redirects to a clean URL and sets a hardened cookie', () => {
  const { res, req } = fakeRequest(`/control/?key=${KEYS.full}&edition=social&other=1`);
  assert.equal(res.statusCode, 302);
  assert.equal(res.location, '/control/?edition=social&other=1');
  assert.ok(!res.location.includes(KEYS.full));
  assert.deepEqual(res.cookies[0], ['hll_key', KEYS.full, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000,
  }]);
  assert.equal(req.access.role, 'full');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('cookie and query keys are equivalent, and an invalid query falls back to the cookie', () => {
  assert.ok(fakeRequest('/control/', { headers: FULL }).passed);
  assert.ok(fakeRequest('/control/?key=nope', { headers: FULL }).passed);
  assert.equal(fakeRequest(`/control/?key=${KEYS.social}`, { headers: REMOTE }).res.statusCode, 302);
  assert.equal(fakeRequest(`/control/?key=${KEYS.overlay}`, { headers: REMOTE }).res.statusCode, 401);
  assert.ok(fakeRequest(`/overlay/master.html?key=${KEYS.overlay}`, { headers: REMOTE }).res.statusCode === 302);
});

test('remote management is blocked before authentication for every role and method', () => {
  for (const role of ROLES) for (const method of ['GET', 'PUT', 'POST', 'HEAD']) {
    const { passed, res } = fakeRequest(`/api/remote/rotate?key=${KEYS[role]}`, { method });
    assert.equal(passed, false, `${role} ${method}`);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(fakeRequest('/api/remote').res.statusCode, 403);
  assert.equal(roleAllows('full', 'PUT', '/api/remote'), false);
  assert.equal(roleAllows('social', 'GET', '/api/remote'), false);
});

test('social cannot sync data, delete tournaments or change the output folder', () => {
  assert.equal(roleAllows('social', 'GET', '/api/sync'), false);
  assert.equal(roleAllows('social', 'POST', '/api/sync/now'), false);
  assert.equal(roleAllows('social', 'DELETE', '/api/tournaments/abc'), false);
  assert.equal(roleAllows('social', 'DELETE', '/API/tournaments/abc/'), false);
  assert.equal(roleAllows('social', 'PUT', '/api/settings', { outputDir: 'x' }), false);
  assert.equal(roleAllows('social', 'PUT', '/api/settings', { settings: { outputDir: 'x' } }), false);
  assert.equal(roleAllows('social', 'PUT', '/api/settings', { theme: {} }), true);
  assert.equal(fakeRequest('/api/remote', { headers: SOCIAL }).res.statusCode, 403);
});

test('overlay cannot write to any root', () => {
  for (const [method, url] of [
    ['POST', '/api/live'], ['PUT', '/api/settings'], ['DELETE', '/api/teams/x'],
    ['PATCH', '/api/state'], ['POST', '/overlay/master.html'], ['PUT', '/raw/x'],
  ]) {
    const { passed, res } = fakeRequest(url, { method, headers: OVERLAY });
    assert.equal(passed, false, `${method} ${url}`);
    assert.equal(res.statusCode, 403, `${method} ${url}`);
  }
});

test('401 and 403 bodies never echo key material', () => {
  for (const headers of [REMOTE, OVERLAY, SOCIAL]) {
    for (const url of ['/control/', '/api/remote', '/api/state']) {
      const { res } = fakeRequest(url, { method: 'POST', headers });
      const body = String(res.body ?? '');
      for (const value of [...Object.values(KEYS), PUBLISH_SECRET, 'publishSecret']) assert.ok(!body.includes(value), `${url}: ${body}`);
    }
  }
});

// Node rejects a lower-case method token with 400 before Express runs, so this guard is
// not reachable today; it is still a case-sensitive comparison in a security decision.
test('social tournament-delete guard should not depend on method casing', () => {
  assert.equal(roleAllows('social', 'delete', '/api/tournaments/abc'), false);
});

/* ------------------------------------------------------------- HTTP probes */

test('remote access HTTP probes on a disposable instance', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hll-remote-review-'));
  const output = path.join(folder, 'output');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(folder, 'db.json'), JSON.stringify({
    settings: {
      leagueName: 'Review', outputDir: output,
      drive: { apiKey: 'SECRET-DRIVE-KEY' },
      hllgr: { baseUrl: 'https://hll.gr', cookie: 'SECRET-HLLGR-COOKIE' },
    },
    teams: [], players: [], matches: [], live: { scene: null, params: {}, visible: false, rev: 0 },
  }));
  fs.writeFileSync(path.join(folder, 'remote.json'), JSON.stringify({
    workerUrl: 'https://worker.invalid', publishSecret: PUBLISH_SECRET, enabled: false, keys: KEYS,
  }));

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, windowsHide: true,
    env: { ...process.env, PORT: String(port), HLL_DATA_DIR: folder, HLL_OUTPUT_DIR: output, HLL_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    assert.equal(path.dirname(folder), path.resolve(os.tmpdir()));
    assert.ok(path.basename(folder).startsWith('hll-remote-review-'));
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/whoami`)).ok) { ready = true; break; } } catch { /* not up */ }
    if (child.exitCode !== null) break;
    await delay(50);
  }
  assert.ok(ready, logs);

  const request = (pathname, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });

  await t.test('baseline: no key 401, key 302 + cookie, cookie 200', async () => {
    assert.equal((await request('/control/', { headers: REMOTE })).status, 401);
    const redirect = await request(`/control/?key=${KEYS.full}`, { headers: REMOTE });
    assert.equal(redirect.status, 302);
    assert.ok(!redirect.headers.location.includes('key='));
    assert.match(redirect.headers['set-cookie'].join(';'), /hll_key=review-full-key/);
    assert.equal((await request('/control/', { headers: FULL })).status, 200);
    assert.equal((await request(`/control/?key=${KEYS.overlay}`, { headers: REMOTE })).status, 401);
    assert.equal((await request('/overlay/master.html', { headers: OVERLAY })).status, 200);
    assert.equal((await request('/overlay/master.html', { headers: FULL })).status, 200);
  });

  await t.test('x-hll-via removed but cf-* present is still key-gated', async () => {
    for (const name of ['cf-ray', 'cf-connecting-ip']) {
      assert.equal((await request('/control/', { headers: { [name]: '1' } })).status, 401);
      assert.equal((await request(`/control/?key=${KEYS.full}`, { headers: { [name]: '1' } })).status, 302);
    }
  });

  await t.test('path tricks are blocked over real HTTP', async () => {
    for (const url of [
      '/CONTROL/', '//control/', '/control/../api/remote', '/overlay/../api/remote',
      '/%2e%2e/api/remote', '/api%2fremote', '/api/remote/', '/API/REMOTE',
      '/overlay/%2e%2e/control/', '/api/remote%00', '/api/remote%2f..%2fstate',
    ]) {
      const r = await request(url, { headers: OVERLAY });
      assert.ok([400, 401, 403, 404].includes(r.status), `${url} -> ${r.status}`);
    }
    for (const url of ['/control/../data/remote.json', '/output/../data/remote.json', '/media/%2e%2e/remote.json', '/raw/..%2f..%2fdata/remote.json']) {
      const r = await request(url, { headers: FULL });
      assert.ok(!r.body.includes(PUBLISH_SECRET) && !r.body.includes(KEYS.full), url);
    }
    // A protocol-relative request-target must not turn the key redirect into an open redirect.
    const weird = await request(`//evil.example/control/?key=${KEYS.full}`, { headers: REMOTE });
    assert.equal(weird.status, 302);
    assert.ok(!String(weird.headers.location).includes('evil.example'), String(weird.headers.location));
  });

  await t.test('HEAD/OPTIONS and lower-case method tokens behave', async () => {
    assert.equal((await request('/control/', { method: 'HEAD', headers: OVERLAY })).status, 401);
    assert.equal((await request('/overlay/master.html', { method: 'HEAD', headers: OVERLAY })).status, 200);
    assert.equal((await request('/overlay/', { method: 'OPTIONS', headers: OVERLAY })).status, 403);
    assert.equal((await request('/api/live', { method: 'POST', headers: OVERLAY })).status, 403);
    const raw = await new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(['delete /api/tournaments/tr_hll HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Connection: close',
          'x-hll-via: worker', `Cookie: hll_key=${KEYS.social}`, '', ''].join('\r\n'));
      });
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', c => { data += c; });
      socket.on('end', () => resolve(data));
      socket.on('error', () => resolve(''));
      setTimeout(() => { try { socket.destroy(); } catch { /* gone */ } resolve(data); }, 1500);
    });
    assert.match(raw, /^HTTP\/1\.1 400/, raw.slice(0, 40));
  });

  await t.test('query/cookie equivalence and whoami roles over HTTP', async () => {
    assert.equal((await request(`/control/?key=nope`, { headers: FULL })).status, 200);
    assert.equal((await request(`/overlay/master.html?key=${KEYS.overlay}`, { headers: REMOTE })).status, 302);
    assert.equal(JSON.parse((await request('/api/whoami', { headers: OVERLAY })).body).role, 'overlay');
    assert.equal(JSON.parse((await request('/api/whoami', { headers: SOCIAL })).body).role, 'social');
    assert.equal(JSON.parse((await request('/api/whoami')).body).role, 'local');
  });

  await t.test('management is local only; social restrictions hold over HTTP', async () => {
    assert.equal((await request('/api/remote', { headers: FULL })).status, 403);
    assert.equal((await request('/api/remote/rotate', { method: 'POST', headers: OVERLAY })).status, 403);
    assert.equal((await request('/api/sync', { headers: SOCIAL })).status, 403);
    assert.equal((await request('/api/sync/now', { method: 'POST', headers: SOCIAL })).status, 403);
    assert.equal((await request('/api/tournaments/tr_hll', { method: 'DELETE', headers: SOCIAL })).status, 403);
    assert.equal((await request('/api/settings', { method: 'PUT', headers: { ...SOCIAL, 'content-type': 'application/json' }, body: '{"outputDir":"x"}' })).status, 403);
    const local = await request('/api/remote');
    assert.equal(local.status, 200);
    assert.ok(!local.body.includes(PUBLISH_SECRET));
  });

  await t.test('overlay reads /output and /raw but never leaks remote.json', async () => {
    assert.ok([200, 301, 302, 404].includes((await request('/output/', { headers: OVERLAY })).status));
    assert.ok([200, 301, 302, 404].includes((await request('/raw/', { headers: OVERLAY })).status));
    const state = await request('/api/state', { headers: OVERLAY });
    assert.equal(state.status, 200);
    assert.ok(!state.body.includes(PUBLISH_SECRET));
    assert.ok(!state.body.includes(KEYS.overlay) && !state.body.includes(KEYS.full));
  });

  await t.test('SSE sends the remote-links event to local clients only', async () => {
    const open = headers => {
      const controller = new AbortController();
      let data = '';
      const done = (async () => {
        try {
          const res = await fetch(`${base}/api/live/stream`, { headers, signal: controller.signal });
          const reader = res.body.getReader();
          for (;;) { const { done, value } = await reader.read(); if (done) break; data += Buffer.from(value).toString('utf8'); }
        } catch { /* aborted */ }
        return data;
      })();
      return { controller, done };
    };
    const overlay = open(OVERLAY);
    const local = open({});
    await delay(250);
    const rotated = await (await fetch(`${base}/api/remote/rotate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'social' }) })).json();
    const rotatedKey = new URL(rotated.links.social).searchParams.get('key');
    await delay(400);
    overlay.controller.abort(); local.controller.abort();
    const [remoteData, localData] = [await overlay.done, await local.done];
    assert.match(localData, /event: remote/);
    assert.ok(!remoteData.includes('event: remote'), remoteData.slice(0, 120));
    assert.ok(rotatedKey && !remoteData.includes(rotatedKey));
  });

  await t.test('local and LAN behaviour is unchanged', async () => {
    assert.equal((await request('/control/')).status, 200);
    assert.equal((await request('/api/state')).status, 200);
    assert.equal((await request('/api/remote')).status, 200);
  });

  await t.test('overlay reads do not expose stored drive/hllgr credentials', async () => {
    const state = await request('/api/state', { headers: OVERLAY });
    assert.equal(state.status, 200);
    assert.ok(!state.body.includes('SECRET-DRIVE-KEY'), 'drive.apiKey must not reach a remote read role');
    assert.ok(!state.body.includes('SECRET-HLLGR-COOKIE'), 'hllgr.cookie must not reach a remote read role');
  });

  await t.test('access keys are not readable cross-origin from a local/LAN browser', async () => {
    const management = await request('/api/remote', { headers: { Origin: 'https://evil.example' } });
    assert.equal(management.status, 200);
    assert.notEqual(management.headers['access-control-allow-origin'], '*');
  });
});
