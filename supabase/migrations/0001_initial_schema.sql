-- ============================================================================
-- CivicFlow — Stage 1: initial schema, triggers, and Row Level Security
--
-- Target: Supabase (PostgreSQL 15+).
-- Apply with `supabase db push` or by pasting into the Supabase SQL editor
-- (both run as postgres, which is required to create triggers on auth.users).
--
-- Design notes:
--   * Categories and statuses are Postgres DOMAINs (single source of truth).
--   * observations.timestamp is when the observation happened in the real
--     world; created_at is when the row landed. Collectors backfilling data
--     set `timestamp` in the past — dedup/geospatial logic uses `timestamp`.
--   * observations.created_by links citizen reports to the submitting profile
--     so "my reports" works under RLS (collector/AI rows have created_by null).
--   * severity is a 4-step band, confidence is 0..100. AI output (Stage 5)
--     writes these on potential issues and never auto-verifies.
--   * New citizen-report observations auto-create a 'potential' issue.
--     Nothing ever auto-verifies — verification is an authority action.
--   * Citizens cannot modify authority-only fields (status, severity,
--     confidence, department_id): they have no UPDATE grant on issues at all
--     and a trigger guard blocks those fields on any non-service-role path.
--   * The service_role key (backend) bypasses RLS — it must never ship to
--     the frontend. All policies below are written for anon/authenticated
--     (browser) access; the Express API does privileged writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Domains (shared vocabularies)
-- ---------------------------------------------------------------------------
create domain public.issue_category as text
  check (value in (
    'ROAD_DAMAGE',        -- potholes, cracks, road defects
    'WATER_LEAK',
    'STREETLIGHT',
    'GARBAGE',
    'FLOODING',
    'DRAINAGE',
    'TRAFFIC_SIGNAL',
    'DAMAGED_SIGN',
    'OTHER'
  ));

create domain public.severity_level as text
  check (value in ('low', 'medium', 'high', 'critical'));

create domain public.issue_status as text
  check (value in ('potential', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'merged'));

create domain public.source_type as text
  check (value in ('citizen_report', 'government', 'weather', 'osm', 'ai', 'other'));

-- ---------------------------------------------------------------------------
-- Helper functions (used by policies; SECURITY DEFINER avoids recursive
-- RLS lookups on profiles)
-- ---------------------------------------------------------------------------
create or replace function public.user_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_citizen()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'citizen' from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.is_authority()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('authority', 'admin') from public.profiles where user_id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where user_id = auth.uid()), false);
$$;

-- Auto-create a citizen profile for every new auth user. Promotions to
-- authority/admin happen via the Supabase dashboard or service-role key.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role, name, email)
  values (
    new.id,
    'citizen',
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  contact    text,
  created_at timestamptz not null default now()
);

create table public.data_sources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  type             public.source_type not null,
  url              text,
  reliability_score numeric(3, 2) not null default 0.50
                   check (reliability_score between 0 and 1),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique
             references auth.users (id) on delete cascade,
  role       text not null default 'citizen'
             check (role in ('citizen', 'authority', 'admin')),
  name       text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles (role);

-- ---------------------------------------------------------------------------
-- source_runs — one row per collector/API run
-- ---------------------------------------------------------------------------
create table public.source_runs (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.data_sources (id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'success', 'failed')),
  records_fetched integer not null default 0
);

