// Sanitizers for `partial` SSE frames. A partial is a deep-partial AnalysisLLM / DraftsLLM produced
// by a model mid-stream: any field may be missing, half-written or (in theory) the wrong type.
// These keep only well-typed fields so the UI can render partials without ever trusting them.
// A full AnalysisResult / DraftsLLM is also a valid PartialAnalysis / PartialDrafts.
import type {
  EligibilityVerdict,
  EvidenceSource,
  RequirementStatus,
  RequirementType,
  Seniority,
} from '@jobpilot/core/schemas';

export interface PartialRequirement {
  text: string;
  type?: RequirementType;
  status?: RequirementStatus;
  evidenceQuote?: string | null;
  evidenceSource?: EvidenceSource;
  note?: string;
}

export interface PartialAnalysis {
  job?: { title?: string; company?: string | null; level?: Seniority };
  candidateLevel?: Seniority;
  eligibility?: {
    verdict?: EligibilityVerdict;
    allowedRegions?: string[];
    evidenceQuote?: string | null;
    reasoning?: string;
  };
  requirements: PartialRequirement[];
  gaps: { skill: string; howToClose?: string }[];
  redFlags: string[];
}

export interface PartialCvBullet {
  original?: string | null;
  improved?: string;
}

export interface PartialDrafts {
  coverLetter?: string;
  coldDm?: string;
  cvBullets: PartialCvBullet[];
}

const VERDICTS: readonly EligibilityVerdict[] = ['eligible', 'unclear', 'not_eligible'];
const STATUSES: readonly RequirementStatus[] = ['met', 'partial', 'missing'];
const TYPES: readonly RequirementType[] = ['must', 'nice'];
const SOURCES: readonly EvidenceSource[] = ['experience', 'project', 'skills_list', 'education', 'none'];
const LEVELS: readonly Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead'];

export const EMPTY_PARTIAL_ANALYSIS: PartialAnalysis = Object.freeze({
  requirements: [],
  gaps: [],
  redFlags: [],
}) as PartialAnalysis;

export const EMPTY_PARTIAL_DRAFTS: PartialDrafts = Object.freeze({ cvBullets: [] }) as PartialDrafts;

export function sanitizeAnalysisPartial(raw: unknown): PartialAnalysis {
  const o = asRecord(raw);
  if (!o) return EMPTY_PARTIAL_ANALYSIS;
  const out: PartialAnalysis = { requirements: [], gaps: [], redFlags: [] };

  const job = asRecord(o.job);
  if (job) {
    out.job = compact({
      title: str(job.title),
      company: strOrNull(job.company),
      level: oneOf(job.level, LEVELS),
    });
  }
  const candidateLevel = oneOf(o.candidateLevel, LEVELS);
  if (candidateLevel) out.candidateLevel = candidateLevel;

  const elig = asRecord(o.eligibility);
  if (elig) {
    const regions = arr(elig.allowedRegions).filter((r): r is string => typeof r === 'string' && r.length > 0);
    out.eligibility = compact({
      verdict: oneOf(elig.verdict, VERDICTS),
      allowedRegions: regions.length > 0 ? regions : undefined,
      evidenceQuote: strOrNull(elig.evidenceQuote),
      reasoning: str(elig.reasoning),
    });
  }

  for (const item of arr(o.requirements)) {
    const r = asRecord(item);
    const text = r && str(r.text);
    if (!r || !text) continue;
    out.requirements.push(
      compact({
        text,
        type: oneOf(r.type, TYPES),
        status: oneOf(r.status, STATUSES),
        evidenceQuote: strOrNull(r.evidenceQuote),
        evidenceSource: oneOf(r.evidenceSource, SOURCES),
        note: str(r.note),
      }),
    );
  }

  for (const item of arr(o.gaps)) {
    const g = asRecord(item);
    const skill = g && str(g.skill);
    if (!g || !skill) continue;
    out.gaps.push(compact({ skill, howToClose: str(g.howToClose) }));
  }

  for (const item of arr(o.redFlags)) {
    const flag = str(item);
    if (flag) out.redFlags.push(flag);
  }
  return out;
}

export function sanitizeDraftsPartial(raw: unknown): PartialDrafts {
  const o = asRecord(raw);
  if (!o) return EMPTY_PARTIAL_DRAFTS;
  const out: PartialDrafts = { cvBullets: [] };
  const coverLetter = str(o.coverLetter);
  if (coverLetter) out.coverLetter = coverLetter;
  const coldDm = str(o.coldDm);
  if (coldDm) out.coldDm = coldDm;
  for (const item of arr(o.cvBullets)) {
    const b = asRecord(item);
    if (!b) continue;
    out.cvBullets.push(compact({ original: strOrNull(b.original), improved: str(b.improved) }));
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** A string, an explicit null, or undefined when absent/invalid. */
function strOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  return str(v);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Drops keys whose value is undefined (keeps `null`), so optional fields stay truly optional. */
function compact<T extends object>(o: T): T {
  const out = {} as T;
  for (const key of Object.keys(o) as (keyof T)[]) {
    if (o[key] !== undefined) out[key] = o[key];
  }
  return out;
}
