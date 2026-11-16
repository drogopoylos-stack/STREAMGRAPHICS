import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBracketEmbed } from '../server/bracket-embed.js';

function fixture() {
  const match = (id, extra) => ({ id, bracketCode: id, date: '2026-11-06', time: '18:00', bestOf: 3, scoreA: null, scoreB: null, status: 'scheduled', ...extra });
  return {
    settings: { leagueName: 'Cup </script><script>alert(1)</script>', leagueShort: 'CUP', timezone: 'Europe/Athens', theme: {},
      matchSheet: { enabled: true, spreadsheetId: 'sheet-id', sheetName: 'Matches' },
      brackets: [{ id: 'main', name: 'Main', rounds: [{ id: 'r1', name: 'Round 1', matches: ['1-1', '1-2'] }, { id: 'f', name: 'Final', matches: ['F'] }], championMatchId: 'F' }] },
    teams: [{ id: 'a', tag: 'A', name: 'Alpha' }, { id: 'b', tag: 'B', name: 'Beta' }, { id: 'c', tag: 'C', name: 'Gamma' }, { id: 'd', tag: 'D', name: 'Delta' }],
    matches: [match('1-1', { teamA: 'a', teamB: 'b', scoreA: 2, scoreB: 1 }), match('1-2', { teamA: 'c', teamB: 'd' }),
      match('F', { teamA: null, teamB: null, teamASource: { matchId: '1-1', outcome: 'winner' }, teamBSource: { matchId: '1-2', outcome: 'winner' } })],
  };
}
const dataOf = (html) => JSON.parse(/<script type="application\/json" id="bracket-data">([\s\S]*?)<\/script>/.exec(html)[1]);

test('the website bracket page carries the bracket, the teams and the public sheet address', async () => {
  const html = await buildBracketEmbed(fixture());
  const data = dataOf(html);
  assert.equal(data.csvUrl, 'https://docs.google.com/spreadsheets/d/sheet-id/gviz/tq?tqx=out:csv&sheet=Matches');
  assert.deepEqual(data.brackets[0].rounds.map((r) => r.matches), [['1-1', '1-2'], ['F']]);
  assert.equal(data.matches['1-1'].a, 'A');
  assert.deepEqual(data.matches.F.srcA, { id: '1-1', outcome: 'winner' });
  assert.equal(data.matches.F.a, null);
  assert.equal(data.teams.C.name, 'Gamma');
  assert.ok(html.includes('@font-face'));
});
test('tournament text cannot close the script blocks of the page', async () => {
  const html = await buildBracketEmbed(fixture());
  assert.equal((html.match(/<script>alert/g) || []).length, 0);
  assert.equal(dataOf(html).league, 'Cup </script><script>alert(1)</script>');
});
test('a tournament without a sheet or a bracket gets a clear message', async () => {
  const noSheet = fixture(); delete noSheet.settings.matchSheet;
  await assert.rejects(() => buildBracketEmbed(noSheet), /Connect a Google Sheet/);
  const noBracket = fixture(); noBracket.settings.brackets = [];
  await assert.rejects(() => buildBracketEmbed(noBracket), /no bracket/);
});
