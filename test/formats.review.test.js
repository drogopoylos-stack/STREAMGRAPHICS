// Independent adversarial review of the tournament format engine.
// This file deliberately re-derives seeding/bye/drop-in expectations from
// jobs/agents/formats-brief.md instead of trusting test/formats.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTournament, scheduleMatches, standings } from '../server/formats/index.js';
import { resolveMatches, validateSources, bracketTree } from '../server/bracket.js';

const teamIds = n => Array.from({ length: n }, (_, i) => `team-${i + 1}`);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const generate = (format, n, options = {}) => generateTournament({ format, teams: teamIds(n), options });

/** Deterministic PRNG so every "random" bracket simulation is reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function possibleTeams(match, side, byId) {
  const source = match[`team${side}Source`];
  if (!source) return new Set([match[`team${side}`]]);
  const parent = byId.get(source.matchId);
  return new Set([...possibleTeams(parent, 'A', byId), ...possibleTeams(parent, 'B', byId)]);
}

/** Fill decisive scores until no unresolved match can be played. */
function simulate(tournament, seed, finalSide = null) {
  let matches = structuredClone(tournament.matches);
  const next = mulberry32(seed);
  for (let pass = 0; pass <= matches.length + 4; pass++) {
    matches = resolveMatches({ matches });
    let changed = false;
    for (const match of matches) {
      if (match.scoreA != null || !match.teamA || !match.teamB) continue;
      if (match.optional) {
        const final = matches.find(item => item.bracketCode === 'GF');
        if (!final.winnerId || final.winnerId !== final.teamB) continue;
      }
      const aWins = finalSide && match.bracketCode === 'GF' ? finalSide === 'A' : next() >= 0.5;
      const needed = Math.ceil(match.bestOf / 2);
      Object.assign(match, { scoreA: aWins ? needed : 0, scoreB: aWins ? 0 : needed, status: 'done' });
      changed = true;
    }
    if (!changed) return matches;
  }
  assert.fail('simulation did not converge');
}

function assertUniqueIds(tournament) {
  const ids = tournament.matches.map(match => match.id);
  assert.equal(new Set(ids).size, ids.length, 'match ids are unique');
  const codes = tournament.matches.map(match => match.bracketCode);
  assert.equal(new Set(codes).size, codes.length, 'bracket codes are unique');
  for (const id of ids) assert.ok(typeof id === 'string' && id.trim(), 'ids are non-empty strings');
}

