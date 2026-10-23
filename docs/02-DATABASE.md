# Database: JobPilot

> v1.1 · 2026-10-23 · Supabase Postgres (+ pgvector) · Companion docs: [PRD](01-PRD.md) · [Architecture](05-ARCHITECTURE.md)
> The SQL here is `supabase/migrations/0001_init.sql` (§4–§6, in order) and `supabase/seed.sql` (§8). Keep them in sync; the migration file wins if they ever differ. Changes since v1.0 are listed in §9.

---

## 1. Principles
- **Supabase Auth owns users.** `profiles.id` = `auth.users.id`, and deleting a user cascades to all of their data (PRD §10 "one-click deletion").
- **RLS on every table.** Users touch only their own rows. Public job posts can be read by any logged-in user. System tables can be used by the **service role only**.
- **No personal data in system tables.** `llm_calls` and `usage_counters` hold no CV or job text, and IPs are hashed with a daily salt.
- **Anonymous v0 stores nothing personal.** Only `usage_counters` (hashed IP) and `llm_calls` rows are written.
- **Expire data.** Public jobs expire after 45 days, and logs older than 90 days are deleted by a cron job.

## 2. Entity overview
```
auth.users 1─1 profiles
profiles 1─* analyses *─1 jobs
analyses 1─* drafts
profiles 1─* applications *─1 jobs   (one application per user+job)
applications 1─* application_events
profiles 1─* daily_matches *─1 jobs
profiles 1─* entitlements, payments, feedback
sources 1─* jobs
system: usage_counters, llm_calls, webhook_events, eval_runs
```

## 3. Phase map
| Table | Phase |
|---|---|
| `usage_counters`, `llm_calls` (+ `consume_quota`) | **0** |
| `profiles`, `sources`, `jobs`, `analyses`, `drafts`, `applications`, `application_events`, `daily_matches`, `feedback` (+ `match_jobs`) | 1 |
| `entitlements`, `payments`, `webhook_events` (+ `current_plan`) | 2 |
| `eval_runs` | 3 (created in Phase 0, since the evals page is a portfolio piece) |

Create everything in a single migration on Day 1. That's simpler, and the tables cost nothing while empty.

---

## 4. SQL

