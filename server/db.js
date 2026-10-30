import fs from 'node:fs';
import path from 'node:path';
import { DATA, OUTPUT_DEFAULT, deepMerge } from './util.js';

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
  photo: { width: 800, height: 1000, framing: 'upper', removeBg: true, harmonize: true, strength: 0.7 },
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
  unmatched: [],
  rev: 0,
});

let db = null;
let saveTimer = null;
const listeners = new Set();

export function load() {
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db = deepMerge(EMPTY(), raw);
    db.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), raw.settings ?? {});
    if (raw.settings?.statDefs) db.settings.statDefs = raw.settings.statDefs;
  } else {
    db = EMPTY();
    flush();
  }
  return db;
}

export function get() {
  return db ?? load();
}

function flush() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Mark the db changed: bump rev, save soon, notify listeners (SSE). */
export function changed() {
  db.rev++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
  for (const fn of listeners) fn(db.rev);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveNow() {
  clearTimeout(saveTimer);
  flush();
}

export const COLLECTIONS = { teams: 't', players: 'p', matches: 'm', sponsors: 's', features: 'f' };
