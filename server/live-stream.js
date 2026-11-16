// Keep SSE framing and proxy headers testable without opening a socket.
export function startLiveStream(res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'Content-Encoding': 'identity',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  // Harmless SSE comment: nudges proxies with small initial write buffers.
  res.write(`:${' '.repeat(2048)}\n\n`);
}

export const LIVE_HEARTBEAT_MS = 15000;