```sql
-- 0001_init.sql: JobPilot initial schema
-- Spec: docs/02-DATABASE.md (keep the two in sync).
-- Target: Supabase Postgres 15+ with pgvector >= 0.5 (HNSW).
--
-- Conventions
--  * Extensions live in the `extensions` schema (Supabase convention; the
--    Security Advisor flags extensions installed in `public`). Every vector
--    reference is therefore schema-qualified: `extensions.vector(768)`,
--    `extensions.vector_cosine_ops`, `operator(extensions.<=>)`.
--  * Every function pins `search_path = ''` and fully qualifies the objects it
--    touches, so a caller cannot hijack name resolution (Supabase advisor
--    lint "function_search_path_mutable").
--  * Table privileges are granted explicitly below (section "privileges"),
--    instead of relying on Supabase's default "grant all to anon,
--    authenticated". RLS stays the row-level gate; grants are the column gate.

create schema if not exists extensions;            -- already exists on Supabase
create extension if not exists vector with schema extensions;
-- gen_random_uuid() is built into Postgres 13+, so pgcrypto is not needed.

-- ───────────── enums ─────────────
create type public.seniority      as enum ('intern','junior','mid','senior','lead');
create type public.eligibility_v  as enum ('eligible','unclear','not_eligible');
create type public.fit_band       as enum ('strong','good','stretch','long_shot');
create type public.app_stage      as enum ('saved','applied','replied','interviewing','offer','rejected','ghosted');
create type public.draft_kind     as enum ('cover_letter','cold_dm','cv_bullets','follow_up','interview_prep','company_brief');
create type public.plan_kind      as enum ('sprint30','sprint90');   -- "free" = no active entitlement
create type public.feedback_kind  as enum ('score_wrong','eligibility_wrong','draft_bad','other');

-- ───────────── profiles ─────────────
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  country_code      char(2),                       -- residence, for eligibility only
  work_auth_regions text[] not null default '{}',  -- expanded, e.g. {'MA','AFRICA','EMEA','MENA'}
  target_roles      text[] not null default '{}',  -- e.g. {'AI engineer','full-stack developer'}
  seniority         public.seniority,
  salary_floor_usd  integer,                       -- monthly
  cv_text           text,                          -- raw, user-provided (needed for drafts)
  cv_parsed         jsonb,                         -- ProfileLLM output, user-reviewed (server-written)
  profile_version   integer not null default 1,    -- server-written
  embedding         extensions.vector(768),        -- bge-base-en-v1.5 (server-written)
  digest_opt_in     boolean not null default false,
  onboarded_at      timestamptz,
  last_active_at    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- generic updated_at maintenance
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_updated_at_trg before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create profile on signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',   -- magic link / most providers
             new.raw_user_meta_data->>'name',        -- Google
             split_part(new.email, '@', 1))
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── sources & jobs ─────────────
create table public.sources (
  id           text primary key,                   -- 'remoteok','remotive','himalayas','arbeitnow','wwr','hn','user_paste'
  name         text not null,
  kind         text not null check (kind in ('api','rss','user')),
  url          text,
  attribution  text,                               -- text/link we must display
  enabled      boolean not null default false,
  last_run_at  timestamptz,
  last_status  text
);

create table public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  source_id          text not null references public.sources(id),
  source_job_id      text,                         -- id in the source system (null for pasted)
  owner_id           uuid references public.profiles(id) on delete cascade, -- null = public feed job
  url                text,
  title              text not null,
  company            text,
  company_url        text,
  description        text not null,               -- plain text / markdown, <= 15k chars
  location_raw       text,
  eligibility_type   text check (eligibility_type in ('worldwide','regions','unclear')),
  allowed_regions    text[] not null default '{}', -- ISO-2 and region codes: 'US','EU','EMEA','AFRICA','MA'...
  eligibility_quote  text,
  seniority          public.seniority,
  salary_min_usd     integer,                      -- yearly, normalized when possible
  salary_max_usd     integer,
  tags               text[] not null default '{}',
  content_hash       text not null,
  embedding          extensions.vector(768),
  posted_at          timestamptz,
  ingested_at        timestamptz not null default now(),
  expires_at         timestamptz,
  unique (source_id, source_job_id)
);
create unique index jobs_public_hash_uq on public.jobs (content_hash) where owner_id is null;
create index jobs_feed_idx  on public.jobs (posted_at desc) where owner_id is null;
create index jobs_owner_idx on public.jobs (owner_id) where owner_id is not null;
create index jobs_embedding_idx on public.jobs using hnsw (embedding extensions.vector_cosine_ops);

-- ───────────── analyses & drafts ─────────────
create table public.analyses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  job_id              uuid not null references public.jobs(id) on delete cascade,
  profile_version     integer not null,
  eligibility         public.eligibility_v not null,
  eligibility_detail  jsonb not null,             -- {allowedRegions, evidenceQuote, reasoning}
  requirements        jsonb not null,             -- AnalysisLLM.requirements (post evidence check)
  gaps                jsonb not null default '[]',
  red_flags           jsonb not null default '[]',
  job_level           public.seniority,
  candidate_level     public.seniority,
  score               smallint not null check (score between 0 and 100),
  band                public.fit_band not null,
  evidence_downgrades smallint not null default 0,
  provider            text not null,
  model               text not null,
  prompt_version      text not null,
  created_at          timestamptz not null default now(),
  unique (user_id, job_id, profile_version)       -- cache key
);
create index analyses_user_idx on public.analyses (user_id, created_at desc);

create table public.drafts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  analysis_id    uuid references public.analyses(id) on delete cascade,
  application_id uuid,                             -- FK added below (follow-ups)
  kind           public.draft_kind not null,
  content        text not null,                    -- cv_bullets/interview_prep stored as JSON text
  honesty_flags  jsonb not null default '[]',
  provider       text not null,
  model          text not null,
  prompt_version text not null,
  created_at     timestamptz not null default now()
);
create index drafts_analysis_idx on public.drafts (analysis_id);

-- ───────────── tracker ─────────────
create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  job_id           uuid not null references public.jobs(id) on delete cascade,
  analysis_id      uuid references public.analyses(id) on delete set null,
  stage            public.app_stage not null default 'saved',
  position         double precision not null default 0,     -- order inside a kanban column
  channel          text check (channel in ('email','linkedin','x','form','referral','other')),
  applied_at       timestamptz,
  last_contact_at  timestamptz,
  follow_up_due_at date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, job_id)
);
create index applications_user_stage_idx on public.applications (user_id, stage, position);
create index applications_followup_idx on public.applications (follow_up_due_at) where stage = 'applied';

alter table public.drafts add constraint drafts_application_fk
  foreign key (application_id) references public.applications(id) on delete cascade;
create index drafts_application_idx on public.drafts (application_id) where application_id is not null;

create table public.application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  from_stage     public.app_stage,
  to_stage       public.app_stage not null,
  at             timestamptz not null default now()
);
create index application_events_user_idx on public.application_events (user_id, at);
create index application_events_app_idx  on public.application_events (application_id);

-- BEFORE: maintain applied_at / follow_up_due_at / updated_at
create function public.app_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stage = 'applied' and new.applied_at is null then
    new.applied_at := now();
    new.follow_up_due_at := coalesce(new.follow_up_due_at, (now() + interval '5 days')::date);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger applications_before_trg before insert or update on public.applications
  for each row execute function public.app_before();

-- AFTER: log stage changes (row exists now, so the FK is satisfied).
-- SECURITY DEFINER: clients may write `applications` directly (RLS), but have no
-- INSERT right/policy on `application_events`; the log is written as the owner.
create function public.app_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.application_events (application_id, user_id, from_stage, to_stage)
    values (new.id, new.user_id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
  end if;
  return null;
end $$;
create trigger applications_after_trg after insert or update on public.applications
  for each row execute function public.app_after();
```

