# UI/UX: JobPilot

> v1.0 · 2026-10-23 · Companion docs: [PRD](01-PRD.md) · [Architecture](05-ARCHITECTURE.md)
> The public brand name isn't chosen yet. The UI reads `BRAND_NAME` from `packages/core/brand.ts`. All copy lives in `apps/web/lib/strings.ts`.

---

## 1. Design principles
1. **Value in 30 seconds.** The landing page *is* the product: the analyzer sits above the fold, with a "Try with a sample" button. No signup wall before the first result.
2. **Honest, not hype.** It's a tool for anxious people, so the tone is calm, direct and kind. A bad fit is said plainly ("Long shot"), together with what to do about it. No confetti, no fake urgency.
3. **Evidence everywhere.** Every verdict shows *why*: the quoted line from the job post or the CV, in a distinct quote style. This is our trust mechanism.
4. **Eligibility first.** If you can't apply from your country, that's the first thing you see, before any score.
5. **Copy-ready output.** Every generated block has a one-click copy button and is plain text that pastes cleanly into LinkedIn, email or a form.
6. **Mobile-first.** Many target users (P1, P4) job hunt on their phones. Everything works at 360px wide.

## 2. Visual direction
- **Mood:** a clean, professional tool, like Linear or Vercel's dashboard, not a playful consumer app. Light mode by default, dark mode supported (system preference + toggle).
- **Base:** Tailwind + **shadcn/ui** (neutral/zinc palette), lucide icons.
- **Type:** **Inter** (UI) and **JetBrains Mono** (scores, small labels, quotes). Sizes: 14px body in the app, 16px on the landing page.
- **Accent:** one brand color, **indigo-600** (`#4F46E5`, dark mode `#818CF8`), used for primary actions and focus rings only. Easy to swap once the brand is chosen.
- **Semantic colors (consistent everywhere):**

| Meaning | Light | Dark | Used for |
|---|---|---|---|
| Eligible / Met / Strong | emerald-600 | emerald-400 | ✅ badges, met requirements, Strong band |
| Unclear / Partial / Good-Stretch | amber-600 | amber-400 | ⚠️ badges, partial requirements |
| Not eligible / Missing / Long shot | rose-600 | rose-400 | ❌ badges, missing requirements |
| Neutral info | zinc-500 | zinc-400 | metadata |

- Never rely on color alone: always include an icon + text label (✅ Eligible, ⚠️ Unclear, ❌ Not eligible).
- **Radius** 10px cards, 8px inputs. **Shadows:** minimal; cards get a 1px border. **Spacing:** 4px grid.

## 3. Sitemap

| Route | Access | Phase | Purpose |
|---|---|---|---|
| `/` | public | 0 | Landing + analyzer + results |
| `/evals` | public | 0 (basic) / 3 | Public eval results (portfolio) |
| `/privacy`, `/terms` | public | 0 | Required before collecting CVs |
| `/pricing` | public | 2 | Plans |
| `/login` | public | 1 | Magic link + Google |
| `/onboarding` | auth | 1 | Profile builder (3 steps) |
| `/feed` | auth | 1 | Today's matches (default page after login) |
| `/jobs/[id]` | auth | 1 | Job + analysis + drafts + "Add to tracker" |
| `/jobs/new` | auth | 1 | Paste any job |
| `/tracker` | auth | 1 | Kanban pipeline |
| `/stats` | auth | 1 | Funnel stats |
| `/settings` (profile, billing, account) | auth | 1/2 | Edit profile, plan & receipts, delete account |
| `/admin` | admin | 3 | Founder dashboard |

**App navigation (logged in):** top bar on desktop, bottom tab bar on mobile: **Feed · Tracker · Add job · Stats · Settings**, plus a quota meter ("3/5 today") and a plan badge.

---

## 4. Screens

### 4.1 `/`: Landing + Analyzer (Phase 0, the most important screen)

