# Version Plan: JobPilot, from v0 to platform

> v1.0 (draft for review) · 2026-10-23 · Companion docs: [PRD](01-PRD.md) · [Roadmap](04-ROADMAP.md) · [Architecture](05-ARCHITECTURE.md)
> The **PRD** covers v0 → v1.5 in full detail (what we build now). **This document** is the long-term product plan: every version from the first page to an advanced platform, the unique features that make JobPilot hard to copy, and the gates that decide whether to keep going.

---

## 1. North star

**"Get people from anywhere hired remotely, by helping them apply only where they can win, and making every application count."**

**North-star metric:** **interviews landed per active user per month.** Not analyses, not signups. If users get interviews, they pay, stay and tell friends.

### 1.1 Product principles (they never change, in any version)
1. **Human in the loop.** JobPilot researches, matches, drafts and reminds. The **human always sends**. No auto-apply, no auto-DM, ever.
2. **Honesty over flattery.** Scores are evidence-based and computed in code. Drafts never invent experience. A "Long shot" is called a long shot.
3. **Cross-border first.** Every feature asks: "Does this work for someone in Rabat, Lagos or Dhaka applying to a company in Berlin or Austin?" That's our wedge.
4. **Evidence, always.** Every claim the product makes shows its source (a quote, data, a count).
5. **Privacy by default.** Users' data is theirs. Aggregate insights only with consent and with k-anonymity (≥ 10 users per data point).
6. **Measured AI.** Every AI feature ships with evals. If we can't measure it, we don't ship it.

### 1.2 The moat: why JobPilot gets harder to copy over time
Any developer can wrap an LLM around "CV + job post → cover letter". What competitors can't copy quickly:
1. **The Hiring-Geography Graph:** which companies actually hire from which countries, built from job posts plus users' real (consented) outcomes. → v3
2. **Outcome data:** which fit bands, channels, message styles and timing actually get replies, for people like you. → v3
3. **Workflow lock-in:** your profile, pipeline, history and stats live here. → v1
4. **Distribution:** schools, bootcamps and communities in markets the big players ignore (MENA, Africa, South Asia). → v5

---

## 2. Version overview

| Version | Name | When (target) | One-line goal | Status |
|---|---|---|---|---|
| **v0** | Analyze | Day 2 (24 Oct 2026) | Paste CV + job → eligibility, honest fit, drafts | Spec ✅ |
| **v1** | Copilot | Day 4 (26 Oct) | Accounts, daily matched feed, tracker, stats | Spec ✅ |
| **v1.5** | Sprint | Day 5 (27 Oct) | Monetization (Sprint passes via Dodo), Claude for paid users | Spec ✅ |
| **v2** | Agent | Nov 2026 (Days 12–20 + 2 weeks) | Research agent, outreach copilot, interview prep, Gap-to-Proof ⭐ | This doc |
| **v3** | Intelligence | Dec 2026–Jan 2027 | Hiring-Geography Graph ⭐, Reply Odds ⭐, market radar, ghost-job detector | This doc |
| **v4** | Everywhere | Feb–Apr 2027 | Chrome extension, Fit Pages ⭐, voice interview coach ⭐, French + more languages, mobile PWA, MCP server ⭐ | This doc |
| **v5** | Cohorts | Apr–Jul 2027 | B2B for schools and bootcamps, coach mode, career-services dashboard | This doc |
| **v6** | Platform | H2 2027+ | Opt-in talent network ("Reverse Feed") ⭐, public API, partner integrations | This doc |

⭐ = unique feature (see §10 for the full list).
**Dates are targets, not promises.** Each version starts only if the previous one passes its **gate** (§9).

---

## 3. v0 "Analyze": the 48-hour proof (Day 2)
*Full detail: PRD §5 Phase 0.*

**Who it's for:** anyone with a CV and a job post. No account needed.
**Job-to-be-done:** "Should I even apply to this, and what do I send?"

**Features**
- Paste CV (+ PDF upload, parsed in the browser) and a job post, and pick your country.
- **Eligibility verdict** (✅/⚠️/❌), quoting the job post.
- **Honest fit score** (rubric computed in code) with every requirement checked against CV evidence.
- Top-3 gaps with how to close them. Red flags.
- Drafts: cover letter, cold DM, 3 improved CV bullets, with an honesty check.
- Two LLM providers with automatic fallback, per-IP quotas, per-call logs, public `/evals`.

