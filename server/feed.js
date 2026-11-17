// Social PC copy: a one-way copy of the broadcaster's tournaments for the social media PC.
//
// Broadcaster PC: "Publish" uploads the chosen tournaments (without secrets and PC paths) and the
// images they use to the online address (Cloudflare Worker + KV, see cloud/worker). The broadcaster
// PC does not need to stay on after that.
// Social PC: connects once with the "Social PC" link and gets the copy. Later updates happen only
// when the operator clicks "Get updates". Nothing goes back to the broadcaster.
//
// A three-way merge (last copy received, this PC, the new copy) keeps the social PC's work:
// a value the social PC changed stays; a value it did not change follows the broadcaster.
// For teams, players, matches, sponsors and features the broadcaster wins when both changed;
// for the graphics design, social settings, saved graphics and backgrounds the social PC wins.
// A tournament that is no longer in the copy stays on the social PC.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ASSETS, DATA } from './util.js';

const SOCIAL_SETTINGS = new Set(['graphicDesign', 'socialStyle', 'socialLogo', 'theme', 'sponsorsOnSocial']);
// Settings of this PC: its folders, keys, photo processing and its own data source choices.
const LOCAL_SETTINGS = new Set(['outputDir', 'drive', 'hllgr', 'photo', 'matchSheet']);
const SOCIAL_DATA = new Set(['graphics', 'backgrounds']);
const LOCAL_DATA = new Set(['live', 'unmatched', 'rev']);
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

const sha256 = data => createHash('sha256').update(data).digest('hex');
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value));
  fs.renameSync(temp, file);
};
const userError = (message, status = 400) => Object.assign(new Error(message), { status });

/* ------------------------------------------------------------------ broadcaster */

/** The database as the social PC may see it: no secrets, no paths of this PC, no on-air state. */
export function publishedRoot(root, tournamentIds = null) {
  const out = structuredClone(root);
  if (tournamentIds) out.tournaments = out.tournaments.filter(t => tournamentIds.includes(t.id));
  if (!out.tournaments.some(t => t.id === out.activeTournamentId)) out.activeTournamentId = out.tournaments[0]?.id;
  for (const record of out.tournaments) {
    const data = record.data;
    if (data.settings) {
      delete data.settings.outputDir;
      if (data.settings.drive) data.settings.drive = { ...data.settings.drive, apiKey: '' };
      if (data.settings.hllgr) data.settings.hllgr = { ...data.settings.hllgr, cookie: '' };
      // The social PC uses the standard photo processing (no PhotoCraft agent there).
      if (data.settings.photo) data.settings.photo = { ...data.settings.photo, engine: 'standard' };
    }
    for (const list of [data.teams, data.players, data.sponsors]) for (const item of list || []) {
      delete item.logoRaw; delete item.photoRaw;
      if (item.photoProcessor === 'photocraft') item.photoProcessor = 'inherit';
    }
    delete data.live;
    data.unmatched = [];
  }
  return out;
}

