import fs from 'node:fs';
import path from 'node:path';
import { ASSETS, RAW, DATA, OUTPUT_DEFAULT, deepMerge, newId } from './util.js';
import { BUILTIN_DESIGNS, normalizeDesign } from '../public/shared/graphic-design.js';

import { previewTournament, validateWizard, decorateTournament, toBroadcastDays, generatedIds, canRegenerate } from './formats/wizard.js';
import { SCENE_IDS } from '../public/shared/scenes.js';
import { standings as tournamentStandings } from './formats/index.js';
export { tournamentStandings };
import { syncBracket } from './bracket.js';

const FILE = path.join(DATA, 'db.json');

const DEFAULT_SETTINGS = {
  leagueName: 'Hellenic Legends League',
  leagueShort: 'HLL',
  season: 'Season 1',
  timezone: 'Europe/Athens',
  mode: 'full',
  rosterStyle: 'photos',
  // Social graphics: 'classic' keeps the current social scenes, 'supercup' uses the SUPERCUP 2027 look.
  socialStyle: 'classic',
  socialLogo: '',
  // preset picks the plates /brand/<preset>-main.jpg, -versus.jpg, -stage.jpg ('sparta' = league logo colours, 'aegean' = navy/gold).
  theme: { preset: 'sparta', primary: '#141414', accent: '#c8102e', accent2: '#f2c230', text: '#ffffff', bgImage: null, socialBgPost: null, socialBgStory: null },
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

const imageUrl = (value) => value == null || value === '' || (typeof value === 'string' && value.trim().length <= 500 && /^(\/|https?:\/\/)/i.test(value.trim()));

/** Validate the social settings before a PUT /api/settings patch is merged. */
export function validateSettings(body = {}) {
  if (body.socialStyle !== undefined && !['classic', 'supercup'].includes(body.socialStyle)) throw failure(400, 'Choose classic or supercup for the social graphics style');
  if (body.socialLogo !== undefined && !imageUrl(body.socialLogo)) throw failure(400, 'The social logo must be an image URL or empty');
  if (body.theme !== undefined) {
    if (body.theme === null || typeof body.theme !== 'object' || Array.isArray(body.theme)) throw failure(400, 'Theme must be an object');
    for (const key of ['socialBgPost', 'socialBgStory']) {
      if (body.theme[key] !== undefined && !imageUrl(body.theme[key])) throw failure(400, `Choose an image URL or empty for ${key}`);
    }
  }
  return body;
}
function normalize(raw) {
  const data = deepMerge(EMPTY(), raw);
  data.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), raw.settings ?? {});
  if (raw.settings?.statDefs) data.settings.statDefs = raw.settings.statDefs;
  return data;
}

/** One durable database containing independent tournament workspaces. */
/**
 * The database is synced between PCs (data/ is its own git repository), but it keeps full paths of the
 * PC that wrote them. Point them into this PC's folders: raw originals under RAW, export folders under
 * the output root. A custom export folder that exists on this PC stays as it is.
 */
