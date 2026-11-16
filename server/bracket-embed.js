// One self-contained HTML bracket page for other websites (public/embed/*). The page reads the public
// Google Sheet itself, so a website can show live results without access to this program.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, ASSETS } from './util.js';
import { bracketDefinitions, resolveMatches } from './bracket.js';
import { sheetCsvUrl } from './match-sheet.js';

const FONTS = [
  ['Fira Sans Extra Condensed', 'fira-sans-extra-condensed', 800],
  ['Fira Sans Condensed', 'fira-sans-condensed', 500],
  ['Fira Sans Condensed', 'fira-sans-condensed', 700],
];
const fail = (status, message) => Object.assign(new Error(message), { status });
const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const hexRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return Number.isFinite(n) ? `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}` : '255,255,255'; };

/** A local image (/media/… or /brand/…) as a small data URI, or null. */
async function imageData(url, size) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('?')[0];
  const [base, rest] = clean.startsWith('/media/') ? [ASSETS, clean.slice(7)] : clean.startsWith('/brand/') ? [path.join(ROOT, 'public/brand'), clean.slice(7)] : [null, null];
  if (!base) return null;
  const file = path.resolve(base, rest);
  if (!file.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(file)) return null;
  try {
    const png = await sharp(file, { density: 200 }).resize(size, size, { fit: 'inside', withoutEnlargement: !file.endsWith('.svg') }).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
    return `data:image/webp;base64,${png.toString('base64')}`;
  } catch { return null; }
}

function fontFaces() {
  const out = [];
  for (const [family, pkg, weight] of FONTS) {
    for (const subset of ['latin', 'greek']) {
      const file = path.join(ROOT, 'node_modules/@fontsource', pkg, 'files', `${pkg}-${subset}-${weight}-normal.woff2`);
      if (!fs.existsSync(file)) continue;
      out.push(`@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format("woff2")}`);
    }
  }
  return out.join('\n');
}

export async function buildBracketEmbed(db) {
  const sheet = db.settings.matchSheet;
  if (!sheet?.spreadsheetId) throw fail(400, 'Connect a Google Sheet in Settings first. The website page reads the results from that sheet.');
  const brackets = bracketDefinitions(db).filter((b) => b.rounds?.length);
  if (!brackets.length) throw fail(400, 'This tournament has no bracket.');
  const resolved = new Map(resolveMatches(db).map((m) => [m.id, m]));
  const tagOf = (teamId) => db.teams.find((t) => t.id === teamId)?.tag || null;
  const ids = new Set(brackets.flatMap((b) => [...b.rounds.flatMap((r) => r.matches), ...(b.qualifications || []).map((q) => q.source?.matchId), b.championMatchId]).filter(Boolean));
  // Every match that a bracket match depends on, also through several rounds.
  for (const id of [...ids]) for (let m = db.matches.find((x) => x.id === id); m;) {
    const next = [m.teamASource, m.teamBSource].filter(Boolean).map((s) => s.matchId).filter((x) => !ids.has(x));
    next.forEach((x) => ids.add(x));
    m = next.length ? db.matches.find((x) => x.id === next[0]) : null;
  }
  const matches = {};
  for (const m of db.matches.filter((x) => ids.has(x.id))) {
    const r = resolved.get(m.id);
    matches[m.id] = {
      id: m.id, code: m.bracketCode || m.id, label: m.bracketNode ? m.stage || '' : '', openingDraw: !!m.bracketNode?.startsWith('opening'),
      date: m.date || null, time: m.time || null, bestOf: m.bestOf || null, status: m.status, sa: m.scoreA ?? null, sb: m.scoreB ?? null,
      a: m.teamASource ? null : tagOf(r.teamA), b: m.teamBSource ? null : tagOf(r.teamB),
      srcA: m.teamASource ? { id: m.teamASource.matchId, outcome: m.teamASource.outcome } : null,
      srcB: m.teamBSource ? { id: m.teamBSource.matchId, outcome: m.teamBSource.outcome } : null,
    };
  }
  const teams = {};
  for (const team of db.teams) if (team.tag) teams[team.tag] = { name: team.name, logo: await imageData(team.logo, 96) };
  const theme = db.settings.theme || {};
  const data = {
    league: db.settings.leagueName, logo: await imageData(db.settings.leagueLogo, 160), csvUrl: sheetCsvUrl(sheet),
    timezoneLabel: (db.settings.timezone || 'Europe/Athens').split('/').pop().replace(/_/g, ' '),
    brackets: brackets.map((b) => ({
      id: b.id, name: b.name, title: b.title || b.name, subtitle: b.subtitle || '', footer: b.footer || '', championMatchId: b.championMatchId || null,
      rounds: b.rounds.map((r) => ({ name: r.name, matches: r.matches.filter((id) => matches[id]) })),
      qualifications: (b.qualifications || []).map((q) => ({ name: q.name, source: { id: q.source.matchId, outcome: q.source.outcome } })),
    })),
    matches, teams,
  };
  const vars = { primary: theme.primary || '#0a1828', accent: theme.accent || '#d6a44c', accent2: theme.accent2 || '#8bbaec', text: theme.text || '#ffffff' };
  const css = fs.readFileSync(path.join(ROOT, 'public/embed/bracket-embed.css'), 'utf8');
  const script = fs.readFileSync(path.join(ROOT, 'public/embed/bracket-embed.js'), 'utf8');
  const root = Object.entries(vars).map(([k, v]) => `--${k}:${v};--${k}-rgb:${hexRgb(v)};`).join('');
  const title = String(db.settings.leagueName || 'Tournament').replace(/[<&>"]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Bracket</title>
<style>
${fontFaces()}
:root{${root}}
${css}
</style>
</head>
<body>
<main class="eb">
  <header class="eb-head"><img id="eb-brand" class="eb-brand" alt=""><div><div id="eb-league" class="eb-league"></div><h1 id="eb-title" class="eb-title"></h1><p id="eb-sub" class="eb-sub"></p></div></header>
  <nav id="eb-tabs" class="eb-tabs" role="tablist" aria-label="Brackets"></nav>
  <div class="eb-rule"></div>
  <div id="eb-grid" class="eb-grid"></div>
  <div id="eb-champion" class="eb-champion" hidden></div>
  <p id="eb-status" class="eb-foot" role="status"></p>
</main>
<script type="application/json" id="bracket-data">${escapeJson(data)}</script>
<script>
${script}
</script>
</body>
</html>
`;
}
