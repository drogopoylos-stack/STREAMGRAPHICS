import { FORMATS, generateTournament, scheduleMatches, standings } from './index.js';
import { errorsFor, formats, formatError } from '../../public/control/js/wizard-model.js';
export { toEngineWeekdays, toBroadcastDays } from '../../public/control/js/wizard-model.js';
import { bracketTree } from '../bracket.js';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function previewTournament(input, newId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Send the tournament format, teams and options.');
  const result = generateTournament({ format: input.format, teams: input.seeds ?? input.teams, options: input.options, ...(newId ? { newId } : {}) });
  if (input.schedule) {
    validateSchedule(input.schedule);
    result.matches = scheduleMatches(result.matches, result.brackets, input.schedule);
    const third = result.matches.find(m => m.bracketCode === '3P'), final = result.matches.find(m => m.bracketCode === 'F');
    if (third && final && `${third.date}T${third.time}` > `${final.date}T${final.time}`) {
      // Both depend on the semifinals. Reserve the earlier slot for third place,
      // including a one-match broadcast day, so the final always closes the cup.
      [third.date, final.date] = [final.date, third.date];
      [third.time, final.time] = [final.time, third.time];
    }
  }
  const dates = [...new Set(result.matches.map(m => m.date).filter(Boolean))].sort();
  return { ...result, counts: { matches: result.matches.length, days: dates.length, first: dates[0] ?? null, last: dates.at(-1) ?? null } };
}
export function validateSchedule(s) {
  if (!s.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)) fail('Choose the first match day.');
  const date = new Date(`${s.startDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== s.startDate) fail('Choose the first match day.');
  if (!Array.isArray(s.weekdays) || !s.weekdays.length) fail('Choose at least one broadcast day.');
  if (!Array.isArray(s.times) || !s.times.length) fail('Add at least one start time.');
  if (s.times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) fail('Use the 24-hour format, e.g. 18:00.');
  if (!Number.isInteger(s.perDay) || s.perDay < 1 || s.perDay > 12) fail('Choose 1 to 12 matches per day.');
}
export function validateWizard(body, { getTournament, designLibrary }) {
  if (typeof body?.name !== 'string' || !body.name.trim()) fail('Enter a tournament name.');
  if (body.name.length > 100) fail('Use up to 100 characters for the tournament name.');
  // The short name is optional: createWizard makes one from the name.
  if (body.short != null && (typeof body.short !== 'string' || body.short.length > 8)) fail('Use up to 8 characters for the short name.');
  if (typeof (body.season ?? '') !== 'string' || (body.season ?? '').length > 80) fail('Use up to 80 characters for the season.');
  if (!['aegean', 'sparta'].includes(body.theme)) fail('Choose Aegean or Sparta.');
  if (body.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { fail('Choose a valid timezone'); } }
  if (body.broadcastDays && (!Array.isArray(body.broadcastDays) || body.broadcastDays.some(d => !Number.isInteger(d) || d < 1 || d > 7))) fail('Choose at least one broadcast day.');
  if (body.designPresetId && !designLibrary().presets.some(p => p.id === body.designPresetId)) fail('Choose a preset from the shared design library');
  if (!Array.isArray(body.teams) || !Array.isArray(body.seeds) || body.seeds.length < 2) fail('Add at least 2 teams.');
  if (body.seeds.length > 64) fail('A tournament can have up to 64 teams.');
  const keys = new Set();
  for (const t of body.teams) {
    if (!t || typeof t.key !== 'string' || !t.key || keys.has(t.key)) fail('Team keys must be unique.');
    keys.add(t.key);
    if (typeof t.name !== 'string' || typeof t.tag !== 'string') fail('Enter a team name.');
    if (t.colors && Object.values(t.colors).some(c => !/^#[0-9a-f]{6}$/i.test(c))) fail('Choose valid team colours.');
    if (t.copy && !getTournament(t.copy.tournamentId)?.teams.some(x => x.id === t.copy.teamId)) fail('Copied team not found.');
  }
  const used = body.seeds.filter(k => k !== null);
  if (used.length !== keys.size || new Set(used).size !== used.length || used.some(k => !keys.has(k))) fail('Use every team exactly once in the seeding.');
  const validationTeams = [...body.teams, ...body.seeds.filter(k => k === null).map((_, i) => ({ key: `tbd-${i}`, tbd: true }))];
  const draft = { ...body, teams: validationTeams, sheet: body.sheet ?? null };
  for (const step of [1, 2, 6]) { const e = errorsFor(draft, step); if (Object.keys(e).length) fail(Object.values(e)[0]); }
  const f = formats.find(f => f.id === body.format), error = f && formatError(f, body.seeds.length);
  if (error) fail(error);
  previewTournament(body);
}
export function decorateTournament(data, body, result) {
  const label = FORMATS.find(f => f.id === body.format).label, n = body.seeds.length;
  const generatedTeams = [...new Set(result.matches.flatMap(m => [m.teamA, m.teamB]).filter(Boolean))];
  for (const team of data.teams) {
    const inputTeam = body.teams.find(t => t.key === team.id || t.name.trim().toLowerCase() === team.name.trim().toLowerCase());
    const seed = body.seeds.indexOf(inputTeam?.key);
    if (seed >= 0 && generatedTeams.includes(team.id)) team.seed = seed + 1;
  }
  data.matches = result.matches.map(m => ({ ...m, source: 'manual', extId: null, notes: '', streamWithCast: null, teamALabel: m.teamALabel ?? '', teamBLabel: m.teamBLabel ?? '' }));
  const series = `Best of ${body.options?.bestOf ?? 3}${body.options?.finalBestOf ? ` · Final BO${body.options.finalBestOf}` : ''}`;
  data.settings.brackets = result.brackets.map(b => ({ ...b, title: body.format === 'gsl' ? b.name : label, subtitle: `${n} teams · ${series}`, footer: `${body.short} · EVERY SERIES COUNTS` }));
  let stages;
  if (body.format === 'gsl') stages = [...result.brackets.map(b => ({ name: b.name, headline: '4 TEAMS', lines: ['Two wins qualify', 'Two losses eliminate'] })), { name: 'Qualified', headline: `${n / 2} TEAMS`, lines: ['Top 2 from each group'] }];
  else if (body.format === 'round-robin') stages = [{ name: 'League', headline: `${n} TEAMS`, lines: ['Everyone plays everyone', '3 points per win'] }];
  else if (body.format === 'double-elimination') stages = ['Upper bracket', 'Lower bracket', 'Grand final'].map(name => ({ name, headline: name.toUpperCase(), lines: [`Best of ${body.options?.bestOf ?? 3}`, 'Winners advance'] }));
  else stages = result.brackets[0].rounds.map((r,i,rounds) => ({ name: r.name, headline: `${i === 0 ? n : r.matches.length * 2} → ${i === 0 && rounds[i+1]?.name !== 'Third place' ? rounds[i+1]?.matches.length * 2 || 1 : r.matches.length}`, lines: [`Best of ${result.matches.find(m => m.id === r.matches[0])?.bestOf ?? 3}`, 'Winners advance'] }));
  data.settings.tournamentFormat = { subtitle: `${label} · ${n} teams`, stages, footer: `${body.short} · ${label.toUpperCase()}` };
  data.settings.timezone = body.timezone || data.settings.timezone;
  if (body.sheet) data.settings.matchSheet = { enabled: false, url: body.sheet.url, spreadsheetId: body.sheet.url.match(/\/d\/([\w-]+)/)[1], sheetName: body.sheet.sheetName || 'Matches' };
  const input = structuredClone(body); delete input.logo; input.teams = input.teams.map(({ logo, logoRaw, ...team }) => team);
  data.settings.wizard = { version: 1, input, createdAt: new Date().toISOString() };
}
export const generatedIds = data => new Set((data.settings.brackets ?? []).flatMap(b => b.rounds.flatMap(r => r.matches)));
export const canRegenerate = data => { const ids = generatedIds(data); return data.matches.filter(m => ids.has(m.id)).every(m => m.status === 'scheduled' && m.scoreA == null && m.scoreB == null); };

export function tournamentRanking(db) {
  const ids = generatedIds(db), matches = ids.size ? db.matches.filter(m => ids.has(m.id)) : db.matches;
  if (db.settings.wizard?.input.format === 'round-robin' || db.settings.brackets?.some(b => b.format === 'round-robin')) return standings(matches, [...db.teams].sort((a,b) => (a.seed ?? Infinity) - (b.seed ?? Infinity)).map(t => t.id)).filter(r => r.played).map(r => r.teamId);
  const rank = new Map();
  const rounds = (db.settings.brackets ?? []).flatMap(b => b.rounds);
  for (const [index, round] of rounds.entries()) for (const id of round.matches) {
    const m = matches.find(m => m.id === id);
    if (!m?.winnerId || m.bracketCode === '3P') continue;
    rank.set(m.loserId, Math.max(rank.get(m.loserId) ?? 0, index * 2 + 1));
    rank.set(m.winnerId, Math.max(rank.get(m.winnerId) ?? 0, index * 2 + 2));
  }
  for (const b of db.settings.brackets ?? []) {
    const tree = bracketTree(db, b.id);
    if (tree?.champion) {
      rank.set(tree.champion.id, 10000);
      const final = matches.find(m => m.winnerId === tree.champion.id && (m.id === b.championMatchId || m.bracketCode === 'GF'));
      if (final?.loserId) rank.set(final.loserId, 9999);
    }
  }
  for (const m of matches.filter(m => m.bracketCode === '3P' && m.winnerId)) { rank.set(m.winnerId, 9998); rank.set(m.loserId, 9997); }
  return db.teams.map((t,i) => ({ id:t.id, rank:rank.get(t.id), seed:t.seed ?? i })).filter(t => t.rank !== undefined).sort((a,b)=>b.rank-a.rank||a.seed-b.seed).map(t=>t.id);
}
