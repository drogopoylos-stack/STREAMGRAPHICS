import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import * as store from './db.js';
import { ROOT, ASSETS, RAW, newId, deepMerge, isoDay } from './util.js';
import { startJob, getJob, listJobs } from './jobs.js';
import { sceneData, nextMatch, SCENES } from './scenes.js';
import { setEntityImage, reprocessAll, assignUnmatched, importItem, listLocalFolder } from './assets.js';
import { listDriveFolder } from './drive.js';
import { syncHllgr } from './hllgr.js';
import { renderScene, renderAll, setPort, closeBrowser } from './render.js';
import { refreshDdragon } from './ddragon.js';

const PORT = Number(process.env.PORT) || 4610;
const db = store.load();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
// Overlays are loaded by OBS / vMix from other machines too: allow cross-origin reads.
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });

// ---------- static ----------
const noCache = { setHeaders: (res) => res.set('Cache-Control', 'no-cache') };
app.get('/', (req, res) => res.redirect('/control/'));
app.use('/control', express.static(path.join(ROOT, 'public/control'), noCache));
app.use('/overlay', express.static(path.join(ROOT, 'public/overlay'), noCache));
app.use('/brand', express.static(path.join(ROOT, 'public/brand'), { maxAge: '1h' }));
app.use('/media', express.static(ASSETS, noCache));
app.use('/raw', express.static(RAW, noCache));
app.use('/output', (req, res, next) => express.static(store.get().settings.outputDir, noCache)(req, res, next));
app.use('/fonts/:pkg', (req, res, next) => {
  const pkg = req.params.pkg.replace(/[^\w-]/g, '');
  const dirs = [`node_modules/@fontsource/${pkg}`, `node_modules/@fontsource-variable/${pkg}`].map((d) => path.join(ROOT, d));
  const dir = dirs.find((d) => fs.existsSync(d));
  if (!dir) return res.status(404).end();
  express.static(dir, { maxAge: '7d' })(req, res, next);
});

// ---------- helpers ----------
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) {
    if (e.status !== 404) console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

function publicState() {
  const d = store.get();
  return {
    settings: d.settings, teams: d.teams,
    players: d.players,
    matches: d.matches.map(({ stats, ...m }) => ({ ...m, statsCount: stats?.length ?? 0 })),
    sponsors: d.sponsors, features: d.features, live: d.live, unmatched: d.unmatched,
    jobs: listJobs().map(({ log, ...j }) => ({ ...j, log: log.slice(-5) })),
    nextMatch: nextMatch(d)?.id ?? null, today: isoDay(0, d.settings.timezone), rev: d.rev,
  };
}

// ---------- state + settings ----------
app.get('/api/state', wrap(() => publicState()));
app.put('/api/settings', wrap((req) => {
  const d = store.get();
  const body = req.body ?? {};
  deepMerge(d.settings, body);
  if (Array.isArray(body.statDefs)) d.settings.statDefs = body.statDefs;
  store.changed();
  return d.settings;
}));

// ---------- CRUD ----------
const PREFIX = store.COLLECTIONS;
const DEFAULTS = {
  teams: () => ({ name: 'New team', tag: 'NEW', logo: null, colors: { primary: '#444444', secondary: '#888888' }, source: 'manual', extId: null }),
  players: () => ({ teamId: null, nick: 'Player', name: '', role: '', photo: null, country: null, captain: false, source: 'manual', extId: null }),
  matches: () => ({ date: isoDay(0, store.get().settings.timezone), time: '18:00', teamA: null, teamB: null, scoreA: null, scoreB: null, bestOf: 1, stage: '', status: 'scheduled', source: 'manual', extId: null, stats: [] }),
  sponsors: () => ({ name: 'Sponsor', logo: null, tier: 'partner' }),
  features: () => ({ playerA: null, playerB: null, title: '', matchId: null }),
};
const READONLY = new Set(['id', 'logo', 'photo', 'logoRaw', 'photoRaw', 'photoStats']);
const clean = (body) => Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => !READONLY.has(k)));

