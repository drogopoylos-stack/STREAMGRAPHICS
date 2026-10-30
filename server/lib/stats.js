/**
 * Game-agnostic league statistics over match/player data shapes.
 * All functions are pure and never mutate inputs.
 * @module server/lib/stats
 */

/**
 * Parse a stat value, returning null for anything non-finite.
 * @param {unknown} v
 * @returns {number|null}
 */
function statValue(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Aggregate one player's done matches into totals, averages and win/loss.
 *
 * Averages divide by the number of matches in which the key is present
 * (missing keys are skipped, never treated as zero). For `pct` keys the
 * "total" is that same average rather than a sum.
 *
 * @param {string} playerId
 * @param {Array<object>} matches
 * @param {Array<{key:string,label:string,better:string,fmt:string}>} [statDefs]
 * @param {Array<{id:string,teamId:string}>} [players] Optional roster for W/L sides.
 * @returns {{matches:number, totals:Record<string,number>, averages:Record<string,number|null>, wins:number, losses:number}}
 */
export function aggregatePlayer(playerId, matches, statDefs = [], players = []) {
  const defs = statDefs ?? [];
  const played = [];
  for (const m of matches ?? []) {
    if (!m || m.status !== 'done') continue;
    const entry = (m.stats ?? []).find((s) => s && s.playerId === playerId);
    if (entry) played.push({ match: m, values: entry.values ?? {} });
  }

  const keys = [];
  const seen = new Set();
  const fmtOf = new Map();
  for (const d of defs) {
    if (!d || d.key === undefined) continue;
    if (!seen.has(d.key)) {
      seen.add(d.key);
      keys.push(d.key);
    }
    fmtOf.set(d.key, d.fmt);
  }
  for (const { values } of played) {
    for (const k of Object.keys(values)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }

  const totals = {};
  const averages = {};
  for (const key of keys) {
    let sum = 0;
    let present = 0;
    for (const { values } of played) {
      const v = statValue(values[key]);
      if (v !== null) {
        sum += v;
        present++;
      }
    }
    if (present === 0) {
      totals[key] = 0;
      averages[key] = null;
      continue;
    }
    const avg = sum / present;
    if (fmtOf.get(key) === 'pct') {
      totals[key] = avg;
      averages[key] = avg;
    } else {
      totals[key] = sum;
      averages[key] = avg;
    }
  }

  let wins = 0;
  let losses = 0;
  const player = (players ?? []).find((p) => p && p.id === playerId);
  if (player && player.teamId) {
    for (const { match } of played) {
      const onA = match.teamA === player.teamId;
      const onB = match.teamB === player.teamId;
      if (!onA && !onB) continue;
      const mine = onA ? match.scoreA : match.scoreB;
      const theirs = onA ? match.scoreB : match.scoreA;
      if (mine === null || theirs === null || mine === undefined || theirs === undefined) continue;
      if (mine > theirs) wins++;
      else if (mine < theirs) losses++;
    }
  }

  return { matches: played.length, totals, averages, wins, losses };
}

/**
 * Compare two aggregations key-by-key using their averages.
 * @param {{averages:Record<string,number|null>}} aggA
 * @param {{averages:Record<string,number|null>}} aggB
 * @param {Array<{key:string,label:string,better:'high'|'low',fmt:string}>} [statDefs]
 * @returns {Array<{key:string,label:string,a:number|null,b:number|null,fmt:string,better:string,winner:'a'|'b'|'tie'}>}
 */
export function compareRows(aggA, aggB, statDefs = []) {
  return (statDefs ?? []).map((def) => {
    const a = aggA?.averages?.[def.key] ?? null;
    const b = aggB?.averages?.[def.key] ?? null;
    let winner;
    // No value on one side (no games yet) → no winner to highlight.
    if (a === null || b === null) winner = 'tie';
    else if (Math.abs(a - b) <= 1e-9) winner = 'tie';
    else if (def.better === 'low') winner = a < b ? 'a' : 'b';
    else winner = a > b ? 'a' : 'b';
    return { key: def.key, label: def.label, a, b, fmt: def.fmt, better: def.better, winner };
  });
}

/**
 * Win/loss/played record for a team over completed matches.
 * @param {string} teamId
 * @param {Array<object>} matches
 * @returns {{w:number, l:number, played:number}}
 */
export function teamRecord(teamId, matches) {
  let w = 0;
  let l = 0;
  let played = 0;
  for (const m of matches ?? []) {
    if (!m || m.status !== 'done') continue;
    let mine;
    let theirs;
    if (m.teamA === teamId) {
      mine = m.scoreA;
      theirs = m.scoreB;
    } else if (m.teamB === teamId) {
      mine = m.scoreB;
      theirs = m.scoreA;
    } else {
      continue;
    }
    if (mine === null || theirs === null || mine === undefined || theirs === undefined) continue;
    played++;
    if (mine > theirs) w++;
    else if (mine < theirs) l++;
  }
  return { w, l, played };
}

/**
 * Format a stat value for display.
 * @param {number|null|undefined} v
 * @param {'int'|'dec1'|'dec2'|'pct'|string} fmt
 * @returns {string}
 */
export function formatStat(v, fmt) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  switch (fmt) {
    case 'int':
      return String(Math.round(v));
    case 'dec1':
      return v.toFixed(1);
    case 'dec2':
      return v.toFixed(2);
    case 'pct': {
      const pct = v <= 1 ? v * 100 : v;
      return `${Math.round(pct)}%`;
    }
    default:
      return String(v);
  }
}

/**
 * Match ids in which both players have a stats entry.
 * @param {string} playerA
 * @param {string} playerB
 * @param {Array<object>} matches
 * @returns {string[]}
 */
export function headToHead(playerA, playerB, matches) {
  const ids = [];
  for (const m of matches ?? []) {
    const stats = m?.stats ?? [];
    const hasA = stats.some((s) => s && s.playerId === playerA);
    const hasB = stats.some((s) => s && s.playerId === playerB);
    if (hasA && hasB) ids.push(m.id);
  }
  return ids;
}
