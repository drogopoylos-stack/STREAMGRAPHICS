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
      out[`team${side}`] = parent?.winnerId ?? null;
      out[`team${side}Label`] = `Winner ${original.get(source.matchId)?.bracketCode || original.get(source.matchId)?.stage || 'TBD'}`;
    }
    const a = Number(match.scoreA), b = Number(match.scoreB);
    const needed = Math.ceil((Number(match.bestOf) || 1) / 2);
    out.winnerId = match.status === 'done' && match.scoreA != null && match.scoreB != null && Number.isFinite(a) && Number.isFinite(b) && a !== b && Math.max(a, b) >= needed && out.teamA && out.teamB ? (a > b ? out.teamA : out.teamB) : null;
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
  return { id: null, name: label, tag: parent?.bracketCode ? `W ${parent.bracketCode}` : 'TBD', logo: null, placeholder: true };
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
      if (typeof source !== 'object' || source.outcome !== 'winner' || !byId.has(source.matchId)) invalid('Choose an existing match in this tournament as the winner source');
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

export function bracketTree(db) {
  const config = db.settings.bracketTree;
  if (!config?.rounds?.length) return null;
  const resolved = resolvedTournament(db);
  const rounds = config.rounds.map(round => ({ id: round.id, name: round.name,
    matches: (round.matches ?? []).map(id => resolved.matches.find(match => match.id === id)).filter(Boolean).map(match => ({ ...match, stats: undefined, teamA: matchTeam(resolved, match, 'A'), teamB: matchTeam(resolved, match, 'B') })) }));
  const final = rounds.at(-1)?.matches.at(-1);
  return { rounds, champion: resolved.teams.find(team => team.id === final?.winnerId) ?? null };
}
