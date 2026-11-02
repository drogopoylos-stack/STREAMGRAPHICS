// Dashboard organization is derived from fixtures, never from a card's display title.
import { SCENE_DEFINITIONS, sceneDefinition } from '../../shared/scenes.js';

export const PERIODS = ['live', 'today', 'upcoming', 'tbd', 'general', 'completed', 'past'];

function addDay(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function periodFor(matches, date, today) {
  if (matches.some(match => match.status === 'live')) return 'live';
  if (matches.length && matches.every(match => match.status === 'done')) return 'completed';
  if (!date) return 'tbd';
  if (date === today) return 'today';
  return date > today ? 'upcoming' : 'past';
}

/** Enrich saved and automatic cards using the same tournament-scoped source records. */
export function organizeGraphics(cards, state) {
  const byId = new Map(state.matches.map(match => [match.id, match]));
  const byDate = new Map();
  for (const match of state.matches) {
    if (!byDate.has(match.date)) byDate.set(match.date, []);
    byDate.get(match.date).push(match);
  }
  const features = new Map(state.features.map(feature => [feature.id, feature]));
  return cards.map(card => {
    const definition = sceneDefinition(card.scene);
    const params = card.params ?? {};
    let date = null, time = '', period = 'general';
    let match;
    if (definition?.target === 'match') match = byId.get(params.match || state.nextMatch);
    if (definition?.target === 'feature') match = byId.get(features.get(params.feature)?.matchId);
    if (match) {
      date = match.date || null; time = match.time || '';
      period = periodFor([match], date, state.today);
    } else if (definition?.target === 'day' && params.day !== 'all') {
      date = !params.day || params.day === 'today' ? state.today : params.day === 'tomorrow' ? addDay(state.today) : params.day;
      period = periodFor(byDate.get(date) ?? [], date, state.today);
    } else if (definition?.target === 'match') {
      period = 'tbd';
    }
    return { ...card, date, time, period };
  });
}

export function graphicTypes(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.scene, (counts.get(card.scene) ?? 0) + 1);
  const known = SCENE_DEFINITIONS.filter(scene => counts.has(scene.id)).map(scene => ({ id: scene.id, count: counts.get(scene.id), label: scene.label }));
  const future = [...counts.keys()].filter(id => !known.some(scene => scene.id === id)).map(id => ({ id, count: counts.get(id), label: id }));
  return [{ id: 'all', count: cards.length, label: 'All types' }, ...known, ...future];
}

function compare(a, b) {
  const aDate = a.date || '', bDate = b.date || '';
  const descending = ['completed', 'past'].includes(a.period);
  return (descending ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate)) || a.time.localeCompare(b.time)
    || Number(!!b.savedId) - Number(!!a.savedId) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
}

export function graphicSections(cards, { type = 'all', period = 'all', query = '', date = '', saved = false } = {}) {
  const search = query.trim().toLocaleLowerCase();
  const matches = cards.filter(card => (type === 'all' || card.scene === type) && (!saved || card.savedId)
    && (!date || card.date === date) && (!search || `${card.title} ${card.sub} ${card.date || ''}`.toLocaleLowerCase().includes(search)));
  const counts = Object.fromEntries(PERIODS.map(key => [key, matches.filter(card => card.period === key).length]));
  const sections = PERIODS.filter(key => period === 'all' || period === key)
    .map(key => ({ id: key, cards: matches.filter(card => card.period === key).sort(compare) })).filter(section => section.cards.length);
  return { sections, counts, total: matches.length, shown: sections.reduce((sum, section) => sum + section.cards.length, 0) };
}