/** The files under data/assets that the copy uses (every /media/… address in it). */
export function usedAssets(root, assetsDir = ASSETS) {
  const found = new Set();
  for (const match of JSON.stringify(root).matchAll(/\/media\/([^"?#\\]+)/g)) {
    let rel;
    try { rel = decodeURIComponent(match[1]); } catch { continue; }
    const full = path.resolve(assetsDir, ...rel.split('/'));
    if (!full.startsWith(path.resolve(assetsDir) + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    found.add(rel);
  }
  return [...found].sort();
}

export function createFeedPublisher({ store, cloudConfig, dataDir = DATA, assetsDir = ASSETS, fetcher = fetch } = {}) {
  const file = path.join(dataDir, 'feed-publish.json');
  let running = null;
  const state = () => {
    const saved = readJson(file, {});
    const c = cloudConfig();
    const link = c.workerUrl && c.feedKey ? `${c.workerUrl}/__hll/feed?key=${encodeURIComponent(c.feedKey)}` : '';
    return { configured: !!(c.workerUrl && c.publishSecret), link, lastPublished: saved.lastPublished ?? null, tournaments: saved.tournaments ?? null, files: saved.files ?? 0, publishing: !!running };
  };
  async function call(c, method, pathname, body, type = 'application/json') {
    const response = await fetcher(`${c.workerUrl}${pathname}`, { method, headers: { authorization: `Bearer ${c.publishSecret}`, 'content-type': type }, body, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`The online address refused the copy (${response.status}): ${(await response.text()).slice(0, 200)}`);
    return response.json();
  }
  async function publish(tournamentIds, job) {
    const c = cloudConfig();
    if (!c.workerUrl || !c.publishSecret) throw userError('The online address is not set up on this PC (data/remote.json).');
    const all = store.tournaments().map(t => t.id);
    const ids = Array.isArray(tournamentIds) && tournamentIds.length ? tournamentIds.filter(id => all.includes(id)) : all;
    if (!ids.length) throw userError('Choose at least one tournament.');
    store.saveNow();
    const root = publishedRoot(store.rootSnapshot(), ids);
    const files = usedAssets(root, assetsDir).map(p => {
      const bytes = fs.readFileSync(path.join(assetsDir, ...p.split('/')));
      return { p, h: sha256(bytes), s: bytes.length };
    });
    job?.progress(0.05, 'Checking which images are online');
    const { missing } = await call(c, 'POST', '/__hll/feed/missing', JSON.stringify({ hashes: [...new Set(files.map(f => f.h))] }));
    const todo = files.filter((f, i) => missing.includes(f.h) && files.findIndex(g => g.h === f.h) === i);
    let done = 0;
    for (const f of todo) {
      job?.progress(0.1 + 0.8 * (done / Math.max(1, todo.length)), `Uploading images ${done + 1} / ${todo.length}`);
      await call(c, 'PUT', `/__hll/feed/file/${f.h}`, fs.readFileSync(path.join(assetsDir, ...f.p.split('/'))), TYPES[path.extname(f.p).toLowerCase()] || 'application/octet-stream');
      done++;
    }
    job?.progress(0.92, 'Saving the copy');
    await call(c, 'PUT', '/__hll/feed/auth', JSON.stringify({ hash: sha256(c.feedKey) }));
    const publishedAt = new Date().toISOString();
    await call(c, 'PUT', '/__hll/feed/manifest', JSON.stringify({ feed: 2, revision: root.revision, publishedAt, root, files }));
    writeJson(file, { lastPublished: publishedAt, tournaments: ids, files: files.length });
    return { tournaments: ids.length, files: files.length, uploaded: todo.length };
  }
  return {
    state,
    /** One publish at a time. */
    publish(tournamentIds, job) {
      if (running) throw userError('A copy is already being published.', 409);
      running = publish(tournamentIds, job).finally(() => { running = null; });
      return running;
    },
    /** A new Social PC key must reach the online address at once, or the old link keeps working. */
    async publishKey() {
      const c = cloudConfig();
      if (!c.workerUrl || !c.publishSecret) return;
      await call(c, 'PUT', '/__hll/feed/auth', JSON.stringify({ hash: sha256(c.feedKey) }));
    },
  };
}

/* ------------------------------------------------------------------ merge */

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const idList = v => Array.isArray(v) && v.every(x => plain(x) && typeof x.id === 'string');
const clone = v => v === undefined ? undefined : structuredClone(v);

export function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (plain(a) && plain(b)) {
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    return ka.length === kb.length && ka.every(k => equal(a[k], b[k]));
  }
  return false;
}

/** Three-way merge of one value. `localWins` decides a real conflict (both sides changed it). */
export function merge3(base, local, remote, localWins) {
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base) || equal(local, remote)) return clone(local);
  if (plain(local) && plain(remote) && (base === undefined || plain(base))) {
    const b = base ?? {}, out = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const value = merge3(b[key], local[key], remote[key], localWins);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  if (idList(local) && idList(remote) && (base === undefined || idList(base))) {
    const byId = list => new Map((list ?? []).map(item => [item.id, item]));
    const b = byId(base), l = byId(local), r = byId(remote);
    const ids = [...r.keys(), ...[...l.keys()].filter(id => !r.has(id))];
    return ids.map(id => merge3(b.get(id), l.get(id), r.get(id), localWins)).filter(v => v !== undefined);
  }
  return clone(localWins ? local : remote);
}

function mergeSettings(base = {}, local = {}, remote = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const value = LOCAL_SETTINGS.has(key) ? clone(local[key] ?? remote[key]) : merge3(base[key], local[key], remote[key], SOCIAL_SETTINGS.has(key));
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergeData(base = {}, local = {}, remote = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    let value;
    if (key === 'settings') value = mergeSettings(base.settings, local.settings, remote.settings);
    else if (LOCAL_DATA.has(key)) value = clone(local[key]);
    else value = merge3(base[key], local[key], remote[key], SOCIAL_DATA.has(key));
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const hasContent = data => !!(data?.teams?.length || data?.matches?.length || data?.graphics?.length);

/**
 * Merge the broadcaster's copy into this PC's database.
 * `base` is the copy of the last update (null before the first update).
 */
export function mergeRoot(base, local, remote) {
  const localById = new Map(local.tournaments.map(t => [t.id, t]));
  const baseById = new Map((base?.tournaments ?? []).map(t => [t.id, t]));
  const tournaments = [];
  for (const r of remote.tournaments) {
    const l = localById.get(r.id), b = baseById.get(r.id);
    // New here (or the first update, when this PC has only its empty start database): take it as it is.
    if (!l || !base) { tournaments.push({ ...clone(r), data: { ...clone(r.data), live: clone(l?.data.live), rev: l?.data.rev ?? 0 } }); continue; }
    tournaments.push({ ...clone(r), data: mergeData(b?.data, l.data, r.data) });
  }
  // Tournaments that are not in this copy stay (an empty start tournament goes at the first update).
  for (const l of local.tournaments) {
    if (remote.tournaments.some(r => r.id === l.id)) continue;
    if (base || hasContent(l.data)) tournaments.push(clone(l));
  }
  const ids = new Set(tournaments.map(t => t.id));
  const active = base && ids.has(local.activeTournamentId) ? local.activeTournamentId
    : ids.has(remote.activeTournamentId) ? remote.activeTournamentId : tournaments[0]?.id;
  const out = { ...clone(local), schemaVersion: 2, activeTournamentId: active, revision: Math.max(local.revision ?? 0, remote.revision ?? 0) + 1, tournaments };
  const library = merge3(base?.designLibrary, local.designLibrary, remote.designLibrary, true);
  if (library === undefined) delete out.designLibrary; else out.designLibrary = library;
  return out;
}

/* ------------------------------------------------------------------ social PC */

/** Accept the "Social PC" link from the broadcaster: https://…/__hll/feed?key=… */
export function parseFeedLink(link) {
  let url;
  try { url = new URL(String(link ?? '').trim()); } catch { throw userError('Paste the complete Social PC link (it starts with https://).'); }
  const key = url.searchParams.get('key');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.pathname.replace(/\/+$/, '') !== '/__hll/feed' || !key) throw userError('This is not a Social PC link. Ask the broadcaster for the "Social PC" link.');
  return { origin: url.origin, key };
}

export function createFeedClient({ store, dataDir = DATA, assetsDir = ASSETS, fetcher = fetch, onState = () => {}, onImported = () => {} } = {}) {
  const files = { config: path.join(dataDir, 'feed.json'), base: path.join(dataDir, 'feed-base.json'), assets: path.join(dataDir, 'feed-files.json') };
  let config = readJson(files.config, {});
  let state = { status: config.origin && config.key ? 'idle' : 'off', message: '', downloaded: 0 };
  let running = null;

  const connected = () => !!(config.origin && config.key);
  const view = () => ({ connected: connected(), origin: config.origin ?? '', ...state, lastUpdate: config.lastUpdate ?? null, publishedAt: config.publishedAt ?? null, tournaments: config.tournaments ?? [] });
  const set = patch => { state = { ...state, ...patch }; onState(view()); };
  const saveConfig = () => writeJson(files.config, config);
  const request = (pathname, timeout) => fetcher(`${config.origin}${pathname}`, { headers: { authorization: `Bearer ${config.key}`, accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });

  async function download(file) {
    const target = path.resolve(assetsDir, ...file.p.split('/'));
    if (!target.startsWith(path.resolve(assetsDir) + path.sep)) throw new Error(`Refused a file outside the media folder: ${file.p}`);
    const response = await request(`/__hll/feed/file/${file.h}`, 120_000);
    if (!response.ok) throw new Error(`Could not download ${file.p} (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== file.h) throw new Error(`The download of ${file.p} is damaged. Try again.`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, target);
  }

  async function update() {
    if (!connected()) return view();
    set({ status: 'updating', message: '' });
    try {
      let response;
      try { response = await request('/__hll/feed', 60_000); }
      catch { throw Object.assign(new Error('No internet connection. Your copy stays as it is.'), { offline: true }); }
      if (response.status === 401 || response.status === 403) throw new Error('The Social PC link does not work any more. Ask the broadcaster for the new link.');
      if (response.status === 404) throw new Error('The broadcaster has not published a copy yet.');
      if (!response.ok || !String(response.headers.get('content-type')).includes('json')) throw new Error(`The online address answered with an error (${response.status}).`);
      const feed = await response.json();
      if (feed?.feed !== 2 || feed.root?.schemaVersion !== 2 || !Array.isArray(feed.root.tournaments) || !Array.isArray(feed.files)) throw new Error('The copy cannot be read by this version. Update both programs.');

      const have = readJson(files.assets, {});
      const missing = feed.files.filter(f => typeof f.p === 'string' && /^[a-f0-9]{64}$/.test(f.h) && (have[f.p] !== f.h || !fs.existsSync(path.join(assetsDir, ...f.p.split('/')))));
      let done = 0;
      const queue = [...missing];
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let file; (file = queue.shift());) {
          await download(file);
          have[file.p] = file.h;
          if (++done % 10 === 0) { writeJson(files.assets, have); set({ message: `Downloading images… ${done} / ${missing.length}` }); }
        }
      }));
      writeJson(files.assets, have);

      const base = readJson(files.base, null);
      if (feed.publishedAt !== config.publishedAt || !base) {
        store.saveNow();
        if (!base) {
          // First update: keep the database this PC had before, so nothing is lost.
          const backups = path.join(dataDir, 'backups');
          fs.mkdirSync(backups, { recursive: true });
          const db = path.join(dataDir, 'db.json');
          if (fs.existsSync(db)) fs.copyFileSync(db, path.join(backups, `before-feed-${Date.now()}.json`));
        }
        store.importRoot(mergeRoot(base, store.rootSnapshot(), feed.root));
        writeJson(files.base, feed.root);
        config.publishedAt = feed.publishedAt;
        config.tournaments = feed.root.tournaments.map(t => t.data?.settings?.leagueName || t.id);
        onImported();
      } else if (done) store.changed();
      config.lastUpdate = new Date().toISOString();
      saveConfig();
      set({ status: 'ok', message: '', downloaded: done });
    } catch (error) {
      set({ status: error.offline ? 'offline' : 'error', message: error.message });
    }
    return view();
  }

  function run() {
    running ||= update().finally(() => { running = null; });
    return running;
  }

  return {
    connected, state: view,
    /** Start an update in the background; progress arrives as 'feed' events. */
    update() { void run(); return view(); },
    updateAndWait: run,
    connect(link) {
      const { origin, key } = parseFeedLink(link);
      if (origin !== config.origin) { delete config.publishedAt; fs.rmSync(files.base, { force: true }); }
      config = { ...config, origin, key };
      saveConfig();
      set({ status: 'idle', message: '' });
      void run();
      return view();
    },
    disconnect() {
      // The copy and the last update stay, so a new connection to the same address keeps this PC's work.
      config = { publishedAt: config.publishedAt, origin: config.origin, lastUpdate: config.lastUpdate, tournaments: config.tournaments };
      saveConfig();
      set({ status: 'off', message: '' });
      return view();
    },
  };
}