**Unique already:** cross-border eligibility check with evidence · scores computed in code · public evals.
**Success signal:** strangers use it without being told how. ≥ 30% of visitors run an analysis.

---

## 4. v1 "Copilot" + v1.5 "Sprint" (Days 3–5)
*Full detail: PRD §5 Phases 1–2.*

**Job-to-be-done:** "Bring me jobs I can actually get, every day, and keep me organized until I'm hired."

**v1 features**
- Accounts (magic link + Google). AI-parsed profile, reviewed by the user.
- **Daily matched feed** from public job APIs: eligibility-filtered, ranked by similarity, top N fully analyzed.
- Paste any job (+ URL import later).
- **Pipeline tracker** (kanban), follow-up flags + follow-up drafts.
- **Funnel stats:** response rate by fit band and by channel, plus a plain-English insight.
- Export CSV, delete account.

**v1.5 features**
- Free / **Sprint 30 ($7)** / **Sprint 90 ($15)**, one-time passes through Dodo.
- Paywall at the right moments, billing page, Claude Haiku for paid users.

**Success signal:** the founder runs their whole job hunt in it. First paying stranger. D7 retention ≥ 25%.

---

## 5. v2 "Agent": from tool to copilot (November 2026)

**Theme:** JobPilot stops being "a form that returns text" and becomes **an agent that does the research and prep work around each application**. This is also the showcase for agentic engineering.

**Job-to-be-done:** "For the jobs I care about, help me stand out the way a well-connected candidate would."

### 5.1 Features

**V2.1 Company Research Agent** (Sprint 90 / Pro)
- Tools: web search, fetch the company site, careers and team pages, public engineering blog, GitHub org, recent news.
- Output: a **1-page brief**: what they build, business model, tech stack (with evidence), recent events, likely team structure, **3 personalized angles** for the application, **who to contact** (role, and name if public), and red flags (layoffs, funding issues, bad reviews).
- Built as a real agent loop: plan → tool calls → self-check → cited brief. Every claim has a source link.
- Cost control: briefs are cached per company for 14 days and shared across users (company data is public, not personal).

**V2.2 Outreach Copilot**
- A multi-touch **sequence planner** per application: Day 0 application + DM → Day 4 follow-up → Day 10 value-add touch (e.g. "I built a small demo related to your product").
- Drafts each message for the right channel (LinkedIn, email, X), within length limits and in a natural tone.
- The user sends each one. JobPilot tracks it ("Mark as sent") and reminds them.
- **Style learning:** the user marks which of their messages got replies, and future drafts lean toward that style (per user only).

**V2.3 Interview Prep Studio**
- Predicted questions from the job post + company brief + your CV: technical, behavioral, and "about your project X".
- **STAR story builder:** turns your real projects and experience into 5 reusable stories, linked to the questions.
- **Text mock interview:** the agent plays the interviewer, asks follow-ups, then scores clarity, structure, evidence and length, with suggestions.
- **"Explain your code" drill:** paste a file from your project, and the agent asks the questions a senior engineer would. Built for the AI-built-portfolio era: you must be able to defend code you didn't type yourself.

**V2.4 ⭐ Gap-to-Proof Generator** (the signature v2 feature)
- For each **missing skill** in a job you want, it generates a **1–3 day mini-project spec**: scope, a suggested stack, acceptance criteria, a README outline, and a ready-to-use **Claude Code / agent prompt pack** to build it fast.
- When finished, the user links the repo. JobPilot checks the evidence (README + code exist) and adds it to the profile as a project. **The fit score updates.**
- Why it matters: in 2026 anyone can build a small, real project in a day with AI. JobPilot turns "you're missing X" into "here's the proof of X by Friday". No competitor closes the gap. They only report it.

**V2.5 Weekly Coach Report** (email + in-app, Sundays)
- Last week: applications, replies, interviews, best channel, best fit band.
- Next week: the 3 actions with the biggest expected impact, the 5 jobs to prioritize, the 1 skill to prove.
- Generated from stats computed in code. The LLM only writes the prose.

