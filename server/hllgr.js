// Importer for https://hll.gr (WordPress, server-rendered HTML, no public JSON API).
// Teams + rosters: team pages (JSON-LD SportsTeam + HTML). Matches: /matches/. Stats: /game/<slug>/[n/].
import * as cheerio from 'cheerio';
import * as store from './db.js';
import { newId, nameKey } from './util.js';
import { setEntityImageFromUrl } from './assets.js';
import { refreshDdragon } from './ddragon.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach'];
const MONTHS = { ian: 1, fev: 2, mar: 3, apr: 4, mai: 5, ioun: 6, ioul: 7, avg: 8, sep: 9, okt: 10, noe: 11, dek: 12,
  jan: 1, feb: 2, may: 5, jun: 6, jul: 7, aug: 8, oct: 10, nov: 11, dec: 12 };

function base() {
  return store.get().settings.hllgr.baseUrl.replace(/\/+$/, '');
}

/** GET a page and load it in cheerio. Inline base64 images (MBs per page) are removed first. */
async function page(url) {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'el,en;q=0.8' };
  const cookie = store.get().settings.hllgr.cookie;
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const html = (await r.text()).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '');
  return cheerio.load(html);
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const slugOf = (url, kind) => (String(url).match(new RegExp(`/${kind}/([^/]+)/?`)) ?? [])[1]?.toLowerCase() ?? null;

function roleOf(text) {
  const t = String(text ?? '').toLowerCase();
  if (/adc|bottom|\bbot\b/.test(t)) return 'Bot';
  if (/supp/.test(t)) return 'Support';
  if (/jung/.test(t)) return 'Jungle';
  if (/\bmid/.test(t)) return 'Mid';
  if (/\btop\b/.test(t)) return 'Top';
  if (/coach|προπον/.test(t)) return 'Coach';
  return ROLES.find((r) => t.includes(r.toLowerCase())) ?? '';
}

// ---------- teams + rosters ----------

async function teamUrls() {
  try {
    const $ = await page(`${base()}/teams-sitemap.xml`);
    const urls = $('loc').map((_, e) => $(e).text().trim()).get().filter((u) => u.includes('/team/'));
    if (urls.length) return urls;
  } catch { /* fall back to the listing page */ }
  const $ = await page(`${base()}/teams/`);
  return [...new Set($('a[href*="/team/"]').map((_, e) => $(e).attr('href')).get())];
}

