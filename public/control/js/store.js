// App state: GET /api/state + SSE /api/live/stream. Listeners: 'state', 'live', 'conn'.
import { api } from './api.js';

const listeners = { state: new Set(), live: new Set(), conn: new Set() };

export const store = {
  state: null,
  live: { scene: null, params: {}, visible: false, rev: -1 },
  connected: false,
  loadError: null,
  idx: { teams: new Map(), players: new Map(), matches: new Map(), sponsors: new Map(), features: new Map() },

  on(evt, fn) {
    listeners[evt].add(fn);
    return () => listeners[evt].delete(fn);
  },

  team(id) { return id == null ? null : this.idx.teams.get(id) ?? null; },
  player(id) { return id == null ? null : this.idx.players.get(id) ?? null; },
  match(id) { return id == null ? null : this.idx.matches.get(id) ?? null; },
  feature(id) { return id == null ? null : this.idx.features.get(id) ?? null; },
  sponsor(id) { return id == null ? null : this.idx.sponsors.get(id) ?? null; },

  /** Fetch the full state now (coalesces concurrent calls). */
  load,
  /** Debounced reload — call after writes / on SSE `state`. */
  refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(load, 120);
  },
};

let refreshTimer = null;
let inflight = null;
let again = false;

async function load() {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    try {
      const s = await api.get('/api/state');
      store.state = s;
      store.loadError = null;
      for (const k of Object.keys(store.idx)) store.idx[k] = new Map((s[k] ?? []).map((x) => [x.id, x]));
      emit('state', s);
      if (s.live && (s.live.rev ?? 0) >= (store.live.rev ?? -1)) setLive(s.live);
    } catch (e) {
      store.loadError = e;
      emit('state', store.state);
      throw e;
    } finally {
      inflight = null;
    }
  })();
  const p = inflight;
  try { await p; } finally {
    if (again) { again = false; store.refresh(); }
  }
  return p;
}

function setLive(live) {
  const prev = store.live;
  store.live = live;
  if (JSON.stringify(prev) !== JSON.stringify(live)) emit('live', live);
}

function emit(evt, data) {
  for (const fn of listeners[evt]) {
    try { fn(data); } catch (e) { console.error(`[${evt} listener]`, e); }
  }
}

function setConn(ok) {
  if (store.connected === ok) return;
  store.connected = ok;
  emit('conn', ok);
}

export function connectStream() {
  const es = new EventSource('/api/live/stream');
  es.addEventListener('open', () => {
    const wasDown = !store.connected;
    setConn(true);
    if (wasDown && store.state) store.refresh();
  });
  es.addEventListener('error', () => setConn(false));
  es.addEventListener('state', () => store.refresh());
  es.addEventListener('live', (ev) => {
    try { setLive(JSON.parse(ev.data)); } catch { /* ignore */ }
  });
  return es;
}
