// ASSETS (HLL Social): teams, players and the sources of the data in one place.
// Sources: the broadcaster's copy, the match source of the tournament (Google Sheet / HLL.GR) and
// the Google Drive folder with the original logos and photos.
import { h } from '../dom.js';
import { t } from '../strings.js';
import { sectionHead, panel, ctlSegmented } from '../ui.js';
import * as teams from './teams.js';
import * as players from './players.js';
import * as importer from './import.js';
import { feedPanel } from '../feed-panel.js';
import { matchSheetPanel } from '../match-sheet-panel.js';

export const id = 'assets';
const TABS = ['teams', 'players', 'sources'];
let els = null;

export function mount(root, goto, ctx) {
  const tabs = ctlSegmented({ options: TABS.map(value => ({ value, label: t(`assets.tab.${value}`) })), value: 'teams' });
  tabs.el.setAttribute('aria-label', t('nav.assets'));
  const hosts = Object.fromEntries(TABS.map(key => [key, h(`div.assets-tab.assets-${key}`, { hidden: key !== 'teams' })]));
  teams.mount(hosts.teams, goto, ctx);
  players.mount(hosts.players);
  const sheet = matchSheetPanel({ configure: true });
  hosts.sources.append(
    h('div.import-grid',
      h('div.col', feedPanel(), sheet.el),
      h('div.col', panel(t('assets.sourcesTitle'), h('p.panel-sub', t('assets.sourcesSub'))))),
  );
  const importHost = h('div');
  importer.mount(importHost);
  hosts.sources.append(importHost);
  tabs.el.addEventListener('change', () => select(tabs.get()));
  root.append(sectionHead(t('nav.assets'), t('assets.sub')), h('div.assets-tabs', tabs.el), ...Object.values(hosts));
  els = { tabs, hosts, sheet };
}

function select(tab) {
  if (!els || !TABS.includes(tab)) return;
  els.tabs.set(tab);
  for (const [key, host] of Object.entries(els.hosts)) host.hidden = key !== tab;
}

export function show(opts) {
  if (!els) return;
  if (opts?.tab) select(opts.tab);
  if (opts?.tab === 'players') players.show(opts);
}

export function update(state) {
  if (!els || !state) return;
  for (const section of [teams, players, importer]) { try { section.update(state); } catch (e) { console.error(e); } }
  els.sheet.update();
}
