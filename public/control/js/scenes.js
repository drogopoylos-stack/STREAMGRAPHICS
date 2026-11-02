// Scene catalogue for the control panel: labels, URLs, quick cards.
import { t, fmtDate } from './strings.js';
import { store } from './store.js';
import { SCENE_IDS, sceneDefinition } from '../../shared/scenes.js';

export const SCENES = SCENE_IDS;
export const PARAM_OF = { schedule: 'day', versus: 'match', 'simple-vs': 'match', roster: 'team', matchup: 'feature', bracket: null, sponsors: null };

export const sceneName = scene => scene ? (t(`scenes.${scene}`) === `scenes.${scene}` ? sceneDefinition(scene)?.label ?? scene : t(`scenes.${scene}`)) : '';

/** Drop empty values, sort keys → stable object. */
export function cleanParams(params = {}) {
  const out = {};
  for (const k of Object.keys(params ?? {}).sort()) {
    const v = params[k];
    if (v != null && v !== '') out[k] = String(v);
  }
  return out;
}

export function cueKey(scene, params) {
  if (!scene) return '';
  return `${scene}?${new URLSearchParams(cleanParams(params))}`;
}

export function sameCue(a, b) {
  return !!a && !!b && cueKey(a.scene, a.params) === cueKey(b.scene, b.params);
}