**V2.6 Admin & quality**
- `/admin` cost, error and funnel dashboard. A feedback queue. A dashboard per prompt version.
- Eval set grows to 60+ cases, including agent-trajectory evals for the research agent (Were sources cited? Any hallucinated facts?).

### 5.2 Tech additions
- Agent runtime: the AI SDK tool loop (or the Claude Agent SDK), with a step limit, cost cap and timeout per run.
- Search tool: a free or cheap search API (choose by checking current free tiers). Fetch tool with SSRF protection (already specified).
- New tables: `company_briefs` (shared cache), `sequences` + `sequence_steps`, `stories`, `mock_sessions`, `proof_projects`.
- Queue for long agent runs: Cloudflare Queues, or a status row + polling.

### 5.3 Pricing changes
- The research agent, Gap-to-Proof and mock interviews are **Sprint 90 only** (or limited uses on Sprint 30). This gives a reason to upgrade to the higher tier.
- Free users get **1 research brief a week** as a taste.

### 5.4 Gate to v3
≥ 300 weekly active users · ≥ 20 paying users in total · ≥ 10 users reported an interview from a JobPilot-sourced job · research-agent eval: ≥ 95% of claims cited.

---

## 6. v3 "Intelligence": the data moat (Dec 2026 – Jan 2027)

**Theme:** use aggregated (consented, anonymized) data to answer questions **no single candidate can answer alone**.

**Job-to-be-done:** "Tell me where people like me actually get hired, and what actually works."

### 6.1 Features

**V3.1 ⭐ Hiring-Geography Graph ("Who hires from where")**
- For every company: **which countries it has hired from or explicitly accepts**, with a confidence level, based on:
  1. location rules in its job posts over time;
  2. whether it uses an employer of record (Deel, Remote, Oyster…), detected from public signals;
  3. **anonymized user outcomes**, e.g. "3 JobPilot users in Morocco got interviews here in the last 90 days" (shown only if ≥ 3; detail only if ≥ 10).
- UI: a "Hires from 🇲🇦 Morocco: Yes (high confidence)" badge on jobs and company pages. A searchable directory of "**Companies that hire from {country}**", which also works as an SEO page per country (a big organic traffic engine).

**V3.2 ⭐ Reply Odds**
- A model trained on tracked outcomes (fit band, seniority gap, channel, time since posting, company size, eligibility, follow-up done?) that predicts the **probability of a reply**.
- Shown as "Reply odds: ~12% (higher than 80% of your options)". It ranks the feed by **expected value**, not just fit.
- Starts as a simple, explainable model (logistic regression on features we already store) once there are ≥ 2,000 tracked applications. Retrained monthly. Its calibration is published on `/evals`.

**V3.3 Ghost-Job & Scam Detector**
- Flags: reposted 3+ times, older than 60 days, no real company footprint, "pay for training", requests to run unknown code, crypto pay, messages from personal-email "recruiters".
- A badge + an explanation. Scam patterns are reported by users (with moderation).
- This directly protects the core audience, who are frequent targets of fake remote-job scams.

**V3.4 Skill Demand Radar**
- From all ingested jobs: the skills trending week over week in remote dev/AI jobs **open to your region**.
- Personal view: "Your top 3 missing skills appear in 41% of your matched jobs." Links to Gap-to-Proof.
- Public monthly report ("Remote AI jobs open to Africa/MENA: October 2026"). Good content for distribution and PR.

**V3.5 Cross-Border Salary Reality**
- Salary ranges by role and seniority **for remote hires from the user's region** (job-post data + anonymized offers that users share). Contractor vs employee framing.
- "Is this offer fair?" check for offers in the tracker.

**V3.6 Cross-Border Readiness Kit** (content + checklists)
- How to get paid from each supported country (Payoneer, Deel, Wise, local bank rules), contractor vs employee, invoicing basics, legal status options. For information only, with links to official sources. **Morocco first**, then Egypt, Nigeria, India, Pakistan, Tunisia.
- An eligibility FAQ the agent can cite in answers.

