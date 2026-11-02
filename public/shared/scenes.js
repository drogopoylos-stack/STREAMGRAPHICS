// One catalogue for broadcast controls, server validation, exports and future scenes.
export const MASTER_URL = '/overlay/master.html';
export const SCENE_DEFINITIONS = [
  { id: 'schedule', label: 'Day schedule', group: 'match', target: 'day' },
  { id: 'versus', label: 'Versus', group: 'match', target: 'match' },
  { id: 'simple-vs', label: 'Logos versus', group: 'match', target: 'match' },
  { id: 'roster', label: 'Team roster', group: 'rosters', target: 'team' },
  { id: 'matchup', label: 'Player matchup', group: 'matchups', target: 'feature' },
  { id: 'bracket', label: 'Bracket', group: 'other', target: 'single' },
  { id: 'sponsors', label: 'Sponsors', group: 'other', target: 'single' },
  { id: 'social-schedule', label: 'Social · Day schedule', group: 'social', target: 'day', width: 1080, height: 1920 },
  { id: 'social-versus', label: 'Social · Match poster', group: 'social', target: 'match', width: 1080, height: 1920 },
];
export const SCENE_IDS = SCENE_DEFINITIONS.map(scene => scene.id);
export function sceneDefinition(id) { return SCENE_DEFINITIONS.find(scene => scene.id === id); }
export function dimensionsFor(id) {
  const definition = sceneDefinition(id);
  return { width: definition?.width ?? 1920, height: definition?.height ?? 1080 };
}
export function isPortrait(id) { const size = dimensionsFor(id); return size.height > size.width; }
