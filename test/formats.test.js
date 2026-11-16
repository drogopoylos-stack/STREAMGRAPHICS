import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, generateTournament, scheduleMatches, standings } from '../server/formats/index.js';
import { resolveMatches, validateSources, bracketTree } from '../server/bracket.js';

const teams = n => Array.from({ length: n }, (_, i) => `team-${i + 1}`);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const generate = (format, n, options = {}) => generateTournament({ format, teams: teams(n), options });
const badRequest = action => assert.throws(action, error => error.status === 400 && /[A-Za-z]/.test(error.message));
const slot = match => `${match.date}T${match.time}`;

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function simulate(tournament, seed = 42, finalWinner = 'upper') {
  let matches = structuredClone(tournament.matches);
  let random = seed;
  const next = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 2 ** 32;
  };
  for (let pass = 0; pass <= matches.length; pass++) {
    matches = resolveMatches({ matches });
    let changed = false;
    for (const match of matches) {
      if (match.scoreA != null || !match.teamA || !match.teamB) continue;
      if (match.optional) {
        const gf = matches.find(item => item.bracketCode === 'GF');
        if (!gf.winnerId || gf.winnerId !== gf.teamB) continue;
      }
      const aWins = match.bracketCode === 'GF' ? finalWinner === 'upper' : next() >= 0.5;
      const needed = Math.ceil(match.bestOf / 2);
      Object.assign(match, { scoreA: aWins ? needed : 0, scoreB: aWins ? 0 : needed, status: 'done' });
      changed = true;
    }
    if (!changed) return resolveMatches({ matches });
  }
  assert.fail('Simulation did not converge');
}

function checkStructure(tournament) {
  const { matches, brackets } = tournament;
  validateSources(matches);
  assert.equal(new Set(matches.map(match => match.id)).size, matches.length);
  assert.equal(new Set(matches.map(match => match.bracketCode)).size, matches.length);
  const referenced = brackets.flatMap(bracket => bracket.rounds.flatMap(round => round.matches));
  assert.deepEqual([...referenced].sort(), matches.map(match => match.id).sort());
  for (const match of matches) {
    assert.equal(match.status, 'scheduled');
    assert.equal(match.date, null); assert.equal(match.time, null);
    assert.equal(match.scoreA, null); assert.equal(match.scoreB, null);
    assert.deepEqual(match.stats, []);
    assert.ok(match.stage);
    for (const side of ['A', 'B']) {
      if (match[`team${side}Source`]) assert.equal(match[`team${side}`], null);
      else assert.ok(match[`team${side}`] || /^Seed \d+$/.test(match[`team${side}Label`]));
    }
  }
}

function checkSimulation(tournament, completed, teamIds, elimination) {
  for (const match of completed) {
    assert.ok(match.teamA && match.teamB, `${match.bracketCode} has both teams`);
    assert.notEqual(match.teamA, match.teamB, `${match.bracketCode} cannot be a self-match`);
    if (!match.optional) assert.ok(match.winnerId, `${match.bracketCode} has a winner`);
  }
  const byId = new Map(completed.map(match => [match.id, match]));
  for (const bracket of tournament.brackets) for (const round of bracket.rounds) {
    const seen = new Set();
    for (const id of round.matches) for (const team of [byId.get(id).teamA, byId.get(id).teamB]) {
      assert.ok(!seen.has(team), `${team} plays once in ${round.name}`);
      seen.add(team);
    }
  }
  if (!elimination) return;
  let final = byId.get(tournament.brackets[0].championMatchId);
  if (final.optional && !final.winnerId) final = completed.find(match => match.bracketCode === 'GF');
  assert.ok(final.winnerId);
  const losses = new Map(teamIds.map(id => [id, 0]));
  for (const match of completed) if (match.loserId && match.bracketCode !== '3P') {
    losses.set(match.loserId, losses.get(match.loserId) + 1);
  }
  for (const id of teamIds) {
    if (id === final.winnerId) assert.ok(losses.get(id) < elimination);
    else assert.equal(losses.get(id), elimination, `${id} eliminated after ${elimination} loss(es)`);
  }
  const db = { matches: completed, teams: teamIds.map(id => ({ id })), settings: { brackets: tournament.brackets } };
  if (byId.get(tournament.brackets[0].championMatchId).winnerId) {
    assert.equal(bracketTree(db).champion.id, final.winnerId);
  }
}

