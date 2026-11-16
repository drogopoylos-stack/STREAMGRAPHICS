import * as store from './db.js';
import { aggregatePlayer, compareRows, teamRecord, formatStat, headToHead } from './lib/stats.js';
import { isoDay, dayLabel } from './util.js';
import { championIcon } from './ddragon.js';
import { SCENE_IDS, sceneDefinition } from '../public/shared/scenes.js';
import { resolvedTournament, matchTeam, bracketTree, bracketDefinitions } from './bracket.js';

export const SCENES = SCENE_IDS;
const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach', ''];
const ROLE_LABELS = { Top: 'TOP', Jungle: 'JUNGLE', Mid: 'MID', Bot: 'BOT', Support: 'SUPPORT' };
const ROUND_ORDINALS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH'];
const SUPERCUP_BG = { post: '/brand/supercup/bg-post.jpg', story: '/brand/supercup/bg-story.jpg' };
const DEFAULT_TWITCH = 'twitch.tv/HellenicLegends';

const byId = (list, id) => list.find((x) => x.id === id) ?? null;

function rosterOf(db, teamId) {
  if (!teamId) return [];
  return db.players
    .filter((p) => p.teamId === teamId && !p.hidden)
    .sort((a, b) => (ROLE_ORDER.indexOf(a.role ?? '') - ROLE_ORDER.indexOf(b.role ?? '')) || a.nick.localeCompare(b.nick));
}

function common(db, scene, params) {
  const s = db.settings;
  const theme = { ...s.theme };
  if (params.background === 'preset') {
    theme.bgImage = theme.versusBgImage = theme.socialBgImage = null;
  } else if (params.background) {
    const background = db.backgrounds?.find(item => item.id === params.background);
    if (!background) throw Object.assign(new Error('Background not found in this tournament'), { status: 404 });
    theme.bgImage = theme.versusBgImage = theme.socialBgImage = background.url;
  }
  const social = sceneDefinition(scene)?.group === 'social' ? socialMeta(s, scene, params, theme) : null;
  return {
    scene,
    mode: params.mode === 'simple' || params.mode === 'full' ? params.mode : s.mode,
    rosterStyle: s.rosterStyle || 'photos',
    showBench: s.showBench !== false,
    league: { name: s.leagueName, short: s.leagueShort, season: s.season, logo: s.leagueLogo },
    theme,
    graphicDesign: s.graphicDesign?.config || null,
    sponsors: s.sponsorsOnGraphics ? db.sponsors.filter((x) => x.logo) : [],
    ...(social ? { social } : {}),
  };
}

/** The shared block every social scene reads: style, format, header lockup and Twitch line. */
function socialMeta(settings, scene, params, theme) {
  const definition = sceneDefinition(scene);
  const format = definition?.storyOnly ? 'story' : params.format === 'post' ? 'post' : 'story';
  const style = settings.socialStyle === 'supercup' ? 'supercup' : 'classic';
  // The SUPERCUP plates are the default only for that style; a custom social image still overrides them in plate().
  if (style === 'supercup') {
    theme.socialBgPost ||= SUPERCUP_BG.post;
    theme.socialBgStory ||= SUPERCUP_BG.story;
  }
  const name = String(settings.leagueName ?? '');
  return {
    style,
    format,
    logo: settings.socialLogo || null,
    lettermark: '/brand/hll-lettermark-white.png',
    year: name.match(/\d{4}/)?.[0] ?? '',
    title: socialTitle(name, settings.leagueShort),
    twitch: settings.twitch || DEFAULT_TWITCH,
  };
}

/** "HLL 2027 SUPER CUP" → "SUPER CUP" (year and league short dropped, uppercase). */
function socialTitle(name, short) {
  let title = String(name ?? '').replace(/\d{4}/g, ' ').replace(/\s+/g, ' ').trim();
  const tag = String(short ?? '').trim();
  if (tag && title.toUpperCase().startsWith(`${tag.toUpperCase()} `)) title = title.slice(tag.length).trim();
  return title.toUpperCase();
}

function roundTitle(index) {
  return `${ROUND_ORDINALS[index] ?? `ROUND ${index + 1}`} ROUND`;
}

/** Bracket + round a match belongs to (settings.brackets); null for matches outside a bracket. */
function matchRound(db, matchId, bracketId) {
  const brackets = db.settings.brackets ?? [];
  const list = bracketId ? brackets.filter((bracket) => bracket.id === bracketId) : brackets;
  for (const bracket of list) {
    const rounds = bracket.rounds ?? [];
    for (let index = 0; index < rounds.length; index++) {
      if ((rounds[index].matches ?? []).includes(matchId)) return { index, name: rounds[index].name ?? '', title: roundTitle(index) };
    }
  }
  return null;
}

