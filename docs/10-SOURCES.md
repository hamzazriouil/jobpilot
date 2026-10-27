# Job sources

> 2026-10-25 · W13 Ingest; Jobicy and the other candidates 2026-10-27 (W18). Extends [05-ARCHITECTURE §5.4](05-ARCHITECTURE.md) and [09-PHASE1-CONTRACT §5](09-PHASE1-CONTRACT.md).
> Code: `workers/ingest/src/sources/*`. Each source's terms were read on the date above. Read them again before changing anything here.

## Summary

| Source | Enabled | Why |
|---|---|---|
| **Himalayas** | **yes** | Commercial use is allowed without asking. Location limits come as structured country lists. Large volume. |
| **Remote OK** | **yes** | Only asks for a followed link back and the name. Good share of dev jobs. Locations are often empty. |
| **Jobicy** | **yes** (2026-10-27) | Terms explicitly allow commercial use and aggregators. Credit with a clickable link; apply links go to the Jobicy page; poll at most hourly. Mostly US jobs, but every job has a location field. |
| Remotive | no | Its terms forbid showing its jobs to collect signups. Our feed is behind login. Also only ~10 dev jobs in the free feed. |
| Arbeitnow | no | Mostly on-site jobs in Germany (22 of 300 remote). Its site licence forbids commercial use and public display, which contradicts the API clause: unclear, so no. |
| We Work Remotely | no | API terms (read 2026-10-27) ban "a job advertising or job search service" and storing their data. |
| Working Nomads | no | No API terms; site terms ban commercial use and building a competing product. |
| 4dayweek.io | no (ask first) | Free API, but terms forbid using it to "populate a competing job board". Needs written permission. |
| Landing.jobs, Remote Rocketship | no | Landing.jobs forbids republishing; Remote Rocketship's API is a paid personal subscription. |
| HN "Who is hiring" | no | Free-form comments: no title, company or location fields. Each post would need an LLM to parse. Revisit later. |

## Rules for every source (all of them, enabled or not)

- Every request sends `User-Agent: ApplyVerdictBot/0.1 (+https://jobpilot-web.buildli731.workers.dev)`.
- At most 1 request per second per source. Timeout 20 s. One retry on 429/503, honoring `Retry-After` (capped at 30 s).
- Every job links back to its original post (`jobs.url`). The UI shows `sources.attribution` next to it.
- Jobs are shown only inside ApplyVerdict. We don't pass them to other job boards, feeds, Google Jobs or LinkedIn. **No `JobPosting` structured data** (schema.org) on job pages.
- Expired jobs leave the feed. `match_jobs` already filters `expires_at`. The W12 job list must do the same.
- Dedupe: a job whose `content_hash` already exists among public jobs is skipped, even if it comes from another source.

## Himalayas — enabled

- **API:** `GET https://himalayas.app/jobs/api?limit=20&cursor=…` (newest first, 20 jobs per request, cursor pagination) and `GET https://himalayas.app/jobs/api/search?…&page=N` (filters, 20 per page, no cursor). Docs: <https://himalayas.app/api>.
- **Streams (added 2026-10-26):** the newest feed alone is mostly US-only jobs. On 2026-10-26, 0 of the 26 jobs it added were open to a user in Morocco, while the search API listed ~1,100 worldwide "engineer" jobs. Each run reads, in order:
  1. `feed`: the browse feed;
  2. `worldwide:engineer`, `worldwide:developer`: `worldwide=true&sort=recent&q=…`;
  3. `<CC>:engineer`, `<CC>:developer` for the top `SEARCH_COUNTRIES` (2) countries of onboarded users: `country=CC&exclude_worldwide=true&sort=recent&q=…`.

  The run's page budget is split evenly, with the remainder going to the feed. The pipeline tracks "caught up" per stream, so a known feed doesn't stop the searches. The first backfill (`--pages 60`) added 199 jobs: 158 worldwide and 41 open to Morocco.