// ---------------------------------------------------------------------------
// Single elimination: counts, standard seeding, byes for the top seeds.
// ---------------------------------------------------------------------------
test('SE review: counts, seed separation and top-seed byes for every N=2..64', () => {
  for (const n of range(2, 64)) {
    for (const thirdPlace of n >= 4 ? [false, true] : [false]) {
      const t = generate('single-elimination', n, { thirdPlace });
      const label = `SE N=${n} thirdPlace=${thirdPlace}`;
      assert.equal(t.matches.length, n - 1 + Number(thirdPlace), `${label} match count`);
      assert.equal(t.brackets.length, 1, `${label} one bracket`);
      validateSources(t.matches);
      assertUniqueIds(t);

      const byId = new Map(t.matches.map(match => [match.id, match]));
      // Seeds 1 and 2 may only share a match on the championship path (never 3P).
      let finalists = new Set();
      for (const match of t.matches) {
        // The third-place match is off the championship path: both top seeds may
        // legitimately fall into it after losing a semifinal.
        if (match.bracketCode === '3P') continue;
        const a = possibleTeams(match, 'A', byId);
        const b = possibleTeams(match, 'B', byId);
        const together = (a.has('team-1') && b.has('team-2')) || (a.has('team-2') && b.has('team-1'));
        if (together) assert.equal(match.bracketCode, 'F', `${label} seeds 1/2 meet only in the final`);
        if (match.bracketCode === 'F') finalists = new Set([...a, ...b]);
      }
      assert.ok(finalists.has('team-1') && finalists.has('team-2'), `${label} both top seeds reach the final half`);

      // Byes: exactly seeds 1..(2^k - N) skip round 1 and enter later as fixed teams.
      const size = 2 ** Math.ceil(Math.log2(n));
      const byes = size - n;
      const firstRound = t.brackets[0].rounds[0].matches;
      const playing = new Set();
      for (const id of firstRound) {
        const match = byId.get(id);
        if (match.teamA) playing.add(match.teamA);
        if (match.teamB) playing.add(match.teamB);
      }
      const rested = teamIds(n).filter(id => !playing.has(id));
      assert.deepEqual(rested, teamIds(n).slice(0, byes), `${label} byes go to the top seeds`);
      for (const id of rested) {
        const match = t.matches.find(item => item.teamA === id || item.teamB === id);
        assert.ok(match, `${label} ${id} appears in a later round`);
        const side = match.teamA === id ? 'A' : 'B';
        assert.ok(!match[`team${side}Source`], `${label} ${id} is a fixed bye slot`);
        assert.ok(!firstRound.includes(match.id), `${label} ${id} does not replay round 1`);
      }

      // Third place is fed by the two semifinal losers.
      if (thirdPlace) {
        const third = t.matches.find(match => match.bracketCode === '3P');
        assert.ok(third);
        const semis = t.brackets[0].rounds.find(round => round.name === 'Semifinals');
        assert.equal(semis.matches.length, 2, `${label} two semifinals`);
        assert.deepEqual(
          [third.teamASource, third.teamBSource].map(source => [source.matchId, source.outcome]),
          semis.matches.map(id => [id, 'loser']),
          `${label} 3P uses both semifinal losers`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Double elimination: 50 seeded simulations per N, loss and structure bounds.
// ---------------------------------------------------------------------------
test('DE review: 50 seeded simulations per N=4..32 keep every team to <=2 losses', () => {
  for (const n of range(4, 32)) {
    const t = generate('double-elimination', n);
    assert.equal(t.matches.length, 2 * n - 2, `DE N=${n} match count`);
    validateSources(t.matches);
    assertUniqueIds(t);

    for (let seed = 1; seed <= 50; seed++) {
      const finalSide = seed % 2 ? 'B' : 'A';
      const done = simulate(t, seed * 7919 + n, finalSide);
      const byId = new Map(done.map(match => [match.id, match]));
      const label = `DE N=${n} seed=${seed}`;

      for (const match of done) {
        if (match.optional) continue;
        assert.ok(match.teamA && match.teamB, `${label} ${match.bracketCode} has two teams`);
        assert.notEqual(match.teamA, match.teamB, `${label} ${match.bracketCode} is not a self-match`);
        assert.ok(match.winnerId, `${label} ${match.bracketCode} has a winner`);
      }
      // No team twice in one round.
      for (const round of t.brackets[0].rounds) {
        const seen = new Set();
        for (const id of round.matches) {
          const match = byId.get(id);
          for (const team of [match.teamA, match.teamB]) {
            if (!team) continue;
            assert.ok(!seen.has(team), `${label} ${round.name}: ${team} plays twice`);
            seen.add(team);
          }
        }
      }
      // Loss accounting.
      const losses = new Map(teamIds(n).map(id => [id, 0]));
      for (const match of done) if (match.loserId) losses.set(match.loserId, losses.get(match.loserId) + 1);
      let champion = byId.get(t.brackets[0].championMatchId);
      if (champion.optional && !champion.winnerId) champion = done.find(match => match.bracketCode === 'GF');
      assert.ok(champion.winnerId, `${label} champion is decided`);
      for (const [id, count] of losses) {
        assert.ok(count <= 2, `${label} ${id} has ${count} losses`);
        if (id === champion.winnerId) assert.ok(count <= 1, `${label} champion ${id} has ${count} losses`);
        else assert.ok(count >= 1, `${label} ${id} cannot be eliminated with zero losses`);
      }
      // The engine output resolves through bracket.js.
      const tree = bracketTree({ matches: done, teams: teamIds(n).map(id => ({ id })), settings: { brackets: t.brackets } });
      assert.equal(tree.champion?.id, champion.winnerId, `${label} bracketTree champion`);
    }
  }
});

test('DE review: grand final reset plays GF2 only when the lower finalist wins GF', () => {
  for (const n of range(4, 32)) {
    const t = generate('double-elimination', n, { grandFinalReset: true });
    assert.equal(t.matches.length, 2 * n - 1, `DE N=${n} reset match count`);
    const reset = t.matches.find(match => match.bracketCode === 'GF2');
    assert.equal(reset.optional, true);
    for (let seed = 1; seed <= 25; seed++) {
      const finalSide = seed % 2 ? 'B' : 'A';
      const done = simulate(t, seed * 104729 + n, finalSide);
      const final = done.find(match => match.bracketCode === 'GF');
      const playedReset = done.find(match => match.bracketCode === 'GF2');
      const label = `DE reset N=${n} seed=${seed}`;
      if (final.winnerId === final.teamB) {
        assert.ok(playedReset.winnerId, `${label} reset is played when the lower finalist wins GF`);
        assert.deepEqual(
          [playedReset.teamA, playedReset.teamB].sort(),
          [final.teamA, final.teamB].sort(),
          `${label} reset reuses the grand final teams`,
        );
      } else {
        assert.equal(playedReset.scoreA, null, `${label} reset is skipped when the upper finalist wins GF`);
      }
      for (const match of done) {
        if (match.optional) continue;
        assert.ok(match.teamA && match.teamB && match.teamA !== match.teamB, `${label} ${match.bracketCode}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// GSL groups.
// ---------------------------------------------------------------------------
test('GSL review: five nodes per group and two distinct qualifiers for 4..32 teams', () => {
  for (const n of [4, 8, 12, 16, 20, 24, 28, 32]) {
    const t = generate('gsl', n);
    assert.equal(t.matches.length, (n / 4) * 5, `GSL N=${n} match count`);
    assert.equal(t.brackets.length, n / 4, `GSL N=${n} group count`);
    validateSources(t.matches);
    assertUniqueIds(t);

    const done = simulate(t, 4242 + n);
    const byId = new Map(done.map(match => [match.id, match]));
    const seenTeams = new Set();
    for (const [index, bracket] of t.brackets.entries()) {
      const letter = String.fromCharCode(65 + index);
      assert.equal(bracket.id, `gsl-${letter.toLowerCase()}`, `GSL group id ${letter}`);
      assert.equal(bracket.name, `Group ${letter}`, `GSL group name ${letter}`);
      const ids = bracket.rounds.flatMap(round => round.matches);
      assert.equal(ids.length, 5, `GSL ${letter} has five matches`);
      const nodes = new Map(ids.map(id => [byId.get(id).bracketNode, byId.get(id)]));
      assert.deepEqual([...nodes.keys()].sort(), ['decider', 'losers', 'openingA', 'openingB', 'winners'].sort(), `GSL ${letter} nodes`);
      for (const team of [nodes.get('openingA').teamA, nodes.get('openingA').teamB,
        nodes.get('openingB').teamA, nodes.get('openingB').teamB]) {
        assert.ok(!seenTeams.has(team), `GSL ${team} appears in one group only`);
        seenTeams.add(team);
      }
      // winners = W(openingA) vs W(openingB); losers = L(A) vs L(B); decider = L(winners) vs W(losers).
      assert.deepEqual([nodes.get('winners').teamASource, nodes.get('winners').teamBSource],
        [nodes.get('openingA'), nodes.get('openingB')].map(match => ({ matchId: match.id, outcome: 'winner' })), `GSL ${letter} winners wiring`);
      assert.deepEqual([nodes.get('losers').teamASource, nodes.get('losers').teamBSource],
        [nodes.get('openingA'), nodes.get('openingB')].map(match => ({ matchId: match.id, outcome: 'loser' })), `GSL ${letter} losers wiring`);
      assert.deepEqual([nodes.get('decider').teamASource, nodes.get('decider').teamBSource],
        [{ matchId: nodes.get('winners').id, outcome: 'loser' }, { matchId: nodes.get('losers').id, outcome: 'winner' }], `GSL ${letter} decider wiring`);
      assert.equal(nodes.get('decider').teamA, nodes.get('winners').loserId, `GSL ${letter} decider plays L(winners)`);
      assert.equal(nodes.get('decider').teamB, nodes.get('losers').winnerId, `GSL ${letter} decider plays W(losers)`);

      const qualifiers = bracket.qualifications.map(item => byId.get(item.source.matchId).winnerId);
      assert.equal(new Set(qualifiers).size, 2, `GSL ${letter} two distinct qualifiers`);
      assert.deepEqual(qualifiers, [nodes.get('winners').winnerId, nodes.get('decider').winnerId], `GSL ${letter} qualification order`);
    }
    assert.equal(seenTeams.size, n, `GSL N=${n} every team placed`);
  }
});

// ---------------------------------------------------------------------------
// Round robin.
// ---------------------------------------------------------------------------
test('RR review: unique pairings and one match per team per round for 3..20 teams', () => {
  for (const n of range(3, 20)) {
    for (const double of [false, true]) {
      const t = generate('round-robin', n, { double });
      const multiplier = double ? 2 : 1;
      const label = `RR N=${n} double=${double}`;
      assert.equal(t.matches.length, (n * (n - 1) / 2) * multiplier, `${label} match count`);
      assert.equal(t.brackets.length, 1, `${label} one bracket`);
      assert.equal(t.brackets[0].format, 'round-robin', `${label} bracket format`);
      validateSources(t.matches);
      assertUniqueIds(t);
      assert.ok(t.matches.every(match => !match.teamASource && !match.teamBSource), `${label} no sources`);

      const byId = new Map(t.matches.map(match => [match.id, match]));
      const pairings = new Map();
      const rests = [];
      for (const round of t.brackets[0].rounds) {
        const seen = new Set();
        for (const id of round.matches) {
          const match = byId.get(id);
          assert.notEqual(match.teamA, match.teamB, `${label} self-match`);
          for (const team of [match.teamA, match.teamB]) {
            assert.ok(!seen.has(team), `${label} ${round.name}: ${team} plays twice`);
            seen.add(team);
          }
          const key = [match.teamA, match.teamB].sort().join('/');
          pairings.set(key, (pairings.get(key) || 0) + 1);
        }
        if (n % 2) rests.push(teamIds(n).filter(id => !seen.has(id)).sort().join(','));
      }
      assert.equal(pairings.size, n * (n - 1) / 2, `${label} all pairs exist`);
      for (const [key, count] of pairings) assert.equal(count, multiplier, `${label} pair ${key} meets ${count} times`);
      if (n % 2) {
        const restCounts = new Map(teamIds(n).map(id => [id, 0]));
        for (const rest of rests) restCounts.set(rest, restCounts.get(rest) + 1);
        for (const [id, count] of restCounts) assert.equal(count, multiplier, `${label} ${id} rests ${count} times`);
        for (let i = 1; i < rests.length; i++) assert.notEqual(rests[i], rests[i - 1], `${label} no team rests twice in a row`);
      }
      // Every team plays the same number of matches.
      const played = new Map(teamIds(n).map(id => [id, 0]));
      for (const match of t.matches) for (const team of [match.teamA, match.teamB]) played.set(team, played.get(team) + 1);
      for (const [id, count] of played) assert.equal(count, (n - 1) * multiplier, `${label} ${id} match count`);
    }
  }
});

// ---------------------------------------------------------------------------
// Scheduling.
// ---------------------------------------------------------------------------
test('scheduleMatches review: dependency order, allowed weekdays and per-day capacity', () => {
  const config = { startDate: '2026-10-23', weekdays: [5, 6], times: ['18:00', '20:00'], perDay: 2 };
  const jobs = [
    ['single-elimination', 2, {}], ['single-elimination', 5, {}], ['single-elimination', 17, { thirdPlace: true }],
    ['single-elimination', 64, {}],
    ['double-elimination', 4, {}], ['double-elimination', 9, {}], ['double-elimination', 13, {}],
    ['double-elimination', 32, { grandFinalReset: true }],
    ['gsl', 8, {}], ['gsl', 20, {}], ['gsl', 32, {}],
    ['round-robin', 3, {}], ['round-robin', 7, { double: true }], ['round-robin', 20, { double: true }],
  ];
  const slot = match => `${match.date}T${match.time}`;
  for (const [format, n, options] of jobs) {
    const t = generate(format, n, options);
    const before = JSON.stringify(t);
    const out = scheduleMatches(t.matches, t.brackets, config);
    const label = `schedule ${format} N=${n}`;
    assert.equal(JSON.stringify(t), before, `${label} does not mutate its input`);
    assert.equal(out.length, t.matches.length, `${label} keeps every match`);
    assert.deepEqual(out.map(match => match.id), t.matches.map(match => match.id), `${label} keeps order`);

    const byId = new Map(out.map(match => [match.id, match]));
    const perDate = new Map();
    for (const [index, match] of out.entries()) {
      assert.notEqual(match, t.matches[index], `${label} returns new objects`);
      assert.notEqual(match.stats, t.matches[index].stats, `${label} clones stats`);
      assert.ok(config.times.includes(match.time), `${label} uses configured times`);
      assert.ok([5, 6].includes(new Date(`${match.date}T00:00:00Z`).getUTCDay()), `${label} uses allowed weekdays`);
      assert.ok(match.date >= config.startDate, `${label} never precedes the start date`);
      perDate.set(match.date, (perDate.get(match.date) || 0) + 1);
      for (const source of [match.teamASource, match.teamBSource].filter(Boolean)) {
        assert.ok(slot(match) > slot(byId.get(source.matchId)), `${label} ${match.bracketCode} follows its source`);
      }
    }
    for (const [date, count] of perDate) assert.ok(count <= 2, `${label} ${date} has ${count} matches`);

    // Whole rounds stay in definition order.
    let previous = '';
    for (const round of t.brackets.flatMap(bracket => bracket.rounds)) {
      const slots = round.matches.map(id => slot(byId.get(id))).sort();
      if (!slots.length) continue;
      assert.ok(slots[0] > previous, `${label} ${round.name} follows the preceding round`);
      previous = slots.at(-1);
    }
  }
});

// ---------------------------------------------------------------------------
// Standings.
// ---------------------------------------------------------------------------
const result = (teamA, teamB, scoreA, scoreB, extra = {}) => ({ teamA, teamB, scoreA, scoreB, bestOf: 3, status: 'done', ...extra });

test('standings review: head-to-head precedes map difference and only decided games count', () => {
  const matches = [
    result('a', 'b', 2, 1), result('a', 'c', 2, 1), result('a', 'd', 0, 2),
    result('b', 'c', 2, 0), result('b', 'd', 2, 0), result('c', 'd', 2, 0),
  ];
  const table = standings(matches, ['b', 'd', 'c', 'a']);
  assert.deepEqual(table.map(row => row.teamId), ['a', 'b', 'c', 'd']);
  assert.deepEqual(table[0], { teamId: 'a', seed: 4, points: 6, played: 3, wins: 2, losses: 1, draws: 0, mapDifference: 0 });

  const unfinished = [
    result('a', 'b', 2, 1),
    result('a', 'c', 0, 2, { status: 'live' }),      // decisive live score counts
    result('a', 'd', 2, null),                        // missing score is ignored
    result('b', 'c', 1, 1),
    result('b', 'd', 2, 0, { status: 'scheduled' }),  // decisive even while scheduled
    result('c', 'd', 1, 0, { status: 'scheduled' }),  // not decisive -> ignored
  ];
  const partial = standings(unfinished, ['a', 'b', 'c', 'd']);
  const row = id => partial.find(item => item.teamId === id);
  assert.deepEqual(
    ['a', 'b', 'c', 'd'].map(id => [row(id).played, row(id).points, row(id).wins, row(id).losses, row(id).draws]),
    [[2, 3, 1, 1, 0], [3, 4, 1, 1, 1], [2, 4, 1, 0, 1], [1, 0, 0, 1, 0]],
  );
});

// ---------------------------------------------------------------------------
// Purity, ids and bad inputs.
// ---------------------------------------------------------------------------
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('review: generation is pure, ids are injectable and unique per call', () => {
  const input = freeze({ format: 'double-elimination', teams: freeze(teamIds(16)), options: freeze({ grandFinalReset: true, bestOf: 3 }) });
  const first = generateTournament(input);
  const second = generateTournament(input);
  assert.deepEqual(first, second, 'same input gives the same output');
  assertUniqueIds(first);

  let counter = 0;
  const custom = generateTournament({ ...input, newId: prefix => `${prefix}#${++counter}` });
  assert.equal(counter, custom.matches.length, 'newId is called once per match');
  assert.ok(custom.matches.every(match => match.id.startsWith('match#')));
  assertUniqueIds(custom);

  // Default ids are local to one result: two calls collide by design (documented).
  assert.deepEqual(first.matches.map(match => match.id).slice(0, 2), ['match-1', 'match-2']);
});

test('review: bad inputs throw errors with status 400', () => {
  const bad = action => assert.throws(action, error => error.status === 400 && /[A-Za-z]/.test(error.message));
  for (const input of [null, [], 'single-elimination', { format: 'swiss', teams: teamIds(8) }, { teams: teamIds(8) }]) {
    bad(() => generateTournament(input));
  }
  for (const [format, counts] of [['single-elimination', [0, 1, 65]], ['double-elimination', [3, 33]], ['gsl', [3, 6, 36]], ['round-robin', [2, 21]]]) {
    for (const n of counts) bad(() => generate(format, n));
  }
  bad(() => generateTournament({ format: 'single-elimination', teams: ['a', 'a'] }));
  bad(() => generateTournament({ format: 'single-elimination', teams: ['a', ''] }));
  bad(() => generateTournament({ format: 'single-elimination', teams: 'abcdefgh' }));
  bad(() => generateTournament({ format: 'single-elimination', teams: Array(8) }));
  bad(() => generate('single-elimination', 4, { bestOf: 2 }));
  bad(() => generate('single-elimination', 4, { finalBestOf: 0 }));
  bad(() => generate('single-elimination', 4, { roundBestOf: { r1: 4 } }));
  bad(() => generate('single-elimination', 2, { thirdPlace: true }));
  bad(() => generateTournament({ format: 'single-elimination', teams: teamIds(4), newId: () => 'same' }));
  const t = generate('single-elimination', 4);
  bad(() => scheduleMatches(t.matches, t.brackets, { startDate: '2026-02-30', weekdays: [5], times: ['18:00'] }));
  bad(() => scheduleMatches(t.matches, t.brackets, { startDate: '2026-10-23', weekdays: [7], times: ['18:00'] }));
  bad(() => scheduleMatches(t.matches, t.brackets, { startDate: '2026-10-23', weekdays: [5], times: ['24:00'] }));
  bad(() => scheduleMatches(t.matches, t.brackets, { startDate: '2026-10-23', weekdays: [5], times: ['18:00'], perDay: 0 }));
  bad(() => scheduleMatches(null, [], { startDate: '2026-10-23', weekdays: [5], times: ['18:00'] }));
  bad(() => standings([], ['a', 'a']));
  bad(() => standings([], 'ab'));
  bad(() => standings([], ['a'], { win: Infinity }));
});

// ---------------------------------------------------------------------------
// Documented limitation: the reset grand final cannot name a champion by source.
// ---------------------------------------------------------------------------
test('review: a skipped reset grand final gives the GF winner as champion', () => {
  const t = generate('double-elimination', 4, { grandFinalReset: true });
  const reset = t.matches.find(match => match.bracketCode === 'GF2');
  assert.equal(t.brackets[0].championMatchId, reset.id);
  assert.match(t.warnings.join(' '), /GF2/);

  const done = simulate(t, 12345, 'A'); // upper finalist wins GF -> reset is skipped
  const final = done.find(match => match.bracketCode === 'GF');
  assert.ok(final.winnerId);
  assert.equal(done.find(match => match.bracketCode === 'GF2').winnerId, null);
  const tree = bracketTree({ matches: done, teams: teamIds(4).map(id => ({ id })), settings: { brackets: t.brackets } });
  // server/bracket.js falls back to the GF winner when the optional reset is not played.
  assert.equal(tree.champion?.id, final.winnerId);
});