for (const n of range(2, 64)) {
  test(`single elimination: ${n} teams, counts, resolution and elimination`, () => {
    for (const thirdPlace of n >= 4 ? [false, true] : [false]) {
      const tournament = generate('single-elimination', n, { thirdPlace });
      assert.equal(tournament.matches.length, n - 1 + Number(thirdPlace));
      checkStructure(tournament);
      for (const seed of [1, 99, 2026]) checkSimulation(tournament, simulate(tournament, seed), teams(n), 1);
    }
  });
}

for (const n of range(4, 32)) {
  test(`double elimination: ${n} teams, byes, drops and both grand final paths`, () => {
    for (const grandFinalReset of [false, true]) {
      const tournament = generate('double-elimination', n, { grandFinalReset });
      assert.equal(tournament.matches.length, 2 * n - 2 + Number(grandFinalReset));
      assert.equal(tournament.brackets.length, 1);
      const sides = tournament.brackets[0].rounds.map(round => round.side);
      assert.deepEqual(sides, [...sides].sort((a, b) => ['upper', 'lower', 'final'].indexOf(a) - ['upper', 'lower', 'final'].indexOf(b)));
      checkStructure(tournament);
      for (const seed of [3, 101]) {
        const upperWins = simulate(tournament, seed, 'upper');
        checkSimulation(tournament, upperWins, teams(n), 2);
        if (grandFinalReset) {
          assert.equal(upperWins.find(match => match.optional).winnerId, null);
          const lowerWins = simulate(tournament, seed, 'lower');
          checkSimulation(tournament, lowerWins, teams(n), 2);
          assert.ok(lowerWins.find(match => match.optional).winnerId);
        }
      }
    }
  });
}

for (const n of [4, 8, 12, 16, 20, 24, 28, 32]) {
  test(`GSL: ${n} teams, group draw, five nodes and two qualifiers`, () => {
    const tournament = generate('gsl', n);
    assert.equal(tournament.matches.length, n / 4 * 5);
    assert.equal(tournament.brackets.length, n / 4);
    checkStructure(tournament);
    const completed = simulate(tournament);
    checkSimulation(tournament, completed, teams(n));
    const byId = new Map(completed.map(match => [match.id, match]));
    for (const [i, bracket] of tournament.brackets.entries()) {
      assert.equal(bracket.id, `gsl-${String.fromCharCode(97 + i)}`);
      assert.equal(bracket.name, `Group ${String.fromCharCode(65 + i)}`);
      assert.equal(bracket.championMatchId, undefined);
      assert.equal(bracket.qualifications.length, 2);
      const nodes = new Map(bracket.rounds.flatMap(round => round.matches).map(id => [byId.get(id).bracketNode, byId.get(id)]));
      assert.deepEqual([...nodes.keys()], ['openingA', 'openingB', 'winners', 'losers', 'decider']);
      assert.equal(nodes.get('openingA').teamA, teams(n)[i]);
      const qualifiers = bracket.qualifications.map(item => byId.get(item.source.matchId).winnerId);
      assert.deepEqual(qualifiers, [nodes.get('winners').winnerId, nodes.get('decider').winnerId]);
      assert.notEqual(...qualifiers);
      assert.equal(nodes.get('decider').teamA, nodes.get('winners').loserId);
      assert.equal(nodes.get('decider').teamB, nodes.get('losers').winnerId);
    }
  });
}