for (const coll of Object.keys(PREFIX)) {
  app.post(`/api/${coll}`, wrap((req) => {
    const item = { id: newId(PREFIX[coll]), ...DEFAULTS[coll](), ...clean(req.body) };
    store.get()[coll].push(item);
    store.changed();
    return item;
  }));
  app.put(`/api/${coll}/:id`, wrap((req) => {
    const item = store.get()[coll].find((x) => x.id === req.params.id);
    if (!item) throw fail(404, 'not found');
    const body = clean(req.body);
    if (coll === 'teams' && body.colors) body.colorsManual = true;
    Object.assign(item, body);
    store.changed();
    return item;
  }));
  app.delete(`/api/${coll}/:id`, wrap((req) => {
    const list = store.get()[coll];
    const i = list.findIndex((x) => x.id === req.params.id);
    if (i < 0) throw fail(404, 'not found');
    list.splice(i, 1);
    if (coll === 'teams') for (const p of store.get().players) if (p.teamId === req.params.id) p.teamId = null;
    store.changed();
    return { ok: true };
  }));
}

// ---------- assets ----------
const KIND_COLL = { team: 'teams', player: 'players', sponsor: 'sponsors' };

app.post('/api/assets/upload', upload.single('file'), wrap(async (req) => {
  const { kind, id } = req.body ?? {};
  if (!KIND_COLL[kind]) throw fail(400, 'kind must be team, player or sponsor');
  if (!req.file) throw fail(400, 'no file');
  const entity = store.get()[KIND_COLL[kind]].find((x) => x.id === id);
  if (!entity) throw fail(404, `${kind} not found`);
  return setEntityImage(kind, entity, req.file.buffer, path.extname(req.file.originalname) || '.png');
}));

// League logo / custom background upload (stored under data/assets/brand/).
app.post('/api/brand/upload', upload.single('file'), wrap(async (req) => {
  const slot = req.body?.slot === 'bg' ? 'bg' : 'league-logo';
  if (!req.file) throw fail(400, 'no file');
  const dir = path.join(ASSETS, 'brand');
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  fs.writeFileSync(path.join(dir, `${slot}${ext}`), req.file.buffer);
  const url = `/media/brand/${slot}${ext}?v=${Date.now().toString(36)}`;
  const s = store.get().settings;
  if (slot === 'bg') s.theme.bgImage = url; else s.leagueLogo = url;
  store.changed();
  return s;
}));

app.post('/api/assets/import', wrap((req) => {
  const { source, url, path: dir, kind = 'auto' } = req.body ?? {};
  if (source !== 'drive' && source !== 'local') throw fail(400, 'source must be drive or local');
  return startJob('import', async (job) => {
    const items = source === 'drive'
      ? await listDriveFolder(url, store.get().settings.drive.apiKey, (l) => job.log(l))
      : listLocalFolder(dir);
    job.log(`${items.length} images found`);
    const lines = [];
    let i = 0;
    for (const item of items) {
      job.progress(i++ / Math.max(1, items.length), item.name);
      try { lines.push(await importItem(item, kind)); job.log(lines.at(-1)); } catch (e) { job.log(`${item.name}: ${e.message}`); }
    }
    return { files: items.length, lines };
  });
}));

app.post('/api/assets/assign', wrap((req) => assignUnmatched(req.body?.file, req.body?.kind, req.body?.id)));
app.delete('/api/assets/unmatched/:file', wrap((req) => {
  const d = store.get();
  d.unmatched = d.unmatched.filter((u) => u.file !== req.params.file);
  fs.rmSync(path.join(RAW, 'unmatched', path.basename(req.params.file)), { force: true });
  store.changed();
  return { ok: true };
}));

app.post('/api/assets/reprocess', wrap((req) => {
  const { kind, id } = req.body ?? {};
  if (id && KIND_COLL[kind]) {
    const entity = store.get()[KIND_COLL[kind]].find((x) => x.id === id);
    if (!entity) throw fail(404, 'not found');
    return startJob('reprocess', async () => {
      const { processEntity } = await import('./assets.js');
      return processEntity(kind, entity);
    });
  }
  return startJob('reprocess', (job) => reprocessAll(kind ?? 'all-players', job));
}));

