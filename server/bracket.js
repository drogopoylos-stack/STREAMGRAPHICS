import { standings } from './formats/standings.js';
// Native knockout brackets. Dependencies point to matches in the same tournament.
export function resolveMatches(db) {
  const original = new Map(db.matches.map(match => [match.id, match]));
  const cache = new Map();
  const visiting = new Set();
  function resolve(id) {
    if (cache.has(id)) return cache.get(id);
    const match = original.get(id);
    if (!match || visiting.has(id)) return null;
    visiting.add(id);
    const out = { ...match };
    for (const side of ['A', 'B']) {
      const source = match[`team${side}Source`];
      if (!source?.matchId) continue;
      const parent = resolve(source.matchId);
      out[`team${side}`] = (source.outcome === 'loser' ? parent?.loserId : parent?.winnerId) ?? null;
      out[`team${side}Label`] = `${source.outcome === 'loser' ? 'Loser' : 'Winner'} ${original.get(source.matchId)?.bracketCode || original.get(source.matchId)?.stage || 'TBD'}`;
    }
    const a = Number(match.scoreA), b = Number(match.scoreB);
    const needed = Math.ceil((Number(match.bestOf) || 1) / 2);
    const decisive = match.scoreA != null && match.scoreB != null && Number.isFinite(a) && Number.isFinite(b) && a !== b && Math.max(a, b) >= needed && out.teamA && out.teamB;
    // A decisive score is the result, whatever the status says. With an unknown best-of, only "done" can tell that the series ended.
    out.winnerId = decisive && (match.status === 'done' || Number(match.bestOf) > 0) ? (a > b ? out.teamA : out.teamB) : null;
    out.loserId = out.winnerId ? (out.winnerId === out.teamA ? out.teamB : out.teamA) : null;
    if (out.winnerId) out.status = 'done';
    visiting.delete(id);
    cache.set(id, out);
    return out;
  }
  return db.matches.map(match => resolve(match.id));
}

export function resolvedTournament(db) {
  return db.matches.some(match => match.teamASource || match.teamBSource) ? { ...db, matches: resolveMatches(db) } : db;
}

export function matchTeam(db, match, side) {
  const team = db.teams.find(team => team.id === match[`team${side}`]);
  if (team) return team;
  const label = match[`team${side}Label`];
  if (!label) return null;
  const source = match[`team${side}Source`];
  const parent = source ? db.matches.find(item => item.id === source.matchId) : null;
  return { id: null, name: label, tag: parent?.bracketCode ? `${source.outcome === 'loser' ? 'L' : 'W'} ${parent.bracketCode}` : 'TBD', logo: null, placeholder: true };
}

export function validateSources(matches) {
  const byId = new Map(matches.map(match => [match.id, match]));
  const visiting = new Set(), checked = new Set();
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  function visit(id) {
    if (checked.has(id)) return;
    if (visiting.has(id)) invalid('Bracket dependencies cannot contain a cycle');
    visiting.add(id);
    for (const side of ['A', 'B']) {
      const source = byId.get(id)?.[`team${side}Source`];
      if (!source) continue;
      if (typeof source !== 'object' || !['winner', 'loser'].includes(source.outcome) || !byId.has(source.matchId)) invalid('Choose an existing match in this tournament as the winner or loser source');
      visit(source.matchId);
    }
    visiting.delete(id); checked.add(id);
  }
  for (const match of matches) visit(match.id);
}

/** Persist changed participants and clear results that belonged to previous participants. */
export function syncBracket(db) {
  for (let pass = 0; pass <= db.matches.length; pass++) {
    const resolved = new Map(resolveMatches(db).map(match => [match.id, match]));
    let changed = false;
    for (const match of db.matches) for (const side of ['A', 'B']) {
      if (!match[`team${side}Source`]) continue;
      const value = resolved.get(match.id)[`team${side}`];
      if ((match[`team${side}`] ?? null) === value) continue;
      match[`team${side}`] = value;
      match.scoreA = match.scoreB = null;
      match.status = 'scheduled';
      match.stats = [];
      changed = true;
    }
    if (!changed) break;
  }
}

export function bracketDefinitions(db) {
  if (Array.isArray(db.settings.brackets) && db.settings.brackets.length) return db.settings.brackets;
  return db.settings.bracketTree ? [{ id: 'default', name: 'Tournament bracket', ...db.settings.bracketTree }] : [];
}