for (const n of range(3, 20)) {
  test(`round robin: ${n} teams, unique pairings, rest rounds and home/away`, () => {
    for (const double of [false, true]) {
      const tournament = generate('round-robin', n, { double });
      const multiplier = double ? 2 : 1;
      assert.equal(tournament.matches.length, n * (n - 1) / 2 * multiplier);
      assert.equal(tournament.brackets[0].rounds.length, (n % 2 ? n : n - 1) * multiplier);
      assert.ok(tournament.matches.every(match => !match.teamASource && !match.teamBSource));
      checkStructure(tournament);
      checkSimulation(tournament, simulate(tournament), teams(n));
      const pairings = new Map(), appearances = new Map(teams(n).map(id => [id, 0]));
      for (const match of tournament.matches) {
        const key = [match.teamA, match.teamB].sort().join('/');
        const prior = pairings.get(key) || [];
        if (double && prior.length) assert.deepEqual([match.teamA, match.teamB], [prior[0].teamB, prior[0].teamA]);
        pairings.set(key, [...prior, match]);
        for (const id of [match.teamA, match.teamB]) appearances.set(id, appearances.get(id) + 1);
      }
      assert.equal(pairings.size, n * (n - 1) / 2);
      assert.ok([...pairings.values()].every(pair => pair.length === multiplier));
      assert.ok([...appearances.values()].every(count => count === (n - 1) * multiplier));
    }
  });
}

function possibleTeams(match, side, byId) {
  const source = match[`team${side}Source`];
  if (!source) return new Set([match[`team${side}`]]);
  const parent = byId.get(source.matchId);
  return new Set([...possibleTeams(parent, 'A', byId), ...possibleTeams(parent, 'B', byId)]);
}

