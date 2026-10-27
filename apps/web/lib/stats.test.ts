import { describe, expect, it } from 'vitest';
import { computeStats, pickInsight, type StatsApplication, type StatsEvent } from './stats';

let n = 0;
/** One application plus its event log, from a list of [stage, ISO time] moves. */
function app(
  moves: Array<[StatsEvent['toStage'], string]>,
  over: Partial<StatsApplication> = {},
): { app: StatsApplication; events: StatsEvent[] } {
  const id = `a${++n}`;
  const applied = moves.find(([s]) => s === 'applied');
  return {
    app: { id, stage: moves.at(-1)![0], channel: null, appliedAt: applied ? applied[1] : null, band: null, ...over },
    events: moves.map(([toStage, at]) => ({ applicationId: id, toStage, at })),
  };
}

function run(list: Array<ReturnType<typeof app>>) {
  return computeStats(list.map((l) => l.app), list.flatMap((l) => l.events));
}

describe('computeStats', () => {
  it('counts the funnel from the event log, so a card moved back still counts', () => {
    const s = run([
      app([['saved', '2026-10-01T00:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z'], ['replied', '2026-10-04T12:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z'], ['interviewing', '2026-10-03T00:00:00Z'], ['applied', '2026-10-05T00:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z'], ['rejected', '2026-10-02T00:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z'], ['ghosted', '2026-10-20T00:00:00Z']]),
      app([['applied', '2026-10-01T00:00:00Z'], ['interviewing', '2026-10-08T00:00:00Z'], ['offer', '2026-10-15T00:00:00Z']]),
    ]);
    expect(s.tracked).toBe(7);
    expect(s.sent).toBe(6); // the saved-only card isn't sent
    expect(s.replied).toBe(4); // replied, interviewing (moved back), rejected, offer
    expect(s.interviewing).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.responseRate).toBeCloseTo(4 / 6);
    expect(s.interviewRate).toBeCloseTo(2 / 6);
    expect(s.avgDaysToReply).toBe(3.3); // 3, 2, 1, 7 → 3.25 → 3.3
  });

  it('a card dragged from Saved straight to Replied counts as sent, timed from that move', () => {
    const s = run([app([['saved', '2026-10-01T00:00:00Z'], ['replied', '2026-10-02T00:00:00Z']])]);
    expect(s.sent).toBe(1);
    expect(s.replied).toBe(1);
    expect(s.avgDaysToReply).toBe(0);
  });

  it('breaks down by fit band and channel, with missing values grouped', () => {
    const s = run([
      app([['applied', '2026-10-01T00:00:00Z'], ['replied', '2026-10-02T00:00:00Z']], { band: 'strong', channel: 'email' }),
      app([['applied', '2026-10-01T00:00:00Z']], { band: 'strong', channel: 'linkedin' }),
      app([['applied', '2026-10-01T00:00:00Z']], { band: null, channel: null }),
    ]);
    expect(s.byBand).toEqual([
      { key: 'strong', sent: 2, replied: 1, rate: 0.5 },
      { key: 'none', sent: 1, replied: 0, rate: 0 },
    ]);
    expect(s.byChannel.map((r) => r.key)).toEqual(['email', 'linkedin', 'unknown']);
  });

  it('gives no insight below 10 sent applications', () => {
    const s = run(Array.from({ length: 9 }, () => app([['applied', '2026-10-01T00:00:00Z']])));
    expect(s.insight).toBeNull();
    expect(s.avgDaysToReply).toBeNull();
  });
});

describe('pickInsight', () => {
  const base = { sent: 12, replied: 4, responseRate: 4 / 12, byChannel: [] };

  it('compares fit bands first', () => {
    const byBand = [
      { key: 'strong' as const, sent: 4, replied: 2, rate: 0.5 },
      { key: 'stretch' as const, sent: 8, replied: 1, rate: 0.125 },
    ];
    expect(pickInsight({ ...base, byBand })).toEqual({ kind: 'ratio', dimension: 'band', best: 'strong', worst: 'stretch', ratio: 4 });
  });

  it('says "none yet" when the weaker group has no replies', () => {
    const byBand = [
      { key: 'good' as const, sent: 3, replied: 1, rate: 1 / 3 },
      { key: 'long_shot' as const, sent: 5, replied: 0, rate: 0 },
    ];
    expect(pickInsight({ ...base, byBand })).toMatchObject({ kind: 'only', best: 'good', worst: 'long_shot' });
  });

  it('ignores small groups and the "no analysis" group, then falls back to channel, then the overall rate', () => {
    const byBand = [
      { key: 'strong' as const, sent: 2, replied: 2, rate: 1 },
      { key: 'none' as const, sent: 10, replied: 2, rate: 0.2 },
    ];
    const byChannel = [
      { key: 'email' as const, sent: 6, replied: 3, rate: 0.5 },
      { key: 'form' as const, sent: 6, replied: 1, rate: 1 / 6 },
    ];
    expect(pickInsight({ ...base, byBand, byChannel })).toMatchObject({ kind: 'ratio', dimension: 'channel', best: 'email', ratio: 3 });
    expect(pickInsight({ ...base, byBand, byChannel: [] })).toEqual({ kind: 'rate', rate: 4 / 12 });
  });

  it('no replies at all', () => {
    expect(pickInsight({ ...base, replied: 0, responseRate: 0, byBand: [] })).toEqual({ kind: 'no_replies', sent: 12 });
  });
});
