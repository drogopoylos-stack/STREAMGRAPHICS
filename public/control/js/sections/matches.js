// MATCHES: grouped by date (upcoming first), jump to today, editor, add/delete.
import { h, keyedList } from '../dom.js';
import { icon } from '../icons.js';
import { t, fmtDate } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import {
  toast, toastError, busy, btn, badge, emptyState, sectionHead, thumb,
  openDrawer, closeDrawer, drawerState, confirmDialog, createForm, field, ctlText, ctlSelect, ctlSegmented, ctlNumber,
} from '../ui.js';
import { teamOptions, matchLabel, addDays } from '../scenes.js';
import { cueAndShow } from './live.js';

export const id = 'matches';
let els = null;
const filter = { status: '', team: '' };
let jumped = false;

export function mount(root) {
  const statusSel = ctlSelect({ options: [{ value: '', label: t('matches.allStatus') }, ...['scheduled', 'live', 'done'].map((s) => ({ value: s, label: t(`status.${s}`) }))] });
  const teamSel = ctlSelect({ options: [{ value: '', label: t('matches.allTeams') }, ...teamOptions(store.state)] });
  statusSel.el.setAttribute('aria-label', t('matches.status'));
  teamSel.el.setAttribute('aria-label', t('players.team'));
  statusSel.el.addEventListener('change', () => { filter.status = statusSel.el.value; render(); });
  teamSel.el.addEventListener('change', () => { filter.team = teamSel.el.value; render(); });
  const head = sectionHead(t('matches.title'), '',
    btn(t('matches.jumpToday'), { iconName: 'target', onclick: () => jumpToday() }),
    btn(t('matches.add'), { kind: 'primary', iconName: 'plus', onclick: () => edit(null) }));
  const bar = h('div.toolbar', statusSel.el, teamSel.el);
  const list = h('div.match-list', { role: 'list' });
  const empty = h('div', { hidden: true }, emptyState({ iconName: 'matches', title: t('matches.empty'), body: t('matches.emptyBody') }));
  root.append(head, bar, list, empty);
  els = { head, list, empty, teamSel };
  update(store.state);
}

export function show() {
  if (!jumped && els) { jumped = true; requestAnimationFrame(() => jumpToday(false)); }
}

function jumpToday(smooth = true) {
  const today = store.state?.today;
  if (!today || !els) return;
  const heads = [...els.list.querySelectorAll('.date-head')];
  // Newest first: today's header, else the first date before today (closest past), else the last.
  const target = heads.find((x) => x.dataset.date === today) ?? heads.find((x) => x.dataset.date < today) ?? heads.at(-1);
  // Already the first group: keep the page header (title, Add, filters) in view.
  if (target && target === heads[0]) els.head.closest('.main')?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  else target?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  target?.classList.add('flash');
  setTimeout(() => target?.classList.remove('flash'), 900);
}

function dateHead(item) {
  const s = store.state;
  const isToday = item.date === s.today;
  const isTomorrow = item.date === addDays(s.today, 1);
  return h(`div.date-head${isToday ? '.is-today' : ''}`, { role: 'heading', 'aria-level': 2, dataset: { date: item.date } },
    h('span.date-label', fmtDate(item.date, 'long')),
    isToday ? badge(t('matches.todayBadge'), 'gold') : null,
    isTomorrow ? badge(t('matches.tomorrowBadge'), 'muted') : null,
    h('span.date-count', item.count ? String(item.count) : t('matches.noneToday')));
}

function row(m) {
  const A = store.team(m.teamA), B = store.team(m.teamB);
  const played = m.scoreA != null || m.scoreB != null;
  const winA = played && m.status === 'done' && (m.scoreA ?? 0) > (m.scoreB ?? 0);
  const winB = played && m.status === 'done' && (m.scoreB ?? 0) > (m.scoreA ?? 0);
  const el = h(`div.match-row.st-${m.status}`, { role: 'listitem', tabIndex: 0, dataset: { id: m.id }, 'aria-label': `${matchLabel(m, false)} ${m.time ?? ''}` },
    h('span.m-time', m.time || '—'),
    h(`span.m-team.m-a${winA ? '.is-win' : ''}`, h('span.m-name', A?.name ?? t('common.tbd')), thumb(A?.logo ?? null, 'logo-md')),
    h('span.m-score', played ? h('span', h(`b${winA ? '.win' : ''}`, m.scoreA ?? 0), h('i', '–'), h(`b${winB ? '.win' : ''}`, m.scoreB ?? 0)) : h('span.m-vs', 'vs')),
    h(`span.m-team.m-b${winB ? '.is-win' : ''}`, thumb(B?.logo ?? null, 'logo-md'), h('span.m-name', B?.name ?? t('common.tbd'))),
    h('span.m-stage', m.stage || ''),
    h('span.m-bo', `BO${m.bestOf}`),
    h(`span.status-pill.st-${m.status}`, t(`status.${m.status}`)),
    h('span.m-stats', m.statsCount ? badge(t('matches.stats', { n: m.statsCount }), 'src', t('matches.statsTitle', { n: m.statsCount })) : null),
    h('span.m-links',
      m.url ? h('a.icon-link', { href: m.url, target: '_blank', rel: 'noopener', title: t('common.hllgrLink'), 'aria-label': t('common.hllgrLink'), onclick: (e) => e.stopPropagation() }, icon('external', 15)) : null,
      m.vod ? h('a.icon-link', { href: m.vod, target: '_blank', rel: 'noopener', title: t('matches.vodLink'), 'aria-label': t('matches.vodLink'), onclick: (e) => e.stopPropagation() }, icon('play', 15)) : null));
  el.addEventListener('click', () => edit(m.id));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(m.id); } });
  return el;
}