### 6.2 Tech & data
- **Consent:** a clear opt-in ("Contribute anonymized outcomes to improve odds for everyone"), on by default **only** for aggregates with k ≥ 10. Can be withdrawn at any time.
- New tables: `companies` (normalized, with domain and EOR signals), `company_geo_evidence`, `outcome_aggregates` (materialized), `scam_reports`, `salary_points`.
- Analytics: nightly aggregation jobs. A move to a stronger Postgres plan may be needed (first real infrastructure cost, paid for by revenue).

### 6.3 Pricing changes
- Introduce **Pro (monthly, ~$12)** for people who keep using it after they get a job (career tracking, radar, salary data). Sprint passes stay. Most job seekers prefer them.
- Public SEO pages (companies that hire from X) stay **free**. They're the acquisition engine.

### 6.4 Gate to v4
≥ 1,500 WAU · ≥ 5,000 tracked applications with outcomes · Reply Odds calibrated (predicted vs actual within ±5 points per decile) · organic search bringing ≥ 30% of signups.

---

## 7. v4 "Everywhere": meet users where they apply (Feb – Apr 2027)

**Theme:** JobPilot follows the user around the web and into every step: the job page, the application form, the interview, in their language.

### 7.1 Features

**V4.1 Chrome extension**
- On **any job page the user is viewing**: a side panel with eligibility, fit, Reply Odds and drafts, plus one-click "Track".
- **Form assist:** fills application form fields with the user's profile + drafted answers. The **user reviews and clicks Submit**. It never submits by itself.
- Only reads the page the user opened, when they click it. No background scraping.

**V4.2 ⭐ Fit Pages: a tailored mini-site per application**
- One click generates a private, shareable page: **"Why [Name] for [Role] at [Company]"**. It shows the 3 most relevant projects (with demos), how each must-have is met, a 60-second intro video (optional), and a link to the CV.
- The candidate adds the link to the application or DM. The page shows **view count and time viewed** (no personal tracking of the viewer, disclosed on the page).
- Why it's unique: it turns a 2-second CV skim into a page built for that one hiring manager, and the candidate learns whether anyone actually looked.

**V4.3 ⭐ Voice Interview Coach for non-native speakers**
- A voice mock interview (real-time speech) that scores the answers **and the delivery**: clarity, pace, filler words, structure. It also gives **pronunciation and phrasing suggestions** for non-native English speakers.
- Practice packs: "Tell me about yourself", "Walk me through your project", "Why remote?", salary talk.
- Why it's unique: the core audience often writes English well but speaks it less confidently, and big US tools ignore this. (The founder has this exact need.)

**V4.4 Languages**
- **French** UI + drafts (first, as decided), then **Arabic** (UI + Darija-friendly explanations, applications still in the employer's language), **Spanish**, **Portuguese**.
- The draft language is chosen **per job**, based on the job post's language.

**V4.5 Mobile PWA**
- Installable, push notifications (new Strong matches, follow-ups due, Fit Page viewed), a fast tracker on the phone.

**V4.6 ⭐ JobPilot MCP server**
- Exposes JobPilot as tools for Claude and other AI assistants: `analyze_job`, `get_feed`, `track_application`, `draft_follow_up`, `get_stats`, with OAuth per user.
- Lets people job hunt from inside Claude ("find me 5 Strong matches and draft DMs"). It's also a strong agentic-engineering showcase and a distribution channel through MCP directories.

### 7.2 Tech additions
- Extension (Manifest V3) with the same API and auth (token exchange).
- Realtime voice: a speech API with a free or cheap tier, or browser speech recognition + LLM for v1 of the coach. Costs are reviewed before launch, and the feature is paid-only.
- i18n framework (strings already centralized since v0).
- Fit Pages: a public route with an unguessable slug, `noindex`, view counter without personal data.

### 7.3 Pricing
- Fit Pages: 1 free, unlimited on paid plans. The voice coach is paid only (it has a real cost per minute).
- Optional regional pricing activated for the new language markets.

### 7.4 Gate to v5
≥ 5,000 WAU · extension ≥ 1,000 weekly users · paid conversion ≥ 3% · ≥ 3 schools or bootcamps asking for group access (inbound demand).

---

## 8. v5 "Cohorts" and v6 "Platform" (2027+)

### 8.1 v5 "Cohorts": B2B for career services (Apr – Jul 2027)
**Buyers:** engineering schools, universities, bootcamps, upskilling programs, NGOs and government employment programs in MENA, Africa and South Asia.
**Job-to-be-done:** "Get more of our graduates hired remotely, and prove it."

- **Cohort dashboard:** students' pipelines (with each student's consent), applications, response and interview rates, at-risk students (no activity, low fit), placements.
- **Coach mode:** a coach comments on drafts, assigns Gap-to-Proof projects, runs mock interviews.
- **Placement reports:** exportable outcome reports. Schools need them for accreditation and marketing.
- **Program templates:** "4-week remote job sprint" with weekly goals.
- Seat pricing: from **$49/mo (20 seats)** up to annual contracts. Discounts for public programs.
- Requires: organizations, roles, invitations, audit log, data processing agreements.

