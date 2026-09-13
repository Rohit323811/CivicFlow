-- ============================================================================
-- TEST-ONLY emulation of the Supabase-provided auth objects.
-- Lets the CivicFlow migration run against vanilla Postgres (local Docker).
-- NEVER apply this file to a real Supabase project — there, the real
-- auth schema and roles already exist.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Emulates auth.uid() the same way PostgREST does: from the request JWT
-- claims (here via a session GUC set by the test harness).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