export function localPaths(data, outputRoot = OUTPUT_DEFAULT) {
  const under = (p, base) => path.resolve(p).toLowerCase().startsWith(path.resolve(base).toLowerCase());
  const after = (p, dir) => { const m = new RegExp(`[\\\\/]${dir}[\\\\/](.+)$`, 'i').exec(p); return m ? m[1].split(/[\\/]/) : null; };
  const raw = p => {
    if (typeof p !== 'string' || !p || under(p, RAW)) return p;
    const rest = after(p, 'raw');
    return rest ? path.join(RAW, ...rest) : p;
  };
  for (const list of [data.teams, data.players, data.sponsors]) for (const item of list || []) {
    if (item.logoRaw) item.logoRaw = raw(item.logoRaw);
    if (item.photoRaw) item.photoRaw = raw(item.photoRaw);
  }
  const dir = data.settings?.outputDir;
  if (typeof dir === 'string' && dir && !under(dir, outputRoot) && !fs.existsSync(dir)) {
    const rest = after(`${dir}${path.sep}`, 'output');
    data.settings.outputDir = rest ? path.join(outputRoot, ...rest.filter(Boolean)) : outputRoot;
  }
  return data;
}

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
      for (const record of root.tournaments) record.data = localPaths(normalize(record.data), outputRoot);
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
  function getTournament(id) { ensure(); return root.tournaments.find(t => t.id === id)?.data; }
  function designLibrary() {
    ensure();
    const library = root.designLibrary || { revision: 0, presets: [], defaultPresetId: 'original' };
    return structuredClone({ ...library, presets: [...BUILTIN_DESIGNS, ...library.presets] });
  }
  function editLibrary(revision) {
    const current = designLibrary();
    if (revision !== current.revision) throw failure(409, 'The preset library changed. Reload it before saving.');
    return root.designLibrary ||= { revision: 0, presets: [], defaultPresetId: 'original' };
  }
  function saveDesignPreset(body = {}) {
    const config = normalizeDesign(body.config);
    const name = text(body.name, 'Preset name', 80, true);
    const all = designLibrary();
    const existing = body.id ? all.presets.find(p => p.id === body.id) : null;
    if (body.id && (!existing || existing.builtin)) throw failure(400, 'Built-in presets are read-only. Save a new copy.');
    if (all.presets.some(p => p.id !== body.id && p.name.toLowerCase() === name.toLowerCase())) throw failure(400, 'Choose a unique preset name');
    if (!existing && all.presets.length >= 104) throw failure(400, 'The preset library is full (100 custom presets)');
    const library = editLibrary(body.revision);
    const preset = { id: existing?.id || newId('design'), name, config, updatedAt: new Date().toISOString() };
    const index = library.presets.findIndex(p => p.id === preset.id);
    if (index >= 0) library.presets[index] = preset; else library.presets.push(preset);
    library.revision++;
    changed(); saveNow();
    return { preset, library: designLibrary() };
  }
  function deleteDesignPreset(id, revision) {
    const current = designLibrary();
    if (!current.presets.some(p => p.id === id && !p.builtin)) throw failure(400, 'Choose a custom preset to delete');
    const library = editLibrary(revision);
    library.presets = library.presets.filter(p => p.id !== id);
    if (library.defaultPresetId === id) library.defaultPresetId = 'original';
    library.revision++; changed(); saveNow();
    return designLibrary();
  }
  function setDefaultDesign(id, revision) {
    if (!designLibrary().presets.some(p => p.id === id)) throw failure(404, 'Preset not found');
    const library = editLibrary(revision);
    library.defaultPresetId = id; library.revision++; changed(); saveNow();
    return designLibrary();
  }
  function applyDesign(body = {}) {
    const db = get();
    if (body.revision !== (db.settings.graphicDesign?.revision || 0)) throw failure(409, 'The applied design changed. Reload before applying.');
    const config = normalizeDesign(body.config);
    const preset = designLibrary().presets.find(p => p.id === body.presetId);
    const matches = preset && JSON.stringify(normalizeDesign(preset.config)) === JSON.stringify(config);
    db.settings.graphicDesign = { config, presetId: matches ? preset.id : null, name: matches ? preset.name : 'Custom design', revision: (db.settings.graphicDesign?.revision || 0) + 1 };
    changed(); saveNow();
    return db.settings.graphicDesign;
  }
  function activeId() { ensure(); return root.activeTournamentId; }
  function saveNow() {
    ensure();
    clearTimeout(saveTimer);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(root, null, 2));
    fs.renameSync(tmp, file);
  }
  function changed(id) {
    (id ? getTournament(id) : get()).rev++;
    root.revision++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 150);
    for (const fn of listeners) fn(root.revision);
  }
  function tournaments() {
    ensure();
    return root.tournaments.map(({ id, createdAt, broadcastDays, data }) => ({ id, name: data.settings.leagueName, short: data.settings.leagueShort, season: data.settings.season, createdAt, broadcastDays: broadcastDays ?? [], teams: data.teams.length, players: data.players.length, matches: data.matches.length, wizard: !!data.settings.wizard, canRegenerate: !!data.settings.wizard && canRegenerate(data) }));
  }
  function createTournament(body = {}, initialize = null) {
    const name = text(body.name, 'Tournament name', 100, true);
    const short = text(body.short ?? name.slice(0, 8).toUpperCase(), 'Short name', 8, true);
    const season = text(body.season ?? '', 'Season', 80);
    const broadcastDays = days(body.broadcastDays);
    const designId = body.designPresetId || designLibrary().defaultPresetId;
    const creationPreset = designLibrary().presets.find(p => p.id === designId);
    if (!creationPreset) throw failure(400, 'Choose a preset from the shared design library');
    const inheritedPhoto = structuredClone(get().settings.photo);
    delete inheritedPhoto.look;
    const id = newId('tr');
    const data = EMPTY();
    Object.assign(data.settings, { leagueName: name, leagueShort: short, season, leagueLogo: '/brand/tournament.svg', outputDir: path.join(outputRoot, 'tournaments', id), timezone: get().settings.timezone, photo: inheritedPhoto });
    data.settings.hllgr.baseUrl = '';
    data.settings.theme = { preset: 'aegean', primary: '#0a1828', accent: '#d6a44c', accent2: '#8bbaec', text: '#ffffff', bgImage: null };
    if (creationPreset.id !== 'original') data.settings.graphicDesign = { config: normalizeDesign(creationPreset.config), presetId: creationPreset.id, name: creationPreset.name, revision: 1 };
    initialize?.(data, id);
    root.tournaments.push({ id, createdAt: new Date().toISOString(), broadcastDays, data });
    try { changed(id); saveNow(); } catch (error) { clearTimeout(saveTimer); root.tournaments = root.tournaments.filter(t => t.id !== id); throw error; }
    return tournaments().find(t => t.id === id);
  }
  // All validation and assembly happen before publishing a new workspace.
  function createWizard(body) {
    validateWizard(body, { getTournament, designLibrary });
    body = { ...body, short: body.short || body.name.slice(0, 8).toUpperCase() };
    const teamIds = {}, copiedFiles = [];
    let result, players = 0;
    function duplicateImage(entity, oldId, id, field, kind) {
      const url = entity[field];
      if (url?.startsWith('/media/')) {
        const relative = url.split('?')[0].slice(7);
        const source = path.resolve(ASSETS, relative);
        if (!source.startsWith(path.resolve(ASSETS) + path.sep)) throw failure(400, 'Invalid copied image path');
        if (fs.existsSync(source)) {
          const target = path.join(ASSETS, kind, `${id}${path.extname(source)}`);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(source, target); copiedFiles.push(target);
          entity[field] = `/media/${kind}/${path.basename(target)}`;
        } else entity[field] = null;
      }
      const rawField = field === 'photo' ? 'photoRaw' : 'logoRaw';
      if (entity[rawField] && fs.existsSync(entity[rawField])) {
        const target = path.join(RAW, kind, `${id}${path.extname(entity[rawField])}`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(entity[rawField], target); copiedFiles.push(target); entity[rawField] = target;
      } else delete entity[rawField];
      if (field === 'photo') {
        const source = path.join(RAW, 'cutouts', `${oldId}.png`);
        if (fs.existsSync(source)) {
          const target = path.join(RAW, 'cutouts', `${id}.png`);
          fs.copyFileSync(source, target); copiedFiles.push(target);
        }
      }
    }
    try {
      const tournament = createTournament({ ...body, short: body.short || body.name.slice(0, 8).toUpperCase(), broadcastDays: body.schedule ? toBroadcastDays(body.schedule.weekdays) : body.broadcastDays ?? [] }, data => {
        data.settings.enabledScenes = structuredClone(get().settings.enabledScenes ?? SCENE_IDS);
        data.settings.theme = body.theme === 'sparta'
          ? { preset: 'sparta', primary: '#141414', accent: '#c8102e', accent2: '#f2c230', text: '#ffffff', bgImage: null }
          : { preset: 'aegean', primary: '#0a1828', accent: '#d6a44c', accent2: '#8bbaec', text: '#ffffff', bgImage: null };
        for (const input of body.teams) {
          const id = newId('t'); teamIds[input.key] = id;
          const source = input.copy ? getTournament(input.copy.tournamentId) : null;
          const original = source?.teams.find(t => t.id === input.copy.teamId);
          const team = { ...(original ? structuredClone(original) : { logo: null }), id, name: input.name.trim(), tag: input.tag.trim().toUpperCase(), colors: input.colors ?? original?.colors ?? { primary: '#444444', secondary: '#888888' }, source: 'manual', extId: null };
          if (original) {
            team.sourceTournamentId = input.copy.tournamentId; team.sourceTeamId = original.id;
            duplicateImage(team, original.id, id, 'logo', 'teams');
            if (input.copy.players) {
              const playerIds = {};
              for (const p of source.players.filter(p => p.teamId === original.id)) {
                const player = { ...structuredClone(p), id: newId('p'), teamId: id, sourceTournamentId: input.copy.tournamentId, sourcePlayerId: p.id };
                playerIds[p.id] = player.id;
                duplicateImage(player, p.id, player.id, 'photo', 'players'); data.players.push(player); players++;
              }
              if (team.roster) team.roster = JSON.parse(JSON.stringify(team.roster), (k, v) => typeof v === 'string' ? playerIds[v] ?? v : v);
            } else { delete team.roster; }
          }
          data.teams.push(team);
        }
        result = previewTournament({ ...body, seeds: body.seeds.map(k => k === null ? null : teamIds[k]) }, () => newId('m'));
        decorateTournament(data, body, result); syncBracket(data);
      });
      return { tournament, teamIds, created: { teams: body.teams.length, players, matches: result.matches.length, brackets: result.brackets.length }, warnings: result.warnings };
    } catch (error) { for (const file of copiedFiles) fs.rmSync(file, { force: true }); throw error; }
  }
  function regenerateWizard(id, body) {
    const data = getTournament(id);
    if (!data?.settings.wizard) throw failure(404, 'Wizard tournament not found');
    if (!canRegenerate(data)) throw failure(409, 'Matches have started. Change single matches in Matches.');
    const input = { ...body, name: data.settings.leagueName, short: data.settings.leagueShort, season: data.settings.season, theme: data.settings.theme.preset,
      teams: data.teams.map(t => ({ key: t.id, name: t.name, tag: t.tag, colors: t.colors })) };
    validateWizard(input, { getTournament, designLibrary });
    const result = previewTournament(input, () => newId('m'));
    const next = structuredClone(data), ids = generatedIds(data);
    const retained = next.matches.filter(m => !ids.has(m.id));
    decorateTournament(next, input, result); next.matches.push(...retained); syncBracket(next);
    const record = root.tournaments.find(t => t.id === id), previous = record.data;
    record.data = next;
    const previousDays = record.broadcastDays;
    if (body.schedule) record.broadcastDays = toBroadcastDays(body.schedule.weekdays);
    else if (body.broadcastDays) record.broadcastDays = days(body.broadcastDays);
    try { changed(id); saveNow(); } catch (error) { clearTimeout(saveTimer); record.data = previous; record.broadcastDays = previousDays; throw error; }
    return { tournament: tournaments().find(t => t.id === id), created: { teams: 0, players: 0, matches: result.matches.length, brackets: result.brackets.length }, warnings: result.warnings, teamIds: Object.fromEntries(data.teams.map(t => [t.id, t.id])) };
  }
  function deleteTournament(id, confirm) {
    ensure();
    const record = root.tournaments.find(t => t.id === id);
    if (!record) throw failure(404, 'Tournament not found');
    if (id === activeId()) throw failure(409, 'Switch to another tournament first.');
    if (root.tournaments.length === 1) throw failure(409, 'The only tournament cannot be deleted.');
    if (confirm !== record.data.settings.leagueName) throw failure(400, 'Type the tournament name to delete it.');
    const folder = path.join(path.dirname(file), 'backups'); fs.mkdirSync(folder, { recursive: true });
    const backup = path.join(folder, `${id}-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(root, null, 2), { flag: 'wx' });
    const previous = root.tournaments; root.tournaments = previous.filter(t => t.id !== id);
    try { changed(); saveNow(); } catch (error) { clearTimeout(saveTimer); root.tournaments = previous; throw error; }
    return { ok: true, backup: path.basename(backup) };
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
  return { load, get, getTournament, saveNow, changed, activeId, tournaments, createTournament, createWizard, regenerateWizard, deleteTournament, updateTournament, activate,
    designLibrary, saveDesignPreset, deleteDesignPreset, setDefaultDesign, applyDesign,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}

const store = createStore();
export const { load, get, getTournament, saveNow, changed, onChange, activeId, tournaments, createTournament, createWizard, regenerateWizard, deleteTournament, updateTournament, activate } = store;
export const { designLibrary, saveDesignPreset, deleteDesignPreset, setDefaultDesign, applyDesign } = store;

export const COLLECTIONS = { teams: 't', players: 'p', matches: 'm', sponsors: 's', features: 'f' };
