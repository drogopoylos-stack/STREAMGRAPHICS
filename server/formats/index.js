export { scheduleMatches } from './schedule.js';
export { standings } from './standings.js';

const commonOptions = [
  { id: 'bestOf', label: 'Best of', type: 'number', default: 3 },
  { id: 'finalBestOf', label: 'Final best of', type: 'number', default: null },
  { id: 'roundBestOf', label: 'Best of by round ID or name', type: 'object', default: {} },
];

export const FORMATS = [
  { id: 'single-elimination', label: 'Single elimination', minTeams: 2, maxTeams: 64,
    options: [...commonOptions, { id: 'thirdPlace', label: 'Third place match', type: 'boolean', default: false }] },
  { id: 'double-elimination', label: 'Double elimination', minTeams: 4, maxTeams: 32,
    options: [...commonOptions, { id: 'grandFinalReset', label: 'Grand final reset', type: 'boolean', default: false }] },
  { id: 'gsl', label: 'GSL groups', minTeams: 4, maxTeams: 32,
    options: [...commonOptions] },
  { id: 'round-robin', label: 'Round robin', minTeams: 3, maxTeams: 20,
    options: [...commonOptions, { id: 'double', label: 'Home and away', type: 'boolean', default: false }] },
];

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const record = value => value != null && typeof value === 'object' && !Array.isArray(value);
const series = value => Number.isSafeInteger(value) && value > 0 && value % 2 === 1;
const source = (match, outcome = 'winner') => ({ source: { matchId: match.id, outcome } });

/**
 * Teams are seed-ordered IDs; null reserves an undecided seed (not a bye).
 * roundBestOf keys are round IDs (r1, ub1, lb1, gf, gf2, etc.) or names;
 * overrides take precedence over finalBestOf, which defaults to bestOf.
 * Default IDs are deterministic and local to this result. Inject newId when
 * merging multiple generated tournaments into the same ID namespace.
 *
 * With a reset, championMatchId points to GF2. Play it only if teamB wins GF.
 * If teamA wins GF, skip GF2 and use GF's winner as champion instead: the
 * existing source resolver cannot express that conditional champion choice.
 * Without a reset the GF winner is champion, even if the upper finalist has
 * only one loss. Optional GF2 is reserved in schedules until the caller omits it.
 */
