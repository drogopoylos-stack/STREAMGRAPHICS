export const STREAM_WAIT_MS = 5000;
export const LIVE_POLL_MS = 2000;

/** An open HTTP connection alone does not mean SSE bytes are reaching us. */
export function needsLivePolling({ startedAt, received = false, failed = false }, now) {
  return failed || (!received && now - startedAt >= STREAM_WAIT_MS);
}

/** Shared by master/live, fixed scenes and the panel. No DOM dependencies. */
export function subscribeLive({ onLive, onState, onEvent, onConnection } = {}, runtime = globalThis) {
  const health = { startedAt: runtime.Date.now(), received: false, failed: false };
  let source, reconnect, pollTimer, requestTimer, controller;
  let stopped = false, fetching = false, epoch = 0, lastDataRev;
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
      if (!bootstrap && (dataRev === undefined || dataRev !== lastDataRev)) onState?.(dataRev === undefined ? { polling: true } : { polling: true, rev: dataRev });
      lastDataRev = dataRev;
    } catch { /* Retain the last scene and retry on the next poll. */ }
    finally {
      runtime.clearTimeout(requestTimer);
      controller = null;
      fetching = false;
    }
  }

  function poll() {
    if (!fallback() || stopped) return;
    onConnection?.(false);
    void snapshot();
    pollTimer ??= runtime.setInterval(() => void snapshot(), LIVE_POLL_MS);
  }

  function delivered(type, event) {
    let value;
    try { value = JSON.parse(event.data || '{}'); } catch { return; }
    epoch++;
    health.received = true;
    health.failed = false;
    runtime.clearInterval(pollTimer); pollTimer = null;
    onConnection?.(true);
    if (type === 'live') onLive?.(value);
    if (type === 'state') onState?.(value);
    onEvent?.(type, value);
  }

  function open() {
    if (stopped) return;
    try {
      source = new runtime.EventSource('/api/live/stream');
      for (const type of ['live', 'state', 'sync', 'remote']) {
        source.addEventListener(type, event => delivered(type, event));
      }
      source.onerror = () => {
        health.failed = true;
        poll();
        if (source.readyState === 2) {
          source.close();
          reconnect = runtime.setTimeout(open, 3000);
        }
      };
    } catch {
      health.failed = true;
      poll();
      reconnect = runtime.setTimeout(open, 3000);
    }
  }

  // Render immediately even when the SSE connection never produces its first event.
  void snapshot(true);
  open();
  const watchdog = runtime.setTimeout(poll, STREAM_WAIT_MS);
  return () => {
    stopped = true;
    source?.close();
    controller?.abort();
    runtime.clearTimeout(watchdog);
    runtime.clearTimeout(reconnect);
    runtime.clearTimeout(requestTimer);
    runtime.clearInterval(pollTimer);
  };
}
