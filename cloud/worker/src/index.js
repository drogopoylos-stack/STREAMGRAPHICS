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
