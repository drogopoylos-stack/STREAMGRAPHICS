export const STREAM_WAIT_MS = 5000;
export const LIVE_POLL_MS = 2000;
/** The server sends a visible `ping` event every 15 s: a stream silent for longer has stalled. */
export const STREAM_STALL_MS = 20000;
const WATCH_MS = 2500;

/** An open HTTP connection alone does not mean SSE bytes are reaching us. */
export function needsLivePolling({ startedAt, received = false, failed = false, lastEventAt }, now) {
  if (failed) return true;
  if (!received) return now - startedAt >= STREAM_WAIT_MS;
  return lastEventAt !== undefined && now - lastEventAt >= STREAM_STALL_MS;
}

/** Shared by master/live, fixed scenes and the panel. No DOM dependencies. */
export function subscribeLive({ onLive, onState, onEvent, onConnection, pollMs = LIVE_POLL_MS } = {}, runtime = globalThis) {
  const health = { startedAt: runtime.Date.now(), received: false, failed: false, lastEventAt: undefined };
  let source, reconnect, pollTimer, requestTimer, controller;
  let stopped = false, fetching = false, epoch = 0, lastDataRev, lastLiveRev, up;
  const connection = ok => { if (up !== ok) { up = ok; onConnection?.(ok); } };
  const fallback = () => needsLivePolling(health, runtime.Date.now());

  async function snapshot(bootstrap = false) {
    if (stopped || fetching || (!bootstrap && !fallback())) return;
    fetching = true;
    const version = epoch;
    controller = new AbortController();
    requestTimer = runtime.setTimeout(() => controller?.abort(), 10000);
    try {
      const response = await runtime.fetch('/api/live', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const live = await response.json();
      // A stream event supersedes an older HTTP snapshot, including across tournaments.
      if (stopped || epoch !== version || (!bootstrap && !fallback())) return;
      const { dataRev, ...value } = live;
      onLive?.(value);
      // Scene data can change without a live rev: reload it only when the database revision moved.
      // A take also moves the database revision, but onLive has already rebuilt the scene then.
      const tookOver = lastLiveRev !== undefined && value.rev !== lastLiveRev;
      if (!bootstrap && !tookOver && (dataRev === undefined || dataRev !== lastDataRev)) onState?.(dataRev === undefined ? { polling: true } : { polling: true, rev: dataRev });
      lastDataRev = dataRev;
      lastLiveRev = value.rev;
    } catch { /* Retain the last scene and retry on the next poll. */ }
    finally {
      runtime.clearTimeout(requestTimer);
      controller = null;
      fetching = false;
    }
  }

  function poll() {
    if (!fallback() || stopped || pollTimer) return; // already polling: the interval does the work
    connection(false);
    void snapshot();
    pollTimer ??= runtime.setInterval(() => void snapshot(), pollMs);
  }

  function stopPolling() {
    if (pollTimer !== null && pollTimer !== undefined) { runtime.clearInterval(pollTimer); pollTimer = null; }
    connection(true);
  }

  function delivered(type, event) {
    let value;
    try { value = JSON.parse(event.data || '{}'); } catch { return; }
    epoch++;
    health.received = true;
    health.failed = false;
    health.lastEventAt = runtime.Date.now();
    if (type === 'ping') return void stopPolling();
    stopPolling();
    if (type === 'live') onLive?.(value);
    if (type === 'state') onState?.(value);
    onEvent?.(type, value);
  }

  function scheduleReconnect() {
    if (stopped || reconnect) return; // one pending reconnect at a time
    reconnect = runtime.setTimeout(() => { reconnect = null; open(); }, 3000);
  }

  function open() {
    if (stopped) return;
    try {
      const es = new runtime.EventSource('/api/live/stream');
      source = es;
      for (const type of ['live', 'state', 'sync', 'remote', 'ping']) {
        es.addEventListener(type, event => { if (es === source) delivered(type, event); });
      }
      es.onerror = () => {
        if (es !== source) { es.close(); return; } // a superseded stream: never touch the current one
        health.failed = true;
        poll();
        if (es.readyState === 2) {
          es.close();
          scheduleReconnect();
        }
      };
    } catch {
      health.failed = true;
      poll();
      scheduleReconnect();
    }
  }

  // Render immediately even when the SSE connection never produces its first event.
  void snapshot(true);
  open();
  // Watches for a stream that never starts, and for one that goes silent after it started.
  const watchdog = runtime.setInterval(poll, WATCH_MS);
  return () => {
    stopped = true;
    source?.close();
    controller?.abort();
    runtime.clearInterval(watchdog);
    runtime.clearTimeout(reconnect);
    runtime.clearTimeout(requestTimer);
    runtime.clearInterval(pollTimer);
  };
}
