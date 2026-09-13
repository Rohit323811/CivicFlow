-- ============================================================================
-- CivicFlow — Stage 1 smoke tests (RLS + triggers)
-- Plain plpgsql, no extensions required. Run as postgres (service role):
--
--   psql "$SUPABASE_DB_URL" -f supabase/tests/0001_smoke_test.sql
--
-- or with the docker runner: supabase/tests/run_local_docker.sh
--
-- The tests wrap everything in a transaction and ROLL BACK, so they leave
-- the database untouched.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Schema objects exist
-- ---------------------------------------------------------------------------
do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from (values
    ('departments'), ('data_sources'), ('profiles'), ('source_runs'),
    ('observations'), ('issues'), ('issue_observations'),
    ('verification_events'), ('issue_history'), ('notifications'),
    ('road_segments')
  ) as tables(t)
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = t
  );

  if missing is not null then
    raise exception 'missing tables: %', missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Seed data present
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.departments) < 5 then
    raise exception 'expected >= 5 seeded departments';
  end if;
  if (select count(*) from public.data_sources) < 4 then
    raise exception 'expected >= 4 seeded data sources';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. A citizen-report observation auto-creates a POTENTIAL issue (never
--    verified) and links itself via issue_observations
-- ---------------------------------------------------------------------------
do $$
declare
  v_obs_id  uuid;
  v_issue   record;
  v_link_ct integer;
begin
  insert into public.observations (source, category, description, lat, lng)
  values ('citizen_report', 'ROAD_DAMAGE', 'Large pothole on Main St', 12.9716, 77.5946)
  returning id into v_obs_id;

  select * into v_issue from public.issues
  where id in (select issue_id from public.issue_observations where observation_id = v_obs_id);

  if v_issue.id is null then
    raise exception 'citizen observation did not create an issue';
  end if;

  if v_issue.status <> 'potential' then
    raise exception 'expected issue status potential, got %', v_issue.status;
  end if;

  select count(*) into v_link_ct from public.issue_observations
  where issue_id = v_issue.id and observation_id = v_obs_id;
  if v_link_ct <> 1 then
    raise exception 'expected exactly 1 issue_observations link, got %', v_link_ct;
  end if;

  -- issue_history got the creation entry
  if not exists (
    select 1 from public.issue_history
    where issue_id = v_issue.id and status_change like 'created from citizen report%'
  ) then
    raise exception 'expected issue_history creation entry';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Collector observation (government source) does NOT create an issue
-- ---------------------------------------------------------------------------
do $$
declare
  v_before bigint;
  v_after  bigint;
begin
  select count(*) into v_before from public.issues;

  insert into public.observations (source, source_record_id, category, lat, lng)
  values ('government', '311-000123', 'STREETLIGHT', 12.9720, 77.5950);

  select count(*) into v_after from public.issues;

  if v_after <> v_before then
    raise exception 'collector observation must not auto-create issues';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Confidence recompute: linking a corroborating observation from a
--    different source raises confidence; severity = max by rank
-- ---------------------------------------------------------------------------
do $$
declare
  v_obs1    uuid;
  v_issue   uuid;
  v_conf    numeric;
  v_sev     public.severity_level;
begin
  insert into public.observations (source, category, lat, lng, confidence, severity)
  values ('citizen_report', 'WATER_LEAK', 12.9800, 77.6000, 60.00, 'low')
  returning id into v_obs1;

  -- (the citizen insert already created the issue + link)
  select io.issue_id into v_issue
  from public.issue_observations io where io.observation_id = v_obs1;

  if v_issue is null then
    raise exception 'expected auto-created issue for citizen observation';
  end if;

  insert into public.observations (source, source_record_id, category, lat, lng, confidence, severity)
  values ('government', '311-000456', 'WATER_LEAK', 12.9800, 77.6001, 70.00, 'high')
  returning id into v_obs1;

  insert into public.issue_observations (issue_id, observation_id)
  values (v_issue, v_obs1);

  select confidence, severity into v_conf, v_sev
  from public.issues where id = v_issue;

  -- max obs confidence 70 + (2 sources - 1) * 5 = 75
  if v_conf <> 75.00 then
    raise exception 'expected confidence 75.00, got %', v_conf;
  end if;

  -- highest-ranked severity among observations is 'high'
  if v_sev <> 'high' then
    raise exception 'expected severity high (rank order), got %', v_sev;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. updated_at touch trigger (road_segments carries the column + trigger)
-- ---------------------------------------------------------------------------
do $$
declare
  v_id      uuid;
  v_created timestamptz;
  v_updated timestamptz;
begin
  insert into public.road_segments (osm_id, geometry, condition)
  values (
    '__test_way__',
    st_setsrid(st_geomfromtext('LINESTRING(12.97 77.59, 12.98 77.60)'), 4326),
    'good'
  )
  returning id, created_at into v_id, v_created;

  perform pg_sleep(0.01);

  update public.road_segments set condition = 'worn' where id = v_id;

  select updated_at into v_updated from public.road_segments where id = v_id;

  if v_updated = v_created then
    raise exception 'updated_at was not touched by trigger';
  end if;

  delete from public.road_segments where id = v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS: unauthenticated (anon) users
--    - cannot read observations or issues history
--    - can read active issues only (verified/assigned/in_progress/resolved)
--    - can read departments and data_sources
-- ---------------------------------------------------------------------------
do $$
begin
  set local role anon;

  if exists (select 1 from public.observations) then
    raise exception 'anon must not read observations';
  end if;

  if exists (select 1 from public.issue_history) then
    raise exception 'anon must not read issue_history';
  end if;

  if exists (
    select 1 from public.issues where status not in ('verified', 'assigned', 'in_progress', 'resolved')
  ) then
    raise exception 'anon must not read non-active issues';
  end if;

  if (select count(*) from public.departments) < 1
     or (select count(*) from public.data_sources) < 1 then
    raise exception 'anon should read departments and data_sources';
  end if;

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Policy helper functions are inert without a JWT (service/psql session)
-- ---------------------------------------------------------------------------
do $$
begin
  if public.is_admin() then
    raise exception 'postgres service session must not read as admin (helper uses auth.uid())';
  end if;
  if public.is_authority() then
    raise exception 'helper is_authority must be false without a JWT';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. RLS: an authenticated citizen (via emulated JWT)
--    - gets a profile auto-created by the auth.users trigger
--    - can insert their own citizen-report observation
--    - cannot insert with a spoofed created_by
-- ---------------------------------------------------------------------------
do $$
declare
  v_user_id    uuid;
  v_profile_id uuid;
begin
  insert into auth.users (id, email)
  values (gen_random_uuid(), 'citizen-test@civicflow.local')
  returning id into v_user_id;

  select id, role into v_profile_id
  from public.profiles where user_id = v_user_id;

  if v_profile_id is null then
    raise exception 'handle_new_user trigger did not create a profile';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = v_user_id and role = 'citizen'
  ) then
    raise exception 'new profile should default to role citizen';
  end if;

  -- Simulate the citizen JWT for the rest of this transaction.
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  set local role authenticated;

  insert into public.observations (source, category, lat, lng, created_by)
  values ('citizen_report', 'GARBAGE', 12.9900, 77.6100, v_profile_id);

  begin
    insert into public.observations (source, category, lat, lng, created_by)
    values ('citizen_report', 'GARBAGE', 12.9901, 77.6101, gen_random_uuid());
    raise exception 'RLS must reject citizen inserts with a foreign created_by';
  exception
    when insufficient_privilege or check_violation then
      null; -- expected rejection
  end;

  reset role;
end $$;

rollback;