app.get('/api/jobs/:id', wrap((req) => getJob(req.params.id) ?? (() => { throw fail(404, 'job not found'); })()));

// ---------- HLL.GR ----------
app.post('/api/hllgr/sync', wrap((req) => {
  const what = Array.isArray(req.body?.what) && req.body.what.length ? req.body.what : ['teams', 'players', 'matches', 'stats'];
  return startJob('hllgr', (job) => syncHllgr(job, what, { force: !!req.body?.force }));
}));

// ---------- scenes, live, render ----------
app.get('/api/scene-data', wrap((req) => {
  const { scene, ...params } = req.query;
  if (!SCENES.includes(scene)) throw fail(400, `scene must be one of ${SCENES.join(', ')}`);
  return sceneData(scene, params);
}));

app.get('/api/live', wrap(() => store.get().live));
app.post('/api/live', wrap((req) => {
  const d = store.get();
  const { scene, params, visible } = req.body ?? {};
  if (scene !== undefined) {
    if (scene !== null && !SCENES.includes(scene)) throw fail(400, 'unknown scene');
    d.live.scene = scene;
  }
  if (params !== undefined) d.live.params = params ?? {};
  if (visible !== undefined) d.live.visible = !!visible;
  d.live.rev = (d.live.rev ?? 0) + 1;
  store.changed();
  broadcast('live', d.live);
  return d.live;
}));

app.post('/api/render', wrap(async (req) => {
  const { scene, params = {}, name } = req.body ?? {};
  if (!SCENES.includes(scene)) throw fail(400, 'unknown scene');
  return renderScene(scene, params, name);
}));
app.post('/api/render/all', wrap(() => startJob('render', (job) => renderAll(job, nextMatch()?.id))));

// ---------- Server-Sent Events ----------
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
let stateTimer = null;
store.onChange((rev) => {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => broadcast('state', { rev }), 120);
});
app.get('/api/live/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: live\ndata: ${JSON.stringify(store.get().live)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

// ---------- vMix Data Source (Settings → Data Sources → JSON) ----------
app.get('/api/vmix/data', wrap((req) => {
  const d = store.get();
  const origin = `${req.protocol}://${req.get('host')}`;
  const abs = (u) => (u ? `${origin}${u}` : '');
  const day = req.query.day === 'tomorrow' ? isoDay(1, d.settings.timezone) : isoDay(0, d.settings.timezone);
  const team = (id) => d.teams.find((t) => t.id === id) ?? {};
  return d.matches.filter((m) => m.date === day).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).map((m) => ({
    Time: m.time, Stage: m.stage, BestOf: `BO${m.bestOf}`, Status: m.status,
    TeamA: team(m.teamA).name ?? '', TagA: team(m.teamA).tag ?? '', LogoA: abs(team(m.teamA).logo), ScoreA: m.scoreA ?? '',
    TeamB: team(m.teamB).name ?? '', TagB: team(m.teamB).tag ?? '', LogoB: abs(team(m.teamB).logo), ScoreB: m.scoreB ?? '',
  }));
}));

// ---------- helpers for the control panel ----------
// LAN addresses, so the OBS / vMix page can show the URL for another PC.
app.get('/api/netinfo', wrap(() => {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  return { addresses, port: PORT };
}));

// The PNG files in the output folder, newest first.
app.get('/api/output', wrap(() => {
  const dir = store.get().settings.outputDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((name) => {
    const file = path.join(dir, name);
    const mtime = fs.statSync(file).mtimeMs;
    return { name, file, url: `/output/${encodeURIComponent(name)}?v=${Math.round(mtime).toString(36)}`, mtime };
  }).sort((a, b) => b.mtime - a.mtime);
}));

app.use('/api', (req, res) => res.status(404).json({ error: `no route ${req.method} ${req.path}` }));

// ---------- start ----------
setPort(PORT);
const server = app.listen(PORT, () => {
  console.log(`HLL graphics: control panel http://localhost:${PORT}/  ·  live overlay http://localhost:${PORT}/overlay/live.html`);
  refreshDdragon().catch(() => {});
});
const shutdown = async () => { store.saveNow(); await closeBrowser(); server.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