test('standard seed order separates the top two until the final and gives top seeds byes', () => {
  const tournament = generate('single-elimination', 16);
  const byId = new Map(tournament.matches.map(match => [match.id, match]));
  const opening = tournament.brackets[0].rounds[0].matches.map(id => byId.get(id));
  assert.deepEqual(opening.map(match => [match.teamA, match.teamB]), [
    ['team-1', 'team-16'], ['team-8', 'team-9'], ['team-4', 'team-13'], ['team-5', 'team-12'],
    ['team-2', 'team-15'], ['team-7', 'team-10'], ['team-3', 'team-14'], ['team-6', 'team-11'],
  ]);
  for (const match of tournament.matches) {
    const a = possibleTeams(match, 'A', byId), b = possibleTeams(match, 'B', byId);
    if ((a.has('team-1') && b.has('team-2')) || (b.has('team-1') && a.has('team-2'))) assert.equal(match.bracketCode, 'F');
  }
  const six = generate('single-elimination', 6);
  const first = six.brackets[0].rounds[0].matches;
  assert.equal(first.length, 2);
  assert.ok(six.matches.filter(match => first.includes(match.id)).every(match => !['team-1', 'team-2'].includes(match.teamA) && !['team-1', 'team-2'].includes(match.teamB)));
  const semifinals = six.matches.filter(match => six.brackets[0].rounds[1].matches.includes(match.id));
  assert.deepEqual(semifinals.map(match => match.teamA), ['team-1', 'team-2']);
  assert.ok(semifinals.every(match => !match.teamASource && match.teamBSource));
  assert.deepEqual(tournament.brackets[0].rounds.map(round => round.name), ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final']);
});

test('double elimination crosses loser drop-ins to avoid rematches while separate subtrees exist', () => {
  for (const n of [8, 16, 32]) {
    const tournament = generate('double-elimination', n);
    const byId = new Map(tournament.matches.map(match => [match.id, match]));
    for (const match of tournament.matches.filter(item => item.bracketCode.startsWith('LB'))) {
      const drop = match.teamBSource;
      if (!drop || !byId.get(drop.matchId).bracketCode.startsWith('UB') || drop.matchId === tournament.brackets[0].rounds.filter(round => round.side === 'upper').at(-1).matches[0]) continue;
      const a = possibleTeams(match, 'A', byId), b = possibleTeams(match, 'B', byId);
      assert.ok([...a].every(team => !b.has(team)), `${match.bracketCode} crosses distinct upper subtrees`);
    }
  }
});

test('a single grand final awards the lower finalist the title without a reset', () => {
  const tournament = generate('double-elimination', 8);
  const completed = simulate(tournament, 7, 'lower');
  const final = completed.find(match => match.bracketCode === 'GF');
  assert.equal(final.winnerId, final.teamB);
  assert.equal(tournament.brackets[0].championMatchId, final.id);
  assert.equal(completed.filter(match => match.loserId === final.teamA).length, 1);
  assert.match(tournament.warnings.join(' '), /only one loss/);
});

test('the optional reset reuses the grand final teams and documents conditional champion selection', () => {
  const tournament = generate('double-elimination', 4, { grandFinalReset: true, finalBestOf: 5 });
  const final = tournament.matches.find(match => match.bracketCode === 'GF');
  const reset = tournament.matches.find(match => match.bracketCode === 'GF2');
  assert.equal(reset.optional, true);
  assert.match(reset.stage, /only if the lower finalist wins GF/);
  assert.deepEqual(reset.teamASource, { matchId: final.id, outcome: 'winner' });
  assert.deepEqual(reset.teamBSource, { matchId: final.id, outcome: 'loser' });
  assert.equal(reset.bestOf, 5);
  assert.equal(tournament.brackets[0].championMatchId, reset.id);
  assert.match(tournament.warnings.join(' '), /Otherwise skip GF2 and use the GF winner/);
  const completed = simulate(tournament, 42, 'lower');
  const playedFinal = completed.find(match => match.id === final.id);
  const playedReset = completed.find(match => match.id === reset.id);
  assert.deepEqual([playedFinal.teamA, playedFinal.teamB].sort(), [playedReset.teamA, playedReset.teamB].sort());
});

test('generation is pure, IDs are injectable, series overrides win, and TBD seeds are not byes', () => {
  const input = freeze({ format: 'single-elimination', teams: teams(8),
    options: { bestOf: 1, finalBestOf: 5, thirdPlace: true, roundBestOf: { r1: 3, Semifinals: 7, r3: 9 } } });
  let counter = 0;
  const tournament = generateTournament({ ...input, newId: prefix => `${prefix}_custom_${++counter}` });
  assert.equal(counter, tournament.matches.length);
  assert.ok(tournament.matches.every(match => match.id.startsWith('match_custom_')));
  assert.deepEqual(tournament.brackets[0].rounds.map(round => tournament.matches.find(match => match.id === round.matches[0]).bestOf), [3, 7, 9, 1]);
  assert.deepEqual(generateTournament(input), generateTournament(input));
  assert.equal(generate('single-elimination', 2, { finalBestOf: 5 }).matches[0].bestOf, 5);
  const reset = generate('double-elimination', 4, { bestOf: 1, finalBestOf: 5 });
  assert.equal(reset.matches.find(match => match.bracketCode === 'GF').bestOf, 5);
  const pending = generateTournament({ format: 'single-elimination', teams: freeze(['a', null, 'c', null, null, 'f']) });
  checkStructure(pending);
  assert.equal(pending.matches.length, 5);
  const slots = pending.matches.flatMap(match => ['A', 'B'].filter(side => !match[`team${side}Source`]).map(side => match[`team${side}Label`])).filter(Boolean);
  assert.deepEqual(slots.sort(), ['Seed 2', 'Seed 4', 'Seed 5']);
  assert.deepEqual(FORMATS.map(format => format.id), ['single-elimination', 'double-elimination', 'gsl', 'round-robin']);
  for (const format of FORMATS) {
    assert.ok(format.label && format.minTeams && format.maxTeams);
    assert.ok(format.options.some(option => option.id === 'bestOf'));
  }
});

function checkSchedule(tournament, config) {
  const before = structuredClone(tournament);
  freeze(tournament);
  const output = scheduleMatches(tournament.matches, tournament.brackets, freeze(config));
  assert.deepEqual(tournament, before);
  assert.deepEqual(output.map(match => match.id), tournament.matches.map(match => match.id));
  const byId = new Map(output.map(match => [match.id, match])), counts = new Map();
  for (const [i, match] of output.entries()) {
    assert.notEqual(match, tournament.matches[i]);
    assert.notEqual(match.stats, tournament.matches[i].stats);
    assert.ok(match.date >= config.startDate);
    assert.ok(config.weekdays.includes(new Date(`${match.date}T00:00:00Z`).getUTCDay()));
    assert.ok(config.times.includes(match.time));
    counts.set(match.date, (counts.get(match.date) || 0) + 1);
    for (const source of [match.teamASource, match.teamBSource].filter(Boolean)) {
      assert.ok(slot(match) > slot(byId.get(source.matchId)), `${match.bracketCode} follows its source`);
    }
  }
  assert.ok([...counts.values()].every(count => count <= (config.perDay ?? config.times.length)));
  let previous = '';
  for (const round of tournament.brackets.flatMap(bracket => bracket.rounds)) {
    const slots = round.matches.map(id => slot(byId.get(id))).sort();
    if (!slots.length) continue;
    assert.ok(slots[0] > previous, `${round.name} follows the preceding round`);
    previous = slots.at(-1);
  }
  return output;
}

test('schedules preserve round order and dependencies, weekdays, capacity and input objects', () => {
  for (const [format, n] of [['single-elimination', 17], ['double-elimination', 13], ['gsl', 8], ['round-robin', 7]]) {
    for (const perDay of [1, 2, 5]) {
      checkSchedule(generate(format, n), { startDate: '2026-10-23', weekdays: [0, 3, 6], times: ['18:00', '20:00'], perDay, timezone: 'Europe/Athens' });
    }
  }
  checkSchedule(generate('double-elimination', 32, { grandFinalReset: true }), {
    startDate: '2028-02-28', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['19:00'], timezone: 'America/New_York',
  });
});

test('scheduling repeats time slots for independent matches and handles reversed definitions', () => {
  const rr = generate('round-robin', 10);
  const scheduled = checkSchedule(rr, { startDate: '2026-11-16', weekdays: [1, 2, 3, 4, 5], times: ['18:00', '20:00'], perDay: 5 });
  assert.deepEqual(scheduled.slice(0, 5).map(match => match.time), ['18:00', '20:00', '18:00', '20:00', '18:00']);
  assert.ok(scheduled.slice(0, 5).every(match => match.date === '2026-11-16'));
  const tournament = generate('double-elimination', 8);
  tournament.brackets[0].rounds.reverse();
  tournament.matches.reverse();
  const output = scheduleMatches(tournament.matches, tournament.brackets, { startDate: '2026-11-16', weekdays: [1, 3], times: ['18:00'], perDay: 4 });
  const byId = new Map(output.map(match => [match.id, match]));
  for (const match of output) for (const source of [match.teamASource, match.teamBSource].filter(Boolean)) {
    assert.ok(slot(match) > slot(byId.get(source.matchId)));
  }
  assert.deepEqual(scheduleMatches([], [], { startDate: '2026-11-16', weekdays: [0], times: ['20:00'] }), []);
});

const result = (teamA, teamB, scoreA, scoreB, extra = {}) => ({ teamA, teamB, scoreA, scoreB, bestOf: 3, status: 'done', ...extra });

test('standings use head-to-head before map difference in a four-team table', () => {
  const matches = freeze([
    result('a', 'b', 2, 1), result('a', 'c', 2, 1), result('a', 'd', 0, 2),
    result('b', 'c', 2, 0), result('b', 'd', 2, 0), result('c', 'd', 2, 0),
  ]);
  const table = standings(matches, freeze(['b', 'd', 'c', 'a']));
  assert.deepEqual(table.map(row => row.teamId), ['a', 'b', 'c', 'd']);
  assert.deepEqual(table.map(row => row.points), [6, 6, 3, 3]);
  assert.deepEqual(table.map(row => row.mapDifference), [0, 3, -1, -2]);
  assert.deepEqual(table[0], { teamId: 'a', seed: 4, points: 6, played: 3, wins: 2, losses: 1, draws: 0, mapDifference: 0 });
});

test('standings handle draws, decisive live scores, custom points and unfinished results', () => {
  const matches = freeze([
    result('a', 'b', 1, 1), result('b', 'c', 0, 2, { status: 'live' }),
    result('c', 'a', 1, 0, { status: 'live' }), result('a', 'c', 2, null),
    result('b', 'a', 1, 1, { status: 'scheduled' }), result('a', 'b', NaN, 2),
    result('b', 'c', -1, 2), result('a', 'unknown', 2, 0),
    result('b', 'c', 1, 0, { bestOf: null, status: 'live' }),
  ]);
  const table = standings(matches, ['a', 'b', 'c'], freeze({ win: 5, loss: -1, draw: 2 }));
  assert.deepEqual(table.map(row => [row.teamId, row.points, row.played, row.wins, row.losses, row.draws]), [
    ['c', 5, 1, 1, 0, 0], ['a', 2, 1, 0, 0, 1], ['b', 1, 2, 0, 1, 1],
  ]);
  assert.deepEqual(standings([], ['c', 'a', 'b']).map(row => row.teamId), ['c', 'a', 'b']);
  assert.equal(standings([result('a', 'b', 1, 0, { bestOf: null })], ['a', 'b'])[0].points, 3);
});

test('multi-team head-to-head ties use a mini-table, then map difference and seed', () => {
  const cyclic = [result('a', 'b', 2, 0), result('b', 'c', 2, 1), result('c', 'a', 2, 0)];
  assert.deepEqual(standings(cyclic, ['b', 'a', 'c']).map(row => row.teamId), ['c', 'a', 'b']);
  const equal = [result('a', 'b', 2, 0), result('b', 'c', 2, 0), result('c', 'a', 2, 0)];
  assert.deepEqual(standings(equal, ['b', 'a', 'c']).map(row => row.teamId), ['b', 'a', 'c']);
});

test('invalid tournament inputs throw English status 400 errors', () => {
  for (const input of [null, [], {}, { format: 'swiss', teams: teams(8) }]) badRequest(() => generateTournament(input));
  for (const [format, counts] of [['single-elimination', [0, 1, 65]], ['double-elimination', [3, 33]], ['gsl', [3, 5, 10, 36]], ['round-robin', [2, 21]]]) {
    for (const n of counts) badRequest(() => generate(format, n));
  }
  for (const value of [null, {}, ['a', 'a'], ['a', ''], ['a', 1], ['a', undefined], Array(4)]) {
    badRequest(() => generateTournament({ format: 'single-elimination', teams: value }));
  }
  for (const options of [null, [], { bestOf: 0 }, { bestOf: 2 }, { bestOf: '3' }, { finalBestOf: -1 },
    { finalBestOf: NaN }, { roundBestOf: [] }, { roundBestOf: { r1: 4 } }, { thirdPlace: 'yes' }, { double: 1 }, { grandFinalReset: null }]) {
    badRequest(() => generate('single-elimination', 4, options));
  }
  for (const n of [2, 3]) badRequest(() => generate('single-elimination', n, { thirdPlace: true }));
  for (const newId of [null, () => '', () => 'duplicate', () => 1]) {
    badRequest(() => generateTournament({ format: 'single-elimination', teams: teams(4), newId }));
  }
});

test('invalid schedules and standings throw status 400 instead of hanging or mutating', () => {
  const tournament = generate('single-elimination', 4);
  const valid = { startDate: '2026-11-16', weekdays: [1], times: ['18:00'] };
  for (const changes of [{ startDate: '2026-02-30' }, { startDate: '16/11/2026' }, { startDate: null },
    { weekdays: [] }, { weekdays: [7] }, { weekdays: Array(1) }, { weekdays: ['1'] },
    { times: [] }, { times: ['24:00'] }, { times: ['9:00'] }, { times: Array(1) },
    { perDay: 0 }, { perDay: 1.5 }, { timezone: 'Invalid/Zone' }, { timezone: null }]) {
    badRequest(() => scheduleMatches(tournament.matches, tournament.brackets, { ...valid, ...changes }));
  }
  badRequest(() => scheduleMatches(tournament.matches, tournament.brackets, null));
  badRequest(() => scheduleMatches(null, [], valid));
  badRequest(() => scheduleMatches(tournament.matches, [{ rounds: [{ matches: ['missing'] }] }], valid));
  badRequest(() => scheduleMatches(tournament.matches, [{ rounds: [{ matches: [tournament.matches[0].id, tournament.matches[0].id] }] }], valid));
  const cyclic = structuredClone(tournament.matches);
  cyclic[0].teamASource = { matchId: cyclic.at(-1).id, outcome: 'winner' };
  badRequest(() => scheduleMatches(cyclic, tournament.brackets, valid));
  badRequest(() => standings([], ['a', 'a']));
  badRequest(() => standings([], ['a', null]));
  badRequest(() => standings(null, ['a']));
  badRequest(() => standings([], ['a'], { win: Infinity }));
  badRequest(() => standings([], ['a'], null));
});
