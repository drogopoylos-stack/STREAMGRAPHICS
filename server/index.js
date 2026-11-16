import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { readIndex, guessScene } from './output-index.js';
import { startDataSync, syncNow, syncState } from './data-sync.js';
import * as store from './db.js';
import { ROOT, ASSETS, RAW, newId, deepMerge, isoDay } from './util.js';
import { startJob, getJob, listJobs, jobsRunning } from './jobs.js';
import { sceneData, nextMatch, SCENES } from './scenes.js';
import { setEntityImage, reprocessAll, assignUnmatched, importItem, listLocalFolder } from './assets.js';
import { listDriveFolder } from './drive.js';
import { syncHllgr } from './hllgr.js';
import { renderScene, renderAll, setPort, closeBrowser } from './render.js';
import { refreshDdragon } from './ddragon.js';
import { executable as photocraftExecutable } from './photocraft.js';
import { graphicCatalog, newGraphic } from './graphics.js';
import { saveBackground, saveDesignIcon } from './backgrounds.js';
import { resolvedTournament, validateSources, syncBracket, bracketDefinitions, updateBracketDraw } from './bracket.js';
import { updateRosters, touchRosters } from './rosters.js';
import { createSheetSync, sheetConfig, sheetCsvUrl, matchFeed, feedCsv } from './match-sheet.js';
import { designPreview } from './design-preview.js';
import { previewTournament, tournamentRanking } from './formats/wizard.js';
import { processLogo } from './assets.js';
import { buildBracketEmbed } from './bracket-embed.js';
import { createAccessMiddleware } from './remote-access.js';
import { startRemote, stopRemote, setRemoteEnabled, rotateKey, remoteState, accessKeys } from './remote.js';

const PORT = Number(process.env.PORT) || 4610;
store.load();
const sheetSync = createSheetSync(store);
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(createAccessMiddleware(accessKeys));
app.get('/api/whoami', (req, res) => res.json(req.access));
// Overlays are loaded by OBS / vMix from other machines too: allow cross-origin reads.
// Never for remote-access management: another web page must not read the access keys.
const LOCAL_HOSTS = () => new Set(['localhost', '127.0.0.1', '[::1]', ...Object.values(os.networkInterfaces()).flat().filter(Boolean).map((a) => a.family === 'IPv6' ? `[${a.address}]` : a.address)]);
app.use((req, res, next) => {
  if (/^\/api\/remote/i.test(req.path)) {
    // DNS rebinding: a foreign host name that points at this PC is refused.
    const host = String(req.hostname || '').toLowerCase();
    if (!LOCAL_HOSTS().has(host) && !LOCAL_HOSTS().has(`[${host}]`)) return res.status(403).json({ error: 'Remote access management is local only.' });
    return next();
  }
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

// A switch waits for uploads, imports, processing and renders to finish. A stale
// operator tab cannot write its old tournament's form into the newly active one.
let pendingWrites = 0;
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.get('X-Tournament-Id');
  if (expected && expected !== store.activeId()) return res.status(409).json({ error: 'The active tournament changed. Reload before saving.' });
  pendingWrites++;
  let released = false;
  const release = () => { if (!released) { pendingWrites--; released = true; } };
  res.once('finish', release);
  req.releaseTournamentWrite = release;
  res.once('close', () => { if (!req.tournamentOperationStarted) release(); });
  next();
});

