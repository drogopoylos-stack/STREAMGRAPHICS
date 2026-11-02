import fs from 'node:fs';
import path from 'node:path';
import { DATA, OUTPUT_DEFAULT, deepMerge, newId } from './util.js';

const FILE = path.join(DATA, 'db.json');

const DEFAULT_SETTINGS = {
  leagueName: 'Hellenic Legends League',
  leagueShort: 'HLL',
  season: 'Season 1',
  timezone: 'Europe/Athens',
  mode: 'full',
  // preset picks the plates /brand/<preset>-main.jpg, -versus.jpg, -stage.jpg ('sparta' = league logo colours, 'aegean' = navy/gold).
  theme: { preset: 'sparta', primary: '#141414', accent: '#c8102e', accent2: '#f2c230', text: '#ffffff', bgImage: null },
  bracketEmbed: '',
  outputDir: OUTPUT_DEFAULT,
  logoSize: 512,
  photo: { width: 800, height: 1000, framing: 'upper', removeBg: true, harmonize: true, strength: 0.7, engine: 'standard' },
  // League of Legends, per game (values come from the HLL.GR postgame tables).
  statDefs: [
    { key: 'kda', label: 'KDA', better: 'high', fmt: 'dec2' },
    { key: 'kills', label: 'Kills', better: 'high', fmt: 'dec1' },
    { key: 'deaths', label: 'Deaths', better: 'low', fmt: 'dec1' },
    { key: 'assists', label: 'Assists', better: 'high', fmt: 'dec1' },
    { key: 'kp', label: 'Kill Participation', better: 'high', fmt: 'pct' },
    { key: 'damage', label: 'Damage', better: 'high', fmt: 'int' },
    { key: 'gold', label: 'Gold', better: 'high', fmt: 'int' },
    { key: 'cspm', label: 'CS / min', better: 'high', fmt: 'dec1' },
  ],
  drive: { apiKey: '' },
  hllgr: { baseUrl: 'https://hll.gr', cookie: '' },
  sponsorsOnGraphics: true,
  leagueLogo: '/brand/hll-logo.png',
};

const EMPTY = () => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  teams: [], players: [], matches: [], sponsors: [], features: [],
  live: { scene: null, params: {}, visible: false, rev: 0 },
  unmatched: [], backgrounds: [], graphics: [],
  rev: 0,
});

const failure = (status, message) => Object.assign(new Error(message), { status });
const text = (value, label, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw failure(400, `${label} must be ${required ? 'non-empty text' : 'text'} up to ${max} characters`);
  return value.trim();
};
function days(value = []) {
  if (!Array.isArray(value) || value.some(d => !Number.isInteger(d) || d < 1 || d > 7)) throw failure(400, 'Broadcast days must be weekdays from 1 (Monday) to 7 (Sunday)');
  return [...new Set(value)].sort();
}
function normalize(raw) {
  const data = deepMerge(EMPTY(), raw);
  data.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), raw.settings ?? {});
  if (raw.settings?.statDefs) data.settings.statDefs = raw.settings.statDefs;
  return data;
}