```
┌──────────────────────────────────────────────────────────────┐
│ [logo] BRAND_NAME                         Evals  Pricing  Log in │
├──────────────────────────────────────────────────────────────┤
│  Can you actually get this remote job?                        │
│  Paste your CV and a job post. In 30 seconds: whether you can │
│  apply from your country, an honest fit score, and a          │
│  ready-to-send cover letter + cold DM.                        │
│                                                               │
│  [ ▶ Try with a sample ]   No signup · CV never stored        │
├───────────────────────────┬──────────────────────────────────┤
│ YOUR CV                   │ JOB POST                         │
│ ┌───────────────────────┐ │ ┌──────────────────────────────┐ │
│ │ paste text…           │ │ │ paste the full job post…     │ │
│ │                       │ │ │                              │ │
│ └───────────────────────┘ │ └──────────────────────────────┘ │
│ [⇪ Upload PDF] ☐ Remember │                                  │
│   on this device          │                                  │
├───────────────────────────┴──────────────────────────────────┤
│ I live in: [ 🇲🇦 Morocco ▾ ]          [ Analyze → ]  3 free today │
└──────────────────────────────────────────────────────────────┘
        ↓ (results appear below, page scrolls to them)
   How it works (3 steps) · What we check · Privacy in one line · FAQ
```
- On mobile the two textareas **stack** (CV first). The Analyze button is sticky at the bottom.
- **Country** is pre-selected from Cloudflare's geo header, and the user can change it.
- **Analyze** is disabled until both fields have ≥ 200 characters. Helper text shows the character count.
- "Remember on this device" stores the CV in `localStorage` only. A tooltip explains this.

### 4.2 Results (same page, streams in)

Order (this is also the streaming order):
```
┌─ ELIGIBILITY ────────────────────────────────────────────────┐
│ ❌ Not eligible from Morocco                                  │
│ “Applicants must be located in the United States.”  ← quote  │
│ This role is US-only. Skip it, or ask the recruiter if they   │
│ hire contractors abroad.                                      │
└──────────────────────────────────────────────────────────────┘
┌─ FIT ────────────────────────────┬───────────────────────────┐
│   (  72  )  GOOD FIT             │ Must-haves   4/6 met      │
│   ring gauge                     │ Nice-to-have 1/3          │
│                                  │ Seniority    Junior → Mid │
└──────────────────────────────────┴───────────────────────────┘
┌─ REQUIREMENTS ───────────────────────────────────────────────┐
│ ✅ TypeScript + React (must)                                  │
│    “Built RARE, a Next.js + Cloudflare app…”   from: project  │
│ ⚠️ 2+ years production experience (must)                      │
│    Side projects only, no company experience yet              │
│ ❌ Python / FastAPI (nice)                                     │
│ … (collapsed after 6, "Show all 11")                          │
└──────────────────────────────────────────────────────────────┘
┌─ CLOSE THE GAP (top 3) ──────────────────────────────────────┐
│ 1. Python/FastAPI: build a 1-day FastAPI endpoint in a        │
│    project and mention it.                                    │
└──────────────────────────────────────────────────────────────┘
┌─ RED FLAGS ── (only if any) ─────────────────────────────────┐
│ ⚑ "Senior" responsibilities for a junior salary               │
└──────────────────────────────────────────────────────────────┘
┌─ YOUR DRAFTS ─────────────── [Cover letter] [Cold DM] [CV bullets] ┐
│ Hi Sarah, …                                                   │
│                                              [⧉ Copy] [↻ Redo] │
│ ⓘ Review before sending. We only used facts from your CV.     │
└──────────────────────────────────────────────────────────────┘
[ Save this & get 5 matched jobs daily → Create free account ]
Was this right?  👍  👎 (→ "score wrong / eligibility wrong / draft bad")
```
**Rules:**
- If the verdict is **Not eligible**, the eligibility card is **red and on top**. The fit card is still shown but dimmed, with the note "Fit shown for reference."
- Evidence quotes: mono font, a left border in the semantic color, and a "from: project / experience / skills list" label.
- The score ring animates from 0 to the score once the **server's final** score arrives (skeleton until then).
- Drafts load after the analysis, in tabs. Each tab shows its own skeleton while generating.
- If drafts have honesty flags, show an amber banner: "We may have added something not in your CV: '…'. Please check."

### 4.3 `/login` (Phase 1)
Centered card: "Continue with Google" + an email field with "Send magic link". Line underneath: "Free · 5 analyses a day · Delete anytime." After the magic link is sent: "Check your inbox" plus a resend link (60-second cooldown).

