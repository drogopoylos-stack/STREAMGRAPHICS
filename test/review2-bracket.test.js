// Review 2: bracket champion fallback and native standings data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTournament } from '../server/formats/index.js';
import { bracketTree, resolveMatches, syncBracket } from '../server/bracket.js';

const teamIds = (n) => Array.from({ length: n }, (_, i) => `team-${i + 1}`);
const build = (format, n, options = {}) => {
  const r = generateTournament({ format, teams: teamIds(n), options });
  return { db: { teams: teamIds(n).map((id) => ({ id })), matches: r.matches, settings: { brackets: r.brackets } }, r };
};

test('review2: round robin bracketTree exposes standings data and no champion', () => {
  const { db, r } = build('round-robin', 4);
  const opener = db.matches.find((m) => m.bracketCode === 'RR1-1');
  opener.scoreA = 2; opener.scoreB = 0; opener.status = 'done';
  const tree = bracketTree(db);
  assert.equal(tree.format, 'round-robin');
  assert.equal(tree.champion, null);
  assert.ok(Array.isArray(tree.standings), 'round-robin tree carries standings');
  assert.equal(tree.standings.length, 4);
  const leader = tree.standings[0];
  assert.equal(leader.teamId, opener.teamA);
  assert.equal(leader.points, 3);
  assert.equal(leader.played, 1);
  // Every generated match is part of the table's bracket rounds.
  const ids = new Set(tree.rounds.flatMap((round) => round.matches.map((m) => m.id)));
  assert.equal(ids.size, r.matches.length);
});

test('review2: double elimination rounds carry side and lowered loser sources resolve', () => {
  const { db } = build('double-elimination', 4);
  const lower = db.matches.find((m) => ['teamASource', 'teamBSource'].some((k) => m[k]?.outcome === 'loser'));
  assert.ok(lower, 'a lower-bracket match depends on a loser source');
  // Play the upper rounds so the drop-in participant is known.
  for (const m of db.matches) {
    if (m.id === lower.id) break;
    syncBracket(db);
    m.scoreA = 2; m.scoreB = 0; m.status = 'done';
    syncBracket(db);
  }
  const resolved = resolveMatches(db).find((m) => m.id === lower.id);
  assert.ok(resolved.teamA || resolved.teamB, 'the lower round has a participant after the drop-in');
  const tree = bracketTree(db);
  assert.deepEqual([...new Set(tree.rounds.map((r) => r.side))].sort(), ['final', 'lower', 'upper']);
});

test('review2: the skipped reset grand final names the GF winner, the played reset names GF2', () => {
  for (const lowerWins of [false, true]) {
    const { db } = build('double-elimination', 4, { grandFinalReset: true });
    for (const m of db.matches) {
      if (m.bracketCode === 'GF2') break;
      syncBracket(db);
      m.scoreA = m.bracketCode === 'GF' && lowerWins ? 0 : 2;
      m.scoreB = m.bracketCode === 'GF' && lowerWins ? 2 : 0;
      m.status = 'done';
      syncBracket(db);
    }
    const gf = resolveMatches(db).find((m) => m.bracketCode === 'GF');
    // A reset final is only played when the lower finalist won the first one.
    if (lowerWins) {
      const gf2 = db.matches.find((m) => m.bracketCode === 'GF2');
      gf2.scoreA = 2; gf2.scoreB = 0; gf2.status = 'done';
    }
    const tree = bracketTree(db);
    const expected = lowerWins ? db.matches.find((m) => m.bracketCode === 'GF2').teamA : gf.winnerId;
    assert.equal(tree.champion?.id, expected, `lowerWins=${lowerWins}`);
  }
});
