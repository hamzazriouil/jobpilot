# JobPilot

> Working name. The public brand is set in `packages/core/src/brand.ts`.

JobPilot is an AI job-hunt copilot for remote tech jobs. Paste your CV and a job post and, in about 30 seconds, it tells you whether you can actually apply from the country you live in, gives you an honest fit score with quoted evidence from your CV and the job post, and drafts a tailored cover letter and cold message for you to review. Later it finds matching remote jobs every day and tracks your applications until you get an offer. A human always stays in the loop: JobPilot never auto-submits anything.

## Demo

_Coming on Day 2: live URL, 2-minute video and a GIF._

## Monorepo layout

```
apps/web/          Next.js (App Router) UI + API routes, deployed to Cloudflare Workers via OpenNext
packages/core/     Pure TypeScript: Zod schemas, deterministic scoring, LLM router, prompts, brand
supabase/          SQL migrations (Postgres + RLS + RPCs)
workers/ingest/    Cron Worker that ingests job sources (Phase 1)
evals/             Golden dataset + eval runner (Day 2)
docs/              Product, data, UI/UX, roadmap and architecture specs
```

## Getting started

Requirements: Node.js 22+ (Wrangler needs it; Next.js alone runs on 20.9+), pnpm 9.

```bash
pnpm install

# Web app
cp apps/web/.dev.vars.example apps/web/.dev.vars   # then fill in your own keys (never commit them)
pnpm --filter web dev                               # http://localhost:3000

# Tests and type checks (all packages)
pnpm test
pnpm typecheck

# Cloudflare: build the Worker and run it locally in workerd
pnpm --filter web preview
```

## Docs

- [00 Overview](docs/00-OVERVIEW.md)
- [01 PRD](docs/01-PRD.md)
- [02 Database](docs/02-DATABASE.md)
- [03 UI/UX](docs/03-UI-UX.md)
- [04 Roadmap](docs/04-ROADMAP.md)
- [05 Architecture](docs/05-ARCHITECTURE.md)
- [07 Version plan](docs/07-VERSION-PLAN.md)

## Architecture

_Coming on Day 2: pipeline diagram (rules → LLM → evidence check → scoring in code), provider routing and eval results. Until then, see [05-ARCHITECTURE.md](docs/05-ARCHITECTURE.md)._

## How it was built with Claude Code subagents

_Coming on Day 2: how the Day 1 work was split into parallel workstreams (scaffold, schemas + scoring, LLM router, database, prompts), each run by its own subagent against the architecture doc as a shared contract._
