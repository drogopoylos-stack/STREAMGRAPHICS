// One catalogue for broadcast controls, server validation, exports and future scenes.
export const MASTER_URL = '/overlay/master.html';
export const SCENE_DEFINITIONS = [
  { id: 'schedule', label: 'Day schedule', group: 'match', target: 'day' },
  { id: 'versus', label: 'Versus', group: 'match', target: 'match' },
  { id: 'simple-vs', label: 'Logos versus', group: 'match', target: 'match' },
  { id: 'roster', label: 'Team roster', group: 'rosters', target: 'team' },
  { id: 'matchup', label: 'Player matchup', group: 'matchups', target: 'feature' },
  { id: 'bracket', label: 'Bracket', group: 'other', target: 'single' },
  { id: 'format', label: 'Format explainer', group: 'other', target: 'single' },
  { id: 'waiting', label: 'Starting soon', group: 'other', target: 'single' },
  { id: 'sponsors', label: 'Sponsors', group: 'other', target: 'single' },
  { id: 'social-schedule', label: 'Social · Day schedule', group: 'social', target: 'day' },
  { id: 'social-versus', label: 'Social · Match poster', group: 'social', target: 'match' },
  { id: 'social-roster', label: 'Social · Team roster', group: 'social', target: 'team' },
  { id: 'social-result', label: 'Social · Result', group: 'social', target: 'match' },
  { id: 'social-announce', label: 'Social · Announcement', group: 'social', target: 'single' },
  { id: 'social-bracket', label: 'Social · Bracket', group: 'social', target: 'single' },
  { id: 'social-live', label: 'Social · Live now', group: 'social', target: 'match', storyOnly: true },
  { id: 'standings', label: 'League standings', group: 'other', target: 'single' },
];
export const SCENE_IDS = SCENE_DEFINITIONS.map(scene => scene.id);
export const SOCIAL_FORMATS = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } };
export function sceneDefinition(id) { return SCENE_DEFINITIONS.find(scene => scene.id === id); }
export function sceneFormats(id) {
  const definition = sceneDefinition(id);
  if (definition?.group !== 'social') return [];
  return definition.storyOnly ? ['story'] : ['post', 'story'];
}
/** Social scenes are 1080×1350 with format=post and 1080×1920 otherwise; every other scene keeps its size. */
export function dimensionsFor(id, params = {}) {
  const definition = sceneDefinition(id);
  if (definition?.group === 'social') return SOCIAL_FORMATS[definition.storyOnly || params?.format !== 'post' ? 'story' : 'post'];
  return { width: definition?.width ?? 1920, height: definition?.height ?? 1080 };
}
export function isPortrait(id, params) { const size = dimensionsFor(id, params); return size.height > size.width; }
