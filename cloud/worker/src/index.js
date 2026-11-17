// HLL Broadcast online link: one fixed address that forwards every request to the broadcast PC.
// The PC opens a Cloudflare quick tunnel (a new random *.trycloudflare.com address at each start)
// and reports it here with POST /__hll/origin. Visitors always use this Worker's address.
// Access keys are checked by the program on the PC, not here.

const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HLL Broadcast · offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#e8edf5;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#9aa7ba;margin:0}</style>
<main><h1>The broadcast PC is offline</h1><p>Start HLL Broadcast on the broadcast PC and turn on “Online access”. Then reload this page.</p></main>`;

let cached = null; // { url, at } kept for a short time in this isolate

// ---------- Social PC copy ----------
// The broadcaster PC uploads a copy of the tournaments (manifest) and its images (one KV entry per
// SHA-256). A social PC downloads it with the "Social PC" key, also when the broadcaster PC is off.
// Keys: feed:auth = SHA-256 of the Social PC key; feed:manifest = JSON; feed:file:<sha256> = bytes.
const FEED_FILE = /^\/__hll\/feed\/file\/([a-f0-9]{64})$/;
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });

async function feedFileKeys(env) {
  const keys = new Set();
  let cursor;
  do {
    const page = await env.HLL.list({ prefix: 'feed:file:', cursor });
    for (const key of page.keys) keys.add(key.name.slice(10));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

async function feed(request, env, url) {
  const publisher = !!env.PUBLISH_SECRET && request.headers.get('authorization') === `Bearer ${env.PUBLISH_SECRET}`;
  const file = FEED_FILE.exec(url.pathname);
  if (request.method === 'GET' && (url.pathname === '/__hll/feed' || file)) {
    const key = (request.headers.get('authorization') || '').replace(/^Bearer /, '') || url.searchParams.get('key') || '';
    const expected = await env.HLL.get('feed:auth');
    if (!key || !expected || await sha256(key) !== expected) return json({ error: 'This Social PC link is not valid. Ask the broadcaster for the new link.' }, 401);
    if (file) {
      const { value, metadata } = await env.HLL.getWithMetadata(`feed:file:${file[1]}`, { type: 'arrayBuffer' });
      if (!value) return json({ error: 'File not found' }, 404);
      return new Response(value, { headers: { 'content-type': metadata?.type || 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    }
    const manifest = await env.HLL.get('feed:manifest');
    if (!manifest) return json({ error: 'The broadcaster has not published a copy yet.' }, 404);
    return new Response(manifest, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (!publisher) return json({ error: 'forbidden' }, 403);
  if (request.method === 'PUT' && url.pathname === '/__hll/feed/auth') {
    const body = await request.json().catch(() => ({}));
    if (!/^[a-f0-9]{64}$/.test(body.hash || '')) return json({ error: 'bad hash' }, 400);
    await env.HLL.put('feed:auth', body.hash);
    return json({ ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/__hll/feed/missing') {
    const body = await request.json().catch(() => ({}));
    const have = await feedFileKeys(env);
    return json({ missing: (Array.isArray(body.hashes) ? body.hashes : []).filter(h => /^[a-f0-9]{64}$/.test(h) && !have.has(h)) });
  }
  if (request.method === 'PUT' && file) {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 24 * 1024 * 1024) return json({ error: 'File too big' }, 413);
    if (await sha256(bytes) !== file[1]) return json({ error: 'The file does not match its checksum' }, 400);
    await env.HLL.put(`feed:file:${file[1]}`, bytes, { metadata: { type: request.headers.get('content-type') || 'application/octet-stream' } });
    return json({ ok: true });
  }
  if (request.method === 'PUT' && url.pathname === '/__hll/feed/manifest') {
    const text = await request.text();
    if (text.length > 24 * 1024 * 1024) return json({ error: 'Copy too big' }, 413);
    let manifest;
    try { manifest = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (manifest?.feed !== 2 || !Array.isArray(manifest.files)) return json({ error: 'bad manifest' }, 400);
    const used = new Set(manifest.files.map(f => f.h));
    const have = await feedFileKeys(env);
    const absent = [...used].filter(h => !have.has(h));
    if (absent.length) return json({ error: 'Upload the files first', missing: absent }, 409);
    await env.HLL.put('feed:manifest', text);
    // Remove images that no copy uses any more (a few per publish, inside the free daily limits).
    let removed = 0;
    for (const h of have) { if (removed >= 200) break; if (!used.has(h)) { await env.HLL.delete(`feed:file:${h}`); removed++; } }
    return json({ ok: true, removed });
  }
  return json({ error: 'not found' }, 404);
}

async function origin(env) {
  if (cached && Date.now() - cached.at < 15_000) return cached.url;
  const value = await env.HLL.get('origin', { type: 'json', cacheTtl: 30 });
  cached = { url: value?.url || null, at: Date.now() };
  return cached.url;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__hll/origin' && request.method === 'POST') {
      if (!env.PUBLISH_SECRET || request.headers.get('authorization') !== `Bearer ${env.PUBLISH_SECRET}`) return new Response('forbidden', { status: 403 });
      const body = await request.json().catch(() => ({}));
      const next = body.url === null ? null : String(body.url || '');
      if (next !== null && !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(next)) return new Response('bad url', { status: 400 });
      await env.HLL.put('origin', JSON.stringify({ url: next, host: String(body.host || '').slice(0, 60), since: new Date().toISOString() }));
      cached = null;
      return Response.json({ ok: true });
    }
    if (url.pathname === '/__hll/feed' || url.pathname.startsWith('/__hll/feed/')) return feed(request, env, url);
    if (url.pathname === '/__hll/status') {
      const value = await env.HLL.get('origin', { type: 'json' });
      return Response.json({ online: !!value?.url, host: value?.host || '', since: value?.since || null });
    }

    const target = await origin(env);
    if (!target) return new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

    const headers = new Headers(request.headers);
    headers.set('x-hll-via', 'worker');
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    const liveStream = url.pathname === '/api/live/stream';
    if (liveStream) headers.set('accept-encoding', 'identity');
    let response;
    try {
      response = await fetch(target + url.pathname + url.search, {
        method: request.method, headers, redirect: 'manual',
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });
    } catch {
      cached = null;
      return new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    // 530 / 1033: the tunnel address is gone (the PC was closed without saying so).
    if (response.status === 530) { cached = null; return new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
    if (liveStream && response.ok && response.headers.get('content-type')?.startsWith('text/event-stream')) {
      // Never consume/buffer the body. Preserve the origin's bytes and prevent
      // automatic compression on this leg. Quick tunnels still do not support SSE;
      // clients also poll until a supported tunnel can deliver the stream.
      const out = new Response(response.body, { status: response.status, statusText: response.statusText,
        headers: response.headers, encodeBody: 'manual' });
      out.headers.set('cache-control', 'no-cache, no-transform');
      out.headers.set('x-accel-buffering', 'no');
      return out;
    }
    // Redirects from the PC point at the tunnel address: point them at this address.
    const location = response.headers.get('location');
    if (location && location.startsWith(target)) {
      const out = new Response(response.body, response);
      out.headers.set('location', location.slice(target.length) || '/');
      return out;
    }
    return response;
  },
};