```sql
-- ───────────── daily feed ─────────────
create table public.daily_matches (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  match_date  date not null,
  similarity  real not null,
  rank        smallint not null,
  analysis_id uuid references public.analyses(id) on delete set null,
  dismissed   boolean not null default false,
  primary key (user_id, job_id)                 -- a job is matched to a user at most once
);
create index daily_matches_feed_idx on public.daily_matches (user_id, match_date desc, rank);

-- ───────────── feedback ─────────────
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,  -- null = anonymous
  analysis_id uuid references public.analyses(id) on delete set null,
  kind        public.feedback_kind not null,
  comment     text check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now()
);

-- ───────────── billing (Phase 2) ─────────────
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete set null,  -- keep records for accounting
  dodo_payment_id  text not null unique,
  product_id       text not null,
  plan             public.plan_kind not null,
  amount_cents     integer not null,
  currency         char(3) not null,
  status           text not null,                -- succeeded | refunded | disputed | failed
  created_at       timestamptz not null default now()
);

create table public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  plan        public.plan_kind not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  payment_id  uuid references public.payments(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index entitlements_user_idx on public.entitlements (user_id, ends_at desc);

create table public.webhook_events (
  id           text primary key,                 -- Dodo 'webhook-id' header (idempotency)
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- ───────────── system ─────────────
create table public.usage_counters (
  subject  text not null,                         -- 'user:<uuid>' | 'ip:<sha256>'
  day      date not null default current_date,
  feature  text not null,                         -- 'analyze' | 'draft' | 'parse' | 'lock'
  count    integer not null default 0,
  primary key (subject, day, feature)
);

create table public.llm_calls (
  id             bigint generated always as identity primary key,
  user_id        uuid references public.profiles(id) on delete set null,
  feature        text not null,                   -- analyze | draft | parse | classify_location | follow_up | ...
  provider       text not null,
  model          text not null,
  prompt_version text,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  cost_usd       numeric(10,6) not null default 0,
  schema_valid   boolean,
  retries        smallint not null default 0,
  error_code     text,
  created_at     timestamptz not null default now()
);
create index llm_calls_day_idx on public.llm_calls (created_at);

create table public.eval_runs (
  id              uuid primary key default gen_random_uuid(),
  git_sha         text,
  provider        text not null,
  model           text not null,
  prompt_version  text not null,
  dataset_version text not null,
  metrics         jsonb not null,  -- {eligibilityAcc, bandAcc, bandWithin1, schemaValid, downgradeRate, honestyFlagRate, injectionPass, p50ms, p95ms, costPerCase}
  created_at      timestamptz not null default now()
);
```

## 5. Functions (RPC)

| Function | Called by | Security |
|---|---|---|
| `consume_quota(subject, feature, limit) → boolean` | server (service role) | definer; EXECUTE revoked from clients |
| `current_plan(user) → (plan, ends_at)` | server or signed-in client (`rpc('current_plan', { p_user })`) | **invoker**: RLS limits a client to its own entitlements |
| `match_jobs(user, limit=100) → (job_id, similarity)` | ingest/digest (service role) | definer; EXECUTE revoked from clients |
| `run_maintenance() → jsonb` | ingest cron (service role) | definer; EXECUTE revoked from clients |

