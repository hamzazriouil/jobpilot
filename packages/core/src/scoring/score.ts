import { SENIORITY_LEVEL, type AnalysisLLM, type FitBand, type Requirement, type Seniority } from '../schemas';

// Deterministic fit score, Architecture §6 / PRD §4.3. Input: an AnalysisLLM AFTER the
// evidence check. Eligibility never affects the score.
//
// Decisions where the doc is silent:
// - seniority diff is |jobLevel − candidateLevel| (over-qualified is penalized like under-qualified).
// - evidence with no met/partial items → 0 (nothing proven).

export const SCORE_WEIGHTS = Object.freeze({ must: 50, nice: 15, seniority: 15, stack: 10, evidence: 10 });

/** Value of a component when its requirement set is empty. */
export const EMPTY_DEFAULTS = Object.freeze({ must: 1, nice: 0.5, stack: 0.5, evidence: 0 });

const STATUS_VALUE = { met: 1, partial: 0.5, missing: 0 } as const;

export interface RequirementTally {
  total: number;
  met: number;
  partial: number;
  missing: number;
  /** Average of met=1 / partial=0.5 / missing=0, or the empty-set default. In [0, 1]. */
  ratio: number;
  weight: number;
  /** ratio × weight, unrounded. */
  points: number;
}

export interface SeniorityComponent {
  jobLevel: Seniority;
  candidateLevel: Seniority;
  /** |job − candidate| in levels (intern=0 … lead=4). */
  diff: number;
  ratio: number; // 0 → 1, 1 → 0.5, ≥2 → 0
  weight: number;
  points: number;
}

export interface EvidenceComponent {
  /** met/partial items backed by experience or a project. */
  strong: number;
  /** All met/partial items. */
  total: number;
  ratio: number;
  weight: number;
  points: number;
}

export interface ScoreBreakdown {
  must: RequirementTally;
  nice: RequirementTally;
  seniority: SeniorityComponent;
  stack: RequirementTally;
  evidence: EvidenceComponent;
}

export interface ScoreOutput {
  score: number;
  band: FitBand;
  breakdown: ScoreBreakdown;
}

export function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** ≥80 strong · 65–79 good · 45–64 stretch · <45 long_shot. */
export function bandForScore(score: number): FitBand {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'good';
  if (score >= 45) return 'stretch';
  return 'long_shot';
}

function tally(reqs: readonly Requirement[], emptyDefault: number, weight: number): RequirementTally {
  let met = 0;
  let partial = 0;
  let missing = 0;
  let sum = 0;
  for (const r of reqs) {
    sum += STATUS_VALUE[r.status];
    if (r.status === 'met') met++;
    else if (r.status === 'partial') partial++;
    else missing++;
  }
  const ratio = reqs.length ? sum / reqs.length : emptyDefault;
  return { total: reqs.length, met, partial, missing, ratio, weight, points: ratio * weight };
}

export function seniorityRatio(diff: number): number {
  if (diff <= 0) return 1;
  if (diff === 1) return 0.5;
  return 0;
}

/** Score a (checked) analysis. Accepts an AnalysisResult too, since it extends AnalysisLLM. */
export function computeScore(checked: AnalysisLLM): ScoreOutput {
  const reqs = checked.requirements;

  const must = tally(reqs.filter((r) => r.type === 'must'), EMPTY_DEFAULTS.must, SCORE_WEIGHTS.must);
  const nice = tally(reqs.filter((r) => r.type === 'nice'), EMPTY_DEFAULTS.nice, SCORE_WEIGHTS.nice);
  const stack = tally(reqs.filter((r) => r.category === 'tech'), EMPTY_DEFAULTS.stack, SCORE_WEIGHTS.stack);

  const diff = Math.abs(SENIORITY_LEVEL[checked.job.level] - SENIORITY_LEVEL[checked.candidateLevel]);
  const sRatio = seniorityRatio(diff);
  const seniority: SeniorityComponent = {
    jobLevel: checked.job.level,
    candidateLevel: checked.candidateLevel,
    diff,
    ratio: sRatio,
    weight: SCORE_WEIGHTS.seniority,
    points: sRatio * SCORE_WEIGHTS.seniority,
  };

  const backed = reqs.filter((r) => r.status === 'met' || r.status === 'partial');
  const strong = backed.filter((r) => r.evidenceSource === 'experience' || r.evidenceSource === 'project').length;
  const eRatio = backed.length ? strong / backed.length : EMPTY_DEFAULTS.evidence;
  const evidence: EvidenceComponent = {
    strong,
    total: backed.length,
    ratio: eRatio,
    weight: SCORE_WEIGHTS.evidence,
    points: eRatio * SCORE_WEIGHTS.evidence,
  };

  const sum = must.points + nice.points + seniority.points + stack.points + evidence.points;
  // Kill float noise first (e.g. 79.49999999 for a true 79.5) so round() is stable.
  const score = clampScore(Math.round(Math.round(sum * 1e6) / 1e6));

  return { score, band: bandForScore(score), breakdown: { must, nice, seniority, stack, evidence } };
}
