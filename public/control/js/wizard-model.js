export const DRAFT_KEY = 'hll-tournament-wizard-draft-v1';
export const steps = ['Name & look', 'Teams', 'Format', 'Seeding', 'Schedule', 'Google Sheet', 'Review'];
export const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const formats = [
  { id: 'single-elimination', label: 'Single elimination', min: 2, max: 64, diagram: '┌─┐→🏆', line: 'Lose once and you are out. Fast, dramatic, ideal for cups.' },
  { id: 'double-elimination', label: 'Double elimination', min: 4, max: 32, diagram: '⇉ 🏆', line: 'Upper and lower bracket: a team is out after two losses.' },
  { id: 'gsl', label: 'GSL groups', min: 4, max: 32, diagram: '④ → ②', line: 'Groups of four. Two wins qualify, two losses eliminate. Top 2 advance.' },
  { id: 'round-robin', label: 'Round robin', min: 3, max: 20, diagram: '≡ ★', line: 'Everyone plays everyone. A league table decides the ranking.' },
];
export const leads = [
  'Give your tournament its name and broadcast look. You can change these later.',
  'Add your teams, paste a list or copy teams and players from an earlier tournament.',
  'Choose how your tournament is played. Counts and previews come from the tournament engine.',
  'Seed 1 is your strongest team. Seeds 1 and 2 can only meet in the final.',
  'Matches are placed on your broadcast days in bracket order. A round never starts before the matches it depends on. You can move single matches later in Matches.',
  'Optional. A Google Sheet can keep match dates and scores up to date while you broadcast.',
  'Check everything once more. Use Edit, or the steps on the left.',
];
export const palette = ['#7a5cff','#2791d0','#e04d57','#26a987','#e7ae3c','#d065b2','#5674d0','#b2bc48','#f07f42','#43b9bb','#a079cf','#798a9b'];
export const toEngineWeekdays = days => days.map(d => d % 7);
export const toBroadcastDays = days => [...new Set(days.map(d => d === 0 ? 7 : d))].sort();
export function initials(name, max = 8) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? '').slice(0, max)).toUpperCase().slice(0, max);
}
export function autoTag(name) { return initials(name, 3).replace(/[^A-Z0-9]/g, '').padEnd(2, 'X'); }
export function formatError(f, n) {
  if (f.id === 'gsl' && n % 4) return `GSL needs a multiple of 4 teams. You have ${n}: add ${4 - n % 4} or remove ${n % 4}.`;
  if (n < f.min || n > f.max) return `${f.label} needs ${f.min} to ${f.max} teams. You have ${n}.`;
  return '';
}
export function teamErrors(teams) {
  const errors = {};
  if (teams.length < 2) errors.teams = 'Add at least 2 teams.';
  if (teams.length > 64) errors.teams = 'A tournament can have up to 64 teams.';
  for (const row of teams.filter(t => !t.tbd)) {
    if (!row.name?.trim()) errors[`name-${row.key}`] = 'Enter a team name.';
    else if (teams.filter(t => !t.tbd && t.name?.trim().toLowerCase() === row.name.trim().toLowerCase()).length > 1) errors[`name-${row.key}`] = `${row.name.trim()} is already in the list.`;
    if (!/^[A-Z0-9]{2,5}$/.test(row.tag?.trim().toUpperCase())) errors[`tag-${row.key}`] = 'Use 2 to 5 letters or digits for the tag.';
    else if (teams.filter(t => !t.tbd && t.tag?.trim().toUpperCase() === row.tag.trim().toUpperCase()).length > 1) errors[`tag-${row.key}`] = `Tag ${row.tag.trim().toUpperCase()} is already used by another team. Tags must be unique.`;
  }
  return errors;
}
export function errorsFor(d, step) {
  const errors = {};
  if (step === 1) {
    if (!d.name.trim()) errors.name = 'Enter a tournament name.';
    if (d.short.length > 8) errors.short = 'Use up to 8 characters for the short name.';
  }
  if (step === 2) return teamErrors(d.teams);
  if (step === 3) {
    const f = formats.find(f => f.id === d.format); const error = f ? formatError(f, d.teams.length) : 'Choose a supported tournament format';
    if (error) errors.format = error;
    if (d.options.thirdPlace && d.format === 'single-elimination' && d.teams.length < 4) errors.thirdPlace = 'Third place needs at least 4 teams.';
  }
  if (step === 5 && !d.tbdDates) {
    const date = new Date(`${d.schedule.startDate}T00:00:00Z`);
    if (!d.schedule.startDate || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== d.schedule.startDate) errors.startDate = 'Choose the first match day.';
    if (!d.schedule.broadcastDays.length) errors.broadcastDays = 'Choose at least one broadcast day.';
    if (!d.schedule.times.length) errors.times = 'Add at least one start time.';
    else if (d.schedule.times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) errors.times = 'Use the 24-hour format, e.g. 18:00.';
    if (!Number.isInteger(d.schedule.perDay) || d.schedule.perDay < 1 || d.schedule.perDay > 12) errors.perDay = 'Choose 1 to 12 matches per day.';
  }
  if (step === 6 && d.sheet && !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:[/?#]|$)/.test(d.sheet.url)) errors.sheetUrl = 'Paste the link of a Google Sheet (docs.google.com/spreadsheets/…).';
  return errors;
}
export function payload(d) {
  return { name: d.name, short: d.short || initials(d.name), season: d.season, theme: d.theme, designPresetId: d.designPresetId, timezone: d.timezone,
    teams: d.teams.filter(t => !t.tbd).map(({ key, name, tag, colors, copy }) => ({ key, name, tag, colors, ...(copy ? { copy } : {}) })),
    seeds: d.seeds.map(k => d.teams.find(t => t.key === k)?.tbd ? null : k), format: d.format, options: d.options,
    broadcastDays: d.schedule.broadcastDays,
    schedule: d.tbdDates ? null : { startDate: d.schedule.startDate, weekdays: toEngineWeekdays(d.schedule.broadcastDays), times: [...new Set(d.schedule.times)].sort(), perDay: d.schedule.perDay, timezone: d.timezone }, sheet: d.sheet };
}
export function parsePaste(text, teams) {
  const seen = new Set(teams.filter(t => !t.tbd).map(t => t.name.trim().toLowerCase()));
  const rows = [], skipped = [], generated = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [rawName, rawTag] = line.split(/[,\t]/), name = rawName.trim();
    if (seen.has(name.toLowerCase())) { skipped.push(name); continue; }
    seen.add(name.toLowerCase());
    const tag = rawTag?.trim().toUpperCase() || autoTag(name);
    if (!rawTag?.trim()) generated.push(tag);
    rows.push({ name, tag });
  }
  return { rows, summary: `${lines.length} teams found · ${generated.length} tags made automatically${generated.length ? ` (${generated.join(', ')})` : ''}${skipped.length ? ` · ${skipped.length} already in your list: ${skipped.join(', ')} (skipped)` : ''}` };
}
