import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DATA, ROOT } from './util.js';
import { ROLES } from './remote-access.js';

const newKey = () => randomBytes(24).toString('base64url');
const backoff = [5000, 15000, 60000];

// Dependencies are injectable: lifecycle tests never launch a real tunnel or publish.
export function createRemoteManager({ file = path.join(DATA, 'remote.json'), fetcher = fetch, spawnChild = spawn,
  executable = path.join(ROOT, 'tools', 'cloudflared.exe'), schedule = setTimeout, cancel = clearTimeout } = {}) {
  let config, port, notify = () => {}, child = null, timer = null, generation = 0, attempts = 0, running = false, ownsTunnel = false;
  let state = { status: 'offline', message: '', tunnelUrl: null };
  let publications = Promise.resolve();

  function readConfig() {
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read remote access configuration.'); value = {}; }
    let changed = false;
    if (typeof value.enabled !== 'boolean') { value.enabled = false; changed = true; }
    value.keys ??= {};
    for (const role of ROLES) if (typeof value.keys[role] !== 'string' || !value.keys[role]) { value.keys[role] = newKey(); changed = true; }
    if (changed) save(value);
    config = value;
    return value;
  }
  function save(value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, file);
    config = value;
  }
  function remoteState() {
    const c = readConfig();
    const publicUrl = typeof c.workerUrl === 'string' ? c.workerUrl.replace(/\/+$/, '') : '';
    return { enabled: c.enabled, ...state, publicUrl, links: Object.fromEntries(ROLES.map(role =>
      [role, publicUrl ? `${publicUrl}${role === 'overlay' ? '/overlay/master.html' : '/control/'}?key=${encodeURIComponent(c.keys[role])}` : ''])) };
  }
  function set(update) { state = { ...state, ...update }; notify(remoteState()); }
  function publish(url) {
    const c = readConfig();
    const job = async () => {
      if (!c.workerUrl || !c.publishSecret) throw new Error('Remote access is not configured.');
      const response = await fetcher(`${c.workerUrl.replace(/\/+$/, '')}/__hll/origin`, { method: 'POST',
        headers: { authorization: `Bearer ${c.publishSecret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url, host: os.hostname() }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Could not publish the tunnel.');
    };
    const result = publications.then(job, job);
    publications = result.catch(() => {});
    return result;
  }
  const active = token => running && token === generation && readConfig().enabled;
  function retry(token, fn) {
    if (!active(token)) return;
    cancel(timer);
    timer = schedule(() => { timer = null; if (active(token)) void fn(); }, backoff[Math.min(attempts++, backoff.length - 1)]);
    timer?.unref?.();
  }
  async function publishTunnel(url, token) {
    if (!active(token)) return;
    try {
      await publish(url);
      if (active(token)) { attempts = 0; set({ status: 'online', message: '', tunnelUrl: url }); }
    } catch {
      if (!active(token)) return;
      set({ status: 'offline', message: 'Could not reach the online service. Retrying when the connection returns.' });
      retry(token, () => publishTunnel(url, token));
    }
  }
  async function launch(token) {
    if (!active(token)) return;
    ownsTunnel = true;
    set({ status: 'starting', message: '', tunnelUrl: null });
    try {
      if (!fs.existsSync(executable)) {
        const response = await fetcher('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error('download');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!active(token)) return;
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, bytes);
      }
      if (!active(token)) return;
      const proc = spawnChild(executable, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child = proc;
      let output = '', found = false, finished = false;
      const startupTimer = schedule(() => { if (!found && !finished) { proc.kill(); failed(); } }, 90000);
      startupTimer?.unref?.();
      const receive = bytes => {
        if (!active(token) || finished) return;
        output = (output + bytes.toString()).slice(-8192);
        const url = [...output.matchAll(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/gi)]
          .map(match => match[0]).find(value => new URL(value).hostname !== 'api.trycloudflare.com');
        if (url && !found) { found = true; cancel(startupTimer); set({ tunnelUrl: url }); void publishTunnel(url, token); }
      };
      proc.stderr?.on('data', receive);
      proc.stdout?.on('data', receive);
      const failed = () => {
        if (finished) return;
        finished = true;
        cancel(startupTimer);
        if (child === proc) child = null;
        if (!active(token)) return;
        // Invalidate any publication still in flight for the dead tunnel.
        generation++;
        cancel(timer);
        set({ status: 'error', message: 'The tunnel stopped. Restarting shortly.', tunnelUrl: null });
        void publish(null).catch(() => {});
        retry(generation, () => launch(generation));
      };
      proc.once('error', failed);
      proc.once('exit', failed);
    } catch {
      if (!active(token)) return;
      set({ status: 'offline', message: 'Could not start the tunnel. Check the internet connection. Retrying.' });
      retry(token, () => launch(token));
    }
  }
  function startRemote({ port: listenPort, onState = () => {} }) {
    port = listenPort; notify = onState;
    if (running) return remoteState();
    running = true;
    const c = readConfig();
    if (c.enabled) void launch(++generation);
    return remoteState();
  }
  async function clearOrigin(token) {
    try { await publish(null); if (token === generation && !running) set({ message: '' }); }
    catch {
      if (token !== generation || running) return;
      set({ status: 'offline', message: 'Could not mark the PC offline. The tunnel has stopped. Retrying.' });
      timer = schedule(() => { if (token === generation && !running) void clearOrigin(token); }, backoff[Math.min(attempts++, backoff.length - 1)]);
      timer?.unref?.();
    }
  }
  async function stopRemote() {
    running = false; generation++; cancel(timer); timer = null;
    const proc = child; child = null;
    // ChildProcess.kill targets only the pid spawned by this manager.
    if (proc?.pid) proc.kill();
    const hadTunnel = ownsTunnel || state.tunnelUrl || config?.enabled;
    ownsTunnel = false;
    set({ status: 'offline', message: '', tunnelUrl: null });
    if (hadTunnel) await clearOrigin(generation);
    return remoteState();
  }
  async function setRemoteEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw Object.assign(new Error('enabled must be a boolean'), { status: 400 });
    const c = readConfig();
    if (c.enabled === enabled && (enabled ? running : !child)) return remoteState();
    save({ ...c, enabled });
    if (!enabled) return stopRemote();
    running = true; attempts = 0;
    void launch(++generation);
    return remoteState();
  }
  function rotateKey(role) {
    if (!ROLES.includes(role)) throw Object.assign(new Error('Unknown access role'), { status: 400 });
    const c = readConfig();
    save({ ...c, keys: { ...c.keys, [role]: newKey() } });
    notify(remoteState());
    return remoteState();
  }
  return { startRemote, stopRemote, setRemoteEnabled, rotateKey, remoteState, accessKeys: () => ({ ...readConfig().keys }) };
}

const manager = createRemoteManager();
export const { startRemote, stopRemote, setRemoteEnabled, rotateKey, remoteState, accessKeys } = manager;
