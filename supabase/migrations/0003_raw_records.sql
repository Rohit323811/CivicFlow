-- ============================================================================
-- CivicFlow — Stage 6: raw collector records
--
-- Every collector run stores what the source actually returned BEFORE any
-- normalization. This is the replay/audit trail: if a normalizer has a bug,
-- the raw payload can be re-processed without re-fetching.
-- ============================================================================

create table if not exists public.raw_records (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.source_runs (id) on delete cascade,
  source     public.source_type not null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  processed  boolean not null default false
);

create index idx_raw_records_run on public.raw_records (run_id, fetched_at desc);
create index idx_raw_records_unprocessed on public.raw_records (processed) where processed = false;

alter table public.raw_records enable row level security;

-- Read: authority+. Writes happen only through the backend (service_role),
-- so there are no client write policies.
create policy "raw_records: read by authority+"
  on public.raw_records for select
  using (public.is_authority());

grant select on public.raw_records to anon, authenticated;
