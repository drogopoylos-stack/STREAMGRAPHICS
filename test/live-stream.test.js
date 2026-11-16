import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveStream, LIVE_HEARTBEAT_MS } from '../server/live-stream.js';
import { obsLinkFor } from '../server/remote-access.js';
import { needsLivePolling, subscribeLive } from '../public/shared/live-connection.js';
import { masterLinks, overlayMonitorUrl, OBS_LINK_NOTE } from '../public/shared/master-links.js';
import worker from '../cloud/worker/src/index.js';

test('SSE sends proxy-safe, uncompressed headers before an initial comment', () => {
  const calls = [];
  const response = { set: headers => calls.push(headers), flushHeaders: () => calls.push('flush'), write: bytes => calls.push(bytes) };
  startLiveStream(response);
  assert.equal(calls[0]['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(calls[0]['Cache-Control'], 'no-cache, no-transform');
  assert.equal(calls[0]['X-Accel-Buffering'], 'no');
  assert.equal(calls[0]['Content-Encoding'], 'identity');
  assert.equal(calls[1], 'flush');
  assert.match(calls[2], /^:[^\n]{2048}\n\n$/);
  assert.equal(LIVE_HEARTBEAT_MS, 15000);
});

test('stream health falls back after five seconds or immediately on error', () => {
  assert.equal(needsLivePolling({ startedAt: 100 }, 5099), false);
  assert.equal(needsLivePolling({ startedAt: 100 }, 5100), true);
  assert.equal(needsLivePolling({ startedAt: 100, failed: true }, 101), true);
  assert.equal(needsLivePolling({ startedAt: 100, received: true }, 90000), false);
  assert.equal(needsLivePolling({ startedAt: 100, received: true, failed: true }, 90000), true);
});

const drain = () => new Promise(resolve => setImmediate(resolve));
function harness(fetcher = async () => ({ ok: true, json: async () => ({ scene: 'versus', visible: true }) })) {
  let now = 0, nextId = 0;
  const timers = new Map(), sources = [], requests = [];
  const schedule = (fn, ms, interval = false) => {
    const id = ++nextId;
    timers.set(id, { fn, at: now + ms, interval: interval ? ms : 0 });
    return id;
  };
  const runtime = {
    Date: { now: () => now },
    setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => timers.delete(id),
    fetch: (...args) => { requests.push(args); return fetcher(...args); },
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
  return { runtime, advance, sources, requests, timers };
}

test('a buffered stream bootstraps the scene, then polls live and scene data every two seconds', async () => {
  const h = harness(), live = [], state = [];
  const stop = subscribeLive({ onLive: value => live.push(value), onState: value => state.push(value) }, h.runtime);
  await h.advance(0);
  assert.equal(live.length, 1, 'render without waiting for SSE');
  await h.advance(4999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(state, [{ polling: true }]);
  await h.advance(4000);
  assert.equal(h.requests.length, 4);
  assert.ok(h.requests.every(([url, options]) => url === '/api/live' && options.cache === 'no-store'));
  stop();
  assert.equal(h.timers.size, 0);
  assert.equal(h.sources[0].closed, true);
});

test('errors start polling immediately, valid SSE resumes updates and stops polling', async () => {
  const h = harness(), live = [];
  const stop = subscribeLive({ onLive: value => live.push(value) }, h.runtime);
  await h.advance(0);
  h.sources[0].send('live', { rev: 1 });
  await h.advance(6000);
  assert.equal(h.requests.length, 1);
  h.sources[0].error();
  await h.advance(0);
  assert.equal(h.requests.length, 2);
  h.sources[0].send('live', { rev: 2 });
  await h.advance(6000);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(live.at(-1), { rev: 2 });
  stop();
});

test('an HTTP open or malformed SSE does not disable fallback', async () => {
  const h = harness();
  const stop = subscribeLive({}, h.runtime);
  h.sources[0].listeners.get('live')({ data: 'invalid JSON' });
  await h.advance(5000);
  assert.equal(h.requests.length, 2);
  stop();
});

test('a late HTTP snapshot cannot overwrite a newer SSE event', async () => {
  let resolve;
  const h = harness(() => new Promise(r => { resolve = r; })), live = [];
  const stop = subscribeLive({ onLive: value => live.push(value) }, h.runtime);
  h.sources[0].send('live', { rev: 9 });
  resolve({ ok: true, json: async () => ({ rev: 8 }) });
  await h.advance(5000);
  assert.deepEqual(live, [{ rev: 9 }]);
  assert.equal(h.requests.length, 1);
  stop();
});

test('failed polling retries and a closed EventSource is reopened without surviving cleanup', async () => {
  const h = harness(async () => { throw new Error('offline'); });
  const stop = subscribeLive({}, h.runtime);
  await h.advance(0);
  h.sources[0].readyState = 2;
  h.sources[0].error();
  await h.advance(3000);
  assert.equal(h.sources.length, 2);
  assert.equal(h.requests.length, 3);
  stop();
  await h.advance(10000);
  assert.equal(h.sources.length, 2);
  assert.equal(h.timers.size, 0);
});

const overlay = 'https://online.example/overlay/master.html?key=overlay-only';
const remote = { enabled: true, links: { overlay, full: 'full-secret', social: 'social-secret' }, publishSecret: 'publish-secret' };
test('local Master URL retains its origin and adds a separate keyed online row only when enabled', () => {
  for (const origin of ['http://127.0.0.1:4610', 'http://192.168.1.20:4610']) {
    assert.deepEqual(masterLinks({ origin, access: { remote: false }, remote }).rows, [
      { label: 'This PC / same network', url: origin + '/overlay/master.html' },
      { label: 'Online (other networks)', url: overlay },
    ]);
    assert.equal(masterLinks({ origin, access: { remote: false }, remote: { ...remote, enabled: false } }).rows.length, 1);
  }
});

test('remote Master links require a keyed overlay URL supplied by the API', () => {
  const access = { remote: true, role: 'full' };
  assert.equal(masterLinks({ access, overlayUrl: overlay }).rows[0].url, overlay);
  for (const overlayUrl of [undefined, '', 'https://online.example/overlay/master.html', 'https://online.example/control/?key=full', 'javascript:alert(1)']) {
    assert.deepEqual(masterLinks({ access, overlayUrl }), { rows: [], note: OBS_LINK_NOTE });
  }
});

test('the read-only OBS link API shares only the overlay key with local and full operators', () => {
  for (const access of [{ remote: false, role: 'local' }, { remote: true, role: 'full' }]) {
    assert.deepEqual(obsLinkFor(access, remote), { overlayUrl: overlay });
    assert.deepEqual(obsLinkFor(access, { ...remote, enabled: false }), { overlayUrl: null });
  }
  for (const role of ['overlay', 'social', 'unknown']) assert.deepEqual(obsLinkFor({ remote: true, role }, remote), { overlayUrl: null });
  assert.deepEqual(obsLinkFor(undefined, remote), { overlayUrl: null });
});

test('both monitors retain relative paths and never carry an access key', () => {
  assert.equal(overlayMonitorUrl(), '/overlay/master.html');
  assert.equal(overlayMonitorUrl(overlay), '/overlay/master.html');
  assert.equal(overlayMonitorUrl('/overlay/scene.html?scene=versus&match=1&static=1'), '/overlay/scene.html?scene=versus&match=1&static=1');
});

test('Worker passes SSE bytes through without reading the stream and requests identity encoding', async t => {
  let upstreamRequest;
  const bytes = new TextEncoder().encode(': comment\n\nevent: live\ndata: {"rev":1}\n\n');
  const upstream = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); } }), {
    headers: { 'content-type': 'text/event-stream', 'content-encoding': 'identity' },
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => { upstreamRequest = { url, options }; return upstream; });
  const response = await worker.fetch(new Request('https://online.example/api/live/stream', {
    headers: { cookie: 'hll_key=overlay-only', 'accept-encoding': 'gzip' },
  }), { HLL: { get: async () => ({ url: 'https://fake.trycloudflare.com' }) } });
  assert.equal(upstreamRequest.options.headers.get('accept-encoding'), 'identity');
  assert.equal(upstreamRequest.options.headers.get('cookie'), 'hll_key=overlay-only');
  assert.equal(upstream.bodyUsed, false);
  assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
  assert.equal(response.headers.get('content-encoding'), 'identity');
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, bytes);
  await reader.cancel();
});

test('polling reloads scene data only when the database revision changes', async () => {
  let dataRev = 7;
  const state = [];
  const runtime = harness().runtime;
  const h = harness();
  const fetch = h.runtime.fetch;
  h.runtime.fetch = async (...args) => { const r = await fetch(...args); return { ok: true, json: async () => ({ ...(await r.json()), dataRev }) }; };
  const stop = subscribeLive({ onState: value => state.push(value) }, h.runtime);
  await h.advance(0);
  await h.advance(5000);
  await h.advance(4000);
  assert.deepEqual(state, [], 'same revision as the first snapshot: nothing to reload');
  dataRev = 8;
  await h.advance(2000);
  assert.deepEqual(state, [{ polling: true, rev: 8 }]);
  await h.advance(4000);
  assert.equal(state.length, 1);
  stop();
  void runtime;
});
