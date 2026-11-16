import { newId } from './util.js';

const LANES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
const ROLES = [...LANES, 'Coach', ''];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export function touchRosters(db, teamIds) {
  for (const id of new Set(teamIds)) {
    const team = db.teams.find(team => team.id === id);
    if (team) team.rosterRevision = (team.rosterRevision ?? 0) + 1;
  }
}

/** Validate the complete edit before saving either team's starting five. */
export function updateRosters(db, body) {
  if (!Array.isArray(body?.teams) || !body.teams.length || body.teams.length > db.teams.length) fail(400, 'Choose teams to edit');
  const seenTeams = new Set(), seenPlayers = new Set();
  const plans = body.teams.map(edit => {
    const team = db.teams.find(team => team.id === edit.teamId);
    if (!team || seenTeams.has(team.id)) fail(400, 'Choose distinct teams in this tournament');
    seenTeams.add(team.id);
    if (edit.revision !== (team.rosterRevision ?? 0)) fail(409, 'This roster changed in another editor. Close and reopen it before saving.');
    if (!Array.isArray(edit.players) || edit.players.length > 30) fail(400, 'A roster can contain up to 30 players');
    const starters = new Set();
    const players = edit.players.map(row => {
      if (typeof row.nick !== 'string' || !row.nick.trim() || row.nick.trim().length > 40) fail(400, 'Each player needs a name up to 40 characters');
      if (!ROLES.includes(row.role) || !['starter', 'substitute'].includes(row.lineup)) fail(400, 'Choose a valid role and lineup position');
      if (row.lineup === 'starter') {
        if (!LANES.includes(row.role) || starters.has(row.role)) fail(400, 'Choose one starter per role: Top, Jungle, Mid, Bot and Support');
        starters.add(row.role);
      }
      let existing;
      if (row.id) {
        existing = db.players.find(player => player.id === row.id && player.teamId === team.id);
        if (!existing || seenPlayers.has(row.id)) fail(400, 'A player must belong to this team and appear only once');
        seenPlayers.add(row.id);
      }
      return { ...(existing ?? { id: newId('p'), teamId: team.id, name: '', photo: null, country: null, captain: false, source: 'manual', extId: null }),
        nick: row.nick.trim(), role: row.role, lineup: row.lineup, hidden: false };
    });
    return { team, players };
  });
  for (const { team, players } of plans) {
    const selected = new Set(players.map(player => player.id));
    // Removed roster entries stay in the database for historical stats and can be restored in Players.
    for (const player of db.players) if (player.teamId === team.id && !selected.has(player.id)) player.hidden = true;
    for (const player of players) {
      const existing = db.players.find(item => item.id === player.id);
      if (existing) Object.assign(existing, player); else db.players.push(player);
    }
  }
  touchRosters(db, plans.map(plan => plan.team.id));
  return { teams: plans.map(({ team, players }) => ({ teamId: team.id, revision: team.rosterRevision, players })) };
}
