# Phase 1 build contract (Day 3–4)

> 2026-10-25 · Extends [05-ARCHITECTURE](05-ARCHITECTURE.md) (still the source of truth for endpoints and pipelines).
> This file pins the **shared code** that the Day 3 workstreams (W10 Auth, W11 Onboarding, W12 Jobs, W13 Ingest)
> build against, and who owns which files. Change it before changing a shared interface.

## 1. Ownership

| WS | Owns (creates/edits) | Must not edit |
|---|---|---|
| **W10 Auth** (lead) | `apps/web/middleware.ts`, `apps/web/lib/supabase/*`, `apps/web/app/login/*`, `apps/web/app/auth/*`, `apps/web/app/api/me/*`, `apps/web/components/site-header.tsx`, `apps/web/components/app/*` | `packages/core/src/jobs/*`, `embed/*`, `workers/*` |
| **W13 Ingest** | `workers/ingest/**`, `packages/core/src/jobs/**`, `packages/core/src/embed/**`, `docs/10-SOURCES.md`, new `supabase/migrations/0002_*.sql` (if needed) | anything in `apps/web` |
| **W11 Onboarding** | `apps/web/app/onboarding/*`, `apps/web/app/api/profile/**`, `packages/core/src/prompts/parse.v1.ts`, `packages/core/src/pipeline/parse.ts` | shared files below without the lead |
| **W12 Jobs** | `apps/web/app/jobs/**`, `apps/web/app/api/jobs/**`, `apps/web/app/feed/*` (placeholder) | shared files below without the lead |

Shared files (lead only, ask first): `packages/core/package.json` exports, `packages/core/src/schemas/*`,
`apps/web/lib/server/*`, `apps/web/lib/strings.ts`, `pnpm-lock.yaml` (no new installs without the lead: RAM is tight).

## 2. Auth (W10)

- Libraries: `@supabase/ssr` + `@supabase/supabase-js` (installed in `apps/web`).
- **`middleware.ts` (edge runtime), not `proxy.ts`.** OpenNext on Cloudflare doesn't run Node middleware / `proxy.ts`
  yet. The middleware refreshes the session cookies on every page request and redirects signed-out visitors away from
  app routes (`/onboarding`, `/feed`, `/jobs`, `/tracker`, `/stats`, `/settings`) to `/login?next=<path>`.
  It skips `/_next/*`, static files and `/api/*` (route handlers check auth themselves).
- `apps/web/lib/supabase/server.ts`:
  - `createSupabaseServer(): Promise<SupabaseClient>`: cookie-bound, anon key, **RLS as the user**. Use it in server
    components and route handlers for the user's own rows.
  - `getUser(): Promise<{ id: string; email: string | null } | null>`: verified (`auth.getUser()`), cached per request.
  - `requireUser()`: for route handlers. Returns the user or a `401 { error: { code: 'unauthorized' } }` response.
- `apps/web/lib/supabase/browser.ts`: `createSupabaseBrowser()`.
- Service-role writes keep using `supabaseAdmin()` from `apps/web/lib/server/supabase.ts` (server only). It gains
  `select`, `update` and `upsert` helpers when W11/W12 need them (lead adds them).
- Routes: `/login` (Google button + magic-link form), `GET /auth/callback` (exchanges `code`, then redirects to `next`,
  **relative paths only**), `POST /auth/signout`, `GET /api/me` → `{ user, plan, planEndsAt, onboarded }`.
- After login: not onboarded → `/onboarding`, else `next` or `/feed`.
- Quota subject for signed-in users: `user:<uuid>`. Limits per [05-ARCHITECTURE §9](05-ARCHITECTURE.md).

## 3. Jobs core (W13 builds, W12 reuses)

All in `packages/core/src/jobs/`, exported as `@jobpilot/core/jobs`:

```ts
/** sha256 hex of lower(company) + '\n' + lower(title) + '\n' + first 500 chars of the description (whitespace collapsed). */
export function jobContentHash(input: { company: string | null; title: string; description: string }): Promise<string>;

export interface LocationVerdict {
  eligibilityType: 'worldwide' | 'regions' | 'unclear';
  allowedRegions: string[];      // codes from REGION / ISO-2 in @jobpilot/core/regions
  quote: string | null;          // the exact text the verdict is based on
}
/** Rules only, no LLM. Returns 'unclear' when the rules can't decide. */
export function classifyLocationRules(input: { locationRaw: string | null; description: string }): LocationVerdict;

/** Dev/AI category filter for feed jobs (title + tags rules). */
export function isTechRole(input: { title: string; tags: string[] }): boolean;

/** Plain text from HTML job descriptions (no tags, entities decoded, capped at JOB_DESCRIPTION_MAX). */
export function htmlToText(html: string): string;
```

The LLM fallback for `unclear` locations is a separate task (`task: 'classify_location'`) that only the ingest Worker calls.

## 4. Embeddings (W13 builds, W11 reuses)

`packages/core/src/embed/`, exported as `@jobpilot/core/embed`:

```ts
export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768 dims = EMBEDDING_DIMS
export type EmbedDeps =
  | { binding: WorkersAiBinding }                          // production (AI binding)
  | { accountId: string; apiToken: string; fetch?: typeof fetch }; // local scripts / next dev (REST)
export function embedTexts(texts: string[], deps: EmbedDeps): Promise<number[][]>; // batches, truncates input
export function jobEmbeddingText(job: { title: string; tags: string[]; description: string }): string; // title + tags + first 400 words
export function profileEmbeddingText(p: { targetRoles: string[]; skills: string[]; summary: string }): string;
```

**Job and profile vectors must come from the same model and the same text recipe**, or similarity is meaningless.

## 5. Ingest Worker (W13)

- `workers/ingest`: plain Worker `jobpilot-ingest`, crons `0 */6 * * *` (ingest) and `0 6 * * *` (maintenance;
  daily matching is added on Day 4). Bindings: `AI`. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY` (only for the location fallback).
- Same pipeline code runs from a local CLI (`pnpm --filter @jobpilot/ingest once -- --source remotive [--dry-run]`)
  that reads `apps/web/.dev.vars` and uses Workers AI over REST. That's how the first jobs get loaded.
- Writes with the service role over PostgREST. Dedupe: skip rows whose `content_hash` already exists among public
  jobs; upsert on `(source_id, source_job_id)`.
- Sources: **read each source's terms first**, record them in `docs/10-SOURCES.md` (link, what's allowed, required
  attribution, rate limits), and only then set `sources.enabled = true` and `sources.attribution`.
  `User-Agent: ApplyVerdictBot/0.1 (+<APP_URL>)`, at most 1 request per second per source.

## 6. Done-when (Day 3)

- W10: Google + magic link sign-in work on workers.dev; `/api/me` returns the plan; signed-out `/feed` → `/login`.
- W11: a new user parses a CV, reviews it, saves preferences; the profile row has `cv_parsed`, `embedding`,
  `work_auth_regions`, `onboarded_at`.
- W12: a pasted job gets a saved analysis (cached by user, job, profile_version) and saved drafts.
- W13: ≥ 200 public dev/AI jobs in the DB, each with eligibility fields and an embedding.