### 8.2 v6 "Platform" (H2 2027+)
- **⭐ Reverse Feed (opt-in talent network):** companies that **verifiably hire from a region** (from the Hiring-Geography Graph) can browse **opted-in** candidates with **evidence-backed fit summaries** and proof projects, and contact them.
  - Candidates control their visibility (anonymous until they accept).
  - Revenue: a company subscription or a success fee, **never** a charge to the candidate for visibility.
- **Public API** for partners (job boards, schools, AI assistants): eligibility classification, fit analysis, Hiring-Geography lookups. Usage-based pricing.
- **Integrations:** export the pipeline to Notion or Google Sheets, a calendar for interviews, Gmail/Outlook "mark as replied" detection (read-only, opt-in).
- **Verified skills (exploratory):** short practical challenges, graded with evals, which produce shareable proof badges. Only if they're honest and resistant to cheating.

---

## 9. Gates, metrics & kill criteria

### 9.1 Version gates (summary)
| Move to | Must have |
|---|---|
| v2 | Founder dogfooding daily · first paying stranger · D7 retention ≥ 25% |
| v3 | 300 WAU · 20 paying users · 10 interview reports · research-agent citation rate ≥ 95% |
| v4 | 1,500 WAU · 5,000 tracked outcomes · Reply Odds calibrated · SEO ≥ 30% of signups |
| v5 | 5,000 WAU · extension 1,000 weekly · conversion ≥ 3% · 3 inbound B2B requests |
| v6 | ≥ 10 paying B2B customers · ≥ 50k tracked outcomes · legal review of the talent network |

### 9.2 Metrics tracked from v1 onward
- **North star:** interviews per active user per month.
- Activation (first analysis), D7/D30 retention, free→paid conversion, revenue per paying user, LLM cost per active user (must stay < 25% of revenue per user).
- Quality: eval metrics per prompt version, feedback 👎 rate, honesty-flag rate.

### 9.3 Kill / pivot criteria (be honest with yourself)
- **By 31 Dec 2026:** fewer than 100 weekly active users **and** under $100 total revenue, despite real distribution effort → put JobPilot into maintenance mode. Keep it as a portfolio piece and move effort elsewhere (GiveMeThatMoney rule: keep winners, kill flops).
- **Pivot signals:**
  - Users love **only the eligibility check** → become "the eligibility layer": API + extension + SEO directory.
  - **Schools** pull harder than individuals → jump straight to v5.
- **The founder lands a job:** JobPilot continues as a side project at the v2 level. v3+ only if the metrics hit the gates.

---

## 10. Unique features summary (the "why us" list)

| # | Feature | Version | Why competitors don't have it |
|---|---|---|---|
| 1 | **Cross-border eligibility check with evidence** | v0 | US-centric tools don't think about the problem at all |
| 2 | **Score computed in code + public evals** | v0 | Others show an opaque AI number with no proof |
| 3 | **Job-hunt pricing (one-time Sprint passes)** | v1.5 | Competitors depend on subscriptions |
| 4 | **Gap-to-Proof Generator** (missing skill → 1–3 day project + agent prompt pack → updated score) | v2 | Others report gaps. We close them with proof. |
| 5 | **"Explain your code" interview drill** | v2 | Made for the AI-built-portfolio era |
| 6 | **Hiring-Geography Graph** (which companies really hire from your country) | v3 | Needs our job data + outcome data, so it grows into a moat |
| 7 | **Reply Odds** (rank jobs by expected reply, not only fit) | v3 | Needs outcome data at scale |
| 8 | **Ghost-job & scam detector** tuned to remote-job scams | v3 | Protects the audience others don't serve |
| 9 | **Fit Pages** (a tailored mini-site per application, with view count) | v4 | Turns a CV skim into a page made for that hiring manager |
| 10 | **Voice coach for non-native English speakers** | v4 | Big tools assume native speakers |
| 11 | **JobPilot MCP server** (job hunt from inside Claude) | v4 | An agent-native distribution channel |
| 12 | **Reverse Feed** (verified cross-border hiring, opt-in talent network) | v6 | Built on the Hiring-Geography Graph |

