import { MASTER_URL } from './scenes.js';

export const OBS_LINK_NOTE = 'Ask the broadcaster for the OBS link';

/** Only accept the role-specific keyed link supplied by the API. */
function keyedOverlay(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.pathname === MASTER_URL && url.searchParams.get('key') ? url.href : null;
  } catch { return null; }
}

export function masterLinks({ origin, access, remote, overlayUrl } = {}) {
  const local = access?.remote === false;
  const online = keyedOverlay(local ? (remote?.enabled ? remote.links?.overlay : null) : overlayUrl);
  if (local) return { rows: [
    { label: 'This PC / same network', url: new URL(MASTER_URL, origin).href },
    ...(online ? [{ label: 'Online (other networks)', url: online }] : []),
  ], note: '' };
  return { rows: online ? [{ label: 'Online (other networks)', url: online }] : [], note: online ? '' : OBS_LINK_NOTE };
}

/** A panel monitor must keep the panel's origin and authentication cookie. */
export function overlayMonitorUrl(value = MASTER_URL) {
  const url = new URL(value, 'http://local');
  url.searchParams.delete('key');
  return url.pathname + url.search;
}
