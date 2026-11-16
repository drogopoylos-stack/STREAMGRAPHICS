import { validateSources } from '../bracket.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Dates and times are wall-clock values in timezone (no UTC conversion).
 * UTC date-only arithmetic keeps weekday selection independent of host DST.
 * perDay may exceed times.length to reuse slots for independent matches.
 */
export function scheduleMatches(matches, brackets, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) invalid('Schedule options must be an object');
  const { startDate, weekdays, times: inputTimes, perDay = inputTimes?.length, timezone } = options;
  if (!Array.isArray(matches) || !Array.isArray(brackets)) invalid('Scheduling needs matches and bracket definitions');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) invalid('Start date must be YYYY-MM-DD');
  const day = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== startDate) invalid('Start date must be a valid YYYY-MM-DD date');
  if (!Array.isArray(weekdays) || !weekdays.length || Array.from(weekdays).some(value => !Number.isInteger(value) || value < 0 || value > 6)) invalid('Choose weekdays from 0 (Sunday) to 6 (Saturday)');
  if (!Array.isArray(inputTimes) || !inputTimes.length || Array.from(inputTimes).some(value => typeof value !== 'string' || !clockTime.test(value))) invalid('Choose at least one start time in HH:mm format');
  if (!Number.isSafeInteger(perDay) || perDay < 1) invalid('Matches per day must be a positive integer');
  if (timezone !== undefined) {
    try {
      if (typeof timezone !== 'string' || !timezone) throw new Error();
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch { invalid('Choose a valid timezone'); }
  }
  const times = [...new Set(inputTimes)].sort();
  const byId = new Map();
  for (const match of matches) {
    if (!match || typeof match.id !== 'string' || !match.id || byId.has(match.id)) invalid('Scheduled matches need unique non-empty IDs');
    byId.set(match.id, match);
  }
  validateSources(matches);
  const groups = [], assigned = new Map();
  for (const bracket of brackets) {
    if (!Array.isArray(bracket?.rounds)) invalid('Bracket rounds must be an array');
    for (const round of bracket.rounds) {
      if (!Array.isArray(round?.matches)) invalid('Round matches must be an array of match IDs');
      const group = [];
      for (const id of round.matches) {
        if (!byId.has(id) || assigned.has(id)) invalid('Each round must reference existing matches exactly once');
        assigned.set(id, groups.length); group.push(id);
      }
      groups.push(group);
    }
  }
  for (const match of matches) if (!assigned.has(match.id)) {
    assigned.set(match.id, groups.length); groups.push([match.id]);
  }

  // Order whole rounds by dependencies, retaining definition order whenever
  // possible. In particular, lower rounds cannot precede their upper drop-ins.
  const ordered = [], visiting = new Set(), visited = new Set();
  function visit(index) {
    if (visited.has(index)) return;
    if (visiting.has(index)) invalid('Round dependencies cannot contain a cycle');
    visiting.add(index);
    for (const id of groups[index]) for (const parent of parents(byId.get(id))) {
      const other = assigned.get(parent);
      if (other !== index) visit(other);
    }
    visiting.delete(index); visited.add(index); ordered.push(groups[index]);
  }
  groups.forEach((_, i) => visit(i));

  const allowed = new Set(weekdays), scheduled = new Map();
  let used = 0, previousRound = '';
  function nextDay(advance) {
    if (advance) day.setUTCDate(day.getUTCDate() + 1);
    while (!allowed.has(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCFullYear() > 9999) invalid('Schedule exceeds the supported date range');
    used = 0;
  }
  nextDay(false);
  for (const group of ordered) {
    let latest = previousRound;
    function schedule(id) {
      if (scheduled.has(id)) return;
      const match = byId.get(id);
      for (const parent of parents(match)) schedule(parent);
      let floor = previousRound;
      for (const parent of parents(match)) {
        const result = scheduled.get(parent), slot = `${result.date}T${result.time}`;
        if (slot > floor) floor = slot;
      }
      if (used >= perDay) nextDay(true);
      let date = day.toISOString().slice(0, 10), time = times[used % times.length];
      // Wrapping times may return an earlier or occupied slot. Move to the
      // next play day rather than overlap a source or a preceding round.
      if (`${date}T${time}` <= floor) {
        nextDay(true); date = day.toISOString().slice(0, 10); time = times[0];
      }
      scheduled.set(id, { ...structuredClone(match), date, time });
      used++;
      if (`${date}T${time}` > latest) latest = `${date}T${time}`;
    }
    group.forEach(schedule);
    previousRound = latest;
  }
  return matches.map(match => scheduled.get(match.id));
}

function parents(match) {
  return [match.teamASource, match.teamBSource].filter(Boolean).map(source => source.matchId);
}