create index idx_source_runs_source on public.source_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- observations — normalized records from every source (citizen reports,
-- collectors, AI). Stage 3 owns normalization into this shape.
-- ---------------------------------------------------------------------------
create table public.observations (
  id               uuid primary key default gen_random_uuid(),
  source           public.source_type not null default 'citizen_report',
  source_record_id text,
  created_by       uuid references public.profiles (id) on delete set null,
  category         public.issue_category not null,
  description      text,
  lat              double precision not null
                   check (lat between -90 and 90),
  lng              double precision not null
                   check (lng between -180 and 180),
  -- Generated spatial column (no typmod/cast in the expression so the
  -- generation expression stays immutable on every PostGIS version).
  geom             geometry generated always as
                   (st_setsrid(st_makepoint(lng, lat), 4326)) stored,
  "timestamp"      timestamptz not null default now(),
  severity         public.severity_level not null default 'low',
  confidence       numeric(5, 2) not null default 50.00
                   check (confidence between 0 and 100),
  evidence         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_observations_time on public.observations ("timestamp" desc);
create index idx_observations_category on public.observations (category);
create index idx_observations_source_record on public.observations (source_record_id);
create index idx_observations_created_by on public.observations (created_by);
create index idx_observations_geom on public.observations using gist (geom);

-- ---------------------------------------------------------------------------
-- issues — deduplicated, actionable civic incidents. New rows start as
-- 'potential' (AI/clustering never auto-verifies — Stage 5 rule).
-- ---------------------------------------------------------------------------
create table public.issues (
  id               uuid primary key default gen_random_uuid(),
  category         public.issue_category not null,
  description      text,
  lat              double precision not null
                   check (lat between -90 and 90),
  lng              double precision not null
                   check (lng between -180 and 180),
  geom             geometry generated always as
                   (st_setsrid(st_makepoint(lng, lat), 4326)) stored,
  severity         public.severity_level not null default 'low',
  confidence       numeric(5, 2) not null default 0.00
                   check (confidence between 0 and 100),
  status           public.issue_status not null default 'potential',
  department_id    uuid references public.departments (id) on delete set null,
  external_ref     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_issues_status on public.issues (status);
create index idx_issues_category on public.issues (category);
create index idx_issues_department on public.issues (department_id);
create index idx_issues_geom on public.issues using gist (geom);

-- ---------------------------------------------------------------------------
-- issue_observations — many-to-many between issues and observations
-- ---------------------------------------------------------------------------
create table public.issue_observations (
  issue_id       uuid not null references public.issues (id) on delete cascade,
  observation_id uuid not null references public.observations (id) on delete cascade,
  primary key (issue_id, observation_id)
);

create index idx_issue_observations_observation on public.issue_observations (observation_id);

-- ---------------------------------------------------------------------------
-- verification_events — authority actions on issues
-- ---------------------------------------------------------------------------
create table public.verification_events (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issues (id) on delete cascade,
  actor_id   uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (action in ('verified', 'rejected', 'merged')),
  notes      text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index idx_verification_events_issue on public.verification_events (issue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- issue_history — append-only status audit trail
-- ---------------------------------------------------------------------------
create table public.issue_history (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null references public.issues (id) on delete cascade,
  status_change text not null check (char_length(status_change) between 1 and 500),
  actor_id      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_issue_history_issue on public.issue_history (issue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  issue_id   uuid references public.issues (id) on delete cascade,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- road_segments — OSM-derived road condition data (Stage 6 collector target)
-- ---------------------------------------------------------------------------
create table public.road_segments (
  id               uuid primary key default gen_random_uuid(),
  osm_id           text not null unique,
  geometry         geometry(geometry, 4326) not null,
  condition        text check (condition is null or char_length(condition) between 1 and 100),
  last_maintenance date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_road_segments_geom on public.road_segments using gist (geometry);

-- ============================================================================
-- updated_at touch trigger
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_updated_at
  before update on public.issues
  for each row execute function public.touch_updated_at();

create trigger trg_touch_updated_at
  before update on public.observations
  for each row execute function public.touch_updated_at();

create trigger trg_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger trg_touch_updated_at
  before update on public.road_segments
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Issue lifecycle triggers
-- ============================================================================

-- A citizen report observation (no source_record_id) becomes a potential
-- issue immediately. Status stays 'potential' — never auto-verify.
create or replace function public.sync_new_issue_from_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_issue_id uuid;
begin
  if new.source = 'citizen_report' and new.source_record_id is null then
    insert into public.issues (category, description, lat, lng, severity, confidence)
    values (new.category, new.description, new.lat, new.lng, new.severity, new.confidence)
    returning id into new_issue_id;

    insert into public.issue_observations (issue_id, observation_id)
    values (new_issue_id, new.id)
    on conflict do nothing;

    insert into public.issue_history (issue_id, status_change)
    values (new_issue_id, 'created from citizen report (status: potential)');
  end if;
  return new;
end;
$$;

create trigger trg_sync_new_issue
  after insert on public.observations
  for each row execute function public.sync_new_issue_from_observation();

-- Recompute severity/confidence from member observations whenever links
-- change. Severity uses explicit rank ordering (SQL max() on text would be
-- alphabetical and wrong). Stage 4's clustering service relies on this.
create or replace function public.sync_issue_from_observations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue_id uuid;
  v_count    integer;
  v_distinct integer;
  v_max_conf numeric;
  v_sev_rank integer;
  v_max_sev  public.severity_level;
  v_score    numeric;
begin
  v_issue_id := coalesce(new.issue_id, old.issue_id);
  if v_issue_id is null then
    return null;
  end if;

  select
    count(*),
    count(distinct o.source),
    max(o.confidence),
    max(case o.severity
          when 'critical' then 4
          when 'high'     then 3
          when 'medium'   then 2
          when 'low'      then 1
        end)
  into v_count, v_distinct, v_max_conf, v_sev_rank
  from public.observations o
  join public.issue_observations io on io.observation_id = o.id
  where io.issue_id = v_issue_id;

  if v_count = 0 then
    return null;
  end if;

  v_max_sev := case v_sev_rank
                 when 4 then 'critical'
                 when 3 then 'high'
                 when 2 then 'medium'
                 when 1 then 'low'
               end;

  -- Confidence heuristic: max observation confidence, boosted for corroboration
  -- from distinct sources, capped at 95 so nothing is ever "certain".
  v_score := least(v_max_conf + (v_distinct - 1) * 5, 95);

  update public.issues
  set confidence = v_score,
      severity   = v_max_sev
  where id = v_issue_id;

  return null;
end;
$$;

create trigger trg_sync_issue
  after insert or delete on public.issue_observations
  for each row execute function public.sync_issue_from_observations();

-- Append-only audit trail for status changes. Transition legality lives in
-- the application/services layer (Stage 2), not in this trigger.
create or replace function public.record_issue_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.issue_history (issue_id, status_change)
    values (new.id, format('%s -> %s', old.status, new.status));
  end if;
  return new;
end;
$$;

create trigger trg_issues_history
  after update on public.issues
  for each row execute function public.record_issue_status_change();

-- ============================================================================
-- Client-side guards (defense in depth; RLS is the primary control)
-- These fire only for browser/postgREST roles — the backend uses
-- service_role, which skips them so the API can drive the lifecycle.
-- ============================================================================

-- Lock authority-only fields on issues: status, severity, confidence,
-- department_id can never be changed through a client session.
create or replace function public.stop_issue_status_edit()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     or new.severity is distinct from old.severity
     or new.confidence is distinct from old.confidence
     or new.department_id is distinct from old.department_id then
    raise exception 'authority-only fields (status, severity, confidence, department_id) cannot be changed client-side';
  end if;
  return new;
end;
$$;

create trigger trg_stop_issue_status_edit
  before update on public.issues
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function public.stop_issue_status_edit();

-- Block privilege escalation: users cannot change their own role.
create or replace function public.stop_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role changes must go through the admin/API path';
  end if;
  return new;
end;
$$;

create trigger trg_stop_profile_role_change
  before update on public.profiles
  for each row
  when (current_user in ('anon', 'authenticated'))
  execute function public.stop_profile_role_change();

-- ============================================================================
-- Views (security_invoker = caller's RLS applies; Postgres 15+)
-- ============================================================================

-- Priority scoring for the authority dashboard. Priority heuristic:
-- severity weight + source corroboration + recency bonus.
create or replace view public.v_issue_scores
with (security_invoker = true, security_barrier = true) as
select
  i.id as issue_id,
  i.status,
  i.severity,
  (select count(*) from public.issue_observations io where io.issue_id = i.id) as observation_count,
  (select count(distinct o.source)
     from public.issue_observations io
     join public.observations o on o.id = io.observation_id
    where io.issue_id = i.id) as source_count,
  (select max(o.confidence)
     from public.issue_observations io
     join public.observations o on o.id = io.observation_id
    where io.issue_id = i.id) as max_observation_confidence,
  greatest(0, extract(epoch from (now() - i.created_at)) / 3600.0) as hours_since_creation,
  case i.severity
    when 'critical' then 40
    when 'high'     then 30
    when 'medium'   then 20
    else 10
  end
  + least(20, (select count(*) from public.issue_observations io where io.issue_id = i.id) * 2)
  + greatest(0, 20 - (extract(epoch from (now() - i.created_at)) / 3600.0)::int) as priority_score
from public.issues i;

-- Map-facing issue locations with a per-source breakdown (Stage 7 layers).
create or replace view public.v_issue_locations
with (security_invoker = true, security_barrier = true) as
select
  i.id,
  i.category,
  i.severity,
  i.status,
  i.lat,
  i.lng,
  i.created_at,
  i.department_id,
  count(io.id) as observation_count,
  count(distinct o.source) as source_count,
  jsonb_object_agg(o.source, 1) filter (where o.source is not null) as sources
from public.issues i
left join public.issue_observations io on io.issue_id = i.id
left join public.observations o on o.id = io.observation_id
group by i.id;

-- ---------------------------------------------------------------------------
-- Client grants
--
-- RLS policies decide *visibility*; these grants decide *reachability*. They
-- mirror the Supabase default grants explicitly so the schema behaves
-- identically on vanilla Postgres (see supabase/tests/auth_shim.sql) and on
-- hosted Supabase. Tables without grants for a role are effectively
-- backend/service_role-only for that role.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- Readable by everyone; policies above filter what is actually visible.
grant select on public.departments, public.data_sources to anon, authenticated;
grant select on public.issues to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.notifications to anon, authenticated;
grant select on public.observations, public.issue_observations to anon, authenticated;
grant select on public.issue_history, public.verification_events to anon, authenticated;
grant select on public.source_runs, public.road_segments to anon, authenticated;

-- Citizen report intake (insert policy enforces source + created_by).
grant insert on public.observations to authenticated;

-- Authority actions (insert policy enforces role + own actor).
grant insert on public.verification_events to authenticated;

-- Self-service rows (policies enforce ownership).
grant update on public.profiles to authenticated;
grant update, delete on public.notifications to authenticated;

-- security_invoker views need direct grants on the views as well; the
-- base-table SELECT grants above make their underlying scans reachable.
grant select on public.v_issue_scores, public.v_issue_locations to anon, authenticated;

-- Notifications are inserted by services via service_role; the definer
-- helper must not be callable by clients (spam vector).
revoke execute on function public.insert_notification(uuid, uuid, text) from public;
revoke execute on function public.insert_notification(uuid, uuid, text) from anon, authenticated;
grant execute on function public.insert_notification(uuid, uuid, text) to service_role;

-- ============================================================================
-- Notification helpers (used by Stage 2 services; SECURITY DEFINER scoped to
-- exact statements so RLS "own rows only" stays enforceable for clients)
-- ============================================================================
create or replace function public.insert_notification(p_user_id uuid, p_issue_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, issue_id, message)
  values (p_user_id, p_issue_id, p_message);
end;
$$;

create or replace function public.update_notification(p_id uuid, p_read boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  update public.notifications
  set read = coalesce(p_read, read)
  where id = p_id
    and user_id = (select id from public.profiles where user_id = auth.uid());
end;
$$;

create or replace function public.delete_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  delete from public.notifications
  where id = p_id
    and user_id = (select id from public.profiles where user_id = auth.uid());
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- profiles -------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: read own or authority+"
  on public.profiles for select
  using (user_id = auth.uid() or public.is_authority());

create policy "profiles: update own (role guarded by trigger)"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- departments ----------------------------------------------------------------
alter table public.departments enable row level security;

create policy "departments: readable by all"
  on public.departments for select using (true);

create policy "departments: write by admin"
  on public.departments for insert
  with check (public.is_admin());

create policy "departments: update by admin"
  on public.departments for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "departments: delete by admin"
  on public.departments for delete
  using (public.is_admin());

-- data_sources ----------------------------------------------------------------
alter table public.data_sources enable row level security;

create policy "data_sources: readable by all"
  on public.data_sources for select using (true);

create policy "data_sources: insert by admin"
  on public.data_sources for insert
  with check (public.is_admin());

create policy "data_sources: update by admin"
  on public.data_sources for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "data_sources: delete by admin"
  on public.data_sources for delete
  using (public.is_admin());

-- source_runs ----------------------------------------------------------------
alter table public.source_runs enable row level security;

create policy "source_runs: read by authority+"
  on public.source_runs for select using (public.is_authority());

create policy "source_runs: insert by admin"
  on public.source_runs for insert
  with check (public.is_admin());

create policy "source_runs: update by admin"
  on public.source_runs for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "source_runs: delete by admin"
  on public.source_runs for delete
  using (public.is_admin());

-- observations ---------------------------------------------------------------
alter table public.observations enable row level security;

create policy "observations: read by authority+"
  on public.observations for select using (public.is_authority());

create policy "observations: read own citizen reports"
  on public.observations for select
  using (created_by = public.user_profile_id());

create policy "observations: citizens insert own reports"
  on public.observations for insert
  with check (
    source = 'citizen_report'
    and source_record_id is null
    and created_by = public.user_profile_id()
  );

-- issues ---------------------------------------------------------------------
alter table public.issues enable row level security;

create policy "issues: read by authority+"
  on public.issues for select using (public.is_authority());

-- Public visibility for the map: citizens (and anonymous users) see active
-- issues only. 'potential' rows stay internal until verified.
create policy "issues: public read of active issues"
  on public.issues for select
  using (status in ('verified', 'assigned', 'in_progress', 'resolved'));

-- No insert/update/delete policies: the lifecycle is driven exclusively by
-- the backend API (service_role). Citizens therefore cannot modify
-- authority-only fields through the client at all.

-- issue_observations ---------------------------------------------------------
alter table public.issue_observations enable row level security;

create policy "issue_observations: read by authority+"
  on public.issue_observations for select using (public.is_authority());

-- No write policies: linking is done by the backend (service_role).

-- verification_events --------------------------------------------------------
alter table public.verification_events enable row level security;

create policy "verification_events: read by authority+"
  on public.verification_events for select using (public.is_authority());

create policy "verification_events: insert by authority+ (own actor)"
  on public.verification_events for insert
  with check (actor_id = public.user_profile_id() and public.is_authority());

-- issue_history --------------------------------------------------------------
alter table public.issue_history enable row level security;

create policy "issue_history: read by authority+"
  on public.issue_history for select using (public.is_authority());

-- notifications --------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications: own rows only"
  on public.notifications for all
  using (user_id = public.user_profile_id())
  with check (user_id = public.user_profile_id());

-- road_segments --------------------------------------------------------------
alter table public.road_segments enable row level security;

create policy "road_segments: read by authority+"
  on public.road_segments for select using (public.is_authority());

create policy "road_segments: insert by admin"
  on public.road_segments for insert
  with check (public.is_admin());

create policy "road_segments: update by admin"
  on public.road_segments for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "road_segments: delete by admin"
  on public.road_segments for delete
  using (public.is_admin());
