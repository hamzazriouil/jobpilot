import type { FitBand } from '@jobpilot/core/schemas';

// Tracker model shared by /tracker, the job page panel, the API routes and /stats (docs/03-UI-UX.md
// §4.8, docs/02-DATABASE.md `applications`). Pure and client-safe.

export const STAGES = ['saved', 'applied', 'replied', 'interviewing', 'offer', 'rejected', 'ghosted'] as const;
export type Stage = (typeof STAGES)[number];

/** Kanban columns: "Closed" holds Rejected and Ghosted. */
export const COLUMNS = ['saved', 'applied', 'replied', 'interviewing', 'offer', 'closed'] as const;
export type Column = (typeof COLUMNS)[number];

export const CHANNELS = ['email', 'linkedin', 'x', 'form', 'referral', 'other'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Stages that mean the company answered (a rejection is an answer too). */
export const RESPONSE_STAGES: ReadonlySet<Stage> = new Set(['replied', 'interviewing', 'offer', 'rejected']);
/** Days until a follow-up is due after applying, and after each follow-up sent. */
export const FOLLOW_UP_DAYS = 5;
export const NOTES_MAX = 2000;

export function columnOf(stage: Stage): Column {
  return stage === 'rejected' || stage === 'ghosted' ? 'closed' : stage;
}

/** One tracked job as the UI needs it. Dates are ISO strings; `followUpDueAt` is a YYYY-MM-DD date. */
export interface TrackerItem {
  id: string;
  jobId: string;
  title: string;
  company: string | null;
  url: string | null;
  stage: Stage;
  position: number;
  channel: Channel | null;
  appliedAt: string | null;
  lastContactAt: string | null;
  followUpDueAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  analysis: { score: number; band: FitBand } | null;
}

/** An `applications` row as PostgREST returns it. */
export interface ApplicationRow {
  id: string;
  job_id: string;
  stage: Stage;
  position: number;
  channel: Channel | null;
  applied_at: string | null;
  last_contact_at: string | null;
  follow_up_due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const APPLICATION_COLUMNS =
  'id, job_id, stage, position, channel, applied_at, last_contact_at, follow_up_due_at, notes, created_at, updated_at';

/** The fields of a TrackerItem that come from the applications row. */
export type ApplicationFields = Omit<TrackerItem, 'title' | 'company' | 'url' | 'analysis'>;

export function fromApplicationRow(r: ApplicationRow): ApplicationFields {
  return {
    id: r.id,
    jobId: r.job_id,
    stage: r.stage,
    position: r.position,
    channel: r.channel,
    appliedAt: r.applied_at,
    lastContactAt: r.last_contact_at,
    followUpDueAt: r.follow_up_due_at,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Applied, no answer yet, and the follow-up date (UTC day) has come. */
export function isFollowUpDue(item: Pick<TrackerItem, 'stage' | 'followUpDueAt'>, today: string): boolean {
  return item.stage === 'applied' && item.followUpDueAt !== null && item.followUpDueAt <= today;
}

/** YYYY-MM-DD `days` after the UTC day of `from`. */
export function addDays(from: Date, days: number): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days)).toISOString().slice(0, 10);
}

/** Whole UTC days from `iso` to `now` (never negative). */
export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Column order: lowest position first. New and moved cards get a position below the current top. */
export function byPosition(a: Pick<TrackerItem, 'position' | 'updatedAt'>, b: Pick<TrackerItem, 'position' | 'updatedAt'>): number {
  return a.position - b.position || b.updatedAt.localeCompare(a.updatedAt);
}

export function topPosition(column: Array<Pick<TrackerItem, 'position'>>): number {
  return column.length === 0 ? 0 : Math.min(...column.map((c) => c.position)) - 1;
}

/** Position for a card dropped between `before` and `after` (either may be missing). */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** Groups items into the kanban columns, each sorted by position. */
export function groupByColumn(items: TrackerItem[]): Record<Column, TrackerItem[]> {
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as TrackerItem[]])) as Record<Column, TrackerItem[]>;
  for (const it of items) out[columnOf(it.stage)].push(it);
  for (const c of COLUMNS) out[c].sort(byPosition);
  return out;
}