/** One durable database containing independent tournament workspaces. */
export function createStore({ file = FILE, outputRoot = OUTPUT_DEFAULT } = {}) {
  let root = null;
  let saveTimer = null;
  const listeners = new Set();
  const activeRecord = () => root.tournaments.find(t => t.id === root.activeTournamentId);
  const ensure = () => { if (!root) load(); };

  function load() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const existed = fs.existsSync(file);
    const raw = existed ? JSON.parse(fs.readFileSync(file, 'utf8')) : EMPTY();
    if (raw.schemaVersion === 2) {
      if (!Array.isArray(raw.tournaments) || !raw.tournaments.length || new Set(raw.tournaments.map(t => t.id)).size !== raw.tournaments.length || !raw.tournaments.some(t => t.id === raw.activeTournamentId)) throw new Error('Invalid tournament database; the saved file has been left unchanged');
      root = raw;
      for (const record of root.tournaments) record.data = normalize(record.data);
    } else {
      if (raw.schemaVersion != null) throw new Error('Unsupported tournament database version');
      if (existed) fs.copyFileSync(file, `${file}.before-tournaments-${Date.now()}.json`, fs.constants.COPYFILE_EXCL);
      root = { schemaVersion: 2, activeTournamentId: 'tr_hll', revision: raw.rev ?? 0,
        tournaments: [{ id: 'tr_hll', createdAt: new Date().toISOString(), broadcastDays: [], data: normalize(raw) }] };
      saveNow();
    }
    return activeRecord().data;
  }
  function get() { ensure(); return activeRecord().data; }
  function activeId() { ensure(); return root.activeTournamentId; }
  function saveNow() {
    ensure();
    clearTimeout(saveTimer);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(root, null, 2));
    fs.renameSync(tmp, file);
  }
  function changed() {
    get().rev++;
    root.revision++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 150);
    for (const fn of listeners) fn(root.revision);
  }
  function tournaments() {
    ensure();
    return root.tournaments.map(({ id, createdAt, broadcastDays, data }) => ({ id, name: data.settings.leagueName, short: data.settings.leagueShort, season: data.settings.season, createdAt, broadcastDays: broadcastDays ?? [], teams: data.teams.length, players: data.players.length, matches: data.matches.length }));
  }
  function createTournament(body = {}) {
    const name = text(body.name, 'Tournament name', 100, true);
    const short = text(body.short ?? name.slice(0, 8).toUpperCase(), 'Short name', 8, true);
    const season = text(body.season ?? '', 'Season', 80);
    const broadcastDays = days(body.broadcastDays);
    const inheritedPhoto = structuredClone(get().settings.photo);
    delete inheritedPhoto.look;
    const id = newId('tr');
    const data = EMPTY();
    Object.assign(data.settings, { leagueName: name, leagueShort: short, season, leagueLogo: '/brand/tournament.svg', outputDir: path.join(outputRoot, 'tournaments', id), timezone: get().settings.timezone, photo: inheritedPhoto });
    data.settings.hllgr.baseUrl = '';
    data.settings.theme = { preset: 'aegean', primary: '#0a1828', accent: '#d6a44c', accent2: '#8bbaec', text: '#ffffff', bgImage: null };
    root.tournaments.push({ id, createdAt: new Date().toISOString(), broadcastDays, data });
    changed();
    saveNow();
    return tournaments().find(t => t.id === id);
  }
  function updateTournament(id, body = {}) {
    ensure();
    const record = root.tournaments.find(t => t.id === id);
    if (!record) throw failure(404, 'Tournament not found');
    // Validate the complete patch before changing any saved field.
    const patch = {};
    if (body.name !== undefined) patch.leagueName = text(body.name, 'Tournament name', 100, true);
    if (body.short !== undefined) patch.leagueShort = text(body.short, 'Short name', 8, true);
    if (body.season !== undefined) patch.season = text(body.season, 'Season', 80);
    const broadcastDays = body.broadcastDays === undefined ? record.broadcastDays : days(body.broadcastDays);
    Object.assign(record.data.settings, patch);
    record.broadcastDays = broadcastDays;
    changed();
    saveNow();
    return tournaments().find(t => t.id === id);
  }
  function activate(id) {
    ensure();
    const record = root.tournaments.find(t => t.id === id);
    if (!record) throw failure(404, 'Tournament not found');
    if (id === activeId()) return get();
    const liveRev = Math.max(...root.tournaments.map(t => t.data.live.rev ?? 0)) + 1;
    get().live.visible = false;
    root.activeTournamentId = id;
    record.data.live.visible = false;
    record.data.live.rev = liveRev;
    changed();
    saveNow();
    return get();
  }
  return { load, get, saveNow, changed, activeId, tournaments, createTournament, updateTournament, activate,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}

const store = createStore();
export const { load, get, saveNow, changed, onChange, activeId, tournaments, createTournament, updateTournament, activate } = store;

export const COLLECTIONS = { teams: 't', players: 'p', matches: 'm', sponsors: 's', features: 'f' };
