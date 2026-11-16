// Review tests for online overlays without a live stream (SSE polling fallback).
// Pure logic + a time-travel harness; no network, no DOM, no server on port 4610.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeLive, needsLivePolling, STREAM_WAIT_MS, LIVE_POLL_MS } from '../public/shared/live-connection.js';
import { obsLinkFor, roleAllows } from '../server/remote-access.js';
import { masterLinks, overlayMonitorUrl, OBS_LINK_NOTE } from '../public/shared/master-links.js';

const overlay = 'https://online.example/overlay/master.html?key=overlay-only';
const remote = { enabled: true, links: { overlay, full: 'full-secret', social: 'social-secret' }, publishSecret: 'publish-secret' };

/* ------------------------------------------------------------------ harness */

const drain = () => new Promise(resolve => setImmediate(resolve));

/** Controllable clock + fake EventSource + counted /api/live fetches. */
function harness() {
  let now = 0, nextId = 0;
  const timers = new Map(), sources = [], requests = [];
  let live = { scene: 'versus', visible: true };
  let dataRev = 1;
  const schedule = (fn, ms, interval = false) => {
    const id = ++nextId;
    timers.set(id, { fn, at: now + ms, interval: interval ? ms : 0 });
    return id;
  };
  const runtime = {
    Date: { now: () => now },
    setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => timers.delete(id),
    fetch: async (...args) => { requests.push(args); return { ok: true, json: async () => ({ ...live, dataRev }) }; },
    EventSource: class {
      readyState = 1;
      listeners = new Map();
      constructor(url) { this.url = url; sources.push(this); }
      addEventListener(type, fn) { this.listeners.set(type, fn); }
      close() { this.closed = true; }
      send(type, value) { this.listeners.get(type)?.({ data: JSON.stringify(value) }); }
      error() { this.onerror(); }
    },
  };
  async function advance(ms) {
    await drain();
    const end = now + ms;
    for (;;) {
      const entry = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, timer] = entry;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval; else timers.delete(id);
      timer.fn();
      await drain();
    }
    now = end;
    await drain();
  }
  return { runtime, advance, sources, requests, timers, setLive: v => { live = v; }, setDataRev: v => { dataRev = v; } };
}

/* --------------------------------------------------- 1. polling cadence / rate */

test('a polling overlay makes about 30 /api/live requests a minute and reloads data only when dataRev moves', async () => {
  const h = harness();
  const live = [], state = [];
  const stop = subscribeLive({ onLive: v => live.push(v), onState: v => state.push(v) }, h.runtime);
  await h.advance(60000);
  assert.equal(h.requests.length, 29, 'bootstrap + 28 two-second polls in the first minute');
  assert.ok(h.requests.every(([url, options]) => url === '/api/live' && options.cache === 'no-store'));
  assert.equal(live.length, 29, 'every poll feeds the live scene');
  assert.deepEqual(state, [], 'nothing to reload while the database revision is unchanged');

  h.setDataRev(2);
  await h.advance(2000);
  assert.deepEqual(state, [{ polling: true, rev: 2 }], 'a data edit reloads scene data at the next poll');
  h.setDataRev(2);
  await h.advance(10000);
  assert.equal(state.length, 1, 'and not again until it changes again');
  stop();
});

test('a scene change reaches a polling overlay within three seconds', async () => {
  const h = harness();
  const live = [];
  const stop = subscribeLive({ onLive: v => live.push({ at: h.runtime.Date.now(), value: v }) }, h.runtime);
  await h.advance(5000); // stream is silent: polling now active
  const changedAt = h.runtime.Date.now();
  h.setLive({ scene: 'roster', visible: true });
  await h.advance(LIVE_POLL_MS);
  assert.deepEqual(live.at(-1).value, { scene: 'roster', visible: true });
  assert.ok(live.at(-1).at - changedAt <= 3000, `took ${live.at(-1).at - changedAt} ms`);
  stop();
});

test('the OBS source plus one remote panel tab stay inside the Worker free plan', () => {
  const perMinute = 29; // measured above
  const perClientPerDay = perMinute * 1440;
  assert.equal(perClientPerDay, 41_760);
  assert.equal(perClientPerDay * 2, 83_520, '1 OBS master + 1 remote panel tab');
  assert.ok(perClientPerDay * 2 < 100_000, 'under the 100k requests/day free plan');
});

/* ---------------------------------------------- 2. errors, reconnects, leaks */

test('repeated SSE errors do not multiply the live polling requests', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  await h.advance(5000); // polling active
  for (let i = 0; i < 25; i++) { h.sources[0].readyState = 1; h.sources[0].error(); }
  await h.advance(0);
  const afterErrors = h.requests.length;
  await h.advance(10000);
  assert.equal(h.requests.length, afterErrors + 5, 'only the two-second cadence, never 25x');
  stop();
});

test('a normal reconnect loop keeps exactly one source and leaves nothing behind after stop', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  await h.advance(0);
  for (let i = 0; i < 3; i++) {
    const source = h.sources.at(-1);
    source.readyState = 2;
    source.error();
    await h.advance(3000);
  }
  assert.equal(h.sources.length, 4, 'one reconnect per fatal error');
  stop();
  await h.advance(0);
  assert.equal(h.timers.size, 0, 'no timer survives cleanup');
  assert.ok(h.sources.every(source => source.closed), 'no EventSource survives cleanup');
});

test('many SSE errors inside the reconnect window do not open duplicate live streams', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  await h.advance(0);
  for (let i = 0; i < 4; i++) { h.sources[0].readyState = 2; h.sources[0].error(); }
  await h.advance(3000);
  assert.equal(h.sources.length, 2, `expected one reconnect, got ${h.sources.length} EventSources`);
  stop();
});