```sql
-- ───────────── functions (RPC) ─────────────

-- Atomic quota check. Returns true and increments if under the limit.
-- Server (service role) only.
create function public.consume_quota(p_subject text, p_feature text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit <= 0 then
    return false;                              -- a limit of 0 means "not allowed"
  end if;
  insert into public.usage_counters as u (subject, day, feature, count)
  values (p_subject, current_date, p_feature, 1)
  on conflict (subject, day, feature)
  do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into v_count;
  return v_count is not null;   -- null -> conflict row existed and was at the limit
end $$;

-- Current plan: 'free' unless an entitlement is active now.
-- ends_at = end of the last pass that has not expired yet, so stacked
-- (back-to-back) passes report the final end date; the webhook uses it as the
-- next pass's starts_at.
-- SECURITY INVOKER on purpose: a signed-in user only sees their own
-- entitlements through RLS (asking about someone else returns 'free'); the
-- service role bypasses RLS and sees everyone.
create function public.current_plan(p_user uuid)
returns table (plan text, ends_at timestamptz)
language sql stable set search_path = '' as $$
  select coalesce(a.plan::text, 'free'),
         case when a.plan is not null then (
           select max(e2.ends_at) from public.entitlements e2
           where e2.user_id = p_user and e2.ends_at > now()
         ) end
  from (select 1) d
  left join lateral (
    select e.plan from public.entitlements e
    where e.user_id = p_user and e.starts_at <= now() and e.ends_at > now()
    order by e.ends_at desc
    limit 1
  ) a on true;
$$;

-- Candidate jobs for a user's daily feed. Server (service role) only.
create function public.match_jobs(p_user uuid, p_limit integer default 100)
returns table (job_id uuid, similarity real)
language sql stable security definer set search_path = '' as $$
  select j.id, (1 - (j.embedding operator(extensions.<=>) p.embedding))::real
  from public.profiles p
  join public.jobs j on j.owner_id is null
                    and j.embedding is not null
                    and (j.expires_at is null or j.expires_at > now())
  where p.id = p_user
    and p.embedding is not null
    -- eligibility: worldwide, unclear, or any overlap with the user's regions
    and (j.eligibility_type in ('worldwide','unclear')
         or j.allowed_regions && (p.work_auth_regions || array[p.country_code::text]))
    and not exists (select 1 from public.daily_matches m where m.user_id = p.id and m.job_id = j.id)
    and not exists (select 1 from public.applications a where a.user_id = p.id and a.job_id = j.id)
  order by j.embedding operator(extensions.<=>) p.embedding
  limit p_limit;
$$;

-- Daily maintenance (docs §7), callable from the ingest Worker via
-- supabase.rpc('run_maintenance') with the service role. Returns row counts.
create function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expired  integer;
  v_jobs     integer;
  v_calls    integer;
  v_counters integer;
begin
  update public.jobs set expires_at = now()
   where owner_id is null and expires_at is null
     and coalesce(posted_at, ingested_at) < now() - interval '45 days';
  get diagnostics v_expired = row_count;

  delete from public.jobs j
   where j.owner_id is null and j.expires_at < now() - interval '15 days'
     and not exists (select 1 from public.applications a where a.job_id = j.id);  -- keep jobs users track
  get diagnostics v_jobs = row_count;

  delete from public.llm_calls where created_at < now() - interval '90 days';
  get diagnostics v_calls = row_count;

  delete from public.usage_counters where day < current_date - 7;
  get diagnostics v_counters = row_count;

  return jsonb_build_object('jobs_expired', v_expired, 'jobs_deleted', v_jobs,
                            'llm_calls_deleted', v_calls, 'usage_counters_deleted', v_counters);
end $$;
```
**Region codes:** the ingest classifier writes **both** the country codes and the region codes a job allows (e.g. a job "open to EMEA" → `{'EMEA'}`). The profile's `work_auth_regions` must contain the user's **expanded** regions (e.g. Morocco → `{'MA','AFRICA','EMEA','MENA'}`). This expansion is done in code (`packages/core/regions.ts`) when the profile is saved, so the overlap check (`&&`) in `match_jobs` stays simple. `country_code` is added to the overlap set as well. Jobs whose `eligibility_type` is still `null` (not classified yet) are **not** matched.

**Stacked passes:** `current_plan.ends_at` is the end of the *last* non-expired pass, so the webhook can use `starts_at = max(now(), current_plan.ends_at)` for the next one (Architecture §11).

