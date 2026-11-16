import { h, setKids } from './dom.js';
import { api } from './api.js';
import { store } from './store.js';
import { btn, busy, toast, toastError, panel, field, ctlText, ctlToggle, copyField } from './ui.js';

export function matchSheetPanel({ configure = false } = {}) {
  const status = h('p.panel-sub', { role: 'status' });
  const links = h('div');
  const source = ctlText({ type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/…' });
  const enabled = ctlToggle({ label: 'Automatic sync every 30 seconds' });
  const connect = btn('Save connection', { onclick: () => busy(connect, async () => {
    try { await api.put('/api/match-sheet', { url: source.get(), enabled: enabled.get(), sheetName: 'Matches' }); await store.load(); toast('Sheet connection saved', 'ok'); } catch (e) { toastError(e); }
  }) });
  const sync = btn('Sync now', { iconName: 'refresh', onclick: () => busy(sync, async () => {
    try { await api.post('/api/match-sheet/sync', {}); await store.load(); toast('Matches synced', 'ok'); } catch (e) { toastError(e); store.refresh(); }
  }) });
  const el = panel('Google Sheets · Matches',
    ...(configure ? [field('Google Sheet URL', source), enabled.el, connect, h('p.field-hint', 'Share → General access → Anyone with the link → Viewer. Only match data should be in this shared file. Changes flow from Sheets into graphics while the server is running.')] : []),
    status, links, sync);
  let signature = '';
  let linkSignature = '';
  function update() {
    const config = store.state?.settings?.matchSheet || {};
    const key = JSON.stringify([store.state?.activeTournamentId, config.url, config.enabled]);
    if (key !== signature) { signature = key; source.set(config.url || ''); enabled.set(!!config.enabled); }
    el.hidden = !configure && !config.url;
    sync.disabled = !config.enabled;
    status.textContent = config.lastError ? `Sync error: ${config.lastError} Last valid matches are kept.` : config.enabled ? `Auto sync on · ${config.lastSuccess ? `Last synced ${new Date(config.lastSuccess).toLocaleString()}` : 'Waiting for first sync'}` : 'Auto sync off · Matches can be edited in the dashboard.';
    const id = store.state?.activeTournamentId;
    const nextLinks = JSON.stringify([id, config.url, config.spreadsheetId, config.sheetName]);
    if (nextLinks === linkSignature) return;
    linkSignature = nextLinks;
    setKids(links, config.url ? h('p', h('a.btn.btn-sm', { href: config.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open match sheet')) : null,
      config.url ? h('details', h('summary', 'Bracket page for a website'),
        h('p.field-hint', 'One HTML file with the bracket. It reads the results from this sheet every 30 seconds, also when this program is closed. Put it on any web host and give the website an iframe to it. Download it again after you change teams, logos or the bracket format.'),
        h('p', h('a.btn.btn-sm', { href: `/api/tournaments/${id}/bracket-embed.html`, download: '' }, 'Download bracket page'), ' ',
          h('a.btn.btn-sm', { href: `/api/tournaments/${id}/bracket-embed.html?download=0`, target: '_blank', rel: 'noopener noreferrer' }, 'Open preview'))) : null,
      config.url ? h('details', h('summary', 'Data feeds for another site'),
        h('p.field-hint', 'Google CSV works remotely once the sheet is shared. Program feeds need a reachable server address.'),
        field('Google CSV', { el: copyField(`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName || 'Matches')}`, { open: true }) }),
        field('Program JSON', { el: copyField(`${location.origin}/api/tournaments/${id}/matches.json`, { open: true }) }),
        field('Program CSV', { el: copyField(`${location.origin}/api/tournaments/${id}/matches.csv`, { open: true }) })) : null);
  }
  update();
  return { el, update };
}
