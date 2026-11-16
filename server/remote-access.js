// Access policy is independent of Express so every role and redirect can be tested.
export const ROLES = ['full', 'social', 'overlay'];
export function obsLinkFor(access, state) {
  const allowed = access?.remote === false || (access?.remote === true && access.role === 'full');
  return { overlayUrl: allowed && state.enabled ? state.links?.overlay || null : null };
}
export function resolveRole(key, keys = {}) {
  return typeof key === 'string' && key ? ROLES.find(role => keys[role] === key) ?? null : null;
}

export function accessPath(url) {
  try {
    const decoded = decodeURIComponent(url.split('?')[0]);
    return new URL(decoded.replace(/\\/g, '/').replace(/\/+/g, '/'), 'http://local').pathname.toLowerCase();
  } catch { return null; }
}

export function roleAllows(role, rawMethod, pathname, body) {
  const method = String(rawMethod || '').toUpperCase();
  const p = accessPath(pathname);
  if (!p || p.startsWith('/api/remote')) return false;
  if (role === 'full') return true;
  if (role === 'social') {
    if (p.startsWith('/api/sync')) return false;
    if (method === 'DELETE' && /^\/api\/tournaments\/[^/]+\/?$/.test(p)) return false;
    if (!['GET', 'HEAD'].includes(method) && (Object.hasOwn(body ?? {}, 'outputDir') || Object.hasOwn(body?.settings ?? {}, 'outputDir'))) return false;
    return true;
  }
  return role === 'overlay' && ['GET', 'HEAD'].includes(method) &&
    /^\/(overlay|shared|brand|media|raw|fonts|output|api)(\/|$)/.test(p);
}

function cookieKey(header = '') {
  try { return decodeURIComponent(header.split(';').map(s => s.trim()).find(s => s.startsWith('hll_key='))?.slice(8) ?? ''); }
  catch { return ''; }
}

export function createAccessMiddleware(getKeys) {
  return (req, res, next) => {
    const remote = ['x-hll-via', 'cf-connecting-ip', 'cf-ray'].some(name => req.headers[name] !== undefined);
    req.access = { remote, role: 'local', edition: 'full' };
    res.locals.remoteAccess = req.access;
    if (!remote) return next();
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const p = accessPath(req.originalUrl);
    if (!p || p.startsWith('/api/remote')) return res.status(403).json({ error: 'Remote access management is local only.' });
    const url = new URL(req.originalUrl, 'http://local');
    const keys = getKeys();
    const queryRole = resolveRole(url.searchParams.get('key'), keys);
    const role = queryRole ?? resolveRole(cookieKey(req.headers.cookie), keys);
    if (!role || (role === 'overlay' && ['GET', 'HEAD'].includes(req.method) && !roleAllows(role, req.method, p, req.body))) {
      return res.status(401).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Access required</title><h1>Access required</h1><p>Ask the broadcaster for a new link</p></html>');
    }
    if (!roleAllows(role, req.method, p, req.body)) return res.status(403).json({ error: 'This link does not allow that action.' });
    req.access = { remote: true, role, edition: role === 'social' ? 'social' : 'full' };
    res.locals.remoteAccess = req.access;
    if (queryRole) {
      res.cookie('hll_key', url.searchParams.get('key'), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      url.searchParams.delete('key');
      return res.redirect(302, url.pathname + url.search);
    }
    next();
  };
}