export function generateTournament(input = {}) {
  if (!record(input)) invalid('Tournament configuration must be an object');
  const { format, teams, options = {}, newId } = input;
  const spec = FORMATS.find(item => item.id === format);
  if (!spec) invalid('Choose a supported tournament format');
  if (!Array.isArray(teams) || teams.length < spec.minTeams || teams.length > spec.maxTeams) {
    invalid(`${spec.label} needs ${spec.minTeams} to ${spec.maxTeams} teams`);
  }
  if (Array.from(teams).some(id => id !== null && (typeof id !== 'string' || !id.trim()))) invalid('Teams must be non-empty team IDs or null for undecided seeds');
  const known = teams.filter(id => id !== null);
  if (new Set(known).size !== known.length) invalid('Team IDs must be unique');
  if (!record(options)) invalid('Options must be an object');
  if (newId !== undefined && typeof newId !== 'function') invalid('newId must be a function');
  const bestOf = options.bestOf ?? 3, finalBestOf = options.finalBestOf ?? bestOf;
  if (!series(bestOf) || !series(finalBestOf)) invalid('Best of must be a positive odd integer');
  const roundBestOf = options.roundBestOf ?? {};
  if (!record(roundBestOf) || Object.values(roundBestOf).some(value => !series(value))) invalid('Round best of overrides must contain positive odd integers');
  for (const key of ['thirdPlace', 'grandFinalReset', 'double']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') invalid(`${key} must be true or false`);
  }
  if (format === 'gsl' && teams.length % 4) invalid('GSL needs a multiple of 4 teams');
  if (format === 'single-elimination' && options.thirdPlace && teams.length < 4) invalid('Third place needs at least 4 teams');

  let counter = 0;
  const allocate = newId ?? (prefix => `${prefix}-${++counter}`);
  const matches = [], brackets = [], warnings = [], ids = new Set();
  const entrants = teams.map((team, i) => ({ team, label: team === null ? `Seed ${i + 1}` : null }));
  const makeRound = (id, name, side) => ({ id, name, matches: [], ...(side ? { side } : {}) });
  function match(round, code, a, b, final = false, extra = {}) {
    const id = allocate('match');
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) invalid('newId must return unique non-empty string IDs');
    ids.add(id);
    const out = { id, bracketCode: code, stage: round.name,
      bestOf: roundBestOf[round.id] ?? roundBestOf[round.name] ?? (final ? finalBestOf : bestOf),
      date: null, time: null, status: 'scheduled', scoreA: null, scoreB: null, stats: [],
      teamA: null, teamB: null, ...extra };
    for (const [side, entrant] of [['A', a], ['B', b]]) {
      if (entrant.source) out[`team${side}Source`] = { ...entrant.source };
      else {
        out[`team${side}`] = entrant.team;
        if (entrant.label) out[`team${side}Label`] = entrant.label;
      }
    }
    matches.push(out); round.matches.push(id);
    return out;
  }
  function definition(id, name, rounds) {
    const out = { id, name, format, title: name, subtitle: spec.label, footer: '', rounds };
    brackets.push(out);
    return out;
  }
  // A missing slot is a structural bye. A null team inside a slot is a TBD seed.
  function play(round, code, a, b, final = false) {
    if (!a || !b) return { winner: a || b, loser: null };
    const out = match(round, code, a, b, final);
    return { winner: source(out), loser: source(out, 'loser') };
  }
  function upper(double) {
    let size = 2;
    while (size < teams.length) size *= 2;
    const order = seedOrder(size);
    let slots = order.map(seed => entrants[seed - 1] || null);
    const rounds = [], drops = [];
    for (let number = 1; slots.length > 1; number++) {
      const remaining = slots.length, final = remaining === 2;
      const name = knockoutName(remaining);
      const round = makeRound(`${double ? 'ub' : 'r'}${number}`, double ? `Upper ${name}` : name, double ? 'upper' : null);
      const winners = [], losers = [];
      for (let i = 0; i < slots.length; i += 2) {
        const index = round.matches.length + 1;
        const code = double ? `UB${number}-${index}` : knockoutCode(remaining, number, index);
        const out = play(round, code, slots[i], slots[i + 1], !double && final);
        winners.push(out.winner); losers.push(out.loser);
      }
      rounds.push(round); drops.push(losers); slots = winners;
    }
    return { rounds, drops, winner: slots[0] };
  }

  if (format === 'single-elimination') {
    const tree = upper(false);
    const bracket = definition(format, spec.label, tree.rounds);
    bracket.championMatchId = tree.winner.source.matchId;
    if (options.thirdPlace) {
      const round = makeRound('third-place', 'Third place');
      match(round, '3P', ...tree.drops.at(-2));
      bracket.rounds.push(round);
    }
  } else if (format === 'double-elimination') {
    const tree = upper(true), rounds = [...tree.rounds];
    let lower = [], number = 0;
    function lowerRound(a, b) {
      const round = makeRound(`lb${++number}`, `Lower Round ${number}`, 'lower');
      const winners = a.map((entrant, i) => play(round, `LB${number}-${round.matches.length + 1}`, entrant, b[i]).winner);
      // With byes, an entire template round can disappear.
      if (round.matches.length) rounds.push(round);
      return winners;
    }
    lower = lowerRound(tree.drops[0].filter((_, i) => i % 2 === 0), tree.drops[0].filter((_, i) => i % 2 === 1));
    for (let k = 1; k < tree.drops.length; k++) {
      const drops = tree.drops[k];
      // Cross adjacent upper subtrees before each drop-in, keeping opponents
      // from the same subtree apart until the bracket has to merge them.
      lower = lowerRound(lower, drops.map((_, i) => drops[drops.length > 1 ? i ^ 1 : i]));
      if (k < tree.drops.length - 1) {
        lower = lowerRound(lower.filter((_, i) => i % 2 === 0), lower.filter((_, i) => i % 2 === 1));
      }
    }
    const finalRound = makeRound('gf', 'Grand Final', 'final');
    const final = match(finalRound, 'GF', tree.winner, lower[0], true);
    rounds.push(finalRound);
    const bracket = definition(format, spec.label, rounds);
    bracket.championMatchId = final.id;
    if (options.grandFinalReset) {
      const resetRound = makeRound('gf2', 'Grand Final Reset (only if the lower finalist wins GF)', 'final');
      const reset = match(resetRound, 'GF2', source(final), source(final, 'loser'), true, { optional: true });
      rounds.push(resetRound);
      bracket.championMatchId = reset.id;
      warnings.push('Play GF2 only if teamB (the lower finalist) wins GF. Otherwise skip GF2 and use the GF winner as champion; championMatchId points to GF2 and cannot express this condition.');
    } else {
      warnings.push('With no grand final reset, the GF winner is champion; the upper finalist can be eliminated with only one loss.');
    }
  } else if (format === 'gsl') {
    const count = teams.length / 4, groups = Array.from({ length: count }, () => []);
    // Alternate the direction of each seed band: 1 -> A, 2 -> B, etc.
    entrants.forEach((entrant, i) => {
      const band = Math.floor(i / count), position = i % count;
      groups[band % 2 ? count - 1 - position : position].push(entrant);
    });
    groups.forEach((group, i) => {
      const letter = String.fromCharCode(65 + i), id = `gsl-${letter.toLowerCase()}`;
      const opening = makeRound(`${id}-opening`, 'Opening matches');
      const middle = makeRound(`${id}-middle`, 'Winners / Elimination');
      const deciding = makeRound(`${id}-decider`, 'Decider');
      const a = match(opening, `${letter}1`, group[0], group[3], false, { bracketNode: 'openingA' });
      const b = match(opening, `${letter}2`, group[1], group[2], false, { bracketNode: 'openingB' });
      const winners = match(middle, `${letter}3`, source(a), source(b), false, { bracketNode: 'winners' });
      const losers = match(middle, `${letter}4`, source(a, 'loser'), source(b, 'loser'), false, { bracketNode: 'losers' });
      const decider = match(deciding, `${letter}5`, source(winners, 'loser'), source(losers), true, { bracketNode: 'decider' });
      const bracket = definition(id, `Group ${letter}`, [opening, middle, deciding]);
      bracket.qualifications = [
        { id: `${id}-first`, name: '1st place', source: { ...source(winners).source } },
        { id: `${id}-second`, name: '2nd place', source: { ...source(decider).source } },
      ];
    });
  } else {
    const rotation = [...entrants];
    if (rotation.length % 2) rotation.push(null);
    const pairings = [];
    for (let r = 0; r < rotation.length - 1; r++) {
      const pairs = [];
      for (let i = 0; i < rotation.length / 2; i++) {
        const a = rotation[i], b = rotation[rotation.length - 1 - i];
        if (a && b) pairs.push((r + i) % 2 ? [b, a] : [a, b]);
      }
      pairings.push(pairs);
      rotation.splice(1, 0, rotation.pop());
    }
    if (options.double) pairings.push(...pairings.map(pairs => pairs.map(([a, b]) => [b, a])));
    const rounds = pairings.map((pairs, i) => {
      const round = makeRound(`rr${i + 1}`, `Round ${i + 1}`);
      pairs.forEach(([a, b], j) => match(round, `RR${i + 1}-${j + 1}`, a, b));
      return round;
    });
    definition(format, spec.label, rounds);
  }
  return { matches, brackets, warnings };
}

function seedOrder(size) {
  let order = [1, 2];
  // Mirror each seed at every expansion; seeds 1 and 2 stay in opposite halves.
  for (let n = 4; n <= size; n *= 2) order = order.flatMap(seed => [seed, n + 1 - seed]);
  return order;
}

function knockoutName(size) {
  return ({ 2: 'Final', 4: 'Semifinals', 8: 'Quarterfinals' })[size] || `Round of ${size}`;
}

function knockoutCode(size, round, index) {
  return size === 2 ? 'F' : size === 4 ? `SF${index}` : size === 8 ? `QF${index}` : `R${round}-${index}`;
}
