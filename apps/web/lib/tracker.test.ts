import { describe, expect, it } from 'vitest';
import { addDays, columnOf, daysSince, groupByColumn, isFollowUpDue, positionBetween, topPosition, type TrackerItem } from './tracker';

const item = (over: Partial<TrackerItem>): TrackerItem => ({
  id: 'a',
  jobId: 'j',
  title: 'AI Engineer',
  company: 'Acme',
  url: null,
  stage: 'saved',
  position: 0,
  channel: null,
  appliedAt: null,
  lastContactAt: null,
  followUpDueAt: null,
  notes: null,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
  analysis: null,
  ...over,
});

describe('tracker model', () => {
  it('puts Rejected and Ghosted in the Closed column', () => {
    expect(columnOf('rejected')).toBe('closed');
    expect(columnOf('ghosted')).toBe('closed');
    expect(columnOf('interviewing')).toBe('interviewing');
  });

  it('a follow-up is due only for applied cards whose date has come', () => {
    const today = '2026-10-27';
    expect(isFollowUpDue({ stage: 'applied', followUpDueAt: '2026-10-27' }, today)).toBe(true);
    expect(isFollowUpDue({ stage: 'applied', followUpDueAt: '2026-10-20' }, today)).toBe(true);
    expect(isFollowUpDue({ stage: 'applied', followUpDueAt: '2026-10-28' }, today)).toBe(false);
    expect(isFollowUpDue({ stage: 'replied', followUpDueAt: '2026-10-20' }, today)).toBe(false);
    expect(isFollowUpDue({ stage: 'applied', followUpDueAt: null }, today)).toBe(false);
  });

  it('dates: addDays works on UTC days, daysSince never goes negative', () => {
    expect(addDays(new Date('2026-10-30T23:30:00Z'), 5)).toBe('2026-11-04');
    expect(daysSince('2026-10-20T12:00:00Z', new Date('2026-10-27T11:00:00Z'))).toBe(6);
    expect(daysSince('2026-10-28T00:00:00Z', new Date('2026-10-27T00:00:00Z'))).toBe(0);
  });

  it('positions: new cards go on top, dropped cards land between their neighbours', () => {
    expect(topPosition([])).toBe(0);
    expect(topPosition([{ position: 3 }, { position: -2 }])).toBe(-3);
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(undefined, 2)).toBe(1);
    expect(positionBetween(4, undefined)).toBe(5);
    expect(positionBetween(undefined, undefined)).toBe(0);
  });

  it('groups by column, sorted by position', () => {
    const g = groupByColumn([
      item({ id: '1', stage: 'applied', position: 2 }),
      item({ id: '2', stage: 'applied', position: -1 }),
      item({ id: '3', stage: 'ghosted' }),
    ]);
    expect(g.applied.map((i) => i.id)).toEqual(['2', '1']);
    expect(g.closed.map((i) => i.id)).toEqual(['3']);
    expect(g.saved).toEqual([]);
  });
});