async function syncTeams(job, { images = true } = {}) {
  const db = store.get();
  const urls = await teamUrls();
  job.log(`HLL.GR: ${urls.length} team pages`);
  const seenPlayers = new Set();
  let n = 0;
  for (const url of urls) {
    job.progress(0.05 + (n++ / urls.length) * 0.4, `Team ${url}`);
    const $ = await page(url);
    const ext = slugOf(url, 'team');
    let ld = null;
    $('script[type="application/ld+json"]').each((_, e) => {
      try { const j = JSON.parse($(e).text()); if (j['@type'] === 'SportsTeam') ld = j; } catch { /* ignore */ }
    });
    const name = ld?.name || $('h5.team-fullname').first().text().trim() || ext.toUpperCase();
    const tag = ld?.alternateName || $('h1.team-shortname').first().text().trim() || ext.toUpperCase();
    let team = db.teams.find((t) => t.extId === ext && t.source === 'hllgr') ?? db.teams.find((t) => nameKey(t.tag) === nameKey(tag));
    if (!team) {
      team = { id: newId('t'), name, tag, logo: null, colors: { primary: '#444444', secondary: '#888888' }, source: 'hllgr', extId: ext };
      db.teams.push(team);
    }
    Object.assign(team, { name, tag, source: 'hllgr', extId: ext, url });
    const logoUrl = ld?.logo || $('.team-logo img').first().attr('src');
    if (images && logoUrl && team.logoSrc !== logoUrl) {
      try { await setEntityImageFromUrl('team', team, logoUrl); team.logoSrc = logoUrl; } catch (e) { job.log(`logo ${tag}: ${e.message}`); }
    }

    // Roster: HTML cards give role + flag; JSON-LD gives the real name in Latin letters.
    const ldBySlug = new Map((ld?.athlete ?? []).map((a) => [slugOf(a.url, 'player'), a]));
    const cards = $('article.team__member').map((_, el) => {
      const $el = $(el);
      const href = $el.find('.member__name a').attr('href') ?? $el.find('a[href*="/player/"]').attr('href');
      return {
        slug: slugOf(href, 'player'),
        nick: $el.find('.member__name').text().trim(),
        role: roleOf($el.find('.position_role').text()),
        country: ($el.find('.member_nationality').attr('title') || '').trim() || null,
        flag: ($el.find('.member_nationality img').attr('src') || '').match(/flags\/([a-z]{2})\.svg/)?.[1] ?? null,
        photo: $el.find('img.thumbnail__featured').attr('src') || null,
        greekName: $el.find('.member__highlighted').text().trim(),
      };
    }).get().filter((c) => c.slug);
    for (const [slug, a] of ldBySlug) {
      if (slug && !cards.some((c) => c.slug === slug)) cards.push({ slug, nick: a.additionalName, role: roleOf(a.disambiguatingDescription), photo: a.image });
    }
    for (const c of cards) {
      const a = ldBySlug.get(c.slug);
      let p = db.players.find((x) => x.extId === c.slug);
      if (!p) {
        p = { id: newId('p'), teamId: team.id, nick: c.nick, name: '', role: '', photo: null, country: null, captain: false, source: 'hllgr', extId: c.slug };
        db.players.push(p);
      }
      Object.assign(p, {
        teamId: team.id,
        nick: a?.additionalName || c.nick || p.nick,
        name: a?.name || c.greekName || p.name,
        role: c.role || roleOf(a?.disambiguatingDescription) || p.role,
        country: c.flag || p.country,
        source: 'hllgr', hidden: false,
        url: a?.url ?? `${base()}/player/${c.slug}/`,
      });
      seenPlayers.add(p.id);
      const photoUrl = (a?.image || c.photo || '').replace(/\?.*$/, '').replace(/-\d+x\d+(\.\w+)$/, '$1');
      if (images && photoUrl && p.photoSrc !== photoUrl) {
        try { await setEntityImageFromUrl('player', p, photoUrl); p.photoSrc = photoUrl; } catch (e) { job.log(`photo ${p.nick}: ${e.message}`); }
      }
    }
    job.log(`${tag}: ${cards.length} players`);
    store.changed();
  }
  return { teams: urls.length, players: seenPlayers.size };
}

// ---------- matches ----------

