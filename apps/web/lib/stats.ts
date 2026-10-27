import type { FitBand } from '@jobpilot/core/schemas';
import { RESPONSE_STAGES, type Channel, type Stage } from './tracker';

// Funnel stats for /stats and GET /api/stats (docs/03-UI-UX.md §4.9, PRD F1.9). Pure: computed from
// the user's applications and their stage-change log (`application_events`), never by an LLM.
//
// Definitions (shown on the page):
// - Sent: the application reached any stage after Saved.
// - Replied: it reached Replied, Interviewing, Offer or Rejected (a rejection is an answer).
// - Interviewing: it reached Interviewing or Offer.
// - Days to reply: from applied_at (or the first move out of Saved) to the first answer.
// "Reached" uses the event log plus the current stage, so a card moved back still counts.

export const STATS_MIN_APPLICATIONS = 10;
/** Groups smaller than this are left out of the insight line (too few to compare). */
export const INSIGHT_MIN_GROUP = 3;

export interface StatsApplication {
  id: string;
  stage: Stage;
  channel: Channel | null;
  appliedAt: string | null;
  band: FitBand | null;
}

export interface StatsEvent {
  applicationId: string;
  toStage: Stage;
  at: string;
}

export interface RateRow<K extends string> {
  key: K;
  sent: number;
  replied: number;
  /** replied / sent, 0..1 */
  rate: number;
}

export type BandKey = FitBand | 'none';
export type ChannelKey = Channel | 'unknown';

export interface Stats {
  tracked: number;
  sent: number;
  replied: number;
  interviewing: number;
  offers: number;
  responseRate: number;
  interviewRate: number;
  /** Average whole-day wait for a first answer, one decimal; null when nothing was answered yet. */
  avgDaysToReply: number | null;
  byBand: RateRow<BandKey>[];
  byChannel: RateRow<ChannelKey>[];
  insight: Insight | null;
}

export type Insight =
  | { kind: 'ratio'; dimension: 'band' | 'channel'; best: string; worst: string; ratio: number }
  | { kind: 'only'; dimension: 'band' | 'channel'; best: string; worst: string; bestRate: number }
  | { kind: 'no_replies'; sent: number }
  | { kind: 'rate'; rate: number };

const BAND_ORDER: BandKey[] = ['strong', 'good', 'stretch', 'long_shot', 'none'];
const CHANNEL_ORDER: ChannelKey[] = ['email', 'linkedin', 'x', 'form', 'referral', 'other', 'unknown'];

export function computeStats(apps: StatsApplication[], events: StatsEvent[]): Stats {
  const byApp = new Map<string, StatsEvent[]>();
  for (const e of events) byApp.set(e.applicationId, [...(byApp.get(e.applicationId) ?? []), e]);

  let sent = 0;
  let replied = 0;
  let interviewing = 0;
  let offers = 0;
  const waits: number[] = [];
  const bands = new Map<BandKey, { sent: number; replied: number }>();
  const channels = new Map<ChannelKey, { sent: number; replied: number }>();

  for (const app of apps) {
    const evs = (byApp.get(app.id) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
    const reached = new Set<Stage>([app.stage, ...evs.map((e) => e.toStage)]);
    const isSent = app.appliedAt !== null || [...reached].some((s) => s !== 'saved');
    if (!isSent) continue;
    sent++;
    const answered = [...reached].some((s) => RESPONSE_STAGES.has(s));
    if (answered) replied++;
    if (reached.has('interviewing') || reached.has('offer')) interviewing++;
    if (reached.has('offer')) offers++;

    if (answered) {
      const start = app.appliedAt ?? evs.find((e) => e.toStage !== 'saved')?.at ?? null;
      const firstAnswer = evs.find((e) => RESPONSE_STAGES.has(e.toStage))?.at ?? null;
      if (start && firstAnswer) waits.push(Math.max(0, Math.floor((Date.parse(firstAnswer) - Date.parse(start)) / 86_400_000)));
    }

    const bump = <K>(m: Map<K, { sent: number; replied: number }>, k: K) => {
      const row = m.get(k) ?? { sent: 0, replied: 0 };
      row.sent++;
      if (answered) row.replied++;
      m.set(k, row);
    };
    bump(bands, app.band ?? 'none');
    bump(channels, app.channel ?? 'unknown');
  }

  const rows = <K extends string>(m: Map<K, { sent: number; replied: number }>, order: K[]): RateRow<K>[] =>
    order.filter((k) => m.has(k)).map((k) => {
      const r = m.get(k)!;
      return { key: k, sent: r.sent, replied: r.replied, rate: r.replied / r.sent };
    });

  const byBand = rows(bands, BAND_ORDER);
  const byChannel = rows(channels, CHANNEL_ORDER);
  const stats: Stats = {
    tracked: apps.length,
    sent,
    replied,
    interviewing,
    offers,
    responseRate: sent ? replied / sent : 0,
    interviewRate: sent ? interviewing / sent : 0,
    avgDaysToReply: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null,
    byBand,
    byChannel,
    insight: null,
  };
  stats.insight = sent >= STATS_MIN_APPLICATIONS ? pickInsight(stats) : null;
  return stats;
}

/** One plain-English finding, chosen by rules: fit band first, then channel, then the overall rate. */
export function pickInsight(s: Pick<Stats, 'sent' | 'replied' | 'responseRate' | 'byBand' | 'byChannel'>): Insight {
  if (s.replied === 0) return { kind: 'no_replies', sent: s.sent };
  const compare = (dimension: 'band' | 'channel', list: RateRow<string>[]): Insight | null => {
    const groups = list.filter((r) => r.sent >= INSIGHT_MIN_GROUP && r.key !== 'none' && r.key !== 'unknown');
    if (groups.length < 2) return null;
    const sorted = groups.slice().sort((a, b) => b.rate - a.rate);
    const best = sorted[0]!;
    const worst = sorted.at(-1)!;
    if (best.rate === 0 || best.rate === worst.rate) return null;
    if (worst.rate === 0) return { kind: 'only', dimension, best: best.key, worst: worst.key, bestRate: best.rate };
    const ratio = Math.round((best.rate / worst.rate) * 10) / 10;
    return ratio >= 1.5 ? { kind: 'ratio', dimension, best: best.key, worst: worst.key, ratio } : null;
  };
  return compare('band', s.byBand) ?? compare('channel', s.byChannel) ?? { kind: 'rate', rate: s.responseRate };
}
