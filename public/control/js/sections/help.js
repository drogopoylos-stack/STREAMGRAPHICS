// OBS / vMix: copyable URLs (built from this browser's origin and the server's LAN addresses) + setup steps.
import { h, setKids, keyedList, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../strings.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { sectionHead, panel, copyField, ctlToggle, toast } from '../ui.js';
import { quickCards, sceneUrl } from '../scenes.js';
import { MASTER_URL } from '../../../shared/scenes.js';

export const id = 'help';
let els = null;
const flags = { bg: false, simple: false };
let net = null; // { main: [addr], other: [addr], port } once /api/netinfo answered
let netLoading = null;

const LIVE_PATH = MASTER_URL;
const PRIVATE = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
const isPrivate = (a) => PRIVATE.some((re) => re.test(a));
const hostOf = (a) => (a.includes(':') ? `[${a}]` : a); // IPv6 literal in a URL

const flagQs = () => {
  const q = new URLSearchParams();
  if (flags.bg) q.set('bg', '0');
  if (flags.simple) q.set('mode', 'simple');
  return q.toString();
};
const withFlags = (path, base = location.origin) => {
  const q = flagQs();
  return q ? `${base}${path}${path.includes('?') ? '&' : '?'}${q}` : `${base}${path}`;
};
const lanUrl = (addr) => withFlags(LIVE_PATH, `${location.protocol}//${hostOf(addr)}:${net?.port ?? location.port}`);

export function mount(root) {
  const liveField = copyField(withFlags(LIVE_PATH), { open: true });
  liveField.classList.add('copy-field-lg');

  const tBg = ctlToggle({ value: flags.bg, label: t('help.flagBg') });
  const tSimple = ctlToggle({ value: flags.simple, label: t('help.flagSimple') });
  tBg.input.addEventListener('change', () => { flags.bg = tBg.get(); paintUrls(); });
  tSimple.input.addEventListener('change', () => { flags.simple = tSimple.get(); paintUrls(); });

  const livePanel = panel(t('help.liveTitle'),
    h('p.panel-sub', t('help.liveBody')),
    liveField,
    h('div.flag-row', h('span.field-label', t('help.flags')), tBg.el, tSimple.el),
    h('p.field-hint', t('help.flagsHint')));

  const obs = panel(t('help.obsTitle'), h('ol.steps', t('help.obsSteps').map((s) => h('li', s))));
  const vmix = panel(t('help.vmixStepsTitle'), h('ol.steps', t('help.vmixSteps').map((s) => h('li', s))));

  const sceneList = h('div.url-list');
  const scenePanel = panel(t('help.sceneTitle'), h('p.panel-sub', t('help.sceneBody')), sceneList);

  const vToday = copyField(`${location.origin}/api/vmix/data`, { open: true });
  const vTomorrow = copyField(`${location.origin}/api/vmix/data?day=tomorrow`, { open: true });
  const vmixData = panel(t('help.vmixTitle'), h('p.panel-sub', t('help.vmixBody')), vToday, vTomorrow);

  // Streaming PC on another computer: this PC's LAN URLs (from the server), firewall note.
  const lanList = h('div.lan-list', h('div.lan-loading', h('span.spinner'), h('span', t('common.loading'))));
  const lanOther = h('div.lan-other', { hidden: true });
  const firewall = h('p', t('help.lanFirewall', { port: location.port || '80' }));
  const lan = panel(t('help.lanTitle'),
    h('p.panel-sub', t('help.lanIntro')),
    lanList,
    lanOther,
    h('div.callout.lan-note', icon('info', 16), h('div',
      firewall,
      h('p.muted', t('help.lanCurrent', { host: location.host })))));

  const staticPanel = panel(t('help.staticTitle'), h('p.panel-sub', t('help.staticBody')),
    h('div.inline-row', h('a.btn.btn-sm', { href: '#/graphics' }, icon('graphics', 14), h('span', t('nav.graphics')))));

  root.append(sectionHead(t('help.title'), t('help.sub')),
    h('div.help-grid',
      h('div.col', livePanel, h('div.two-up', obs, vmix), scenePanel),
      h('div.col', vmixData, lan, staticPanel)));
  els = { liveField, sceneList, lanList, lanOther, firewall };
  update(store.state);
  loadNet();
}

/** Addresses can change (Wi-Fi switch, VPN on/off): re-ask the server each time the page is opened. */
export function show() {
  if (net) loadNet();
}

async function loadNet() {
  if (netLoading) return netLoading;
  netLoading = (async () => {
    let info = null;
    try { info = await api.get('/api/netinfo'); } catch { info = null; }
    const addrs = [...new Set((info?.addresses ?? []).filter((a) => typeof a === 'string' && a))];
    const priv = addrs.filter(isPrivate);
    const rest = addrs.filter((a) => !isPrivate(a));
    // No 192.168 / 10 / 172.16-31 address: the others are all we have, so they become the main list.
    net = priv.length ? { main: priv, other: rest } : { main: rest, other: [] };
    net.port = info?.port ?? (location.port || '80');
    net.ok = !!info;
    netLoading = null;
    paintLan();
  })();
  return netLoading;
}

function lanRow(addr) {
  const f = copyField(lanUrl(addr), { open: true });
  f._addr = addr;
  f.classList.add('lan-row');
  return f;
}

function paintLan() {
  if (!els || !net) return;
  els.firewall.textContent = t('help.lanFirewall', { port: net.port });
  if (!net.main.length) {
    // Server could not tell (or has no network): fall back to the ipconfig instruction.
    const port = location.port || (location.protocol === 'https:' ? '443' : '80');
    setKids(els.lanList, h('p.lan-fallback', t('help.lanBody', { host: location.hostname, port })));
  } else {
    keyedList(els.lanList, net.main, (a) => a, lanRow, (a) => a);
  }
  els.lanOther.hidden = !net.other.length;
  setKids(els.lanOther, net.other.length ? [
    h('span.lan-other-label', t('help.lanOther')),
    ...net.other.map((a) => {
      const b = h('button.btn.btn-sm.btn-ghost.lan-addr', { type: 'button' }, icon('copy', 12), h('span', a));
      b._addr = a;
      b.title = t('help.lanCopyAddr', { url: lanUrl(a) });
      b.addEventListener('click', async () => {
        const url = lanUrl(a);
        if (await copyText(url)) toast(`${t('common.copied')}: ${url}`, 'ok', { timeout: 1600 });
      });
      return b;
    }),
  ] : []);
  paintUrls();
}

function urlRow(c) {
  const path = sceneUrl(c.scene, c.params);
  const f = copyField(withFlags(path), { open: true });
  f._path = path;
  return h('div.url-row', { dataset: { path } },
    h('div.url-label', h('span.url-title', c.title), h('span.url-sub', c.sub)),
    f);
}

function paintUrls() {
  if (!els) return;
  els.liveField.setValue(withFlags(LIVE_PATH));
  for (const row of els.sceneList.children) {
    const f = row.querySelector('.copy-field');
    if (f?._path) f.setValue(withFlags(f._path));
  }
  for (const f of els.lanList.children) if (f._addr) f.setValue(lanUrl(f._addr));
  for (const b of els.lanOther.children) if (b._addr) b.title = t('help.lanCopyAddr', { url: lanUrl(b._addr) });
}

export function update(state) {
  if (!els || !state) return;
  const cards = quickCards(state);
  keyedList(els.sceneList, cards, (c) => c.key, urlRow, (c) => JSON.stringify([c.scene, c.params, c.title, c.sub]));
  paintUrls();
}
