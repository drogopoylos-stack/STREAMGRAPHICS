import { normalizeDesign } from '../public/shared/graphic-design.js';
import { sceneData } from './scenes.js';
import { isoDay } from './util.js';

export function designPreview(db, scene, params = {}, design) {
  const config = normalizeDesign(design);
  let sample = false, data;
  try { data = sceneData(scene, params, db); }
  catch (error) {
    if (error.status !== 404) throw error;
    sample = true;
    const demo = structuredClone(db);
    demo.teams = [{ id: 'demo-blue', name: 'Team Phoenix', tag: 'PHX', colors: { primary: '#266cc0' } }, { id: 'demo-red', name: 'Team Vortex', tag: 'VTX', colors: { primary: '#d65458' } }];
    demo.players = demo.teams.flatMap((t, ti) => ['Top', 'Jungle', 'Mid', 'Bot', 'Support'].map((role, i) => ({ id: `demo-player-${ti}-${i}`, teamId: t.id, nick: ['Atlas', 'Nova', 'Echo', 'Orion', 'Astra'][i] + (ti ? ' II' : ''), role, lineup: 'starter' })));
    demo.matches = [{ id: 'demo-match', teamA: demo.teams[0].id, teamB: demo.teams[1].id, date: isoDay(0, db.settings.timezone), time: '18:00', stage: 'Opening match', status: 'scheduled', bestOf: 3, stats: [] }];
    demo.features = [];
    data = sceneData(scene, scene === 'matchup' ? { ...params, a: demo.players[0].id, b: demo.players[5].id } : params, demo);
  }
  // Empty schedules/waiting screens are valid and show their actual empty-state text.
  return { ...data, graphicDesign: config, previewSample: sample };
}
