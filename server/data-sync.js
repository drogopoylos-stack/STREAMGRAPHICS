// Data sync between PCs: data/ is its own private git repository (STREAMGRAPHICS-data).
// After a change the data is uploaded once the program has been quiet for a short time.
// New data from another PC is downloaded at start (start.bat) and with "Get updates" (pull + reload).
// One PC at a time is the rule; if two PCs changed the data, this PC's version wins and the other
// version of db.json is kept in data/conflicts/ so nothing is lost.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { DATA } from './util.js';

const QUIET_MS = 60_000;      // upload after one minute without changes
const CHECK_MS = 10 * 60_000; // look for updates from other PCs every ten minutes
const MAX_WAIT_MS = 5 * 60_000; // upload at the latest five minutes after the first change (the sheet sync changes data often)

const state = { enabled: false, status: 'off', lastUpload: null, lastCheck: null, behind: 0, pending: false, message: '' };
let timer = null;
let firstChange = 0;
let running = null;
let notify = () => {};
let reloaded = () => {};

const git = (...args) => new Promise((resolve, reject) => {
  execFile('git', ['-C', DATA, ...args], { timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr: String(stderr || '') })); else resolve(String(stdout).trim());
  });
});

function set(patch) { Object.assign(state, patch); notify(syncState()); }
export function syncState() { return { ...state }; }
const offline = error => /could not resolve host|unable to access|failed to connect|timed out|network/i.test(`${error.stderr} ${error.message}`);

/** Commit local changes, merge what other PCs pushed, push. Safe to call at any time. */
async function upload(store) {
  store.saveNow();
  await git('add', '-A');
  const staged = await git('diff', '--cached', '--name-only');
  if (staged) await git('commit', '-q', '-m', `Sync from ${os.hostname()} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  await git('fetch', '-q', 'origin');
  const behind = Number(await git('rev-list', '--count', 'HEAD..@{u}').catch(() => '0'));
  let conflict = false;
  if (behind) {
    conflict = await mergeKeepingThisPc();
    // The file on disk now also has the other PC's changes: load it, or the next save would drop them.
    store.load();
    reloaded();
  }
  const ahead = Number(await git('rev-list', '--count', '@{u}..HEAD').catch(() => '1'));
  if (ahead) await git('push', '-q', 'origin', 'HEAD');
  set({ status: 'synced', pending: false, lastUpload: new Date().toISOString(), behind: 0,
    message: conflict ? 'Both PCs changed the same data. The version of this PC was kept; the other version is saved in data/conflicts/.' : '' });
}

/** Merge another PC's changes. Returns true when both PCs changed the same lines (a real conflict). */
async function mergeKeepingThisPc() {
  try {
    await git('merge', '-q', '--no-edit', '@{u}');
    return false;
  } catch {
    await git('merge', '--abort').catch(() => {});
  }
  // A real conflict: this PC's lines win, the other PC's db.json is kept in data/conflicts/ (not synced).
  const other = await git('show', '@{u}:db.json').catch(() => '');
  try { await git('merge', '-q', '--no-edit', '-X', 'ours', '@{u}'); } catch {
    await git('merge', '--abort').catch(() => {});
    await git('merge', '-q', '--no-edit', '-s', 'ours', '@{u}');
  }
  // A line merge can leave db.json unreadable; then keep this PC's file as it was.
  try { JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')); } catch {
    await git('checkout', 'HEAD^1', '--', 'db.json');
    await git('commit', '-q', '--amend', '--no-edit');
  }
  if (other) {
    const dir = path.join(DATA, 'conflicts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `db-other-pc-${Date.now()}.json`), other);
  }
  return true;
}

/** Sync jobs run one after the other: git must never run twice at the same time in data/. */
function run(store, job) {
  running = (running || Promise.resolve()).then(async () => {
    set({ status: 'syncing' });
    try { await job(); } catch (error) {
      set({ status: offline(error) ? 'offline' : 'error', message: offline(error) ? 'No internet: the data uploads when the connection is back.' : (error.stderr || error.message).slice(0, 300) });
    }
  });
  return running;
}

/** Start: watch for changes. Does nothing when data/ is not a git repository. */
export function startDataSync(store, onState = () => {}, onReload = () => {}) {
  notify = onState; reloaded = onReload;
  if (!fs.existsSync(path.join(DATA, '.git'))) return;
  set({ enabled: true, status: 'synced' });
  store.onChange(() => {
    if (!state.pending) set({ pending: true });
    firstChange ||= Date.now();
    clearTimeout(timer);
    const wait = Math.max(0, Math.min(QUIET_MS, firstChange + MAX_WAIT_MS - Date.now()));
    timer = setTimeout(() => { firstChange = 0; run(store, () => upload(store)); }, wait);
  });
  const check = () => run(store, async () => {
    await git('fetch', '-q', 'origin');
    const behind = Number(await git('rev-list', '--count', 'HEAD..@{u}').catch(() => '0'));
    set({ status: 'synced', behind, lastCheck: new Date().toISOString() });
  });
  check();
  setInterval(check, CHECK_MS).unref();
}

/** "Sync now": upload this PC's changes, then download the other PC's and reload the database. */
export function syncNow(store) {
  if (!state.enabled) return Promise.resolve(syncState());
  clearTimeout(timer);
  firstChange = 0;
  return run(store, async () => {
    await upload(store);
    store.load();
    reloaded();
    set({ behind: 0 });
  }).then(syncState);
}
