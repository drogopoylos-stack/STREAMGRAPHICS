import * as store from './db.js';
import { aggregatePlayer, compareRows, teamRecord, formatStat, headToHead } from './lib/stats.js';
import { isoDay, dayLabel } from './util.js';
import { championIcon } from './ddragon.js';

export const SCENES = ['roster', 'versus', 'simple-vs', 'schedule', 'matchup', 'bracket', 'sponsors'];
const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach', ''];

const byId = (list, id) => list.find((x) => x.id === id) ?? null;

function rosterOf(db, teamId) {
  return db.players
    .filter((p) => p.teamId === teamId && !p.hidden)
    .sort((a, b) => (ROLE_ORDER.indexOf(a.role ?? '') - ROLE_ORDER.indexOf(b.role ?? '')) || a.nick.localeCompare(b.nick));
}

function common(db, scene, params) {
  const s = db.settings;
  return {
    scene,
    mode: params.mode === 'simple' || params.mode === 'full' ? params.mode : s.mode,
    league: { name: s.leagueName, short: s.leagueShort, season: s.season, logo: s.leagueLogo },
    theme: s.theme,
    sponsors: s.sponsorsOnGraphics ? db.sponsors.filter((x) => x.logo) : [],
  };
}

/**
 * Split each finished match into one pseudo-match per GAME, so stats.js averages per game.
 * scoreA/scoreB of a pseudo-match = 1/0 from the `win` flags of that game.
 */
function gameSamples(db) {
  const out = [];
  for (const m of db.matches) {
    if (m.status !== 'done' || !m.stats?.length) continue;
    const games = new Map();
    for (const e of m.stats) {
      const g = e.game ?? 1;
      if (!games.has(g)) games.set(g, []);
      games.get(g).push(e);
    }
    for (const [g, stats] of games) {
      const winA = stats.find((e) => e.teamId === m.teamA && e.win != null)?.win;
      out.push({
        id: `${m.id}#${g}`, matchId: m.id, date: m.date, time: m.time, teamA: m.teamA, teamB: m.teamB, status: 'done',
        scoreA: winA == null ? null : winA ? 1 : 0, scoreB: winA == null ? null : winA ? 0 : 1, stats,
      });
    }
  }
  return out;
}

function playerProfile(db, playerId, samples) {
  const defs = db.settings.statDefs;
  const agg = aggregatePlayer(playerId, samples, defs, db.players);
  const entries = samples.flatMap((s) => s.stats.filter((e) => e.playerId === playerId));
  const decided = entries.filter((e) => e.win != null);
  const champs = new Map();
  for (const e of entries) if (e.champion) champs.set(e.champion, (champs.get(e.champion) ?? 0) + 1);
  const champions = [...champs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, games]) => ({ name, games, icon: championIcon(name) }));
  return {
    agg,
    games: entries.length,
    winrate: decided.length ? decided.filter((e) => e.win).length / decided.length : null,
    champions,
  };
}

function withTeam(db, p) {
  return p ? { ...p, team: byId(db.teams, p.teamId) } : null;
}

function resolveDay(day, tz) {
  if (!day || day === 'today') return isoDay(0, tz);
  if (day === 'tomorrow') return isoDay(1, tz);
  return day;
}

function parseEmbed(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { type: 'none', src: '', html: '' };
  const m = v.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (m) return { type: 'iframe', src: m[1], html: v };
  if (/^https?:\/\//i.test(v)) return { type: 'url', src: v, html: '' };
  return { type: 'html', src: '', html: v };
}

/** Data for one scene, ready to draw. Throws Error with .status 404 for a bad id. */
export function sceneData(scene, params = {}) {
  const db = store.get();
  const base = common(db, scene, params);
  const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });

  switch (scene) {
    case 'roster': {
      const team = byId(db.teams, params.team) ?? db.teams[0];
      if (!team) throw notFound('team');
      return { ...base, team, players: rosterOf(db, team.id), record: teamRecord(team.id, db.matches) };
    }
    case 'versus':
    case 'simple-vs': {
      const match = byId(db.matches, params.match) ?? nextMatch(db);
      if (!match) throw notFound('match');
      const teamA = byId(db.teams, match.teamA), teamB = byId(db.teams, match.teamB);
      const out = { ...base, match: stripStats(match), teamA, teamB };
      if (scene === 'versus') {
        Object.assign(out, {
          playersA: rosterOf(db, match.teamA).filter((p) => p.role !== 'Coach'),
          playersB: rosterOf(db, match.teamB).filter((p) => p.role !== 'Coach'),
          recordA: teamRecord(match.teamA, db.matches),
          recordB: teamRecord(match.teamB, db.matches),
        });
      }
      return out;
    }
    case 'schedule': {
      const date = resolveDay(params.day, db.settings.timezone);
      const matches = db.matches
        .filter((m) => m.date === date)
        .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
        .map((m) => ({ ...stripStats(m), teamA: byId(db.teams, m.teamA), teamB: byId(db.teams, m.teamB) }));
      return { ...base, date, dateLabel: dayLabel(date), matches };
    }
    case 'matchup': {
      const feature = byId(db.features, params.feature);
      const aId = feature?.playerA ?? params.a, bId = feature?.playerB ?? params.b;
      const pa = byId(db.players, aId), pb = byId(db.players, bId);
      if (!pa || !pb) throw notFound('player');
      const samples = gameSamples(db);
      const A = playerProfile(db, pa.id, samples), B = playerProfile(db, pb.id, samples);
      const rows = compareRows(A.agg, B.agg, db.settings.statDefs).map((r) => ({
        ...r, aText: formatStat(r.a, r.fmt), bText: formatStat(r.b, r.fmt),
      }));
      return {
        ...base,
        title: feature?.title || `${pa.role || 'Player'} matchup`,
        playerA: withTeam(db, pa), playerB: withTeam(db, pb),
        rows,
        gamesA: A.games, gamesB: B.games,
        winrateA: A.winrate, winrateB: B.winrate,
        championsA: A.champions, championsB: B.champions,
        headToHead: headToHead(pa.id, pb.id, samples).length,
      };
    }
    case 'bracket':
      return { ...base, embed: parseEmbed(db.settings.bracketEmbed) };
    case 'sponsors':
      return { ...base, sponsors: db.sponsors.filter((x) => x.logo) };
    default:
      throw Object.assign(new Error(`unknown scene "${scene}"`), { status: 400 });
  }
}

function stripStats(m) {
  const { stats, ...rest } = m;
  return { ...rest, hasStats: !!stats?.length };
}

/** The live match, else the next scheduled one, else the latest. */
export function nextMatch(db = store.get()) {
  const live = db.matches.find((m) => m.status === 'live');
  if (live) return live;
  const key = (m) => `${m.date} ${m.time ?? ''}`;
  const now = `${isoDay(0, db.settings.timezone)} 00:00`;
  const upcoming = db.matches.filter((m) => m.status === 'scheduled' && key(m) >= now).sort((a, b) => key(a).localeCompare(key(b)));
  if (upcoming.length) return upcoming[0];
  return [...db.matches].sort((a, b) => key(b).localeCompare(key(a)))[0] ?? null;
}
