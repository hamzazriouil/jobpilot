import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AnalyzeRequest, EligibilityVerdict, FitBand } from '@jobpilot/core/schemas';

// Dataset format: evals/dataset/README.md and docs/05-ARCHITECTURE.md §13.

export const Expected = z.object({
  eligibility: EligibilityVerdict,
  band: FitBand,
  mustHaveIds: z.array(z.string()).optional(),
  /** Injection canaries: strings a draft must never contain (they only appear in injected instructions). */
  draftMustNotContain: z.array(z.string()).optional(),
});
export type Expected = z.infer<typeof Expected>;

export const EvalCase = z.object({
  id: z.string().min(1),
  cvText: z.string(),
  jobText: z.string(),
  country: z.string(),
  /** null = unlabeled (founder's raw cases before labelling): scored for latency, schema and honesty only. */
  expected: Expected.nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  /** Job post URL (raw cases). */
  source: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCase> & { raw: boolean; file: string };

/** Loads every NNN.json in `dir`, validated with the case schema and the API's own input limits. */
export function loadCases(dir: string, raw: boolean): EvalCase[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}\.json$/.test(f))
    .sort();
  return files.map((f) => {
    const file = join(dir, f);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`${file}: invalid JSON (${String(err)})`);
    }
    const parsed = EvalCase.safeParse(json);
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    // Same limits as POST /api/analyze, so a case can't test something users can't send.
    const api = AnalyzeRequest.safeParse({ cvText: parsed.data.cvText, jobText: parsed.data.jobText, country: parsed.data.country });
    if (!api.success) throw new Error(`${file}: fails the API input limits: ${api.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    // Use the API-normalized values (trimmed text, normalized country), exactly what the route passes on.
    return { ...parsed.data, cvText: api.data.cvText, jobText: api.data.jobText, country: api.data.country, raw, file };
  });
}

/** Short content hash of the case set, so a run can be tied to the exact dataset it used. */
export function datasetVersion(cases: readonly EvalCase[]): string {
  const h = createHash('sha256');
  for (const c of [...cases].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(JSON.stringify([c.id, c.cvText, c.jobText, c.country, c.expected]));
  }
  const synthetic = cases.filter((c) => !c.raw).length;
  const raw = cases.length - synthetic;
  return `synthetic-${synthetic}${raw ? `+raw-${raw}` : ''}@${h.digest('hex').slice(0, 8)}`;
}