/** "Σεπ 12, 2026 // 6:00 μμ" → { date: "2026-09-12", time: "18:00" } */
export function parseGreekDate(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const m = t.match(/([^\s\d,]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[nameKey(m[1]).slice(0, 4)] ?? MONTHS[nameKey(m[1]).slice(0, 3)];
  if (!mon) return null;
  const date = `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  let time = null;
  const tm = t.match(/(\d{1,2}):(\d{2})\s*(πμ|μμ|π\.μ\.|μ\.μ\.|am|pm)?/i);
  if (tm) {
    let h = Number(tm[1]);
    const ap = (tm[3] ?? '').toLowerCase().replace(/\./g, '');
    if ((ap === 'μμ' || ap === 'pm') && h < 12) h += 12;
    if ((ap === 'πμ' || ap === 'am') && h === 12) h = 0;
    time = `${String(h).padStart(2, '0')}:${tm[2]}`;
  }
  return { date, time };
}

async function syncMatches(job) {
  const db = store.get();
  const $ = await page(`${base()}/matches/`);
  let rows = $('.tab[data-tab-id="list"] .match-row');
  if (!rows.length) rows = $('.match-row');
  const teamByExt = (href, tag) => db.teams.find((t) => t.extId === slugOf(href, 'team')) ?? db.teams.find((t) => nameKey(t.tag) === nameKey(tag));
  let count = 0;
  const seen = new Set();
  rows.each((_, el) => {
    const $r = $(el);
    const url = $r.find('a.match_link').attr('href') ?? null;
    const ext = slugOf(url, 'game');
    if (!ext || seen.has(ext)) return;
    seen.add(ext);
    const dateCell = $r.find('.match-row-date');
    const sub = dateCell.find('span').last().text().trim(); // "Split 3 - Playoffs // BO5"
    const when = parseGreekDate(dateCell.text()) ?? (() => { const d = ext.match(/(\d{4}-\d{2}-\d{2})/); return d ? { date: d[1], time: null } : null; })();
    const [stage, bo] = sub.split('//').map((s) => s.trim());
    const left = $r.find('.col-team-left-side'), right = $r.find('.col-team-right-side');
    const tA = teamByExt(left.find('a').attr('href'), left.find('span').text().trim());
    const tB = teamByExt(right.find('a').attr('href'), right.find('span').text().trim());
    if (!tA || !tB || !when) return;
    const scores = $r.find('.match-column-versus-score-1').map((_, s) => $(s).text().trim()).get();
    const sA = scores[0] !== undefined && scores[0] !== '' ? Number(scores[0]) : null;
    const sB = scores[1] !== undefined && scores[1] !== '' ? Number(scores[1]) : null;
    const played = Number.isFinite(sA) && Number.isFinite(sB) && sA + sB > 0;
    let m = db.matches.find((x) => x.extId === ext);
    if (!m) {
      m = { id: newId('m'), stats: [], source: 'hllgr', extId: ext };
      db.matches.push(m);
    }
    const vod = $r.find('.match-row-link-icon a').attr('href') ?? null;
    Object.assign(m, {
      date: when.date, time: when.time ?? m.time ?? '', teamA: tA.id, teamB: tB.id,
      scoreA: played ? sA : null, scoreB: played ? sB : null,
      bestOf: Number((bo ?? '').match(/\d+/)?.[0]) || m.bestOf || 1,
      stage: stage || m.stage || '',
      status: played ? 'done' : m.status === 'live' ? 'live' : 'scheduled',
      url, vod,
    });
    count++;
  });
  store.changed();
  job.log(`HLL.GR: ${count} matches`);
  return { matches: count };
}

// ---------- per-game player stats ----------

// The own text of every element in the cell (a value can sit beside a child <div>, e.g. "2 / 3 / 3<div>1.7</div>").
const leaves = ($, el) => $(el).find('*').map((_, e) => $(e).contents().filter((__, n) => n.type === 'text').text().trim()).get().filter(Boolean);
const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const kNum = (s) => { const m = String(s).match(/([\d.]+)\s*([kK])?/); return m ? Math.round(Number(m[1]) * (m[2] ? 1000 : 1)) : null; };

/** Parse one game page → [{ slug, label, realName, teamTag, win, champion, values }] or null. */
export function parseGame($) {
  const w = $('#matchHistoryWrapper');
  if (!w.length) return null;
  const dur = w.text().match(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/); // "… 4955 25:06ALMO …"
  const minutes = dur ? Number(dur[1]) + Number(dur[2]) / 60 : null;
  const out = [];
  const summary = w.find('.tab[data-tab-id="summary"]').first();
  const sides = (summary.length ? summary : w).find('li').filter((_, li) => $(li).find('table').length > 0);
  sides.each((_, li) => {
    const $li = $(li);
    const header = $li.children().first();
    const tag = header.find('span.ml-2').first().text().trim();
    const win = /victory|νίκη/i.test(header.text()) ? true : /defeat|ήττα/i.test(header.text()) ? false : null;
    $li.find('table tbody tr').each((__, tr) => {
      const tds = $(tr).children('td');
      const link = $(tr).find('a[href*="/player/"]').first();
      const slug = slugOf(link.attr('href'), 'player');
      if (!slug) return;
      const label = link.find('span').first().text().trim();
      const tip = cheerio.load(link.attr('data-tooltip') ?? '');
      const champion = tds.eq(0).find('[data-tooltip]').first().attr('data-tooltip') ?? null;
      const kdaText = leaves($, tds.eq(2)).join(' ');
      const k = kdaText.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
      const values = {};
      if (k) {
        const [K, D, A] = [Number(k[1]), Number(k[2]), Number(k[3])];
        Object.assign(values, { kills: K, deaths: D, assists: A, kda: Math.round(((K + A) / Math.max(1, D)) * 100) / 100 });
      }
      const kp = num(leaves($, tds.eq(3))[0]);
      if (kp !== null) values.kp = kp / 100;
      const dmg = kNum(leaves($, tds.eq(4))[0]);
      if (dmg !== null) values.damage = dmg;
      const goldLeaves = leaves($, tds.eq(5));
      const gpm = num((goldLeaves.find((s) => /GPM/i.test(s)) ?? '').replace(/GPM/i, ''));
      values.gold = gpm !== null && minutes ? Math.round(gpm * minutes) : kNum(goldLeaves[0]);
      if (gpm !== null) values.gpm = gpm;
      const csLeaves = leaves($, tds.eq(6));
      const cs = num(csLeaves.find((s) => !/CPM/i.test(s)));
      const cpm = num((csLeaves.find((s) => /CPM/i.test(s)) ?? '').replace(/CPM/i, ''));
      if (cs !== null) values.cs = cs;
      if (cpm !== null) values.cspm = cpm; else if (cs !== null && minutes) values.cspm = Math.round((cs / minutes) * 10) / 10;
      values.mvp = $(tr).find('.tag').filter((___, t) => $(t).text().trim() === 'MVP').length ? 1 : 0;
      for (const key of Object.keys(values)) if (values[key] === null) delete values[key];
      out.push({ slug, label, realName: tip('.tooltip-content').text().trim(), teamTag: tag || label.split(' ')[0], win, champion, values });
    });
  });
  return out.length ? { minutes, players: out } : null;
}

async function syncStats(job, { force = false } = {}) {
  const db = store.get();
  try { await refreshDdragon(); } catch { job.log('Data Dragon not reachable (champion icons later)'); }
  const todo = db.matches.filter((m) => m.status === 'done' && m.url && (force || !m.statsChecked));
  job.log(`HLL.GR: stats for ${todo.length} matches`);
  let done = 0, withStats = 0;
  await pool(todo, 3, async (m) => {
    try {
      const url1 = m.url.endsWith('/') ? m.url : `${m.url}/`;
      const $1 = await page(url1);
      const extra = new Set();
      $1(`a[href^="${url1}"]`).each((_, a) => { const g = ($1(a).attr('href') ?? '').slice(url1.length).match(/^(\d+)\/?$/); if (g) extra.add(Number(g[1])); });
      const games = [[1, $1], ...await Promise.all([...extra].filter((g) => g > 1).sort().map(async (g) => [g, await page(`${url1}${g}/`)]))];
      const stats = [];
      for (const [g, $] of games) {
        const parsed = parseGame($);
        if (!parsed) continue;
        for (const row of parsed.players) {
          let p = db.players.find((x) => x.extId === row.slug);
          const team = db.teams.find((t) => nameKey(t.tag) === nameKey(row.teamTag)) ?? null;
          if (!p) {
            // A substitute or a former player: keep the stats, hide from rosters.
            p = { id: newId('p'), teamId: team?.id ?? null, nick: row.label.replace(new RegExp(`^${row.teamTag}\\s+`), ''), name: row.realName, role: '', photo: null, country: null, captain: false, source: 'hllgr', extId: row.slug, hidden: true };
            db.players.push(p);
          }
          stats.push({ playerId: p.id, game: g, champion: row.champion, teamId: team?.id ?? p.teamId, win: row.win, values: row.values });
        }
      }
      m.stats = stats;
      m.statsChecked = true;
      if (stats.length) withStats++;
    } catch (e) {
      job.log(`stats ${m.extId}: ${e.message}`);
    }
    job.progress(0.6 + (++done / todo.length) * 0.4, `Stats ${done}/${todo.length}`);
  });
  // Roles for players without one: the most common champion role is unknown, so leave '' for the operator.
  store.changed();
  return { matchesChecked: todo.length, matchesWithStats: withStats };
}

/** Job body for POST /api/hllgr/sync. */
export async function syncHllgr(job, what = ['teams', 'players', 'matches', 'stats'], opts = {}) {
  const result = {};
  if (what.includes('teams') || what.includes('players')) Object.assign(result, await syncTeams(job, opts));
  job.progress(0.45, 'Matches');
  if (what.includes('matches') || what.includes('stats')) Object.assign(result, await syncMatches(job));
  job.progress(0.6, 'Stats');
  if (what.includes('stats')) Object.assign(result, await syncStats(job, opts));
  return result;
}