function castState(match) {
  if (match.streamWithCast !== false && /no\s*cast/i.test(String(match.stage ?? ''))) return false;
  return match.streamWithCast ?? null;
}

function winnerOf(match) {
  if (!match) return null;
  if (match.winnerId) return match.winnerId;
  const a = Number(match.scoreA), b = Number(match.scoreB);
  if (match.status === 'done' && match.scoreA != null && match.scoreB != null && Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    return a > b ? match.teamA : match.teamB;
  }
  return null;
}

/** The contract's match "item", shared by every social scene. */
function itemOf(db, match, bracketId) {
  if (!match) return null;
  return {
    id: match.id,
    code: match.bracketCode || match.code || null,
    date: match.date ?? null,
    time: match.time ?? null,
    bestOf: match.bestOf ?? null,
    status: match.status ?? null,
    scoreA: match.scoreA ?? null,
    scoreB: match.scoreB ?? null,
    winnerId: winnerOf(match),
    cast: castState(match),
    round: matchRound(db, match.id, bracketId),
    teamA: matchTeam(db, match, 'A'),
    teamB: matchTeam(db, match, 'B'),
  };
}

const matchKey = (match) => `${match.date || '9999'} ${match.time ?? ''}`;
const sortByDate = (matches) => [...matches].sort((a, b) => matchKey(a).localeCompare(matchKey(b)));

/** Kicker line: round name without " matches" + best of, e.g. "TOP 4 QUALIFYING · BEST OF 3". */
function roundKicker(roundName, matches) {
  const label = String(roundName ?? '').replace(/\s*matches\s*$/i, '').trim().toUpperCase();
  const bestOf = matches.find((match) => match.bestOf)?.bestOf;
  return [label, bestOf ? `BEST OF ${bestOf}` : ''].filter(Boolean).join(' · ') || null;
}

/** Qualification band text for a finished match, from the bracket definitions. */
function qualificationOf(db, match) {
  for (const bracket of db.settings.brackets ?? []) {
    for (const item of bracket.qualifications ?? []) {
      const matchId = item.source?.matchId ?? item.match;
      if (matchId !== match.id) continue;
      const outcome = item.source?.outcome ?? item.outcome ?? 'winner';
      const teamId = outcome === 'loser' ? (winnerOf(match) === match.teamA ? match.teamB : match.teamA) : winnerOf(match);
      const team = db.teams.find((entry) => entry.id === teamId);
      if (!team) return null;
      return { text: `${team.tag} ${String(item.name ?? '').toUpperCase()}`.trim(), tag: team.tag };
    }
  }
  return null;
}

