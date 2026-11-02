import { SCENE_DEFINITIONS, dimensionsFor } from '../public/shared/scenes.js';
import { sceneData, nextMatch } from './scenes.js';
import { isoDay, newId } from './util.js';

const clean = params => Object.fromEntries(Object.entries(params ?? {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => [key, String(value)]));
const teamById = (db, id) => db.teams.find(team => team.id === id);
const matchTitle = (db, match) => `${teamById(db, match?.teamA)?.tag ?? 'TBD'} vs ${teamById(db, match?.teamB)?.tag ?? 'TBD'}`;

/** Every registered scene becomes a dashboard card; new scene types inherit this expansion. */
export function graphicCatalog(db, today = isoDay(0, db.settings.timezone)) {
  const cards = [];
  const tomorrowDate = new Date(`${today}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const add = (definition, suffix, params, title, sub, art, extra = {}) => {
    let ready = true, reason = '';
    try {
      const data = sceneData(definition.id, params, db);
      if (definition.id === 'bracket' && data.embed.type === 'none') { ready = false; reason = 'Add a bracket in Settings'; }
      if (definition.id === 'sponsors' && !data.sponsors.length) { ready = false; reason = 'Add a sponsor logo'; }
      if (definition.target === 'match' && (!data.teamA || !data.teamB)) { ready = false; reason = 'Choose both teams for this match'; }
    } catch (error) { ready = false; reason = error.message; }
    cards.push({ key: `${definition.id}:${suffix}`, scene: definition.id, params: clean(params), title, sub: reason || sub, group: definition.group, art: art ?? { type: 'icon', icon: 'layers' }, ...dimensionsFor(definition.id), ready, warn: !ready, ...extra });
  };
  for (const definition of SCENE_DEFINITIONS) {
    switch (definition.target) {
      case 'day': {
        const dates = [...new Set(db.matches.map(match => match.date).filter(Boolean))].sort();
        const nextDay = dates.find(day => day > today);
        const targets = [['today', today, 'Today'], ['tomorrow', tomorrow, 'Tomorrow']];
        if (nextDay && nextDay !== tomorrow) targets.push([nextDay, nextDay, 'Next match day']);
        for (const day of dates) if (day !== today && day !== tomorrow && day !== nextDay) targets.push([day, day, day]);
        for (const [day, date, label] of targets) {
          const count = db.matches.filter(match => match.date === date).length;
          const pages = definition.id === 'social-schedule' ? Math.max(1, Math.ceil(count / 6)) : 1;
          for (let page = 1; page <= pages; page++) add(definition, `${day}:${page}`, { day, ...(pages > 1 ? { page } : {}) }, `${definition.label} · ${label}${pages > 1 ? ` · ${page}/${pages}` : ''}`, `${date} · ${count} matches`, { type: 'icon', icon: 'calendar' });
        }
        break;
      }
      case 'match': {
        const next = nextMatch(db);
        if (next) add(definition, 'next', {}, `Next match · ${definition.label}`, matchTitle(db, next), { type: 'logos', teams: [teamById(db, next.teamA), teamById(db, next.teamB)] });
        for (const match of [...db.matches].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))) {
          add(definition, match.id, { match: match.id }, `${definition.label} · ${matchTitle(db, match)}`, `${match.date} · ${match.time || 'TBA'}`, { type: 'logos', teams: [teamById(db, match.teamA), teamById(db, match.teamB)] });
        }
        break;
      }
      case 'team':
        for (const team of db.teams.filter(team => !team.hidden)) add(definition, team.id, { team: team.id }, team.name, definition.label, { type: 'logo', team });
        break;
      case 'feature':
        for (const feature of db.features) add(definition, feature.id, { feature: feature.id }, feature.title || definition.label, definition.label, { type: 'photos', players: [db.players.find(player => player.id === feature.playerA), db.players.find(player => player.id === feature.playerB)] });
        break;
      default:
        add(definition, 'default', {}, definition.label, '', { type: 'icon', icon: definition.id });
    }
  }
  for (const graphic of db.graphics ?? []) {
    const definition = SCENE_DEFINITIONS.find(scene => scene.id === graphic.scene);
    if (!definition) continue;
    add(definition, `saved:${graphic.id}`, graphic.params, graphic.name, definition.label, null, { group: 'saved', savedId: graphic.id });
  }
  return cards;
}

export function newGraphic(body, db) {
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) throw Object.assign(new Error('Enter a graphic name up to 100 characters'), { status: 400 });
  if (!SCENE_DEFINITIONS.some(scene => scene.id === body.scene)) throw Object.assign(new Error('Unknown scene'), { status: 400 });
  if (body.params != null && (typeof body.params !== 'object' || Array.isArray(body.params))) throw Object.assign(new Error('Graphic parameters must be an object'), { status: 400 });
  const entries = Object.entries(body.params ?? {});
  if (entries.length > 20 || entries.some(([key, value]) => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 200)) throw Object.assign(new Error('Invalid graphic parameters'), { status: 400 });
  const params = clean(body.params);
  sceneData(body.scene, params, db);
  return { id: newId('g'), name: body.name.trim(), scene: body.scene, params, createdAt: new Date().toISOString() };
}