## 6. Row-level security & privileges

```sql
-- ───────────── row-level security ─────────────
alter table public.profiles           enable row level security;
alter table public.sources            enable row level security;
alter table public.jobs               enable row level security;
alter table public.analyses           enable row level security;
alter table public.drafts             enable row level security;
alter table public.applications       enable row level security;
alter table public.application_events enable row level security;
alter table public.daily_matches      enable row level security;
alter table public.feedback           enable row level security;
alter table public.payments           enable row level security;
alter table public.entitlements       enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.usage_counters     enable row level security;
alter table public.llm_calls          enable row level security;
alter table public.eval_runs          enable row level security;

-- own-row access ((select auth.uid()) is evaluated once per statement, not per row)
create policy "own profile r"    on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile u"    on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own analyses"     on public.analyses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own drafts"       on public.drafts   for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own applications" on public.applications for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    -- may only track a job you can see (public, or your own pasted job)
    and exists (select 1 from public.jobs j
                where j.id = applications.job_id
                  and (j.owner_id is null or j.owner_id = (select auth.uid())))
    -- may only link your own analysis
    and (applications.analysis_id is null
         or exists (select 1 from public.analyses an
                    where an.id = applications.analysis_id
                      and an.user_id = (select auth.uid())))
  );
create policy "own app events"   on public.application_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own matches r"    on public.daily_matches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own matches u"    on public.daily_matches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid())); -- dismiss
create policy "own entitlements" on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own payments"     on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

-- jobs: public feed jobs readable by logged-in users; private (pasted) jobs only by owner
create policy "read jobs" on public.jobs for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

-- sources & eval results are public
create policy "read sources" on public.sources   for select to anon, authenticated using (true);
create policy "read evals"   on public.eval_runs for select to anon, authenticated using (true);

-- feedback: anyone may insert, nobody reads via the API
create policy "insert feedback" on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- usage_counters, llm_calls, webhook_events: no policies -> service role only.
-- analyses/drafts/jobs/entitlements/payments writes happen server-side with the
-- service role (after LLM + scoring), so clients can never write a fake score.
```

**Rule:** writes to `analyses`, `drafts`, `jobs` (pasted), `entitlements` and `payments` happen **only on the server** with the service role. `profiles` updates from the client are allowed, but `profile_version`, `embedding` and `cv_parsed` are set by `PUT /api/profile` (service role).

**Why explicit grants (not `revoke update (cols)`):** Supabase grants `ALL` on every new `public` table to `anon` and `authenticated`. A column-level `REVOKE` does not narrow a table-level grant, so `revoke update (profile_version, …) on profiles from authenticated` would be a silent no-op. The migration therefore revokes everything from the API roles and grants back only what the client needs. **Any later migration that adds a table must do the same** (enable RLS + explicit grants).

```sql
-- ───────────── privileges ─────────────
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. A column-level REVOKE cannot narrow a table-level grant, so we
-- reset to nothing and grant exactly what the API needs. RLS still filters rows.
revoke all on all tables in schema public from anon, authenticated;
grant  all on all tables in schema public to service_role;
grant  usage, select on all sequences in schema public to service_role;

-- anon (logged out)
grant select on public.sources, public.eval_runs to anon;
grant insert on public.feedback to anon;

-- authenticated
grant select on
  public.profiles, public.sources, public.jobs, public.analyses, public.drafts,
  public.applications, public.application_events, public.daily_matches,
  public.entitlements, public.payments, public.eval_runs
  to authenticated;
-- profiles: profile_version, embedding, cv_parsed (and id/created_at/updated_at)
-- are server-only; they are set by PUT /api/profile with the service role.
grant update (display_name, country_code, work_auth_regions, target_roles, seniority,
              salary_floor_usd, cv_text, digest_opt_in, onboarded_at, last_active_at)
  on public.profiles to authenticated;
grant insert, update, delete on public.applications to authenticated;
grant update (dismissed) on public.daily_matches to authenticated;
grant insert on public.feedback to authenticated;

-- functions: Postgres grants EXECUTE to PUBLIC by default and Supabase also
-- grants it to anon/authenticated, so revoke explicitly (with signatures).
revoke all on function public.consume_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_quota(text, text, integer) to service_role;

revoke all on function public.match_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_jobs(uuid, integer) to service_role;

revoke all on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

revoke all on function public.current_plan(uuid) from public, anon;
grant execute on function public.current_plan(uuid) to authenticated, service_role;

-- trigger functions are never called directly (triggers fire regardless of EXECUTE)
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.app_before()      from public, anon, authenticated;
revoke all on function public.app_after()       from public, anon, authenticated;
revoke all on function public.set_updated_at()  from public, anon, authenticated;
```

