const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

/**
 * Returns { teamId, seed, points, played, wins, losses, draws, mapDifference }.
 * Head-to-head is a mini-table of points earned against all teams tied on
 * overall points, avoiding a non-transitive pairwise sorting comparator.
 */
export function standings(matches, teams, points = {}) {
  if (!points || typeof points !== 'object' || Array.isArray(points)) invalid('Standings points must be an object');
  const { win = 3, loss = 0, draw = 1 } = points;
  if (!Array.isArray(matches) || !Array.isArray(teams) || Array.from(teams).some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(teams).size !== teams.length) invalid('Standings need matches and unique team IDs in seed order');
  if (![win, loss, draw].every(value => typeof value === 'number' && Number.isFinite(value))) invalid('Standings points must be finite numbers');
  const rows = teams.map((teamId, i) => ({ teamId, seed: i + 1, points: 0, played: 0, wins: 0, losses: 0, draws: 0, mapDifference: 0 }));
  const byTeam = new Map(rows.map(row => [row.teamId, row])), results = [];
  for (const match of matches) {
    if (!match || match.scoreA == null || match.scoreB == null) continue;
    const a = Number(match.scoreA), b = Number(match.scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) continue;
    const decisive = a !== b && Number(match.bestOf) > 0 && Math.max(a, b) >= Math.ceil(Number(match.bestOf) / 2);
    if (match.status !== 'done' && !decisive) continue;
    const rowA = byTeam.get(match.teamA), rowB = byTeam.get(match.teamB);
    if (!rowA || !rowB || rowA === rowB) continue;
    const pointsA = a === b ? draw : a > b ? win : loss;
    const pointsB = a === b ? draw : b > a ? win : loss;
    for (const [row, score, other, points] of [[rowA, a, b, pointsA], [rowB, b, a, pointsB]]) {
      row.played++; row.points += points; row.mapDifference += score - other;
      if (score === other) row.draws++;
      else if (score > other) row.wins++;
      else row.losses++;
    }
    results.push({ rowA, rowB, pointsA, pointsB });
  }
  const headToHead = new Map(rows.map(row => [row.teamId, 0]));
  for (const { rowA, rowB, pointsA, pointsB } of results) {
    if (rowA.points !== rowB.points) continue;
    headToHead.set(rowA.teamId, headToHead.get(rowA.teamId) + pointsA);
    headToHead.set(rowB.teamId, headToHead.get(rowB.teamId) + pointsB);
  }
  return rows.sort((a, b) => b.points - a.points || headToHead.get(b.teamId) - headToHead.get(a.teamId) ||
    b.mapDifference - a.mapDifference || a.seed - b.seed);
}