// ---------- static ----------
const noCache = { setHeaders: (res) => res.set('Cache-Control', 'no-cache') };
app.get('/', (req, res) => res.redirect('/control/'));
app.use('/control', express.static(path.join(ROOT, 'public/control'), noCache));
app.use('/shared', express.static(path.join(ROOT, 'public/shared'), noCache));
app.get('/overlay/master.html', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/live.html'), { headers: { 'Cache-Control': 'no-cache' } }));
app.use('/overlay', express.static(path.join(ROOT, 'public/overlay'), noCache));
app.use('/brand', express.static(path.join(ROOT, 'public/brand'), { maxAge: '1h' }));
// Uploaded media are images, never pages: no type sniffing, and any document runs sandboxed.
app.use('/media', (req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }); next(); }, express.static(ASSETS, noCache));
// Raw originals are files to process, never pages: no type sniffing, and any document runs sandboxed.
app.use('/raw', (req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'" }); next(); }, express.static(RAW, noCache));
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
  req.tournamentOperationStarted = true;
  try { res.json(await fn(req, res)); } catch (e) {
    if (e.status !== 404) console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  } finally { req.releaseTournamentWrite?.(); }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

app.get('/api/remote', wrap(() => remoteState()));
app.put('/api/remote', wrap(req => setRemoteEnabled(req.body?.enabled)));
app.post('/api/remote/rotate', wrap(req => rotateKey(req.body?.role)));

function publicState(access = { role: 'local' }) {
  const d = resolvedTournament(store.get());
  return {
    activeTournamentId: store.activeId(), tournaments: store.tournaments(),
    designLibrary: store.designLibrary(),
    capabilities: { photocraft: photocraftStatus() },
    backgrounds: d.backgrounds, graphics: d.graphics, screenCatalog: graphicCatalog(d),
    settings: access.role === 'social' || access.role === 'overlay' ? withoutSecrets(d.settings) : d.settings, teams: d.teams,
    players: d.players,
    matches: d.matches.map(({ stats, ...m }) => ({ ...m, statsCount: stats?.length ?? 0 })),
    sponsors: d.sponsors, features: d.features, live: d.live, unmatched: d.unmatched,
    jobs: listJobs().map(({ log, ...j }) => ({ ...j, log: log.slice(-5) })),
    nextMatch: nextMatch(d)?.id ?? null, today: isoDay(0, d.settings.timezone), rev: d.rev,
  };
}

/** Shared social / overlay links must not carry the stored Drive key or the hll.gr session cookie. */
function withoutSecrets(settings) {
  const out = { ...settings };
  if (out.drive) out.drive = { ...out.drive, apiKey: '' };
  if (out.hllgr) out.hllgr = { ...out.hllgr, cookie: '' };
  return out;
}

function photocraftStatus() {
  try { photocraftExecutable(); return { available: true }; }
  catch { return { available: false }; }
}

function assertCanSwitch() {
  if (jobsRunning() || pendingWrites > 1) throw fail(409, 'Wait for the current import, photo processing, upload or render to finish before switching tournaments.');
}

/** processLogo, with a clear 400 for a file that is not an image. */
async function logoOrFail(buffer, opts) {
  try { return await processLogo(buffer, opts); } catch { throw fail(400, 'Choose a valid PNG, JPEG, WebP or SVG image'); }
}

app.get('/api/tournaments', wrap(() => ({ activeTournamentId: store.activeId(), tournaments: store.tournaments() })));
app.post('/api/formats/preview', wrap(req => previewTournament(req.body ?? {})));
app.post('/api/tournaments/wizard', wrap(req => store.createWizard(req.body)));
app.get('/api/tournaments/:id/wizard', wrap(req => {
  const data = store.getTournament(req.params.id);
  if (!data) throw fail(404, 'Tournament not found');
  return { teams: data.teams, players: data.players, ranking: tournamentRanking(resolvedTournament(data)), matches: resolvedTournament(data).matches, settings: { wizard: data.settings.wizard, brackets: data.settings.brackets } };
}));
app.put('/api/tournaments/:id/wizard', wrap(req => store.regenerateWizard(req.params.id, req.body)));
app.delete('/api/tournaments/:id', wrap(req => store.deleteTournament(req.params.id, req.body?.confirm)));
app.post('/api/tournaments/:id/teams/:teamId/logo', upload.single('file'), wrap(async req => {
  const data = store.getTournament(req.params.id);
  const team = data?.teams.find(t => t.id === req.params.teamId);
  if (!team) throw fail(404, 'Team not found');
  if (!req.file) throw fail(400, 'Choose a logo');
  const { png } = await logoOrFail(req.file.buffer, { size: data.settings.logoSize });
  const rawDir = path.join(RAW, 'teams'), dir = path.join(ASSETS, 'teams');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(rawDir, { recursive: true });
  // Keep only one raw original per team, and only with a raster image extension.
  for (const f of fs.readdirSync(rawDir)) if (f.startsWith(`${team.id}.`)) fs.rmSync(path.join(rawDir, f));
  const ext = path.extname(req.file.originalname).toLowerCase();
  const raster = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
  team.logoRaw = path.join(rawDir, `${team.id}${raster ? ext : '.png'}`);
  fs.writeFileSync(team.logoRaw, raster ? req.file.buffer : await sharp(req.file.buffer, { density: 300 }).png().toBuffer()); fs.writeFileSync(path.join(dir, `${team.id}.png`), png);
  team.logo = `/media/teams/${team.id}.png?v=${Date.now().toString(36)}`;
  store.changed(req.params.id); store.saveNow(); return team;
}));
app.post('/api/tournaments/:id/brand/league-logo', upload.single('file'), wrap(async req => {
  const data = store.getTournament(req.params.id);
  if (!data) throw fail(404, 'Tournament not found');
  if (!req.file) throw fail(400, 'Choose a logo');
  const { png } = await logoOrFail(req.file.buffer);
  const dir = path.join(ASSETS, 'brand'); fs.mkdirSync(dir, { recursive: true });
  const filename = `${req.params.id}-league-logo.png`; fs.writeFileSync(path.join(dir, filename), png);
  data.settings.leagueLogo = `/media/brand/${filename}?v=${Date.now().toString(36)}`;
  store.changed(req.params.id); store.saveNow(); return data.settings;
}));
app.post('/api/tournaments', wrap(req => store.createTournament(req.body)));
app.put('/api/tournaments/:id', wrap(req => store.updateTournament(req.params.id, req.body)));
app.post('/api/tournaments/:id/activate', wrap(req => {
  if (req.params.id !== store.activeId()) assertCanSwitch();
  store.activate(req.params.id);
  broadcast('live', store.get().live);
  return { activeTournamentId: store.activeId(), tournaments: store.tournaments() };
}));
app.get('/api/photocraft/status', wrap(() => photocraftStatus()));
app.get('/api/graphics', wrap(() => ({ graphics: store.get().graphics, catalog: graphicCatalog(store.get()) })));
app.post('/api/graphics', wrap(req => {
  const graphic = newGraphic(req.body, store.get());
  store.get().graphics.push(graphic);
  store.changed();
  return graphic;
}));
app.delete('/api/graphics/:id', wrap(req => {
  const list = store.get().graphics;
  const index = list.findIndex(graphic => graphic.id === req.params.id);
  if (index < 0) throw fail(404, 'Graphic not found');
  list.splice(index, 1);
  store.changed();
  return { ok: true };
}));

// ---------- state + settings ----------
app.get('/api/state', wrap((req) => publicState(req.access)));
app.get('/api/design/presets', wrap(() => store.designLibrary()));
app.post('/api/design/presets', wrap(req => store.saveDesignPreset(req.body)));
app.put('/api/design/presets/:id', wrap(req => store.saveDesignPreset({ ...req.body, id: req.params.id })));
app.delete('/api/design/presets/:id', wrap(req => store.deleteDesignPreset(req.params.id, req.body?.revision)));
app.put('/api/design/default', wrap(req => store.setDefaultDesign(req.body?.presetId, req.body?.revision)));
app.put('/api/design/apply', wrap(req => store.applyDesign(req.body)));
app.post('/api/design/icons', upload.single('file'), wrap(async req => {
  if (!req.file) throw fail(400, 'no file');
  return saveDesignIcon(req.file.buffer);
}));
app.post('/api/design/preview', wrap(req => designPreview(store.get(), req.body?.scene, req.body?.params, req.body?.config)));
app.get('/api/match-sheet', wrap(() => {
  const config = store.get().settings.matchSheet || { enabled: false };
  return { ...config, csvUrl: config.spreadsheetId ? sheetCsvUrl(config) : null };
}));
app.put('/api/match-sheet', wrap(req => {
  const config = sheetConfig(req.body);
  store.get().settings.matchSheet = config;
  store.changed();
  return config;
}));
app.post('/api/match-sheet/sync', wrap(() => sheetSync.run(store.activeId())));
// A bracket page for other websites: one HTML file that reads the public Google Sheet by itself.
app.get('/api/tournaments/:id/bracket-embed.html', async (req, res) => {
  const db = store.getTournament(req.params.id);
  if (!db) return res.status(404).json({ error: 'Tournament not found' });
  try {
    const html = await buildBracketEmbed(db);
    const name = String(db.settings.leagueShort || db.settings.leagueName || 'tournament').replace(/[^\w-]+/g, '-').toLowerCase();
    res.set({ 'Cache-Control': 'no-store', 'Content-Disposition': `${req.query.download === '0' ? 'inline' : 'attachment'}; filename="${name}-bracket.html"` });
    res.type('html').send(html);
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
app.get('/api/tournaments/:id/matches.:format', (req, res) => {
  const db = store.getTournament(req.params.id);
  if (!db) return res.status(404).json({ error: 'Tournament not found' });
  res.set('Cache-Control', 'no-store');
  const feed = matchFeed(db, req.params.id);
  if (req.params.format === 'json') return res.json(feed);
  if (req.params.format === 'csv') return res.type('text/csv').send(feedCsv(feed));
  return res.status(404).json({ error: 'Choose json or csv' });
});
app.put('/api/brackets/:id/draw', wrap(req => {
  if (store.get().settings.matchSheet?.enabled) throw fail(409, 'Edit the GSL draw in the connected Google Sheet (source_a / source_b).');
  const result = updateBracketDraw(store.get(), req.params.id, req.body);
  store.changed();
  return result;
}));
app.put('/api/rosters', wrap(req => {
  const result = updateRosters(store.get(), req.body);
  store.changed();
  return result;
}));
app.put('/api/settings', wrap((req) => {
  const d = store.get();
  const body = req.body ?? {};
  if (body.matchSheet !== undefined) throw fail(400, 'Use the Google Sheet connection panel to change the match source');
  if (body.graphicDesign !== undefined) throw fail(400, 'Use the shared Graphics designer to change screen design');
  if (body.photo?.engine !== undefined && !['standard', 'photocraft'].includes(body.photo.engine)) throw fail(400, 'Unknown photo processor');
  if (body.photo?.engine === 'photocraft' && !photocraftStatus().available) throw fail(400, 'PhotoCraft is not installed on this PC.');
  if (body.enabledScenes !== undefined && (!Array.isArray(body.enabledScenes) || body.enabledScenes.some(scene => !SCENES.includes(scene)))) throw fail(400, 'Unknown enabled screen');
  if (body.rosterStyle !== undefined && !['photos', 'text'].includes(body.rosterStyle)) throw fail(400, 'Choose photos or text for rosters');
  store.validateSettings(body);
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
const clean = (body) => {
  if (body?.photoProcessor !== undefined && !['inherit', 'standard', 'photocraft'].includes(body.photoProcessor)) throw fail(400, 'Unknown photo processor');
  if (body?.photoProcessor === 'photocraft' && !photocraftStatus().available) throw fail(400, 'PhotoCraft is not installed on this PC.');
  return Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => !READONLY.has(k)));
};

for (const coll of Object.keys(PREFIX)) {
  app.post(`/api/${coll}`, wrap((req) => {
    if (coll === 'matches' && store.get().settings.matchSheet?.enabled) throw fail(409, 'Matches are managed in Google Sheets. Edit the sheet or disable its connection in Settings.');
    const item = { id: newId(PREFIX[coll]), ...DEFAULTS[coll](), ...clean(req.body) };
    if (coll === 'matches') validateSources([...store.get().matches, item]);
    store.get()[coll].push(item);
    if (coll === 'players') touchRosters(store.get(), [item.teamId]);
    if (coll === 'matches') syncBracket(store.get());
    store.changed();
    return item;
  }));
  app.put(`/api/${coll}/:id`, wrap((req) => {
    if (coll === 'matches' && store.get().settings.matchSheet?.enabled) throw fail(409, 'Matches are managed in Google Sheets. Edit the sheet or disable its connection in Settings.');
    const item = store.get()[coll].find((x) => x.id === req.params.id);
    if (!item) throw fail(404, 'not found');
    const body = clean(req.body);
    if (coll === 'matches') validateSources(store.get().matches.map(match => match.id === item.id ? { ...match, ...body } : match));
    if (coll === 'teams' && body.colors) body.colorsManual = true;
    const previousTeam = item.teamId;
    Object.assign(item, body);
    if (coll === 'players') touchRosters(store.get(), [previousTeam, item.teamId]);
    if (coll === 'matches') syncBracket(store.get());
    store.changed();
    return item;
  }));
  app.delete(`/api/${coll}/:id`, wrap((req) => {
    if (coll === 'matches' && store.get().settings.matchSheet?.enabled) throw fail(409, 'Matches are managed in Google Sheets. Edit the sheet or disable its connection in Settings.');
    const list = store.get()[coll];
    const i = list.findIndex((x) => x.id === req.params.id);
    if (i < 0) throw fail(404, 'not found');
    if (coll === 'matches' && (list.some(m => m.teamASource?.matchId === req.params.id || m.teamBSource?.matchId === req.params.id) || bracketDefinitions(store.get()).some(bracket => bracket.rounds?.some(round => round.matches?.includes(req.params.id))))) throw fail(409, 'Remove this match from the bracket and its winner sources before deleting it');
    const [removed] = list.splice(i, 1);
    if (coll === 'players') touchRosters(store.get(), [removed.teamId]);
    if (coll === 'teams') for (const p of store.get().players) if (p.teamId === req.params.id) p.teamId = null;
    store.changed();
    return { ok: true };
  }));
}

// ---------- assets ----------
const KIND_COLL = { team: 'teams', player: 'players', sponsor: 'sponsors' };

app.post('/api/backgrounds', upload.single('file'), wrap(async req => {
  if (!req.file) throw fail(400, 'Choose a background image');
  const background = await saveBackground(req.file.buffer, req.file.originalname, store.activeId());
  store.get().backgrounds.push(background);
  store.changed();
  return background;
}));

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
  // Only real images are kept; any other image type (SVG, GIF, …) is stored as PNG.
  let ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  let buffer = req.file.buffer;
  try { await sharp(buffer).metadata(); } catch { throw fail(400, 'This file is not an image. Use PNG, JPG or WebP.'); }
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) { buffer = await sharp(buffer).png().toBuffer(); ext = '.png'; }
  const filename = `${store.activeId()}-${slot}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  const url = `/media/brand/${filename}?v=${Date.now().toString(36)}`;
  const s = store.get().settings;
  if (slot === 'bg') s.theme.bgImage = s.theme.versusBgImage = s.theme.socialBgImage = url; else s.leagueLogo = url;
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
  if (!store.get().settings.hllgr.baseUrl) throw fail(400, 'Set this tournament’s HLL.GR source URL in Settings before syncing.');
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
  const nextScene = scene === undefined ? d.live.scene : scene;
  const nextParams = params === undefined ? d.live.params : params;
  if ((visible ?? d.live.visible) && nextScene) sceneData(nextScene, nextParams ?? {});
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
  for (const res of clients) {
    if (event === 'remote' && res.locals.remoteAccess?.remote) continue;
    res.write(msg);
  }
}
let stateTimer = null;
store.onChange((rev) => {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => broadcast('state', { rev }), 120);
});
// Data sync between PCs (data/ is a private git repository; see server/data-sync.js).
startDataSync(store, (s) => broadcast('sync', s), () => broadcast('state', { rev: store.get().rev }));
app.get('/api/sync', wrap(() => syncState()));
app.post('/api/sync/now', wrap(() => syncNow(store)));
app.get('/api/live/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: live\ndata: ${JSON.stringify(store.get().live)}\n\n`);
  if (!req.access.remote) res.write(`event: remote\ndata: ${JSON.stringify(remoteState())}\n\n`);
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
app.get('/api/output', wrap(async () => {
  const dir = store.get().settings.outputDir;
  if (!fs.existsSync(dir)) return [];
  const index = readIndex(dir);
  const files = await Promise.all(fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).map(async (name) => {
    const file = path.join(dir, name);
    const mtime = fs.statSync(file).mtimeMs;
    let width, height;
    try { ({ width, height } = await sharp(file).metadata()); } catch { /* file is still being written */ }
    return { name, file, width, height, scene: index[name]?.scene || guessScene(name), url: `/output/${encodeURIComponent(name)}?v=${Math.round(mtime).toString(36)}`, mtime };
  }));
  return files.sort((a, b) => b.mtime - a.mtime);
}));

app.use('/api', (req, res) => res.status(404).json({ error: `no route ${req.method} ${req.path}` }));

// Upload limits and malformed uploads: a short message for the panel, not a stack trace.
app.use((err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too big (40 MB maximum).' : `Upload failed: ${err.message}` });
});

// ---------- start ----------
setPort(PORT);
const server = app.listen(PORT, () => {
  console.log(`HLL graphics: control panel http://localhost:${PORT}/  ·  live overlay http://localhost:${PORT}/overlay/live.html`);
  if (process.env.HLL_TEST !== '1') refreshDdragon().catch(() => {});
  sheetSync.start();
  startRemote({ port: PORT, onState: state => broadcast('remote', state) });
});
const shutdown = async () => { sheetSync.stop(); await stopRemote(); store.saveNow(); await closeBrowser(); server.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (process.env.HLL_TEST === '1' && process.send) process.on('message', message => { if (message === 'shutdown') void shutdown(); });
