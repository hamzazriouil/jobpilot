# JobPilot: Overview & Context

> Context file for anyone (human or agent) working on this project. Read this first.
> v1.0 · 2026-10-23

---

## What JobPilot is
JobPilot is an AI job-hunt copilot for remote tech jobs. It:
- finds remote jobs you can **actually apply to from where you live**,
- scores how well you fit each one, honestly,
- writes the tailored cover letter and cold message,
- tracks your pipeline until you get an offer.

A human always stays in the loop. JobPilot never auto-submits applications.

## Why it exists (three goals, in priority order)
1. **Founder's portfolio flagship.** The founder is a 2025 graduate in Information Systems Engineering, based in Rabat, Morocco. They are trying to land a remote AI-engineer or AI-native developer job by **~2026-11-11**. JobPilot has to show the exact skills those jobs ask for:
   - LLM calls from code, with structured output and tool calling
   - an agent pipeline
   - evals
   - a full-stack TypeScript app
   - shipping speed with agentic coding (Claude Code subagents and workflows)
2. **Dogfooding.** The founder uses JobPilot for their own job hunt. The line "I built the agent that found this job" is the pitch.
3. **Side revenue.** Paid passes through Dodo Payments. Even small revenue ("N paying users") is a strong CV signal.

## Hard constraints
- **$0 to build and run** until there is revenue: free tiers only. Paid LLM usage is switched on only when paid users exist.
- **Payments: Dodo Payments**, a merchant of record. The founder has no legal entity and Stripe and Lemon Squeezy are not available to them. Fallbacks: Paddle, Polar, Gumroad.
- **Ship v0 in 48 hours.** The whole 20-day plan has the founder applying to jobs from Day 3.
- **Spec before code.** The PRD, database, UI/UX and roadmap are written and signed off before building.

## Docs in this folder
| File | Status |
|---|---|
| `00-OVERVIEW.md` | ✅ this file |
| `01-PRD.md` | ✅ v1.1, signed off 2026-10-23 |
| `02-DATABASE.md` | ✅ v1.0 (SQL migration, RLS, RPCs) |
| `03-UI-UX.md` | ✅ v1.0 (screens, components, states, copy) |
| `04-ROADMAP.md` | ✅ v1.0 (day-by-day, workstreams, cut list) |
| `05-ARCHITECTURE.md` | ✅ v1.0 (**integration contract**: stack, LLM router, pipelines, API) |
| `06-DISTRIBUTION.md` | ⏳ before the Day 5 launch |
| `07-VERSION-PLAN.md` | 📝 draft for review (v0 → v6, unique features, gates) |

## Key decisions (2026-10-23)
- "JobPilot" is the local code name only. The public brand and domain will be chosen at purchase time (`packages/core/brand.ts`).
- English only at launch. French comes next (all text in `strings.ts`).
- Cloudflare hosting (Workers via OpenNext + Cron Triggers). Supabase for DB and Auth.
- LLMs: Gemini free tier (primary) + Workers AI (EEA users + fallback). Claude Haiku for paid users.
- Dev and AI roles only at launch. Pricing: Free / $7 Sprint 30 / $15 Sprint 90.
