// Background job tracking: poll GET /api/jobs/:id every 700 ms while running.
import { api } from './api.js';
import { store } from './store.js';

const jobs = new Map(); // id → Job
const watchers = new Map(); // id → Set<fn>
const anyWatchers = new Set();
const finishWatchers = new Set();
let timer = null;

function notify(id) {
  const job = jobs.get(id);
  for (const fn of watchers.get(id) ?? []) fn(job);
  for (const fn of anyWatchers) fn(job);
}

function ensureLoop() {
  if (timer) return;
  timer = setInterval(tick, 700);
}

async function tick() {
  const running = [...jobs.values()].filter((j) => j.status === 'running' && !j._gone);
  if (!running.length) { clearInterval(timer); timer = null; return; }
  await Promise.all(running.map(async (j) => {
    try {
      const fresh = await api.get(`/api/jobs/${encodeURIComponent(j.id)}`);
      const was = j.status;
      jobs.set(j.id, fresh);
      notify(j.id);
      if (was === 'running' && fresh.status !== 'running') {
        for (const fn of finishWatchers) fn(fresh);
        store.refresh();
      }
    } catch (e) {
      if (e.status === 404) { j._gone = true; j.status = 'error'; j.message = 'Job not found (server restarted?)'; notify(j.id); }
    }
  }));
}

/** Start tracking a job returned by the server. */
export function trackJob(job) {
  if (!job?.id) return job;
  const cur = jobs.get(job.id);
  // Keep the richer (full-log) version we polled ourselves.
  if (!cur || (cur.status === 'running' && job.status !== 'running') || (job.log?.length ?? 0) >= (cur.log?.length ?? 0)) {
    jobs.set(job.id, { ...cur, ...job });
  }
  if (jobs.get(job.id).status === 'running') ensureLoop();
  notify(job.id);
  return jobs.get(job.id);
}

/** Merge the job list from /api/state (running ones get polled). */
export function syncJobs(list = []) {
  for (const j of list) {
    const cur = jobs.get(j.id);
    if (!cur) { jobs.set(j.id, j); if (j.status === 'running') ensureLoop(); notify(j.id); }
    else if (cur.status === 'running' && j.status !== 'running') trackJob(j);
  }
}

export function getJob(id) { return jobs.get(id) ?? null; }

export function allJobs() {
  return [...jobs.values()].sort((a, b) => (b.started ?? 0) - (a.started ?? 0));
}

/** Newest job of a kind (running first). */
export function latestJob(kind) {
  const list = allJobs().filter((j) => j.kind === kind);
  return list.find((j) => j.status === 'running') ?? list[0] ?? null;
}

export function watchJob(id, fn) {
  if (!watchers.has(id)) watchers.set(id, new Set());
  watchers.get(id).add(fn);
  return () => watchers.get(id)?.delete(fn);
}

export function onAnyJob(fn) { anyWatchers.add(fn); return () => anyWatchers.delete(fn); }
export function onJobFinished(fn) { finishWatchers.add(fn); return () => finishWatchers.delete(fn); }