- **Known gap:** the API also has `timezoneRestrictions` (UTC offsets), which we don't store. A "worldwide" job limited to, say, UTC+3:30 shows as worldwide. The full analysis still reads the description.
- **Terms:** "Terms and Conditions for API Users" in <https://himalayas.app/terms>. In short:
  - Personal and commercial use are both allowed, including on your own job board. No need to ask first.
  - Clearly name Himalayas as the source, with a visible link to the Himalayas job or to himalayas.app.
  - **Every Apply action must use the `applicationLink` from the API, unchanged.** No direct employer or ATS links.
  - Show the jobs only on sites and apps you operate. Don't pass them to other job boards, aggregators, search engines, Google Jobs or LinkedIn Jobs (this includes feeds and JobPosting structured data).
  - Cache where you can, stay within the limits, and remove jobs once they expire.
  - API keys are private and server-side only. They give read access to public job data.
- **Attribution (stored):** `Via Himalayas (https://himalayas.app)`.
- **Rate limits:** without a key, one public allowance shared by all callers. With a free key: 60 requests/min and 10,000/day. Data refreshes daily. We use at most 1 req/s and 10 requests per run (cron every 6 h). Optional secret `HIMALAYAS_API_KEY` (free at himalayas.app/api-keys).
- **Fields we map:**

  | Himalayas | `jobs` column | Notes |
  |---|---|---|
  | `guid` | `source_job_id` | the path after `/companies/` |
  | `applicationLink` | `url` | a himalayas.app link, so it satisfies both the link-back and the apply-link rule |
  | `title`, `companyName` | `title`, `company` | |
  | `companySlug` | `company_url` | the Himalayas company page |
  | `description` (HTML) | `description` | `htmlToText` |
  | `locationRestrictions` (country names) | `location_raw`, `eligibility_type`, `allowed_regions`, `eligibility_quote` | empty list → `worldwide`; names → ISO-2 codes |
  | `seniority[]` | `seniority` | Entry-level → junior, Mid-level → mid, Senior → senior, Manager/Director/Executive → lead (highest wins) |
  | `minSalary`, `maxSalary`, `currency`, `salaryPeriod` | `salary_min_usd`, `salary_max_usd` | USD only, converted to yearly (hourly × 2080, monthly × 12…) |
  | `categories` | `tags` | SEO-style entries ("… jobs", "remote …") dropped, max 8 |
  | `pubDate`, `expiryDate` (Unix s) | `posted_at`, `expires_at` | |

## Remote OK — enabled

- **API:** `GET https://remoteok.com/api`. One request returns the latest ~100 jobs. The first array element is a legal notice, not a job.
- **Terms:** the notice inside the API response, plus <https://remoteok.com/legal>. In short:
  - Link back to the job's URL on Remote OK **with a normal, followed link (no `rel="nofollow"`)**, and mention Remote OK as the source. Otherwise they suspend API access.
  - Don't use the Remote OK logo without written permission. Do use the name "Remote OK".
  - The legal page asks for a link back on every page or screen that uses their data.
  - No rate limit is published. We make 1 request per run (4 a day).
- **Attribution (stored):** `Via Remote OK (https://remoteok.com)`.
- **For W12:** Remote OK links must not carry `rel="nofollow"`. (`noopener` is fine.)
- **Fields we map:** `id` → `source_job_id`; `url` → `url`; `position` → `title`; `company`; `description` (HTML; we repair double-encoded UTF-8, then `htmlToText`); `location` → `location_raw` (then the location rules; often empty → `unclear`); `salary_min`/`salary_max` (yearly USD, 0 = not given); `tags` minus the tags they put on almost every post ("digital nomad", "dev", "marketing"…); `date` → `posted_at`; seniority from the title.

## Remotive — not enabled