test('an error from a superseded EventSource does not close the live replacement', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  await h.advance(0);
  h.sources[0].readyState = 2;
  h.sources[0].error();
  await h.advance(3000); // sources[1] is the live stream now
  assert.equal(h.sources.length, 2);
  h.sources[1].readyState = 2;
  h.sources[0].error(); // stale error from the superseded source
  assert.ok(!h.sources[1].closed, 'the live stream must not be closed by a superseded source');
  stop();
});

test('a stream that goes silent after its first event keeps the overlay updating', async () => {
  const h = harness();
  const live = [];
  const stop = subscribeLive({ onLive: v => live.push(v) }, h.runtime);
  await h.advance(0);
  h.sources[0].send('live', { scene: 'versus', visible: true });
  await h.advance(10000); // stream now silent, no error fires
  h.setLive({ scene: 'roster', visible: true });
  await h.advance(10000);
  assert.deepEqual(live.at(-1), { scene: 'roster', visible: true }, 'a silent stream must fall back to polling');
  stop();
});

/* ---------------------------------------------------------- 3. healthy SSE */

test('while the stream delivers, polling never starts and only the bootstrap snapshot is fetched', async () => {
  const h = harness();
  const conn = [];
  const stop = subscribeLive({ onConnection: ok => conn.push(ok) }, h.runtime);
  await h.advance(0);
  assert.equal(h.requests.length, 1, 'one bootstrap snapshot');
  h.sources[0].send('live', { scene: 'versus', visible: true });
  // A healthy stream sends a visible ping every 15 s (server/index.js).
  for (let t = 0; t < 4; t++) { await h.advance(15000); h.sources[0].send('ping', {}); }
  assert.equal(h.requests.length, 1, 'no polling while events arrive');
  assert.deepEqual(conn, [true]);
  assert.equal(h.timers.size, 1, 'only the stall watchdog');
  stop();
});

test('polling stops again as soon as a valid stream event arrives', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  await h.advance(0);
  h.sources[0].error(); // fatal: polling starts
  await h.advance(4000);
  const during = h.requests.length;
  assert.ok(during >= 3);
  h.sources[0].send('live', { scene: 'versus', visible: true });
  await h.advance(10000);
  assert.equal(h.requests.length, during, 'recovered stream silences the poller');
  stop();
});

/* ------------------------------------------------------------- 4. obs-link */

test('the OBS link endpoint can never hand the overlay key to a social or overlay role', () => {
  for (const role of ['social', 'overlay']) {
    assert.equal(roleAllows(role, 'GET', '/api/obs-link'), true, `${role} may call the endpoint`);
    assert.deepEqual(obsLinkFor({ remote: true, role }, remote), { overlayUrl: null });
  }
  assert.deepEqual(obsLinkFor({ remote: true, role: 'full' }, remote), { overlayUrl: overlay });
  assert.deepEqual(obsLinkFor({ remote: false, role: 'local' }, remote), { overlayUrl: overlay });
  assert.deepEqual(obsLinkFor({ remote: true, role: 'full' }, { ...remote, enabled: false }), { overlayUrl: null });
  assert.deepEqual(obsLinkFor(undefined, remote), { overlayUrl: null });
});

/* ------------------------------------------------- 5. panel monitor URLs */

test('the panel monitors stay relative, keyless and on the panel origin', () => {
  assert.equal(overlayMonitorUrl(), '/overlay/master.html');
  assert.equal(overlayMonitorUrl(overlay), '/overlay/master.html');
  const cued = '/overlay/scene.html?scene=versus&match=1&static=1&key=secret';
  assert.equal(overlayMonitorUrl(cued), '/overlay/scene.html?scene=versus&match=1&static=1');
  for (const url of [overlayMonitorUrl(), overlayMonitorUrl(overlay), overlayMonitorUrl(cued)]) {
    assert.ok(url.startsWith('/'), `${url} is relative`);
    assert.ok(!/^https?:/.test(url) && !url.includes('key='), `${url} carries no origin or key`);
  }
});

test('the local OBS row is unchanged and a keyed online row is added only when enabled', () => {
  for (const origin of ['http://127.0.0.1:4610', 'http://192.168.1.20:4610']) {
    assert.deepEqual(masterLinks({ origin, access: { remote: false }, remote }).rows, [
      { label: 'This PC / same network', url: origin + '/overlay/master.html' },
      { label: 'Online (other networks)', url: overlay },
    ]);
    assert.deepEqual(masterLinks({ origin, access: { remote: false }, remote: { enabled: false } }).rows, [
      { label: 'This PC / same network', url: origin + '/overlay/master.html' },
    ]);
  }
});

test('a remote panel without an authorised keyed link shows the broadcaster note', () => {
  assert.deepEqual(masterLinks({ access: { remote: true, role: 'social' }, overlayUrl: null }), { rows: [], note: OBS_LINK_NOTE });
  for (const bad of [undefined, '', 'https://online.example/overlay/master.html', 'javascript:alert(1)']) {
    assert.deepEqual(masterLinks({ access: { remote: true, role: 'full' }, overlayUrl: bad }), { rows: [], note: OBS_LINK_NOTE });
  }
});

/* --------------------------------------------------------- constants sanity */

test('the fallback thresholds are the briefed ones', () => {
  assert.equal(STREAM_WAIT_MS, 5000);
  assert.equal(LIVE_POLL_MS, 2000);
  assert.equal(needsLivePolling({ startedAt: 0 }, 4999), false);
  assert.equal(needsLivePolling({ startedAt: 0 }, 5000), true);
  assert.equal(needsLivePolling({ startedAt: 0, received: true, failed: true }, 1), true);
});
