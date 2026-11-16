import { resolveMatches, validateSources, bracketDefinitions, matchTeam } from './bracket.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function sheetConfig(body = {}) {
  const value = String(body.url || '').trim();
  if (!value && !body.enabled) return { enabled: false, url: '', spreadsheetId: '', sheetName: 'Matches' };
  const found = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/[^\s]*)?$/.exec(value);
  if (!found) invalid('Use a Google Sheets URL: https://docs.google.com/spreadsheets/d/…');
  const sheetName = String(body.sheetName || 'Matches').trim();
  if (!sheetName || sheetName.length > 100) invalid('Choose a valid sheet tab name');
  return { enabled: body.enabled === true, url: `https://docs.google.com/spreadsheets/d/${found[1]}/edit`, spreadsheetId: found[1], sheetName };
}
export const sheetCsvUrl = config => `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName || 'Matches')}`;

/** RFC 4180 fields, including quoted commas, embedded newlines and doubled quotes. */
export function parseCsv(text) {
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) invalid('Sheet is too large (maximum 2 MB)');
  const rows = []; let row = [], field = '', quoted = false, endedQuote = false;
  const cell = () => { row.push(field); field = ''; endedQuote = false; if (row.length > 100) invalid('Too many sheet columns'); };
  const line = () => { cell(); if (row.some(v => v.trim())) rows.push(row); row = []; if (rows.length > 2000) invalid('Too many sheet rows'); };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; endedQuote = true; }
      else field += ch;
    } else if (ch === '"' && field === '' && !endedQuote) quoted = true;
    else if (ch === ',') cell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; line(); }
    else { if (endedQuote || ch === '"') invalid('Malformed CSV quoting'); field += ch; }
  }
  if (quoted) invalid('Unclosed CSV quote');
  if (row.length || field || endedQuote) line();
  return rows;
}
export const encodeCsv = rows => rows.map(row => row.map(v => {
  let text = String(v ?? '');
  // CSV consumers may open feeds in spreadsheet software.
  if (/^[=+@\-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}).join(',')).join('\r\n');

const score = (value, label) => {
  if (value === '') return null;
  if (!/^\d+$/.test(value) || Number(value) > 99) invalid(`${label}: score must be an integer or blank`);
  return Number(value);
};
/** Validate a complete snapshot before changing any tournament data. */
export function prepareSheet(db, csv) {
  const rows = parseCsv(csv);
  const header = rows.shift()?.map(s => s.trim());
  const required = ['match_id', 'date', 'time', 'team_a', 'team_b', 'score_a', 'score_b', 'status', 'best_of', 'stage', 'cast', 'source_a', 'source_b', 'id'];
  if (!header || new Set(header).size !== header.length || required.some(key => !header.includes(key))) invalid('Matches tab has missing or duplicate column headers');
  if (rows.length !== db.matches.length) invalid(`Expected ${db.matches.length} match rows; do not remove or duplicate match IDs`);
  const byId = new Map(db.matches.map(m => [m.id, m]));
  const byCode = new Map(db.matches.map(m => [m.bracketCode, m.id]));
  const seen = new Set();
  const clone = structuredClone(db);
  clone.matches = rows.map((row, i) => {
    if (row.length !== header.length) invalid(`Row ${i + 2}: wrong number of columns`);
    const v = Object.fromEntries(header.map((key, j) => [key, row[j].trim()]));
    const label = `Row ${i + 2} (${v.match_id})`;
    const original = byId.get(v.id);
    if (!original || seen.has(v.id) || original.bracketCode !== v.match_id) invalid(`${label}: unknown, duplicate or changed match ID`);
    seen.add(v.id);
    if (v.date && (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Number.isFinite(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date)) invalid(`${label}: date must be YYYY-MM-DD or blank`);
    if (v.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) invalid(`${label}: time must be HH:mm or blank`);
    if (!['scheduled', 'live', 'done'].includes(v.status)) invalid(`${label}: choose scheduled, live or done`);
    if (!['1', '3', '5', 'TBD', ''].includes(v.best_of)) invalid(`${label}: best_of must be 1, 3, 5 or TBD`);
    if (!['yes', 'no', 'tbd'].includes(v.cast)) invalid(`${label}: cast must be yes, no or tbd`);
    if (v.stage.length > 200 || (v.notes || '').length > 2000) invalid(`${label}: text is too long`);
    const patch = { ...original, date: v.date || null, time: v.time || null, scoreA: score(v.score_a, label), scoreB: score(v.score_b, label), status: v.status, bestOf: Number(v.best_of) || null, stage: v.stage, streamWithCast: v.cast === 'tbd' ? null : v.cast === 'yes', notes: v.notes || '' };
    for (const side of ['A', 'B']) {
      const src = v[`source_${side.toLowerCase()}`];
      if (src) {
        const parts = /^([WL]):(.+)$/.exec(src);
        if (!parts || !byCode.has(parts[2])) invalid(`${label}: invalid source ${src}; use W:match_id or L:match_id`);
        const next = { matchId: byCode.get(parts[2]), outcome: parts[1] === 'W' ? 'winner' : 'loser' };
        // Keep the tournament format fixed; the GSL opening draw is the editable exception.
        if (!original.bracketNode?.startsWith('opening') && JSON.stringify(original[`team${side}Source`] || null) !== JSON.stringify(next)) invalid(`${label}: this source belongs to the tournament format and cannot change`);
        patch[`team${side}Source`] = next;
      } else {
        if (original[`team${side}Source`] && !original.bracketNode?.startsWith('opening')) invalid(`${label}: keep the bracket source`);
        delete patch[`team${side}Source`];
        const name = v[`team_${side.toLowerCase()}`];
        const teams = db.teams.filter(t => t.tag === name || t.name === name);
        if (!teams.length && !['', 'TBD', 'Draw TBD'].includes(name)) invalid(`${label}: unknown team ${name}; use a tag from Teams`);
        if (teams.length > 1) invalid(`${label}: ambiguous team tag ${name}`);
        patch[`team${side}`] = teams[0]?.id || null;
        patch[`team${side}Label`] = teams.length ? '' : 'Draw TBD';
      }
    }
    return patch;
  });
  // Preserve the original order even if the operator sorts the sheet.
  clone.matches.sort((a, b) => db.matches.findIndex(m => m.id === a.id) - db.matches.findIndex(m => m.id === b.id));
  validateSources(clone.matches);
  for (const config of bracketDefinitions(clone).filter(b => b.format === 'gsl')) {
    const openings = ['openingA', 'openingB'].map(node => clone.matches.find(m => m.bracketNode === node && config.rounds.some(r => r.matches.includes(m.id))));
    if (openings.some(m => !m)) continue;
    const sources = openings.flatMap(m => [m.teamASource, m.teamBSource]);
    const count = sources.filter(Boolean).length;
    if (count !== 0 && (count !== 4 || new Set(sources.map(s => s.matchId)).size !== 4 || sources.some(s => s.outcome !== 'winner' || !config.entrySources.some(e => e.matchId === s.matchId)))) invalid('GSL draw: use each of the four qualifying winners exactly once, or leave all four sources blank');
    if (count === 0 && openings.some(m => m.teamA || m.teamB)) invalid('GSL draw: use source_a/source_b instead of team tags');
    const changed = openings.some(m => ['A', 'B'].some(side => JSON.stringify(m[`team${side}Source`] || null) !== JSON.stringify(byId.get(m.id)[`team${side}Source`] || null)));
    if (changed) config.drawRevision = (config.drawRevision || 0) + 1;
    config.drawPending = count === 0;
    for (const m of openings) m.bracketDrawSet = count === 4;
  }
  const previous = new Map(resolveMatches(db).map(m => [m.id, m]));
  clone.matches = resolveMatches(clone).map(({ winnerId, loserId, ...m }) => {
    const old = previous.get(m.id);
    if ((old.scoreA != null || old.scoreB != null || old.status === 'done' || old.status === 'live') && (old.teamA !== m.teamA || old.teamB !== m.teamB) && (m.scoreA != null || m.scoreB != null || m.status !== 'scheduled')) invalid(`${m.bracketCode}: participants changed; clear this match's scores and set scheduled before syncing`);
    if (m.teamA && m.teamA === m.teamB) invalid(`${m.bracketCode}: a team cannot play itself`);
    const needed = Math.ceil((m.bestOf || 1) / 2);
    if ([m.scoreA, m.scoreB].some(s => s != null && s > needed)) invalid(`${m.bracketCode}: score exceeds best_of`);
    if (m.status === 'done' && (!m.teamA || !m.teamB || m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB || Math.max(m.scoreA, m.scoreB) !== needed)) invalid(`${m.bracketCode}: done requires two teams and a valid final score`);
    if (m.status === 'live' && (!m.teamA || !m.teamB)) invalid(`${m.bracketCode}: resolve both teams before going live`);
    if (old.teamA !== m.teamA || old.teamB !== m.teamB) m.stats = [];
    return m;
  });
  return { matches: clone.matches, brackets: clone.settings.brackets };
}

export function matchFeed(db, tournamentId) {
  const resolved = { ...db, matches: resolveMatches(db) };
  const team = (m, side) => { const t = matchTeam(resolved, m, side); return t ? { id: t.id, tag: t.tag, name: t.name, logo: t.logo, placeholder: !!t.placeholder } : null; };
  return { tournamentId, tournament: db.settings.leagueName, timezone: db.settings.timezone, updatedAt: db.settings.matchSheet?.lastSuccess || null,
    matches: resolved.matches.map(m => ({ id: m.id, match_id: m.bracketCode || m.id, date: m.date, time: m.time, stage: m.stage, status: m.status, best_of: m.bestOf, cast: m.streamWithCast ?? null, team_a: team(m, 'A'), team_b: team(m, 'B'), score_a: m.scoreA, score_b: m.scoreB, winner_id: m.winnerId, loser_id: m.loserId, source_a: m.teamASource || null, source_b: m.teamBSource || null })) };
}
export function feedCsv(feed) {
  return encodeCsv([['match_id', 'date', 'time', 'team_a', 'team_b', 'score_a', 'score_b', 'status', 'best_of', 'stage', 'cast', 'winner_id', 'loser_id', 'id'], ...feed.matches.map(m => [m.match_id, m.date, m.time, m.team_a?.tag, m.team_b?.tag, m.score_a, m.score_b, m.status, m.best_of, m.stage, m.cast == null ? 'tbd' : m.cast ? 'yes' : 'no', m.winner_id, m.loser_id, m.id])]);
}

export function createSheetSync(store, { fetcher = fetch, interval = 30000 } = {}) {
  const running = new Map();
  async function run(id) {
    if (running.has(id)) return running.get(id);
    const promise = (async () => {
      const db = store.getTournament(id);
      const config = db?.settings.matchSheet;
      if (!config?.enabled || !config.spreadsheetId) throw Object.assign(new Error('Enable a Google Sheet in Settings first'), { status: 400 });
      const signature = JSON.stringify([config.url, config.sheetName, config.enabled]);
      const current = () => store.getTournament(id) === db && signature === JSON.stringify([db.settings.matchSheet?.url, db.settings.matchSheet?.sheetName, db.settings.matchSheet?.enabled]);
      try {
        const response = await fetcher(sheetCsvUrl(config), { signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) throw new Error(`Google Sheet is not readable (${response.status}). Set General access to Anyone with the link / Viewer.`);
        if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) throw new Error('Sheet exceeds 2 MB');
        const reader = response.body.getReader(); let bytes = 0, chunks = [];
        try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2 * 1024 * 1024) throw new Error('Sheet exceeds 2 MB'); chunks.push(value); } } finally { await reader.cancel(); }
        const csv = Buffer.concat(chunks).toString('utf8');
        if (/^\s*</.test(csv)) throw new Error('Google returned a sign-in page. Set sheet access to Anyone with the link / Viewer.');
        if (!current()) return { skipped: true };
        const prepared = prepareSheet(db, csv);
        const changed = JSON.stringify(db.matches) !== JSON.stringify(prepared.matches) || JSON.stringify(db.settings.brackets) !== JSON.stringify(prepared.brackets);
        db.matches = prepared.matches;
        if (prepared.brackets) db.settings.brackets = prepared.brackets;
        Object.assign(db.settings.matchSheet, { lastSuccess: new Date().toISOString(), lastError: '', matchCount: db.matches.length });
        store.changed(id);
        return { ok: true, changed, matches: db.matches.length, lastSuccess: db.settings.matchSheet.lastSuccess };
      } catch (error) {
        if (current()) { db.settings.matchSheet.lastError = error.message; db.settings.matchSheet.lastAttempt = new Date().toISOString(); store.changed(id); }
        throw Object.assign(error, { status: 422 });
      }
    })();
    running.set(id, promise);
    try { return await promise; } finally { running.delete(id); }
  }
  const poll = () => Promise.allSettled(store.tournaments().filter(t => store.getTournament(t.id).settings.matchSheet?.enabled).map(t => run(t.id)));
  let timer;
  return { run, poll, start() { void poll(); timer = setInterval(() => void poll(), interval); timer.unref(); }, stop() { clearInterval(timer); } };
}
