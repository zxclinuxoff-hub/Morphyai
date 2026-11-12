export type BackgroundJob =
  | { id: string; status: "running"; updatedAt: number }
  | { id: string; status: "completed"; updatedAt: number; content: string }
  | { id: string; status: "failed"; updatedAt: number; error: string };

const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_JOBS = 4;
const MAX_SAVED_JOBS = 30;

declare global {
  // Keep jobs available across Next.js development hot reloads.
  var __morphyBackgroundJobs: Map<string, BackgroundJob> | undefined;
}

const jobs = (globalThis.__morphyBackgroundJobs ??= new Map<string, BackgroundJob>());

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }

  const completed = [...jobs.values()]
    .filter((job) => job.status !== "running")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const job of completed.slice(MAX_SAVED_JOBS)) jobs.delete(job.id);
}

export function createBackgroundJob(id: string): boolean {
  pruneJobs();
  if (jobs.has(id) || [...jobs.values()].filter((job) => job.status === "running").length >= MAX_ACTIVE_JOBS) {
    return false;
  }
  jobs.set(id, { id, status: "running", updatedAt: Date.now() });
  return true;
}

export function completeBackgroundJob(id: string, content: string): void {
  if (jobs.has(id)) jobs.set(id, { id, status: "completed", content, updatedAt: Date.now() });
  pruneJobs();
}

export function failBackgroundJob(id: string, error: string): void {
  if (jobs.has(id)) jobs.set(id, { id, status: "failed", error, updatedAt: Date.now() });
  pruneJobs();
}

export function getBackgroundJob(id: string): BackgroundJob | undefined {
  pruneJobs();
  return jobs.get(id);
}
