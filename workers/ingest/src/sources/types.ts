import type { JobInput } from '@jobpilot/core/schemas';
import type { GetJson } from '../http';
import type { LogFn } from '../log';

// Source adapter contract (docs/10-SOURCES.md). An adapter fetches its source and yields pages of
// zod-validated `JobInput`s. It may pre-fill eligibility when the source has structured location
// data (Himalayas); otherwise the pipeline runs classifyLocationRules on `locationRaw`.

export interface SourceContext {
  /** Polite, rate-limited JSON GET for this source (User-Agent, ≤ 1 req/s, timeout). */
  getJson: GetJson;
  /** Upper bound on requests to this source in one run. */
  maxPages: number;
  apiKey?: string;
  log: LogFn;
}

export interface SourcePage {
  jobs: JobInput[];
  /** Items in the raw response (before validation and filtering). */
  fetched: number;
  /** Items dropped because they failed validation. */
  invalid: number;
}

export interface SourceAdapter {
  /** = `sources.id` */
  id: string;
  /** Shown next to each job and stored in `sources.attribution` (see docs/10-SOURCES.md). */
  attribution: string;
  /** Minimum gap between two requests, from the source's terms. */
  minIntervalMs: number;
  pages(ctx: SourceContext): AsyncGenerator<SourcePage>;
}
