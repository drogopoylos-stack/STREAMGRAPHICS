import { newId } from './util.js';
import { activeId } from './db.js';

const jobs = new Map();

/** Run `fn(job)` in the background and return the job record at once. */
export function startJob(kind, fn) {
  const job = { id: newId('j'), tournamentId: activeId(), kind, status: 'running', progress: 0, message: 'Starting…', log: [], result: null, started: Date.now() };
  jobs.set(job.id, job);
  const api = {
    progress(p, message) { job.progress = Math.max(0, Math.min(1, p)); if (message) job.message = message; },
    log(line) { job.log.push(line); if (job.log.length > 400) job.log.shift(); job.message = line; },
  };
  Promise.resolve()
    .then(() => fn(api))
    .then((result) => { job.status = 'done'; job.progress = 1; job.result = result ?? null; job.message = 'Done'; })
    .catch((err) => { job.status = 'error'; job.message = err?.message ?? String(err); job.log.push(`ERROR: ${job.message}`); console.error(`[job ${kind}]`, err); });
  return job;
}

export function getJob(id) {
  return jobs.get(id) ?? null;
}

export function listJobs({ all = false } = {}) {
  return [...jobs.values()].filter(j => all || j.tournamentId === activeId()).sort((a, b) => b.started - a.started).slice(0, 20);
}

export function jobsRunning() { return [...jobs.values()].some(j => j.status === 'running'); }