## 7. Maintenance (cron in `workers/ingest`, daily)
The Worker calls `supabase.rpc('run_maintenance')` with the service role (supabase-js cannot run raw SQL). The function runs exactly these statements and returns the row counts:
```sql
update jobs set expires_at = now() where owner_id is null and expires_at is null and coalesce(posted_at, ingested_at) < now() - interval '45 days';
delete from jobs  where owner_id is null and expires_at < now() - interval '15 days'
  and not exists (select 1 from applications a where a.job_id = jobs.id);   -- keep jobs users track
delete from llm_calls      where created_at < now() - interval '90 days';
delete from usage_counters where day < current_date - 7;
```
Deleting a job cascades to its `analyses` (and their drafts) and `daily_matches`.

## 8. Seed (`supabase/seed.sql`)
```sql
-- seed.sql: reference data (docs/02-DATABASE.md §8). Idempotent.
-- `user_paste` must exist before any pasted job can be stored (jobs.source_id FK).
-- Enable each feed source only after reading its terms and filling `attribution`.
insert into public.sources (id, name, kind, url, enabled) values
 ('user_paste','Pasted by user','user',null,true),
 ('remoteok','Remote OK','api','https://remoteok.com/api',false),
 ('remotive','Remotive','api','https://remotive.com/api/remote-jobs',false),
 ('himalayas','Himalayas','api','https://himalayas.app/jobs/api',false),
 ('arbeitnow','Arbeitnow','api','https://www.arbeitnow.com/api/job-board-api',false),
 ('wwr','We Work Remotely','rss','https://weworkremotely.com/categories/remote-programming-jobs.rss',false),
 ('hn','HN Who is hiring','api','https://hn.algolia.com/api/v1/',false)
on conflict (id) do nothing;
```

## 9. Changes since v1.0 (Day 1 build, validated in PGlite)
1. **Extensions schema.** `create extension vector with schema extensions` (Supabase convention; the Security Advisor flags extensions in `public`). All references are qualified: `extensions.vector(768)`, `extensions.vector_cosine_ops`, `operator(extensions.<=>)`. `pgcrypto` dropped (`gen_random_uuid()` is core since PG13).
2. **`search_path = ''` on every function**, with fully qualified names (was `public` on some, missing on the trigger functions).
3. **`app_after()` is `security definer`.** Clients write `applications` through RLS but have no INSERT policy on `application_events`, so a client-side stage change would have failed.
4. **Column privileges actually enforced** (see §6): the v1.0 `revoke update (…) on profiles` was a no-op under Supabase's table-level grants. Same mechanism limits `daily_matches` client updates to `dismissed`.
5. **Profiles policy split** into select + update (was `for all`). Clients can no longer insert or delete their profile (deleting it alone would orphan the auth user; account deletion goes through the server/auth admin API).
6. **`applications` with-check** also requires the job to be visible to the user (public or own pasted) and `analysis_id` to be the user's own.
7. **Policies use `(select auth.uid())`** and `to authenticated` / `to anon, authenticated` (per-statement evaluation; Supabase performance advisor).
8. **`consume_quota`**: a limit ≤ 0 now returns false (v1.0 allowed the first call). Function revokes include argument signatures; EXECUTE is granted explicitly to `service_role`.
9. **`current_plan`**: `ends_at` is the end of the last non-expired pass (v1.0 returned the *current* pass end, which broke stacking with a future-dated pass). Now `security invoker` and executable by `authenticated` (RLS keeps it to the caller's own rows); v1.0 was definer and callable by anyone for any user.
10. **`handle_new_user`** also falls back to `raw_user_meta_data->>'name'` (Google).
11. **`profiles.updated_at`** is maintained by a trigger (`set_updated_at`).
12. **Maintenance**: wrapped in `run_maintenance()`; stale-job expiry uses `coalesce(posted_at, ingested_at)` (jobs without `posted_at` never expired).
13. **Indexes added** on FK columns read by the UI: `drafts(application_id)`, `application_events(application_id)`.
14. **Seed** is idempotent (`on conflict (id) do nothing`).