/** /overlay/scene.html URL. flags: { static, bg, mode } */
export function sceneUrl(scene, params = {}, flags = {}) {
  const qs = new URLSearchParams({ scene, ...cleanParams(params) });
  for (const [k, v] of Object.entries(flags)) if (v != null && v !== '') qs.set(k, String(v));
  return `/overlay/scene.html?${qs}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

export function teamName(id, short = true) {
  const tm = store.team(id);
  if (!tm) return t('common.tbd');
  return short ? (tm.tag || tm.name) : tm.name;
}

export function matchLabel(m, short = true) {
  if (!m) return '';
  return `${m.teamA ? teamName(m.teamA, short) : m.teamALabel || t('common.tbd')} ${t('scenes.vs')} ${m.teamB ? teamName(m.teamB, short) : m.teamBLabel || t('common.tbd')}`;
}

export function dayParamLabel(day) {
  const s = store.state;
  if (day === 'all') return t('scenes.allDays');
  if (!day || day === 'today') return `${t('scenes.today')} · ${fmtDate(s?.today, 'short')}`;
  if (day === 'tomorrow') return `${t('scenes.tomorrow')} · ${fmtDate(s?.today ? addDays(s.today, 1) : '', 'short')}`;
  return fmtDate(day, 'short');
}

/** Human description of a cue: { title, detail }. */
export function describe(scene, params = {}) {
  if (!scene) return { title: '', detail: '' };
  const title = sceneName(scene);
  let detail = '';
  switch (scene) {
    case 'schedule':
    case 'social-schedule': detail = dayParamLabel(params.day) + (params.page ? ` · ${t('live.page')} ${params.page}` : ''); break;
    case 'versus':
    case 'social-versus':
    case 'simple-vs': {
      const m = store.match(params.match) ?? store.match(store.state?.nextMatch);
      detail = m ? matchLabel(m) : t('scenes.nextMatch');
      if (!params.match) detail = `${t('scenes.nextMatch')} · ${detail}`;
      break;
    }
    case 'roster': detail = store.team(params.team)?.name ?? ''; break;
    case 'matchup': {
      const f = store.feature(params.feature);
      if (f) detail = f.title || featureAutoTitle(f);
      else if (params.a || params.b) detail = `${store.player(params.a)?.nick ?? '?'} ${t('scenes.vs')} ${store.player(params.b)?.nick ?? '?'}`;
      break;
    }
    default: break;
  }
  if (params.mode) detail = detail ? `${detail} · ${t(`scenes.mode${params.mode === 'simple' ? 'Simple' : 'Full'}`)}` : t(`scenes.mode${params.mode === 'simple' ? 'Simple' : 'Full'}`);
  return { title, detail };
}

export function cueText(scene, params) {
  const d = describe(scene, params);
  return d.detail ? `${d.title} — ${d.detail}` : d.title;
}

export function featureAutoTitle(f) {
  const a = store.player(f.playerA), b = store.player(f.playerB);
  if (a && b) return `${a.nick} ${t('scenes.vs')} ${b.nick}`;
  return t('matchups.untitled', { role: a?.role || '' }).trim();
}

const countLabel = (n) => (n === 0 ? t('scenes.noMatches') : n === 1 ? t('scenes.oneMatch') : t('scenes.nMatches', { n }));

/**
 * The quick cards of the Live page.
 * Card: { key, group, scene, params, title, sub, art: { type: 'icon'|'logos'|'logo'|'photos', … }, warn }
 */
export function quickCards(state = store.state) {
  if (!state) return [];
  if (Array.isArray(state.screenCatalog)) return state.screenCatalog;
  const cards = [];
  const today = state.today;
  const tomorrow = today ? addDays(today, 1) : null;
  const nToday = state.matches.filter((m) => m.date === today).length;
  const nTomorrow = state.matches.filter((m) => m.date === tomorrow).length;
  cards.push({ key: 'sched-today', group: 'match', scene: 'schedule', params: { day: 'today' }, title: `${t('scenes.schedule')} · ${t('scenes.today')}`, sub: `${fmtDate(today, 'short')} · ${countLabel(nToday)}`, art: { type: 'icon', icon: 'calendar', label: fmtDate(today, 'short') }, warn: nToday === 0 });
  cards.push({ key: 'sched-tomorrow', group: 'match', scene: 'schedule', params: { day: 'tomorrow' }, title: `${t('scenes.schedule')} · ${t('scenes.tomorrow')}`, sub: `${fmtDate(tomorrow, 'short')} · ${countLabel(nTomorrow)}`, art: { type: 'icon', icon: 'calendar' }, warn: nTomorrow === 0 });
  const next = store.match(state.nextMatch);
  if (next) {
    const when = `${fmtDate(next.date, 'short')} ${next.time ?? ''}`.trim();
    const logos = [store.team(next.teamA), store.team(next.teamB)];
    cards.push({ key: 'next-versus', group: 'match', scene: 'versus', params: { match: next.id }, title: `${t('scenes.nextMatch')} · ${t('scenes.versus')}`, sub: `${matchLabel(next)} · ${when}`, art: { type: 'logos', teams: logos } });
    cards.push({ key: 'next-simple', group: 'match', scene: 'simple-vs', params: { match: next.id }, title: t('scenes.simple-vs'), sub: `${matchLabel(next)} · ${when}`, art: { type: 'logos', teams: logos, simple: true } });
  }
  const teams = state.teams.filter((x) => !x.hidden).sort((a, b) => a.name.localeCompare(b.name));
  for (const tm of teams) {
    const n = state.players.filter((p) => p.teamId === tm.id && !p.hidden).length;
    cards.push({ key: `roster-${tm.id}`, group: 'rosters', scene: 'roster', params: { team: tm.id }, title: tm.name, sub: `${tm.tag} · ${t('scenes.players', { n })}`, art: { type: 'logo', team: tm }, warn: n === 0 });
  }
  for (const f of state.features) {
    const a = store.player(f.playerA), b = store.player(f.playerB);
    cards.push({ key: `matchup-${f.id}`, group: 'matchups', scene: 'matchup', params: { feature: f.id }, title: f.title || featureAutoTitle(f), sub: `${a?.nick ?? '?'} ${t('scenes.vs')} ${b?.nick ?? '?'}`, art: { type: 'photos', players: [a, b] }, warn: !a || !b });
  }
  const embed = String(state.settings.bracketEmbed ?? '').trim();
  cards.push({ key: 'bracket', group: 'other', scene: 'bracket', params: {}, title: t('scenes.bracket'), sub: embed ? (embed.startsWith('<') ? 'iframe' : embed.replace(/^https?:\/\//, '').slice(0, 40)) : t('scenes.noBracket'), art: { type: 'icon', icon: 'bracket' }, warn: !embed });
  const nS = state.sponsors.filter((s) => s.logo).length;
  cards.push({ key: 'sponsors', group: 'other', scene: 'sponsors', params: {}, title: t('scenes.sponsors'), sub: t('scenes.nSponsors', { n: nS }), art: { type: 'icon', icon: 'sponsors' }, warn: nS === 0 });
  return cards;
}

/** Options helpers shared by several pages. */
export function teamOptions(state = store.state, { none = null } = {}) {
  const list = [...state.teams].sort((a, b) => a.name.localeCompare(b.name)).map((tm) => ({ value: tm.id, label: `${tm.name} (${tm.tag})` }));
  return none ? [{ value: '', label: none }, ...list] : list;
}

export function matchOptions(state = store.state, { auto = false, none = null } = {}) {
  const list = [...state.matches]
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map((m) => ({ value: m.id, label: `${m.time ?? ''}  ${matchLabel(m)}${m.stage ? ` · ${m.stage}` : ''}`, group: m.date === state.today ? `${fmtDate(m.date, 'short')} — ${t('scenes.today')}` : m.date ? fmtDate(m.date, 'short') : 'Date TBD' }));
  const head = [];
  if (auto) head.push({ value: '', label: t('common.autoNext') });
  if (none) head.push({ value: '', label: none });
  return [...head, ...list];
}

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach', ''];
export const roleRank = (r) => { const i = ROLE_ORDER.indexOf(r ?? ''); return i < 0 ? 99 : i; };
export const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support', 'Coach'];

/** Combo options for players, grouped by team, with role + real name. */
export function playerComboOptions(state = store.state) {
  const teams = [...state.teams].sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  const add = (p, group) => out.push({
    value: p.id, label: p.nick, img: p.photo ?? null, group,
    sub: [p.role ? t(`roles.${p.role}`) : '', p.name].filter(Boolean).join(' · '),
    search: `${p.role} ${p.name} ${store.team(p.teamId)?.tag ?? ''}`,
  });
  for (const tm of teams) {
    state.players.filter((p) => p.teamId === tm.id).sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.nick.localeCompare(b.nick)).forEach((p) => add(p, `${tm.name} (${tm.tag})`));
  }
  state.players.filter((p) => !store.team(p.teamId)).sort((a, b) => a.nick.localeCompare(b.nick)).forEach((p) => add(p, t('common.teamless')));
  return out;
}