function render() {
  const s = store.state;
  if (!els || !s) return;
  let list = s.matches;
  if (filter.status) list = list.filter((m) => m.status === filter.status);
  if (filter.team) list = list.filter((m) => m.teamA === filter.team || m.teamB === filter.team);
  list = [...list].sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
  // Within a day show the earliest first.
  const byDate = new Map();
  for (const m of list) { if (!byDate.has(m.date)) byDate.set(m.date, []); byDate.get(m.date).push(m); }
  if (!byDate.has(s.today) && !filter.status && !filter.team) byDate.set(s.today, []);
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  const items = [];
  for (const d of dates) {
    const ms = byDate.get(d).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    items.push({ kind: 'date', date: d, count: ms.length });
    for (const m of ms) items.push({ kind: 'match', m });
  }
  const sig = (it) => (it.kind === 'date'
    ? JSON.stringify([it.date, it.count, s.today])
    : JSON.stringify([it.m, store.team(it.m.teamA)?.logo, store.team(it.m.teamA)?.name, store.team(it.m.teamB)?.logo, store.team(it.m.teamB)?.name]));
  keyedList(els.list, items, (it) => (it.kind === 'date' ? `d:${it.date}` : `m:${it.m.id}`), (it) => (it.kind === 'date' ? dateHead(it) : row(it.m)), sig);
  const nToday = s.matches.filter((m) => m.date === s.today).length;
  els.head.setSub(t('matches.sub', { n: s.matches.length, today: nToday }));
  els.empty.hidden = s.matches.length > 0;
  const key = drawerState()?.key;
  for (const r of els.list.querySelectorAll('.match-row')) r.classList.toggle('is-editing', key === `match:${r.dataset.id}`);
}

export function update(state) {
  if (!els || !state) return;
  els.teamSel.setOptions([{ value: '', label: t('matches.allTeams') }, ...teamOptions(state)]);
  els.teamSel.el.value = filter.team;
  render();
}