### 4.4 `/onboarding` (Phase 1, 3 steps, progress dots)
1. **Your CV:** paste or upload PDF (pre-filled from localStorage if present) → "Parse my CV" → shows a skeleton while parsing.
2. **Review:** editable chips for skills, a list of experiences and projects (title, org, dates, 1-line summary), detected seniority (dropdown). Note: "The AI parsed this. Fix anything wrong. Matching uses this."
3. **Preferences:** country of residence, "I can also legally work in…" (multi-select regions or countries, default none), target roles (chips with suggestions: AI engineer, Full-stack, Frontend, Backend, ML engineer), minimum monthly salary (optional), daily email digest toggle.
→ "Show my matches" → `/feed` (first matches are computed right away for new users, with a progress state: "Finding jobs you can apply to…").

### 4.5 `/feed` (Phase 1)
```
Today · 7 matches (3 Strong)           [Filters: band ▾ eligibility ▾ ]
┌─────────────────────────────────────────────────────────────┐
│ AI Engineer · Acme (Remote, Worldwide)   ✅ Eligible  STRONG 84 │
│ TypeScript · LLM · RAG       posted 2d · via Remote OK       │
│ "Matches 5/6 must-haves. Gap: evals experience."             │
│                         [Dismiss]  [Open →]  [+ Track]       │
└─────────────────────────────────────────────────────────────┘
… cards …
Earlier days ▸ (collapsible list)
```
- Cards that don't have an analysis yet (budget guard) show "Analyze" instead of the score.
- **Source attribution** ("via Remote OK" + link) on every card, as the source terms require.
- **Empty state:** "No new matches today. Add jobs you found yourself →" plus tips to widen the target roles.

### 4.6 `/jobs/[id]` (Phase 1)
Two columns on desktop (left: the full results view from 4.2; right sticky panel: job meta, original link, **"Add to tracker"** / stage selector, notes). One column on mobile, with the actions in a bottom sheet. Phase 3 adds a **"Company brief"** tab and an **"Interview prep"** tab.

### 4.7 `/jobs/new` (Phase 1)
A textarea "Paste the job post" (+ a "URL" field, P1) → "Analyze" → redirects to `/jobs/[id]`.

### 4.8 `/tracker` (Phase 1)
```
 Saved (4)   Applied (12)   Replied (2)   Interviewing (1)   Offer   Closed ▸
 ┌───────┐   ┌──────────┐
 │Acme   │   │Globex    │  ⏰ follow up today
 │AI Eng │   │Frontend  │
 │GOOD 72│   │STRONG 81 │
 └───────┘   └──────────┘
```
- Desktop: kanban with drag and drop (`@dnd-kit`). **Mobile: list grouped by stage**, with a stage dropdown on each card (no dragging on small screens).
- "Closed" collapses Rejected and Ghosted.
- A card with a follow-up due shows an amber "⏰ Follow up" chip. Clicking it opens the job with a **Follow-up draft** tab.
- Changing a stage to Applied asks for the channel (email / LinkedIn / X / form / referral) in a small popover. This feeds the stats.

### 4.9 `/stats` (Phase 1)
- KPI row: Applications sent · Response rate · Interview rate · Avg days to reply.
- A horizontal funnel chart: Applied → Replied → Interviewing → Offer.
- Bar charts: response rate **by fit band** and **by channel**.
- One plain-English insight line, computed in code (not by an LLM): "Your Strong fits get replies 4× more often than Stretch fits. Focus there."
- Fewer than 10 applications → "Stats appear after 10 applications."

### 4.10 `/pricing` (Phase 2)
Three cards: **Free** · **Sprint 30 ($7, one-time)** marked "Most popular" · **Sprint 90 ($15, one-time)**. Line under the cards: "No subscription. Pay once, it ends on its own." FAQ: refunds, what happens when the pass ends (back to Free, data kept), privacy, payment methods (handled by Dodo).

### 4.11 Paywall moments (Phase 2)
- **Limit reached:** a modal over the Analyze button: "You've used your 5 free analyses today. Get 30/day for 30 days, $7 once. Or come back tomorrow." Buttons: [Get Sprint 30] [Maybe tomorrow]. Never block access to the user's existing data.
- **After a Strong result** (free users, at most once a day): a subtle inline card: "Found a strong fit? Sprint users get 30 matches/day + follow-up reminders."

