// Riot Data Dragon: champion name → icon. Icons are cached under data/assets/champions/
// so the graphics also work without internet during a stream.
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS, DATA, nameKey } from './util.js';

const CACHE = path.join(DATA, 'ddragon.json');
const ICONS = path.join(ASSETS, 'champions');
let index = null; // { version, byKey: { nameKey: championId } }

function loadIndex() {
  if (index) return index;
  try { index = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { index = null; }
  return index;
}

/** Download the champion list once (or when `force`). Safe to call without internet. */
export async function refreshDdragon(force = false) {
  if (loadIndex() && !force) return index;
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const version = versions[0];
  const data = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).json();
  const byKey = {};
  for (const c of Object.values(data.data)) {
    byKey[nameKey(c.name)] = c.id;
    byKey[nameKey(c.id)] = c.id;
  }
  index = { version, byKey };
  fs.writeFileSync(CACHE, JSON.stringify(index));
  return index;
}

export function championId(name) {
  const idx = loadIndex();
  return idx?.byKey[nameKey(name)] ?? null;
}

/** Local icon URL if cached, else the Data Dragon URL (and cache it in the background). */
export function championIcon(name) {
  const id = championId(name);
  if (!id) return null;
  const file = path.join(ICONS, `${id}.png`);
  if (fs.existsSync(file)) return `/media/champions/${id}.png`;
  const url = `https://ddragon.leagueoflegends.com/cdn/${index.version}/img/champion/${id}.png`;
  cacheIcon(url, file);
  return url;
}

const pending = new Set();
function cacheIcon(url, file) {
  if (pending.has(file)) return;
  pending.add(file);
  fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .then((buf) => { fs.mkdirSync(ICONS, { recursive: true }); fs.writeFileSync(file, Buffer.from(buf)); })
    .catch(() => {})
    .finally(() => pending.delete(file));
}
