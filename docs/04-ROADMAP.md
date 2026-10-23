# Roadmap: JobPilot

> v1.0 · 2026-10-23 · Companion docs: [PRD](01-PRD.md) · [Database](02-DATABASE.md) · [UI/UX](03-UI-UX.md) · [Architecture](05-ARCHITECTURE.md)
> Day 1 = **Fri 23 Oct 2026** · Day 20 = **Wed 11 Nov 2026**
> **Golden rule:** the job hunt comes first. From Day 3, **3h/day of applications and outreach are non-negotiable**, even if a feature slips.

---

## 0. Accounts & keys (the founder does these by hand, Day 1 morning, ~1h)
These need the founder's own login, ID or verification. The coding agents can't do them.

| # | Task | Why | Done? |
|---|---|---|---|
| A1 | **GitHub:** create a public repo `jobpilot` | Portfolio + version control | ☐ |
| A2 | **Cloudflare:** log in (existing account), note the Account ID, create an API token for Workers (scoped: Workers Scripts edit, Workers AI read) | Hosting + Workers AI | ☐ |
| A3 | **Supabase:** create project `jobpilot` (region: EU, Frankfurt/Paris), copy the URL, anon key and service-role key | DB + Auth | ☐ |
| A4 | **Google AI Studio:** create a Gemini API key (free tier) and **read the free-tier terms** (EEA rule, data use) | Main LLM | ☐ |
| A5 | **Dodo Payments:** sign up and **start identity verification now** (it can take days) | Phase 2 on Day 5 | ☐ |
| A6 | **Google Cloud OAuth client** for Supabase Google login (can wait until Day 3) | Phase 1 login | ☐ |
| A7 | **Resend:** account (can wait until Day 4) | Digests | ☐ |
| A8 | Write **10 golden eval cases** from real job posts you'd actually apply to, and anonymize your CV | Evals + dogfooding | ☐ |

Keys go in `apps/web/.dev.vars` (gitignored) locally and in `wrangler secret put` for production. **Never paste keys into chat or commit them.**

---

## Phase 0: "Analyze" v0 (Days 1–2)

### Day 1 (Fri 23 Oct): skeleton + the core brain
Workstreams that can run in **parallel** (separate subagents, each following [05-ARCHITECTURE](05-ARCHITECTURE.md) as the contract):

| WS | Task | Done when |
|---|---|---|
| **W1 Scaffold** | pnpm monorepo; `apps/web` Next.js + Tailwind + shadcn + OpenNext Cloudflare config; `packages/core`; `.dev.vars.example`; README stub; deploy "hello" to `*.workers.dev` | Live URL shows the placeholder |
| **W2 Core: schemas + scoring** | `schemas/` (Zod: AnalysisLLM, DraftsLLM, AnalysisResult); `scoring/score.ts` + `evidence.ts` with **unit tests** (Vitest) | `pnpm test` is green, ≥ 15 test cases (incl. edge cases) |
| **W3 Core: LLM router** | `llm/router.ts` (gemini → workers → error), `runLLM()` with timeout, repair retry, cost table, `llm_calls` logging | A script runs one analysis through each provider |
| **W4 DB** | `supabase/migrations/0001_init.sql` from [02-DATABASE](02-DATABASE.md), seed sources, push to Supabase | Tables + RLS + RPCs exist; `consume_quota` tested |
| **W5 Prompts** | `prompts/analyze.v1.ts`, `draft.v1.ts` following §7.1 (untrusted-input tags, rubric, honesty rules) | Both prompts return schema-valid JSON on 3 samples |

**Founder (evening):** 1h reviewing the code. Walk through `score.ts` and `router.ts` until you can explain every line. (This is your interview prep.)