function latestDone(db) {
  return [...db.matches].filter((match) => match.status === 'done').sort((a, b) => matchKey(b).localeCompare(matchKey(a)))[0] ?? null;
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
export function sceneData(scene, params = {}, db = store.get()) {
  db = resolvedTournament(db);
  const base = common(db, scene, params);
  const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });

  switch (scene) {
    case 'roster':
    case 'social-roster': {
      if (params.team && !byId(db.teams, params.team)) throw notFound('team');
      const team = byId(db.teams, params.team) ?? db.teams[0];
      if (!team) throw notFound('team');
      const players = rosterOf(db, team.id);
      const out = { ...base, team, players, record: teamRecord(team.id, db.matches) };
      if (scene === 'social-roster') {
        const playersOnly = players.filter((player) => player.role !== 'Coach');
        const starters = playersOnly.filter((player) => (player.lineup ?? 'starter') === 'starter').slice(0, 5);
        Object.assign(out, {
          lineup: starters.map((player) => ({ role: ROLE_LABELS[player.role] ?? String(player.role ?? '').toUpperCase(), nick: player.nick })),
          subs: playersOnly.filter((player) => (player.lineup ?? 'starter') !== 'starter').map((player) => player.nick),
        });
      }
      return out;
    }
    case 'versus':
    case 'simple-vs':
    case 'social-versus': {
      if (params.match && !byId(db.matches, params.match)) throw notFound('match');
      const match = byId(db.matches, params.match) ?? nextMatch(db);
      if (!match) throw notFound('match');
      const teamA = matchTeam(db, match, 'A'), teamB = matchTeam(db, match, 'B');
      const out = { ...base, match: stripStats(match), teamA, teamB };
      if (scene === 'social-versus') {
        const choose = (team, requested) => {
          if (!team) return null;
          const players = rosterOf(db, team?.id).filter(p => p.role !== 'Coach');
          if (requested) {
            const player = players.find(p => p.id === requested);
            if (!player) throw Object.assign(new Error('Choose a visible player from the matching team'), { status: 400 });
            return player;
          }
          return players.find(p => p.captain && p.photo) ?? players.find(p => p.photo) ?? players[0] ?? null;
        };
        return { ...out, item: itemOf(db, match), playersA: rosterOf(db, match.teamA), playersB: rosterOf(db, match.teamB), dateLabel: match.date ? dayLabel(match.date) : 'Date TBD', playerA: choose(teamA, params.playerA), playerB: choose(teamB, params.playerB), effect: ['none', 'prism', 'halftone'].includes(params.effect) ? params.effect : 'halftone' };
      }
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
        .filter((m) => params.day === 'all' || m.date === date)
        .sort((a, b) => `${a.date || '9999'} ${a.time ?? ''}`.localeCompare(`${b.date || '9999'} ${b.time ?? ''}`))
        .map((m) => ({ ...stripStats(m), teamA: matchTeam(db, m, 'A'), teamB: matchTeam(db, m, 'B') }));
      if (params.day === 'all') {
        const pages = Math.max(1, Math.ceil(matches.length / 8));
        const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
        return { ...base, date: null, dateLabel: `${db.settings.timezone} · ${pages > 1 ? `Page ${page}/${pages}` : 'Full tournament schedule'}`, showDates: true, matches: matches.slice((page - 1) * 8, page * 8), pagination: { page, pages, total: matches.length } };
      }
      return { ...base, date, dateLabel: dayLabel(date), matches };
    }
    case 'social-schedule': {
      const perPage = base.social.format === 'post' ? 4 : 6;
      let raw, date = null, dateLabel, bracketId, roundInfo = null;
      if (params.round) {
        const bracket = bracketDefinitions(db).find((entry) => (entry.rounds ?? []).some((round) => round.id === params.round));
        const index = bracket ? bracket.rounds.findIndex((round) => round.id === params.round) : -1;
        if (!bracket || index < 0) throw notFound('round');
        const ids = new Set(bracket.rounds[index].matches ?? []);
        raw = db.matches.filter((match) => ids.has(match.id));
        dateLabel = bracket.rounds[index].name || bracket.name || 'Round';
        bracketId = bracket.id;
        roundInfo = { title: roundTitle(index), name: bracket.rounds[index].name ?? '' };
      } else {
        date = resolveDay(params.day, db.settings.timezone);
        raw = db.matches.filter((match) => params.day === 'all' || match.date === date);
        dateLabel = params.day === 'all' ? 'Full tournament schedule' : dayLabel(date);
        const rounds = raw.map((match) => matchRound(db, match.id)).filter(Boolean);
        if (rounds.length && rounds.every((round) => round.index === rounds[0].index && round.name === rounds[0].name)) roundInfo = rounds[0];
      }
      raw = sortByDate(raw);
      const views = raw.map((match) => ({ ...stripStats(match), teamA: matchTeam(db, match, 'A'), teamB: matchTeam(db, match, 'B') }));
      const items = raw.map((match) => itemOf(db, match, bracketId));
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
      const from = (page - 1) * perPage;
      return {
        ...base,
        date,
        dateLabel,
        roundTitle: roundInfo?.title ?? null,
        roundKicker: roundInfo ? roundKicker(roundInfo.name, raw) : null,
        matches: views.slice(from, from + perPage),
        items: items.slice(from, from + perPage),
        pagination: { page, pages, total: items.length },
      };
    }
    case 'social-result': {
      if (params.match && !byId(db.matches, params.match)) throw notFound('match');
      const match = byId(db.matches, params.match) ?? latestDone(db) ?? nextMatch(db);
      if (!match) throw notFound('match');
      return { ...base, match: stripStats(match), teamA: matchTeam(db, match, 'A'), teamB: matchTeam(db, match, 'B'), item: itemOf(db, match), qualification: qualificationOf(db, match) };
    }
    case 'social-announce':
      return { ...base };
    case 'social-bracket': {
      const brackets = db.settings.brackets ?? [];
      if (params.bracket && !brackets.some((bracket) => bracket.id === params.bracket)) throw notFound('bracket');
      const bracket = brackets.find((entry) => entry.id === params.bracket) ?? brackets.find((entry) => entry.format === 'single-elimination') ?? brackets[0] ?? null;
      if (!bracket) {
        return { ...base, bracket: null, title: 'ROAD TO TOP 4', kicker: 'SINGLE ELIMINATION · 0 OF 4 PLACES DECIDED', columns: ['FIRST ROUND', 'SECOND ROUND', 'TOP 4'], lanes: [] };
      }
      const rounds = bracket.rounds ?? [];
      const columns = rounds.map((round, index) => roundTitle(index));
      const qualifications = bracket.qualifications ?? [];
      if (qualifications.length) columns.push('TOP 4');
      const feederRound = rounds[0]?.matches ?? [];
      const lanes = (rounds[1]?.matches ?? []).map((id) => {
        const match = byId(db.matches, id);
        if (!match) return null;
        const feederCode = String(match.teamBLabel ?? '').replace(/^Winner\s+/i, '').trim();
        const feeder = feederRound.map((matchId) => byId(db.matches, matchId)).find((candidate) => candidate && (candidate.bracketCode || candidate.code) === feederCode) ?? null;
        const winner = db.teams.find((team) => team.id === winnerOf(match)) ?? null;
        const participants = [matchTeam(db, match, 'A'), matchTeam(db, match, 'B')].filter((team) => team && !team.placeholder);
        return {
          feeder: itemOf(db, feeder, bracket.id),
          match: itemOf(db, match, bracket.id),
          slot: { team: winner, label: winner ? (winner.tag || winner.name) : (participants.length ? participants.map((team) => team.tag || team.name).join(' / ') : 'TBD') },
        };
      }).filter(Boolean);
      const places = qualifications.length || 4;
      const decided = qualifications.filter((item) => winnerOf(byId(db.matches, item.source?.matchId ?? item.match))).length;
      return {
        ...base,
        bracket: { id: bracket.id, name: bracket.name, title: bracket.title, subtitle: bracket.subtitle, format: bracket.format },
        title: 'ROAD TO TOP 4',
        kicker: `SINGLE ELIMINATION · ${decided} OF ${places} PLACES DECIDED`,
        columns,
        lanes,
      };
    }
    case 'social-live': {
      if (params.match && !byId(db.matches, params.match)) throw notFound('match');
      const live = db.matches.find((match) => match.status === 'live');
      const match = byId(db.matches, params.match) ?? live ?? nextMatch(db);
      if (!match) throw notFound('match');
      const ordered = sortByDate(db.matches.filter((entry) => entry.date));
      const index = ordered.findIndex((entry) => entry.id === match.id);
      const next = index >= 0 ? ordered.slice(index + 1).find((entry) => entry.id !== match.id && entry.status === 'scheduled') ?? null : null;
      return { ...base, match: stripStats(match), teamA: matchTeam(db, match, 'A'), teamB: matchTeam(db, match, 'B'), item: itemOf(db, match), next: itemOf(db, next) };
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
    case 'waiting':
      return { ...sceneData('schedule', { ...params, day: 'today' }, db), ...base, scene: 'waiting', hllLogo: '/brand/hll-logo.png' };
    case 'standings': {
      const brackets = db.settings.brackets ?? [];
      const bracket = brackets.find(b => b.id === params.bracket) ?? brackets.find(b => b.format === 'round-robin');
      const ids = new Set((bracket?.rounds ?? []).flatMap(r => r.matches));
      const matches = bracket ? db.matches.filter(m => ids.has(m.id)) : db.matches;
      const rows = store.tournamentStandings(matches, [...db.teams].sort((a,b) => (a.seed ?? Infinity) - (b.seed ?? Infinity)).map(t => t.id)).map(row => ({ ...row, team: byId(db.teams, row.teamId) }));
      return { ...base, title: bracket?.title || 'League standings', subtitle: bracket?.subtitle || '3 points per win · Head-to-head · Map difference', rows, footer: bracket?.footer || `${db.settings.leagueShort} · LEAGUE TABLE` };
    }
    case 'bracket':
      return { ...base, embed: parseEmbed(db.settings.bracketEmbed), tree: bracketTree(db, params.bracket) };
    case 'format':
      return { ...base, format: db.settings.tournamentFormat || null };
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
  const upcoming = db.matches.filter((m) => m.date && m.status === 'scheduled' && key(m) >= now).sort((a, b) => key(a).localeCompare(key(b)));
  if (upcoming.length) return upcoming[0];
  return [...db.matches].filter(m => m.date).sort((a, b) => key(b).localeCompare(key(a)))[0] ?? db.matches[0] ?? null;
}