### 4.12 `/settings`
Tabs: **Profile** (same form as onboarding steps 2–3, "Re-parse CV"), **Billing** (plan, end date, "Extend", receipts link), **Account** (email, digest toggle, **Export CSV**, **Delete account**: a confirmation modal where the user types DELETE).

### 4.13 `/evals` (public)
Header: "How accurate is BRAND_NAME? We test every prompt change on a fixed set of real job posts."
A table per provider (Gemini / Workers AI / Claude) with: eligibility accuracy, fit-band accuracy, schema-valid rate, injection resistance, p95 latency, cost per analysis. Plus a trend sparkline over runs, the date, the prompt version, and a link to the dataset description on GitHub.

---

## 5. Component inventory (`apps/web/components`)

| Component | Notes |
|---|---|
| `AnalyzerForm` | CV + job textareas, PDF upload, remember toggle, country select, submit, quota hint |
| `EligibilityCard` | verdict badge, quote, guidance text |
| `FitScoreRing` | SVG ring 0–100, band label, animates on the final value only |
| `FitSummary` | must / nice / seniority counts |
| `RequirementList` / `RequirementRow` | status icon, text, type tag, `EvidenceQuote`, collapsible |
| `EvidenceQuote` | mono, left border colored by status, source label |
| `GapList`, `RedFlagList` | |
| `DraftTabs` / `DraftBlock` | tabs, streaming text, copy, regenerate, honesty banner |
| `JobCard` | feed card with badge, band, attribution, actions |
| `KanbanBoard`, `KanbanColumn`, `ApplicationCard`, `StageSelect` | dnd on desktop, list on mobile |
| `QuotaMeter` | "3/5 today", links to pricing when low |
| `UpgradeModal`, `PlanBadge` | Phase 2 |
| `FeedbackThumbs` | 👍/👎 + reason |
| `EmptyState`, `ErrorState`, `Skeleton*` | shared |

## 6. States (every screen)
| State | Treatment |
|---|---|
| Loading / streaming | Skeletons matching the final layout. A streaming cursor in drafts. A "Reading the job post… Checking eligibility… Scoring…" step text under the button. |
| `quota_exceeded` | Paywall modal (§4.11). For anonymous users: "Create a free account for 5/day." |
| `busy` (all LLMs limited) | Amber inline alert: "High demand right now. Try again in a minute." Inputs are kept. |
| `bad_input` | Inline field errors (too short, too long, looks like it isn't a job post). |
| Network or other error | "Something broke on our side." + Retry. Inputs are **never** lost. |
| Empty | A friendly `EmptyState` with a next action. |

## 7. Copy guidelines
- Second person, short sentences, no jargon ("must-haves", not "mandatory requirements").
- **Bands:** Strong fit · Good fit · Stretch · Long shot. Never "Rejected" or "Bad".
- **Eligibility:** "Eligible from {country}" · "Unclear, check with the recruiter" · "Not eligible from {country}".
- Encourage without lying: "Long shot, but here's what would change that."
- Legal and safety microcopy is always visible near drafts: "Review before sending. You're responsible for what you submit."

## 8. Accessibility & performance
- WCAG AA contrast in both themes. Visible focus rings (indigo). Every icon has a text label or aria-label.
- Streaming regions use `aria-live="polite"`. The score ring has a text equivalent.
- Full keyboard support: tab through results, copy buttons focusable, kanban has a keyboard alternative (the stage dropdown).
- Landing page: LCP < 2.5s on 4G, JS kept small (the PDF parser is **lazy-loaded** only when "Upload PDF" is clicked).
- Respect `prefers-reduced-motion` (no ring animation).

## 9. Portfolio polish (cheap, high-value)
- Footer: "Built by [founder] with Claude Code · [GitHub] · [How it works]", linking to the repo and the case study.
- An Open Graph image for link sharing (static, with the brand name).
- A "How it works" section that shows the pipeline diagram (rules → LLM → evidence check → scoring in code). Recruiters reading the landing page see the engineering.
