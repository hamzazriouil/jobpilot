import { z } from 'zod';
import type { IngestDb } from './db';
import type { GetJson } from './http';
import { errorText, type LogFn } from './log';

// Source status syncs, run by the daily maintenance cron after run_maintenance.
//
// Jobicy (docs/10-SOURCES.md §Jobicy): their terms ask integrations to keep listings current. The
// free batch status endpoint takes up to 100 ids; a job is hidden only on an explicit "closed"
// ("unknown" is left alone, as their docs say). Oldest jobs are checked first. Subrequests: 1 read +
// up to JOBICY_STATUS_MAX_BATCHES × (1 status call + at most 1 update), within the Workers Free 50.

export const JOBICY_STATUS_API = 'https://jobicy.com/api/jobs/status';
export const JOBICY_STATUS_BATCH = 100;
export const JOBICY_STATUS_MAX_BATCHES = 15;

const StatusResponse = z.object({
  jobs: z.array(z.object({ id: z.union([z.number(), z.string()]).transform(String), status: z.string() })),
});

export interface StatusSyncResult {
  checked: number;
  closed: number;
  failedBatches: number;
}

export async function jobicyStatusSync(deps: { db: IngestDb; getJson: GetJson; log: LogFn }, maxBatches = JOBICY_STATUS_MAX_BATCHES): Promise<StatusSyncResult> {
  const result: StatusSyncResult = { checked: 0, closed: 0, failedBatches: 0 };
  const live = await deps.db.liveSourceJobs('jobicy', maxBatches * JOBICY_STATUS_BATCH);
  for (let i = 0; i < live.length; i += JOBICY_STATUS_BATCH) {
    const batch = live.slice(i, i + JOBICY_STATUS_BATCH);
    const byJobicyId = new Map(batch.map((j) => [j.source_job_id, j.id]));
    try {
      const ids = [...byJobicyId.keys()].map(encodeURIComponent).join(',');
      const res = StatusResponse.parse(await deps.getJson(`${JOBICY_STATUS_API}?ids=${ids}`));
      result.checked += batch.length;
      const closed = res.jobs.filter((j) => j.status === 'closed').flatMap((j) => byJobicyId.get(j.id) ?? []);
      result.closed += await deps.db.expireJobs(closed);
    } catch (err) {
      result.failedBatches++;
      deps.log('status_sync_error', { source: 'jobicy', error: errorText(err) });
      // A 429 or an outage would hit every later batch too: try again tomorrow.
      break;
    }
  }
  return result;
}