export function bracketTree(db, id) {
  const definitions = bracketDefinitions(db);
  const config = id ? definitions.find(bracket => bracket.id === id) : definitions[0];
  if (id && !config) throw Object.assign(new Error('Bracket not found in this tournament'), { status: 404 });
  if (!config?.rounds?.length) return null;
  const resolved = resolvedTournament(db);
  const rounds = config.rounds.map(round => ({ id: round.id, name: round.name, side: round.side,
    matches: (round.matches ?? []).map(id => resolved.matches.find(match => match.id === id)).filter(Boolean).map(match => ({ ...match, stats: undefined, teamA: matchTeam(resolved, match, 'A'), teamB: matchTeam(resolved, match, 'B') })) }));
  const qualifications = (config.qualifications || []).map(item => {
    const parent = resolved.matches.find(match => match.id === item.source?.matchId);
    const teamId = item.source?.outcome === 'loser' ? parent?.loserId : parent?.winnerId;
    return { ...item, team: resolved.teams.find(team => team.id === teamId) || { id: null, name: `${item.source?.outcome === 'loser' ? 'Loser' : 'Winner'} ${parent?.bracketCode || 'TBD'}`, tag: 'TBD', logo: null, placeholder: true } };
  });
  let final = config.championMatchId ? resolved.matches.find(match => match.id === config.championMatchId) : qualifications.length ? null : rounds.at(-1)?.matches.at(-1);
  if (final?.optional && !final.winnerId) {
    const gf = resolved.matches.find(m => m.id === final.teamASource?.matchId);
    if (gf?.winnerId === gf?.teamA) final = gf;
  }
  const entries = (config.entrySources || []).map(source => {
    const parent = resolved.matches.find(match => match.id === source.matchId);
    return { id: source.matchId, team: resolved.teams.find(team => team.id === parent?.winnerId) || { id: null, name: `Winner ${parent?.bracketCode || 'TBD'}`, tag: 'TBD', logo: null, placeholder: true } };
  });
  return { ...config, rounds, qualifications, entries, ...(config.format === 'round-robin' ? { standings: standings(resolved.matches.filter(m => config.rounds.some(r => r.matches.includes(m.id))), [...resolved.teams].sort((a,b) => (a.seed ?? Infinity) - (b.seed ?? Infinity)).map(t => t.id)).map(row => ({ ...row, team: resolved.teams.find(t => t.id === row.teamId) })) } : {}), champion: resolved.teams.find(team => team.id === final?.winnerId) ?? null };
}

/** GSL opening draw: every qualified path is used exactly once. */
export function updateBracketDraw(db, id, body) {
  const config = bracketDefinitions(db).find(bracket => bracket.id === id && bracket.format === 'gsl');
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  if (!config) fail(404, 'GSL bracket not found');
  if (body?.revision !== (config.drawRevision ?? 0)) fail(409, 'The draw changed. Reopen the draw editor before saving.');
  const entries = (config.entrySources || []).map(source => source.matchId);
  if (!Array.isArray(body.sources) || body.sources.length !== 4 || new Set(body.sources).size !== 4 || body.sources.some(id => !entries.includes(id))) fail(400, 'Use each of the four qualifying paths exactly once');
  const openings = ['openingA', 'openingB'].map(node => db.matches.find(match => match.bracketNode === node && config.rounds.some(round => round.matches.includes(match.id))));
  if (openings.some(match => !match || match.status === 'live' || match.status === 'done' || match.scoreA != null || match.scoreB != null)) fail(409, 'The opening matches have started; the draw cannot be changed');
  const patches = openings.map((match, index) => ({ ...match, teamASource: { matchId: body.sources[index * 2], outcome: 'winner' }, teamBSource: { matchId: body.sources[index * 2 + 1], outcome: 'winner' } }));
  validateSources(db.matches.map(match => patches.find(patch => patch.id === match.id) || match));
  for (const patch of patches) Object.assign(db.matches.find(match => match.id === patch.id), patch, { bracketDrawSet: true });
  config.drawRevision = (config.drawRevision ?? 0) + 1;
  config.drawPending = false;
  syncBracket(db);
  return { ok: true, revision: config.drawRevision };
}
