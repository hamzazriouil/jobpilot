# @jobpilot/db: Supabase schema

| Path | What |
|---|---|
| `migrations/0001_init.sql` | Full schema: enums, tables, indexes (incl. HNSW), triggers, RPCs, RLS, grants |
| `seed.sql` | Reference data (`sources`). Idempotent. **Required**: pasted jobs need the `user_paste` source |
| `tests/` | Vitest suite that runs the migration in PGlite (in-process Postgres) behind a minimal Supabase shim |

The spec is `docs/02-DATABASE.md`. Keep it and the migration in sync.

## Apply to the real project (once it exists)

### Option A: Supabase CLI (recommended)
```bash
cd JobPilot                      # repo root; the CLI expects ./supabase
npx supabase login
npx supabase link --project-ref <project-ref>     # Dashboard > Project Settings > General
npx supabase db push --include-seed               # applies migrations/*.sql, then seed.sql
```
If your CLI version has no `--include-seed`, run `npx supabase db push`, then paste `seed.sql` into the SQL editor.
The CLI may ask to create `supabase/config.toml` (`npx supabase init`). Answer yes; it does not touch the migrations.

### Option B: SQL editor
Dashboard > SQL Editor > New query: paste `migrations/0001_init.sql`, Run. Then paste `seed.sql`, Run.
(If you later switch to the CLI, run `npx supabase migration repair --status applied 0001` first so it doesn't re-apply.)

### Check that it worked
- Dashboard > Database > Extensions: `vector` is enabled in schema **extensions**.
- Dashboard > Advisors > Security Advisor: no errors (RLS is on for every table, all functions pin `search_path`).
- Sign up once with a magic link: a row appears in `public.profiles`.

> Do **not** enable `vector` from the dashboard before running the migration. If it already exists in `public`, the
> migration's `create extension if not exists vector with schema extensions` is skipped and every `extensions.vector`
> reference fails. Fix: `drop extension vector;` (empty project), then run the migration.

## Dashboard settings the founder must toggle

1. **Authentication > Sign In / Providers > Email**: enabled, with "Confirm email" on. Magic link uses this provider
   (no password UI is needed in the app).
2. **Authentication > Sign In / Providers > Google**: enable it and paste the Client ID + Client secret from Google Cloud
   Console (APIs & Services > Credentials > OAuth client ID, type "Web application"). In Google Cloud, set the
   **Authorized redirect URI** to the callback URL Supabase shows on that page:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Authentication > URL Configuration**
   - **Site URL**: `http://localhost:3000` for now; switch to the production URL at launch.
   - **Redirect URLs** (allow list): `http://localhost:3000/**`, and later `https://<worker-name>.<account>.workers.dev/**`
     (plus the custom domain when there is one).
4. **Project Settings > API**: copy `URL`, `anon` key and `service_role` key into the app's env
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). The service role key is
   server-only.
5. Optional: **Authentication > Emails > SMTP**. Supabase's built-in mailer is rate-limited (a few emails per hour),
   fine for testing, not for launch.

## Run the tests

```bash
pnpm --filter @jobpilot/db test      # or: cd supabase && pnpm test
```

- Needs **Node ^20.19 or >= 22.12** (Vitest 5 / Vite 8 / rolldown). Node 20.11 fails at startup with
  `'node:util' does not provide an export named 'styleText'`. After upgrading Node, re-run `pnpm install`: under 20.11
  pnpm skipped rolldown's native binding (`@rolldown/binding-win32-x64-msvc`, engines mismatch), which otherwise fails
  with `Cannot find native binding`.
- **pgvector**: PGlite 0.5 ships pgvector as a separate package, `@electric-sql/pglite-pgvector` (version must match
  PGlite: 0.0.12 for 0.5.11). If it is installed as a devDependency, the suite uses the real extension (incl. the HNSW
  index). Otherwise you can point `PGLITE_PGVECTOR_DIR` at a folder containing its `vector.tar.gz`. With neither, the
  suite emulates the `vector` type and `<=>` operator (`tests/vector-fallback.sql`), and the 2 HNSW tests are skipped.

### What the shim covers and what it doesn't
`tests/supabase-shim.sql` creates the `anon` / `authenticated` / `service_role` (BYPASSRLS) roles, an `auth.users`
table, an `auth.uid()` identical to Supabase's (reads `request.jwt.claim.sub`), and Supabase's default privileges (ALL to
the API roles). Tests switch roles with `set role`, the same way PostgREST does, so RLS and grants are exercised for real.

Still to check on the real project (cannot be tested in PGlite):
- PGlite is Postgres 18; Supabase is 15/17. Nothing in the schema is version-specific (PG 13+ for `gen_random_uuid`),
  but the migration has only actually run on 18.
- The real `auth.users` has many more columns and is written by `supabase_auth_admin`: confirm the signup trigger
  creates a profile for both magic-link and Google sign-ups (Google puts the name in `full_name` and `name`).
- PostgREST / `supabase-js` behaviour (e.g. `rpc('current_plan')`, column-level grants on `.update()`).
- HNSW recall/perf at real data volume.