- **API:** `GET https://remotive.com/api/remote-jobs?category=software-dev`. Docs: <https://github.com/remotive-com/remote-jobs-api>.
- **Terms (from the README and the API's legal notice):**
  - Link back to the Remotive URL **and** mention Remotive as the source.
  - Don't submit Remotive jobs to third-party sites (Jooble, Neuvoo, Google Jobs, LinkedIn Jobs…).
  - Jobs are delayed by 24 hours. At most ~4 requests a day; more than 2 a minute gets blocked.
  - **"Displaying our jobs in order to collect signups/email addresses to show a listing constitutes a breach of our terms of services."**
- **Why not:** our feed requires an account, so showing Remotive jobs there would break that last rule. The free feed also had only 10 software-dev jobs on 2026-10-25. Possible later: show Remotive jobs on a public page with no login, or buy their paid API.
- Its `candidate_required_location` strings ("USA, Canada, USA timezones", "Europe, USA, Canada, APAC") are in the location-rule tests.

## Jobicy — enabled

- **API:** `GET https://jobicy.com/api/jobs?count=50&industry=<slug>` (JSON, newest first, cursor pagination over a 7-day window, no key). Docs: <https://jobicy.com/jobs-rss-feed> (also <https://jobi.cy/apidocs>).
- **Terms (read 2026-10-27, on the docs page):** the free API "can be used in commercial projects, subscription-based SaaS platforms", "No separate commercial agreement or approval is required", and aggregators are explicitly welcome. Data may be stored and cached. Conditions:
  - credit Jobicy as the source with a clickable link (`sources.attribution` = "Via Jobicy (https://jobicy.com)", shown on every card);
  - apply links must go to the original Jobicy page: we store the Jobicy listing `url` and never the ATS link;
  - don't present the listings as our own;
  - poll at most once per hour (our cron runs every 6 hours) and handle 429 with a deferred retry (our HTTP helper retries once with Retry-After);
  - keep listings current: the daily maintenance cron calls the free batch status endpoint `/api/jobs/status?ids=…` (100 ids per call) and expires a job only on an explicit `closed` (`unknown` is left alone, as the docs say). Code: `workers/ingest/src/maintenance.ts`.
- **What we read:** industries `engineering` and `data-science`, one page of 50 each per run (2 pages × 4 subrequests). About 75% pass our tech-role filter.
- **Location:** `jobGeo` ("Anywhere", "EMEA, LATAM, Canada, USA", "Czechia") goes into `location_raw` and the shared location rules classify it (they read both countries and regions). In a 100-job sample: 5 worldwide, 64 region-limited (mostly USA), 4 unclear.
- **Salary:** only USD ranges are kept (yearly, or converted from the stated period).

## Arbeitnow — not enabled

- **API:** `GET https://www.arbeitnow.com/api/job-board-api` (300 jobs per page). Info: <https://www.arbeitnow.com/blog/job-board-api>.
- **Terms:** the API says "free public API for jobs, please do not abuse", asks for a link back, and points to the site's general terms. No rate limit is published.
- **Why not:** the jobs are mostly on-site in Germany, and many are in German. Only 12 of 300 had `remote: true` (22 of 300 on 2026-10-27). Low value for a remote-job feed.
- **Terms (re-read 2026-10-27):** <https://www.arbeitnow.com/en/terms> section 11 asks API users for a link back, but section 2 (licence) forbids using the materials "for any commercial purpose, or for any public display". Contradictory, so treated as not allowed.

## We Work Remotely — not enabled

- **Feed:** `https://weworkremotely.com/categories/remote-programming-jobs.rss`.
- **Terms (read in a browser 2026-10-27):** the RSS page asks only for attribution, but the API terms <https://weworkremotely.com/api-terms-and-guidelines> forbid building "a job advertising or job search service" and say storing their data is prohibited. ApplyVerdict is a job search service that stores jobs, so **not allowed** without written permission (hello@weworkremotely.com).

## HN "Who is hiring" — not enabled

- **API:** Algolia HN Search, <https://hn.algolia.com/api> (the monthly thread's comments).
- **Terms:** the API page we read states no rate limit or terms. Comments belong to their authors.
- **Why not:** each comment is free text, with no title, company or location fields. Normalizing it needs an LLM per post, and our Workers AI budget is small (§16). Good candidate for Phase 2.

## Location rules (all sources)

`classifyLocationRules` (`packages/core/src/jobs/location.ts`) runs when a source has no structured location. It reads the location field, then restriction sentences in the description ("must be based in…", "US only", "authorized to work in…"). Time-zone phrases ("UTC±3", "CET ±2h") map to broad regions only when no place is named. Contradictions or nothing found → `unclear`. The DB treats `unclear` as eligible. For `unclear` jobs only, the Worker asks Gemini (task `classify_location`, at most `LLM_FALLBACK_CAP` calls per run). The answer is kept only if its quote appears word for word in the posting.

## Worker limits

Defaults: `INGEST_MAX_PAGES=10` requests per source per run, `LLM_FALLBACK_CAP=10`. One cron run then makes about 30–45 outbound requests. That fits the Workers Paid plan easily. On Workers Free (50 subrequests per invocation, 10 ms CPU), lower both vars (e.g. 5 and 3) and watch the logs for CPU-limit errors.
