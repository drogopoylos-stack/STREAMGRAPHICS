// Image pipeline: team logos, player photos, sponsor logos.
// Raw files go to data/raw/<kind>/, processed PNGs to data/assets/<kind>/ (served at /media/).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as store from './db.js';
import { ASSETS, RAW, newId, bestMatch, nameKey, IMAGE_EXT } from './util.js';
import { labStats, targetLook, harmonize, keyOutBackground, dominantColors } from './lib/colour.js';
import { removeBackground } from './bgremove.js';

const KIND_DIR = { team: 'teams', player: 'players', sponsor: 'sponsors' };
const COLLECTION = { team: 'teams', player: 'players', sponsor: 'sponsors' };
const IMAGE_FIELD = { team: 'logo', player: 'photo', sponsor: 'logo' };

sharp.cache(false);

function mediaUrl(kind, id) {
  return `/media/${KIND_DIR[kind]}/${id}.png?v=${Date.now().toString(36)}`;
}

/** Raw RGBA of any image file / buffer (SVG rasterised large). */
async function rawRgba(input) {
  const img = sharp(input, { density: 300, animated: false, failOn: 'none' }).rotate();
  return img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function alphaBox(data, w, h, min = 16) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= min) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** True when the image already has a real transparent background (≥ 2 % of the border is see-through). */
function hasTransparentBorder(data, w, h) {
  let total = 0, clear = 0;
  const check = (x, y) => { total++; if (data[(y * w + x) * 4 + 3] < 250) clear++; };
  for (let x = 0; x < w; x++) { check(x, 0); check(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { check(0, y); check(w - 1, y); }
  return clear / total >= 0.02;
}

function raw(data, info) {
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

// ---------- logos ----------

/** Logo → transparent, trimmed, centred in a square canvas. Returns { png, colors, keyed }. */
export async function processLogo(input, { size = 512, square = true, maxW = 800, maxH = 400 } = {}) {
  let { data, info } = await rawRgba(input);
  const keyed = keyOutBackground(data, info.width, info.height, { tolerance: 22, feather: 6 });
  data = keyed.rgba;
  const box = alphaBox(data, info.width, info.height);
  let img = raw(data, info);
  if (box) img = sharp(await img.extract(box).png().toBuffer());
  let png;
  if (square) {
    const inner = Math.round(size * 0.9);
    const fitted = await img.resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: fitted, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
  } else {
    png = await img.resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false }).png({ compressionLevel: 9 }).toBuffer();
  }
  const small = await sharp(png).resize(160, 160, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colors = dominantColors(small.data, small.info.width, small.info.height, 3);
  return { png, colors, keyed: keyed.removed };
}

// ---------- player photos ----------

/** Cut-out of a player photo (no framing yet): raw RGBA trimmed to the figure. */
async function cutout(input, removeBg) {
  let { data, info } = await rawRgba(input);
  let removed = false;
  if (removeBg && !hasTransparentBorder(data, info.width, info.height)) {
    ({ data, info } = await removeBackground(await sharp(input).rotate().png().toBuffer()));
    removed = true;
  }
  const box = alphaBox(data, info.width, info.height, 24);
  if (box && (box.width < info.width || box.height < info.height)) {
    const out = await raw(data, info).extract(box).raw().toBuffer({ resolveWithObject: true });
    ({ data, info } = out);
  }
  return { data, info, removed };
}

/** Place a trimmed figure in a W×H canvas. 'upper' = head and shoulders fill the frame. */
async function frame(data, info, { width = 800, height = 1000, framing = 'upper' } = {}) {
  const bw = info.width, bh = info.height;
  const regionH = framing === 'upper' ? Math.min(bh, bw * 1.25) : bh;
  const scale = Math.min((width * 0.96) / bw, (height * 0.96) / regionH);
  const sw = Math.max(1, Math.round(bw * scale)), sh = Math.max(1, Math.round(bh * scale));
  const resized = await raw(data, info).resize(sw, sh, { kernel: 'lanczos3' }).png().toBuffer();
  const top = Math.round(height * 0.04);
  const left = Math.round((width - sw) / 2);
  // Composite needs the overlay inside the canvas: crop what falls below the bottom edge.
  const visibleH = Math.min(sh, height - top);
  const part = visibleH < sh ? await sharp(resized).extract({ left: 0, top: 0, width: sw, height: visibleH }).png().toBuffer() : resized;
  const cropL = Math.max(0, -left);
  const visW = Math.min(sw - cropL, width);
  const part2 = cropL || visW < sw ? await sharp(part).extract({ left: cropL, top: 0, width: visW, height: visibleH }).png().toBuffer() : part;
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part2, left: Math.max(0, left), top }])
    .png({ compressionLevel: 9 }).toBuffer();
}

function cutoutFile(id) { return path.join(RAW, 'cutouts', `${id}.png`); }

