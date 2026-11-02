import { h, keyedList } from './dom.js';
import { t } from './strings.js';
import { sceneName } from './scenes.js';
import { organizeGraphics, graphicTypes, graphicSections, PERIODS } from './graphic-browser-model.js';

const PAGE_SIZE = 8;
const label = key => t(`live.browse.${key}`);

/** A compact type menu and a bounded, date-grouped gallery. No actions take a graphic on air. */
export function graphicBrowser({ renderCard, onKeyDown, onRender }) {
  let state, all = [], tournamentId, type = 'schedule', period = 'all', saved = false;
  const expanded = new Map(), limits = new Map(), groups = new Map();
  const picker = h('div.picker', { 'aria-label': t('live.dashboardTitle'), onkeydown: onKeyDown });
  const types = h('nav.graphic-types', { 'aria-label': label('types') });
  const periods = h('div.graphic-periods', { 'aria-label': label('periods') });
  const search = h('input.input', { type: 'search', dataset: { search: '' }, placeholder: t('live.searchGraphics'), 'aria-label': t('live.searchGraphics'), oninput: () => { limits.clear(); paint(); } });
  const date = h('input.input.graphic-date', { type: 'date', 'aria-label': label('date'), title: label('date'), onchange: () => { limits.clear(); paint(); } });
  const count = h('span.graphic-count', { role: 'status', 'aria-live': 'polite' });
  const savedButton = h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-pressed': 'false', onclick: () => { saved = !saved; limits.clear(); paint(); } }, label('savedOnly'));
  const reset = h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: clear }, label('clear'));
  const empty = h('div.picker-empty', label('empty'), ' ', h('button.btn-link', { type: 'button', onclick: clear }, label('clear')));
  const menu = h('div.graphic-menu',
    h('div.dashboard-toolbar', h('h2.panel-title', t('live.dashboardTitle')), count, search, savedButton),
    types, h('div.graphic-filter-row', periods, h('label.graphic-date-label', label('date'), date), reset));
  // Keep the score panel below this sticky menu, even when type buttons wrap.
  new ResizeObserver(() => menu.closest('.graphics-dashboard')?.style.setProperty('--graphics-menu-h', `${menu.offsetHeight}px`)).observe(menu);

  function remember() {
    try { localStorage.setItem(`hll:graphic-type:${tournamentId}`, type); } catch { /* private storage disabled */ }
  }
  function clear() { search.value = date.value = ''; saved = false; period = 'all'; limits.clear(); paint(); }
  function chooseType(id) {
    type = id; period = 'all'; date.value = ''; limits.clear(); remember(); paint();
  }
  function filterButton(id, text, n, selected, choose) {
    return h('button.graphic-filter', { type: 'button', dataset: { filter: id }, 'aria-pressed': String(selected), onclick: () => choose(id) }, h('span', text), h('span.graphic-filter-count', String(n)));
  }
  function paint() {
    if (!state) return;
    const available = graphicTypes(all);
    if (!available.some(item => item.id === type)) type = available.find(item => item.id !== 'all')?.id || 'all';
    keyedList(types, available, item => item.id, item => {
      const typeLabel = t(`live.browse.typeLabels.${item.id}`);
      return filterButton(item.id, item.id === 'all' ? label('allTypes') : typeLabel.startsWith('live.browse.') ? sceneName(item.id) : typeLabel, item.count, type === item.id, chooseType);
    }, item => JSON.stringify([item, type === item.id]));
    const result = graphicSections(all, { type, period, saved, date: date.value, query: search.value });
    const periodOptions = [{ id: 'all', count: result.total }, ...PERIODS.filter(id => result.counts[id] || period === id).map(id => ({ id, count: result.counts[id] }))];
    keyedList(periods, periodOptions, item => item.id, item => filterButton(item.id, label(item.id), item.count, period === item.id, id => { period = id; limits.clear(); paint(); }), item => JSON.stringify([item, period === item.id]));
    savedButton.setAttribute('aria-pressed', String(saved));
    reset.hidden = !search.value && !date.value && !saved && period === 'all';
    count.textContent = label('count').replace('{n}', result.shown);
    const visible = new Set(result.sections.map(section => section.id));
    for (const [id, group] of groups) if (!visible.has(id)) group.el.remove();
    for (const [index, section] of result.sections.entries()) {
      let group = groups.get(section.id);
      if (!group) {
        const title = h('span'), total = h('span.graphic-section-count');
        const grid = h('div.card-grid'), more = h('button.btn.btn-sm.graphic-more', { type: 'button' });
        const body = h('div.graphic-section-body', grid, more);
        const el = h('details.picker-group.graphic-section', { dataset: { period: section.id } }, h('summary.picker-title', title, total), body);
        el.addEventListener('toggle', () => {
          if (expanded.get(section.id) === el.open) return;
          expanded.set(section.id, el.open); paint();
        });
        group = { el, title, total, body, grid, more }; groups.set(section.id, group);
      }
      const open = period !== 'all' || (expanded.get(section.id) ?? !['completed', 'past'].includes(section.id));
      expanded.set(section.id, open);
      group.el.open = open;
      group.title.textContent = label(section.id);
      group.total.textContent = String(section.cards.length);
      if (picker.children[index] !== group.el) picker.insertBefore(group.el, picker.children[index] ?? null);
      if (!open) { group.grid.replaceChildren(); continue; }
      const limit = limits.get(section.id) || PAGE_SIZE;
      const shown = section.cards.slice(0, limit);
      keyedList(group.grid, shown, card => card.key, renderCard);
      group.more.hidden = section.cards.length <= limit;
      group.more.textContent = label('more').replace('{n}', section.cards.length - limit);
      group.more.onclick = () => { limits.set(section.id, limit + PAGE_SIZE); paint(); };
    }
    empty.hidden = !!result.shown;
    onRender?.();
  }

  return { menu, picker, empty,
    update(cards, nextState) {
      state = nextState;
      if (tournamentId !== state.activeTournamentId) {
        tournamentId = state.activeTournamentId; type = 'schedule'; period = 'all'; saved = false;
        search.value = date.value = ''; expanded.clear(); limits.clear();
        try { type = localStorage.getItem(`hll:graphic-type:${tournamentId}`) || type; } catch { /* no persistence */ }
      }
      all = organizeGraphics(cards, state); paint();
    },
  };
}