### Day 2 (Sat 24 Oct): the analyzer page, live
| WS | Task | Done when |
|---|---|---|
| **W6 API** | `/api/analyze` (SSE: partials + final server-scored result + HMAC `analysisToken`), `/api/draft` (SSE + honesty check), quota by hashed IP, error shape | curl test streams correctly; quota returns 429 on the 4th call |
| **W7 UI** | Landing + `AnalyzerForm` + results components (§4.1–4.2 in UI/UX), sample-CV button, localStorage remember, mobile layout, dark mode | Full flow works on phone and desktop |
| **W8 Evals v0** | `evals/run.ts` + 10 cases → metrics printed + row in `eval_runs`; a simple `/evals` page | First eval run recorded for Gemini **and** Workers AI |
| **W9 Legal + polish** | `/privacy`, `/terms` (plain-English: what's stored, which LLMs see data), OG image, footer, `strings.ts` | Pages live |

**Founder:**
- Record the **2-minute Loom demo**.
- Write the README: problem, demo GIF, architecture diagram, "How I built it with Claude Code subagents", eval results.
- Post on X and LinkedIn: "Day 2: shipped v0 of an AI job-fit analyzer."

✅ **Phase 0 exit:** public URL, mobile OK, sample works, both providers work, evals page shows real numbers, README + Loom done. **From here on, this link goes in every application.**

---

## Phase 1: Accounts, Feed & Tracker (Days 3–4)
> From Day 3: **3h/day applications + outreach** (see the job-hunt plan). Build in the remaining hours.

### Day 3 (Sun 25 Oct): accounts + profile + paste-a-job
| WS | Task | Done when |
|---|---|---|
| **W10 Auth** | Supabase Auth (magic link + Google), middleware, `/login`, `GET /api/me`, profile trigger | Login works in production |
| **W11 Onboarding** | `/api/profile/parse`, `PUT /api/profile` (region expansion, embedding, version bump), 3-step `/onboarding` | New user reaches `/feed` with a saved profile |
| **W12 Jobs** | `POST /api/jobs` (paste), `/jobs/new`, `/jobs/[id]` (analysis cached by (user, job, profile_version), drafts saved), anonymous-analysis import after login | A pasted job shows a saved analysis + drafts |
| **W13 Ingest** | `workers/ingest`: 2 sources first (**read their terms**, add attribution), normalize, dedupe, rule-based location classifier (+ LLM fallback), embeddings, cron | ≥ 200 public jobs in the DB with eligibility + embedding |

### Day 4 (Mon 26 Oct): feed + tracker + stats
| WS | Task | Done when |
|---|---|---|
| **W14 Matching** | `match_jobs` usage, daily cron, analyze top N with budget guard, instant first matches for new users | A new user sees ≥ 5 matches in under 1 minute |
| **W15 Feed UI** | `/feed` cards, filters, dismiss, attribution, empty state | Works on mobile |
| **W16 Tracker** | `/tracker` kanban (desktop dnd, mobile list), stage changes + channel popover, follow-up chip, follow-up draft | Founder's real applications are tracked here |
| **W17 Stats + account** | `/stats` (KPIs, funnel, by band/channel, insight line), `/settings` profile + account (CSV export, delete) | Delete account removes everything (tested) |
| **W18 Sources 3–6** | Add the remaining sources one at a time, after checking their terms | ≥ 4 sources running |

**Founder:** move **all** your applications into the tracker from now on (dogfooding = real data for stats + a story for interviews).

✅ **Phase 1 exit:** sign up → onboarding → feed → open job → drafts → track → stats, all working in production; RLS tested with two accounts.

---

## Phase 2: Monetization (Day 5)

### Day 5 (Tue 27 Oct)
| WS | Task | Done when |
|---|---|---|
| **W19 Plans** | `current_plan()` everywhere, plan-based quotas (§9 of Architecture), `PlanBadge`, `QuotaMeter` | Limits switch with the plan |
| **W20 Dodo** | Products Sprint 30/90 in the Dodo dashboard, `POST /api/checkout`, `POST /api/webhooks/dodo` (signature, idempotency, stacking, refunds), success page polling | Test-mode purchase → pass active; replaying the same webhook doesn't create a duplicate |
| **W21 Pricing + paywall** | `/pricing`, `UpgradeModal` at the limit, the post-Strong-result nudge, billing tab | Full purchase flow works on mobile |
| **W22 Claude for paid users** | `CLAUDE_ENABLED` flag + Anthropic provider (turned on once the first payment arrives) | The eval run for Claude is recorded once the key exists |

**If Dodo verification isn't done yet:** ship everything behind `DODO_ENV=test` and turn on live mode the day verification passes. Don't let this block anything else.

✅ **Phase 2 exit:** a real (test-mode) purchase works end to end. The pricing page is live.

**Launch posts (Day 5 evening):** X, LinkedIn, r/SideProject, Indie Hackers, and Moroccan, Algerian and Tunisian dev groups. Angle: "I'm job hunting, so I built the tool I needed. It tells you if you can even apply from your country." Full plan in `06-DISTRIBUTION.md` (to write).

---

## Days 6–11: the other portfolio projects (JobPilot in maintenance)
Main focus moves to **Wraqi (RAG assistant)** and the **MCP server/skills repo**, per the job-hunt plan. JobPilot only gets:
- 30 min/day: fix bugs, reply to users, watch `llm_calls` and the Workers AI budget.
- Grow the eval set from 10 to 30 cases (add injection and location edge cases), re-run, publish.

## Days 12–20: Phase 3 (in the 1h/day build slot)
| Day | Item | Pri |
|---|---|---|
| 12 | `/evals` v2: trend over runs, per-provider table, dataset description | P0 |
| 13 | `/admin` dashboard (cost/day, errors, funnel, feedback list) | P1 |
| 14–15 | Interview prep tab (questions from job + CV, STAR stories from real projects, text mock interview) | P1 |
| 16–17 | Company research agent (tools: search + fetch, 1-page brief) | P1 |
| 18 | Resend daily digest + follow-up reminders by email | P1 |
| 19 | URL import for jobs (with SSRF protection) | P1 |
| 20 | Write the **case study**: "Building an AI job copilot in 5 days with Claude Code subagents: architecture, evals, costs, results" | P0 |

---

## Daily tracking (fill in every evening)

| Day | Shipped | Applications sent | Outreach sent | Replies | Interviews | JobPilot users | Paid |
|---|---|---|---|---|---|---|---|
| 1 | | – | – | | | | |
| 2 | | – | – | | | | |
| 3 | | | | | | | |
| … | | | | | | | |

## Cut list (if behind schedule, drop in this order)
1. Phase 3 items (all of them).
2. Sources 3–6 (keep 2 + "paste any job").
3. `/stats` charts (keep the KPI numbers only).
4. PDF upload (paste only).
5. Google login (magic link only).
**Never cut:** evals v0, evidence check, quotas, RLS, webhook signature verification, README + demo video.