export async function edit(matchId) {
  const isNew = !matchId;
  const m = isNew ? null : store.match(matchId);
  if (!isNew && !m) return;
  const s = store.state;
  const f = createForm();
  const date = f.add('date', ctlText({ type: 'date', value: m?.date ?? s.today }));
  const time = f.add('time', ctlText({ type: 'time', value: m?.time ?? '18:00' }));
  const teamA = f.add('teamA', ctlSelect({ options: teamOptions(s, { none: t('common.tbd') }), value: m?.teamA ?? '' }));
  const teamB = f.add('teamB', ctlSelect({ options: teamOptions(s, { none: t('common.tbd') }), value: m?.teamB ?? '' }));
  const stages = [...new Set(s.matches.map((x) => x.stage).filter(Boolean))];
  const stage = f.add('stage', ctlText({ value: m?.stage ?? '', list: 'stage-list', placeholder: t('matches.stageHint') }));
  const bestOf = f.add('bestOf', ctlSegmented({ options: [1, 3, 5].map((n) => ({ value: n, label: `BO${n}` })), value: m?.bestOf ?? 1, size: 'sm' }));
  const status = f.add('status', ctlSegmented({ options: ['scheduled', 'live', 'done'].map((x) => ({ value: x, label: t(`status.${x}`) })), value: m?.status ?? 'scheduled', size: 'sm' }));
  const scoreA = f.add('scoreA', ctlNumber({ value: m?.scoreA ?? null, min: 0, max: 9, allowEmpty: true, placeholder: '–' }));
  const scoreB = f.add('scoreB', ctlNumber({ value: m?.scoreB ?? null, min: 0, max: 9, allowEmpty: true, placeholder: '–' }));
  const url = f.add('url', ctlText({ value: m?.url ?? '', type: 'url', placeholder: 'https://hll.gr/game/…' }));
  const vod = f.add('vod', ctlText({ value: m?.vod ?? '', type: 'url', placeholder: 'https://youtube.com/…' }));
  f.snapshot();

  const swapBtn = h('button.btn.btn-icon.btn-ghost.swap-btn', { type: 'button', title: t('matches.swap'), 'aria-label': t('matches.swap') }, icon('swap', 16));
  swapBtn.addEventListener('click', () => {
    const a = teamA.get(), b = teamB.get(), sa = scoreA.get(), sb = scoreB.get();
    teamA.set(b); teamB.set(a); scoreA.set(sa); scoreB.set(sb);
  });

  const body = h('div.form-stack',
    h('datalist', { id: 'stage-list' }, stages.map((x) => h('option', { value: x }))),
    h('div.form-grid',
      field(t('matches.date'), date),
      field(t('matches.time'), time),
      h('div.span-2.teams-pick', field(t('matches.teamA'), teamA), swapBtn, field(t('matches.teamB'), teamB)),
      h('div.span-2.teams-pick.scores-pick', field(t('matches.scoreA'), scoreA), h('span.score-colon', ':'), field(t('matches.scoreB'), scoreB)),
      h('p.field-hint.span-2', t('matches.scoreHint')),
      field(t('matches.status'), status, { span: 2 }),
      field(t('matches.bestOf'), bestOf),
      field(t('matches.stage'), stage),
      field(t('matches.url'), url, { span: 2 }),
      field(t('matches.vod'), vod, { span: 2 })),
    isNew ? null : h('div.form-links',
      m.statsCount ? badge(t('matches.stats', { n: m.statsCount }), 'src', t('matches.statsTitle', { n: m.statsCount })) : badge(t('matches.noStats'), 'muted'),
      h('div.spacer'),
      btn(t('matches.cueVersus'), { size: 'sm', iconName: 'live', onclick: () => closeDrawer().then((ok) => ok && cueAndShow('versus', { match: matchId })) }),
      btn(t('matches.cueSimple'), { size: 'sm', iconName: 'live', onclick: () => closeDrawer().then((ok) => ok && cueAndShow('simple-vs', { match: matchId })) })));

  const saveBtn = btn(isNew ? t('common.create') : t('common.save'), { kind: 'primary', kbd: 'Ctrl+S' });
  const save = () => busy(saveBtn, async () => {
    const v = f.values();
    v.url = v.url || null;
    v.vod = v.vod || null;
    try {
      if (isNew) {
        const created = await api.post('/api/matches', v);
        toast(t('common.created'), 'ok');
        f.snapshot();
        store.state.matches.push({ ...created, statsCount: 0 });
        store.idx.matches.set(created.id, { ...created, statsCount: 0 });
        await closeDrawer({ force: true });
        edit(created.id);
      } else {
        const patch = f.changed();
        for (const k of ['url', 'vod']) if (k in patch) patch[k] = v[k];
        await api.put(`/api/matches/${matchId}`, patch);
        f.snapshot();
        toast(t('common.saved'), 'ok');
      }
      store.refresh();
    } catch (e) { toastError(e); }
  });
  saveBtn.addEventListener('click', save);
  const delBtn = isNew ? null : btn(t('common.delete'), { kind: 'danger', iconName: 'trash' });
  delBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('common.confirmDelete', { name: `${matchLabel(m)} (${fmtDate(m.date, 'short')})` }), body: t('common.confirmDeleteBody') });
    if (!ok) return;
    try {
      await api.del(`/api/matches/${matchId}`);
      toast(t('common.deleted'), 'ok');
      await closeDrawer({ force: true });
      store.refresh();
    } catch (e) { toastError(e); }
  });

  await openDrawer({
    key: isNew ? 'match:new' : `match:${matchId}`,
    title: isNew ? t('matches.newTitle') : matchLabel(m, false),
    subtitle: isNew ? null : `${fmtDate(m.date, 'long')} · ${m.time ?? ''}`,
    body,
    footer: [delBtn, h('div.spacer'), btn(t('common.cancel'), { onclick: () => closeDrawer() }), saveBtn],
    isDirty: () => f.dirty(),
    onSave: save,
    onState: () => {
      if (isNew) return;
      if (!store.match(matchId)) { closeDrawer({ force: true }); toast(t('common.notFoundClosed'), 'info'); }
    },
    onClose: () => els && render(),
  });
  if (els) render();
}
