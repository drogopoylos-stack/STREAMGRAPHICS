// The filter menu of the Live page, for any long list: rows of filter buttons with counts, a search
// field, a result count and "Clear filters". It keeps the same look (graphic-* classes) everywhere.
import { h, keyedList, norm } from './dom.js';
import { t } from './strings.js';

/**
 * rows: [{ id, label, allLabel, secondary? }] — a secondary row is the small one under the main row.
 * The choice of the first row is kept for each tournament (storageKey).
 */
export function filterMenu({ title = '', searchLabel = '', rows, extra = [], storageKey = '', onChange }) {
  const values = Object.fromEntries(rows.map((row) => [row.id, 'all']));
  let tournament = null;
  const search = searchLabel
    ? h('input.input', { type: 'search', placeholder: searchLabel, 'aria-label': searchLabel, dataset: { search: '' }, oninput: () => changed() })
    : null;
  const count = h('span.graphic-count', { role: 'status', 'aria-live': 'polite' });
  const reset = h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => clear() }, t('live.browse.clear'));
  const navs = new Map(rows.map((row) => [row.id, h(`nav.${row.secondary ? 'graphic-periods' : 'graphic-types'}`, { 'aria-label': row.label })]));
  const main = rows.filter((row) => !row.secondary).map((row) => navs.get(row.id));
  const small = rows.filter((row) => row.secondary).map((row) => navs.get(row.id));
  const el = h('div.graphic-menu.list-filter',
    h('div.dashboard-toolbar', title ? h('h2.panel-title', title) : null, count, search, ...extra),
    ...main, h('div.graphic-filter-row', ...small, reset));

  function remember() {
    if (!storageKey || !tournament) return;
    try { localStorage.setItem(`hll:filter:${storageKey}:${tournament}`, JSON.stringify(values)); } catch { /* private storage disabled */ }
  }
  function changed() { remember(); paintReset(); onChange(); }
  function paintReset() { reset.hidden = !(search?.value) && rows.every((row) => values[row.id] === 'all'); }
  function clear() {
    if (search) search.value = '';
    for (const row of rows) values[row.id] = 'all';
    changed();
  }

  return {
    el,
    value: (id) => values[id],
    set(id, value) { values[id] = value ?? 'all'; changed(); },
    query: () => norm(search?.value || '').trim(),
    /** A new tournament: restore its saved choice, or start with everything. */
    forTournament(id) {
      if (id === tournament) return;
      tournament = id;
      for (const row of rows) values[row.id] = 'all';
      if (search) search.value = '';
      try { Object.assign(values, JSON.parse(localStorage.getItem(`hll:filter:${storageKey}:${id}`) || '{}')); } catch { /* no saved choice */ }
      paintReset();
    },
    /** items: [{ id, label, count }] in display order. A button with 0 results hides unless selected. */
    paintRow(id, items, total) {
      const row = rows.find((r) => r.id === id);
      if (values[id] !== 'all' && !items.some((item) => item.id === values[id])) values[id] = 'all';
      const shown = [{ id: 'all', label: row.allLabel, count: total }, ...items.filter((item) => item.count || item.id === values[id])];
      keyedList(navs.get(id), shown, (item) => item.id, (item) => h('button.graphic-filter', {
        type: 'button', dataset: { filter: item.id }, 'aria-pressed': String(values[id] === item.id),
        onclick: () => { values[id] = item.id; changed(); },
      }, h('span', item.label), h('span.graphic-filter-count', String(item.count))), (item) => JSON.stringify([item, values[id] === item.id]));
      navs.get(id).hidden = items.length < 2 && values[id] === 'all';
      paintReset();
    },
    setCount(text) { count.textContent = text; },
  };
}

/**
 * Filter a list by facets and a search text. Each facet count uses all the other filters, so a
 * button shows how many results it gives with the current choice. facets: { id: item => key or keys }.
 */
export function applyFacets(items, menu, facets, textOf) {
  const query = menu.query();
  const keysOf = (item, id) => [].concat(facets[id](item)).filter((key) => key != null);
  const passes = (item, skip) => (!query || norm(textOf(item)).includes(query))
    && Object.keys(facets).every((id) => id === skip || menu.value(id) === 'all' || keysOf(item, id).includes(menu.value(id)));
  const counts = {};
  const totals = {};
  for (const id of Object.keys(facets)) {
    counts[id] = new Map();
    totals[id] = 0;
    for (const item of items) {
      if (!passes(item, id)) continue;
      totals[id]++;
      for (const key of new Set(keysOf(item, id))) counts[id].set(key, (counts[id].get(key) ?? 0) + 1);
    }
  }
  return { shown: items.filter((item) => passes(item, null)), counts, totals };
}

/** The status / date group of a match, as on the Live page. */
export function matchPeriod(match, today) {
  if (match.status === 'live') return 'live';
  if (match.status === 'done') return 'completed';
  if (!match.date) return 'tbd';
  if (match.date === today) return 'today';
  return match.date > today ? 'upcoming' : 'past';
}
export const MATCH_PERIODS = ['live', 'today', 'upcoming', 'tbd', 'completed', 'past'];