/** Step 1 for one player: cut out and measure. Saves the cut-out and photoStats on the player. */
async function preparePlayer(p, settings) {
  if (!p.photoRaw || !fs.existsSync(p.photoRaw)) return false;
  const { data, info, removed } = await cutout(p.photoRaw, settings.photo.removeBg);
  fs.mkdirSync(path.dirname(cutoutFile(p.id)), { recursive: true });
  await raw(data, info).png().toFile(cutoutFile(p.id));
  p.photoStats = labStats(data, info.width, info.height, { alphaMin: 128, step: 3 });
  p.bgRemoved = removed;
  return true;
}

/** Step 2 for one player: colour match to the league look, frame, save. */
async function finishPlayer(p, settings, look) {
  const file = cutoutFile(p.id);
  if (!fs.existsSync(file)) return false;
  let { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ph = settings.photo;
  if (ph.harmonize && look && p.photoStats?.mean && !p.noHarmonize) {
    data = harmonize(data, info.width, info.height, p.photoStats, look, { strength: ph.strength ?? 0.7, protectSkin: true });
  }
  const png = await frame(data, info, ph);
  fs.mkdirSync(path.join(ASSETS, 'players'), { recursive: true });
  fs.writeFileSync(path.join(ASSETS, 'players', `${p.id}.png`), png);
  p.photo = mediaUrl('player', p.id);
  return true;
}

/** The league look = robust median of all player photo colour stats (cached in settings). */
function currentLook(db) {
  const look = targetLook(db.players.map((p) => p.photoStats).filter((s) => s?.mean));
  db.settings.photo.look = look;
  return look;
}

// ---------- entity image ingest ----------

function saveRaw(kind, id, buffer, ext) {
  const dir = path.join(RAW, KIND_DIR[kind]);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${id}.`)) fs.rmSync(path.join(dir, f));
  const file = path.join(dir, `${id}${ext.toLowerCase()}`);
  fs.writeFileSync(file, buffer);
  return file;
}

/** Process the raw image of one entity and update it in the db. */
export async function processEntity(kind, entity, { lookOverride } = {}) {
  const db = store.get();
  const s = db.settings;
  if (kind === 'player') {
    if (!(await preparePlayer(entity, s))) return entity;
    const look = lookOverride ?? s.photo.look ?? currentLook(db);
    await finishPlayer(entity, s, look);
  } else {
    const rawFile = entity.logoRaw;
    if (!rawFile || !fs.existsSync(rawFile)) return entity;
    const { png, colors } = await processLogo(rawFile, kind === 'team' ? { size: s.logoSize, square: true } : { square: false });
    fs.mkdirSync(path.join(ASSETS, KIND_DIR[kind]), { recursive: true });
    fs.writeFileSync(path.join(ASSETS, KIND_DIR[kind], `${entity.id}.png`), png);
    entity.logo = mediaUrl(kind, entity.id);
    if (kind === 'team' && !entity.colorsManual) {
      // First strong colour = primary; skip near-black / near-white for the accent when possible.
      const vivid = colors.filter((c) => !/^#(?:[0-2][0-9a-f]){3}$|^#(?:[e-f][0-9a-f]){3}$/i.test(c));
      entity.colors = { primary: vivid[0] ?? colors[0] ?? '#444444', secondary: vivid[1] ?? colors[1] ?? '#888888' };
    }
  }
  store.changed();
  return entity;
}

/** Store a new image for an entity (buffer from upload / download / local file) and process it. */
export async function setEntityImage(kind, entity, buffer, ext = '.png') {
  const file = saveRaw(kind, entity.id, buffer, ext);
  if (kind === 'player') entity.photoRaw = file; else entity.logoRaw = file;
  return processEntity(kind, entity);
}

export async function setEntityImageFromUrl(kind, entity, url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`download ${url}: HTTP ${r.status}`);
  const ext = path.extname(new URL(url).pathname) || '.png';
  return setEntityImage(kind, entity, Buffer.from(await r.arrayBuffer()), ext);
}

/** Re-run the pipeline: all players in two passes (so the league look uses every photo). */
export async function reprocessAllPlayers(job) {
  const db = store.get();
  const list = db.players.filter((p) => p.photoRaw);
  let i = 0;
  for (const p of list) {
    job?.progress((i++ / list.length) * 0.6, `Cut-out ${p.nick}`);
    try { await preparePlayer(p, db.settings); } catch (e) { job?.log(`${p.nick}: ${e.message}`); }
  }
  const look = currentLook(db);
  i = 0;
  for (const p of list) {
    job?.progress(0.6 + (i++ / list.length) * 0.4, `Colour + frame ${p.nick}`);
    try { await finishPlayer(p, db.settings, look); } catch (e) { job?.log(`${p.nick}: ${e.message}`); }
  }
  store.changed();
  return { players: list.length };
}

export async function reprocessAll(kind, job) {
  if (kind === 'all-players' || kind === 'player') return reprocessAllPlayers(job);
  const db = store.get();
  const list = db[COLLECTION[kind]];
  let i = 0;
  for (const e of list) {
    job?.progress(i++ / list.length, `${kind} ${e.name ?? e.id}`);
    try { await processEntity(kind, e); } catch (err) { job?.log(`${e.name}: ${err.message}`); }
  }
  return { [kind]: list.length };
}

// ---------- folder import (local folder or Google Drive) ----------

const KIND_HINTS = [
  ['sponsor', /sponsor|χορηγ|partner/i],
  ['team', /logo|team|ομαδ|ομάδ|σημα|σήμα/i],
  ['player', /player|παικτ|παίκτ|photo|φωτο|roster/i],
];

function kindFromPath(parts) {
  for (const part of [...parts].reverse()) {
    for (const [kind, re] of KIND_HINTS) if (re.test(part)) return kind;
  }
  return null;
}

/**
 * Link one imported file to an entity. `item` = { name, folders: [..], read: async () => Buffer }.
 * Returns a log line.
 */
export async function importItem(item, forcedKind) {
  const db = store.get();
  const base = item.name.replace(/\.[^.]+$/, '').replace(/[-_ ]*(logo|photo|final|white|black|\d{2,4}x\d{2,4})$/i, '');
  const ext = path.extname(item.name) || '.png';
  const hinted = forcedKind && forcedKind !== 'auto' ? forcedKind : kindFromPath(item.folders);
  // A sub-folder named like a team narrows player matching to that team.
  const folderTeam = item.folders.map((f) => bestMatch(f, db.teams, (t) => [t.name, t.tag, t.extId])).find(Boolean) ?? null;

  const tryKinds = hinted ? [hinted] : ['player', 'team', 'sponsor'];
  for (const kind of tryKinds) {
    let target = null;
    if (kind === 'player') {
      const pool = folderTeam ? db.players.filter((p) => p.teamId === folderTeam.id) : db.players;
      target = bestMatch(base, pool, (p) => [p.nick, p.extId, p.name]);
      if (!target && folderTeam && hinted === 'player') {
        target = { id: newId('p'), teamId: folderTeam.id, nick: base, name: '', role: '', photo: null, country: null, captain: false, source: 'import', extId: null };
        db.players.push(target);
      }
    } else if (kind === 'team') {
      target = bestMatch(base, db.teams, (t) => [t.name, t.tag, t.extId]);
      if (!target && hinted === 'team') {
        target = { id: newId('t'), name: base, tag: base.slice(0, 4).toUpperCase(), logo: null, colors: { primary: '#444444', secondary: '#888888' }, source: 'import', extId: null };
        db.teams.push(target);
      }
    } else if (kind === 'sponsor') {
      target = bestMatch(base, db.sponsors, (s) => [s.name]);
      if (!target && hinted === 'sponsor') {
        target = { id: newId('s'), name: base, logo: null, tier: 'partner' };
        db.sponsors.push(target);
      }
    }
    if (target) {
      await setEntityImage(kind, target, await item.read(), ext);
      return `${item.name} → ${kind} ${target.nick ?? target.name}`;
    }
  }

  // Not matched: keep it for manual assignment in the control panel.
  const dir = path.join(RAW, 'unmatched');
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${Date.now().toString(36)}_${item.name.replace(/[^\w.\-]+/g, '_')}`;
  fs.writeFileSync(path.join(dir, safe), await item.read());
  db.unmatched.push({ file: safe, name: item.name, url: `/raw/unmatched/${encodeURIComponent(safe)}`, kind: hinted ?? 'unknown', folders: item.folders, guess: null });
  store.changed();
  return `${item.name} → not matched (assign it by hand)`;
}

/** Assign an unmatched file to an entity. */
export async function assignUnmatched(file, kind, id) {
  const db = store.get();
  const idx = db.unmatched.findIndex((u) => u.file === file);
  if (idx < 0) throw Object.assign(new Error('file not found'), { status: 404 });
  const entity = db[COLLECTION[kind]]?.find((e) => e.id === id);
  if (!entity) throw Object.assign(new Error(`${kind} not found`), { status: 404 });
  const full = path.join(RAW, 'unmatched', file);
  await setEntityImage(kind, entity, fs.readFileSync(full), path.extname(file));
  fs.rmSync(full, { force: true });
  db.unmatched.splice(idx, 1);
  store.changed();
  return entity;
}

/** Walk a local folder (for example a "Google Drive for desktop" folder). */
export function listLocalFolder(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Object.assign(new Error(`folder not found: ${root}`), { status: 400 });
  const out = [];
  const walk = (dir, folders) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, [...folders, ent.name]);
      else if (IMAGE_EXT.test(ent.name)) out.push({ name: ent.name, folders, read: async () => fs.readFileSync(full) });
    }
  };
  walk(root, [path.basename(root)]);
  return out;
}

export { nameKey };
