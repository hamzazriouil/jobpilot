import { describe, expect, it, vi } from 'vitest';
import type { IngestDb } from '../src/db';
import { silentLog } from '../src/log';
import { JOBICY_STATUS_BATCH, jobicyStatusSync } from '../src/maintenance';

function fakeDb(live: Array<{ id: string; source_job_id: string }>) {
  const expired: string[][] = [];
  const db = {
    liveSourceJobs: vi.fn(async (_source: string, max: number) => live.slice(0, max)),
    expireJobs: vi.fn(async (ids: string[]) => {
      if (ids.length) expired.push(ids);
      return ids.length;
    }),
  } as unknown as IngestDb;
  return { db, expired };
}

const live = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `uuid-${i}`, source_job_id: String(1000 + i) }));

describe('jobicyStatusSync', () => {
  it('checks stored ids in batches of 100 and expires only explicit "closed" ones', async () => {
    const { db, expired } = fakeDb(live(150));
    const getJson = vi.fn(async (url: string) => {
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return { jobs: ids.map((id) => ({ id: Number(id), status: id === '1001' ? 'closed' : id === '1120' ? 'unknown' : 'active' })) };
    });
    const res = await jobicyStatusSync({ db, getJson, log: silentLog });
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(getJson.mock.calls[0]![0]).toMatch(/^https:\/\/jobicy\.com\/api\/jobs\/status\?ids=1000,1001,/);
    expect(new URL(getJson.mock.calls[0]![0]).searchParams.get('ids')!.split(',')).toHaveLength(JOBICY_STATUS_BATCH);
    expect(expired).toEqual([['uuid-1']]);
    expect(res).toEqual({ checked: 150, closed: 1, failedBatches: 0 });
  });

  it('stops at the first failing batch (rate limit or outage) and caps the batches', async () => {
    const { db } = fakeDb(live(250));
    const getJson = vi.fn(async () => {
      throw new Error('HTTP 429');
    });
    expect(await jobicyStatusSync({ db, getJson, log: silentLog })).toEqual({ checked: 0, closed: 0, failedBatches: 1 });
    expect(getJson).toHaveBeenCalledTimes(1);

    const capped = fakeDb(live(250));
    await jobicyStatusSync({ db: capped.db, getJson: vi.fn(async () => ({ jobs: [] })), log: silentLog }, 2);
    expect(capped.db.liveSourceJobs).toHaveBeenCalledWith('jobicy', 200);
  });
});