---

## 11. Feature matrix by version

| Capability | v0 | v1 | v1.5 | v2 | v3 | v4 | v5 | v6 |
|---|---|---|---|---|---|---|---|---|
| Eligibility + fit + drafts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Accounts, profile | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Matched feed | | ✅ | ✅ | ✅ | ✅ (Reply Odds) | ✅ | ✅ | ✅ |
| Tracker + stats | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payments | | | ✅ | ✅ | ✅ + Pro | ✅ | ✅ + seats | ✅ + API |
| Research agent, outreach sequences | | | | ✅ | ✅ | ✅ | ✅ | ✅ |
| Interview prep (text) | | | | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gap-to-Proof | | | | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hiring-Geography Graph, Radar, Salary | | | | | ✅ | ✅ | ✅ | ✅ |
| Ghost/scam detector | | | | | ✅ | ✅ | ✅ | ✅ |
| Extension, Fit Pages, voice coach, MCP | | | | | | ✅ | ✅ | ✅ |
| French / Arabic / ES / PT | | | | | | ✅ | ✅ | ✅ |
| Cohorts / coach mode | | | | | | | ✅ | ✅ |
| Reverse Feed, public API | | | | | | | | ✅ |

---

## 12. Revenue evolution (estimates, assumptions in PRD §9)

| Stage | Main revenue | Rough monthly revenue if the gates are met |
|---|---|---|
| v1.5 (Nov 2026) | Sprint passes | $10–400 |
| v2 (Dec 2026) | Sprint 90 upsell (agent features) | $300–1,500 |
| v3 (Q1 2027) | Passes + Pro monthly | $1,000–4,000 |
| v4 (Q2 2027) | + new language markets, paid voice coach | $3,000–10,000 |
| v5 (H2 2027) | + B2B seats (schools and bootcamps) | $8,000–25,000 |
| v6 (2028) | + company subscriptions, API | Depends on the network effect |

These are **upside scenarios conditional on each gate**, not forecasts. The PRD's realistic near-term numbers still hold: tens of dollars in the first 20 days.

---

## 13. Risks across versions

| Risk | Versions | Mitigation |
|---|---|---|
| LLM costs grow faster than revenue | v2+ (agents, voice) | Paid-only for costly features, caching shared company briefs, cost caps per run, cost per user tracked on `/admin` |
| Privacy and regulation (GDPR, Law 09-08) as aggregate data grows | v3+ | Opt-in consent, k-anonymity, data protection impact assessment before v3, EU data residency for the database |
| Job sources revoke access | all | Many sources, plus "paste any job" and the extension (user-viewed pages) |
| Big players copy features | v2+ | The moat is data (geo graph, outcomes) + an underserved audience + B2B in local markets |
| Two-sided marketplace is hard (Reverse Feed) | v6 | Start only with companies already proven to hire from the region. Pilot manually first. |
| Extension or form-assist seen as automation abuse | v4 | The user always clicks Submit, no background activity, follow each platform's terms |
| Founder bandwidth (one person) | all | Gates prevent premature building. Agents do the heavy lifting. Cut lists per version. |

---

## 14. What I need from you (review checklist)
1. Do the **unique features** (§10) feel right? Any to cut, or ideas of your own to add?
2. Are the **gates** (§9.1) ambitious enough, or too strict?
3. Agree with the **kill criteria** (31 Dec 2026)?
4. **v5 B2B:** do you know schools or bootcamps in Morocco that could be early partners (e.g. your own university's career services)?
5. Anything in v2–v4 you want **pulled earlier** (for example, the voice coach, since it also helps your own interviews)?
