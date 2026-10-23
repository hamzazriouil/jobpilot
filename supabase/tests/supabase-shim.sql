-- Minimal stand-in for what a fresh Supabase project provides before our
-- migration runs. Test-only: never apply this to a real project.

set timezone = 'UTC';                 -- Supabase databases run in UTC

-- API roles (PostgREST switches to one of these per request)
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- auth schema: the parts our migration touches
create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb
);
-- Same definition as Supabase's auth.uid()
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public     to anon, authenticated, service_role;

-- Supabase's default privileges: everything created in public is granted to
-- the API roles. The migration must narrow this itself, so we reproduce it.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
