-- Initial schema (SPEC §8.1). Applied with the Supabase CLI; never create or
-- alter schema by hand in the dashboard — it must be reproducible from here.

create type outage_kind as enum ('planned', 'fault', 'rotating');
create type utility_kind as enum ('electricity');
create type confidence_level as enum ('high', 'low');

create table outages (
  id            text primary key,          -- fingerprint hash, §10.5
  utility       utility_kind not null default 'electricity',
  kind          outage_kind not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,               -- null = unknown
  district      text not null,
  areas         text[] not null,
  sources       jsonb not null,            -- SourceRef[]
  published_at  timestamptz not null,
  ingested_at   timestamptz not null default now(),
  confidence    confidence_level not null default 'high',
  cancelled_at  timestamptz,               -- non-null = retracted, §10.6
  updated_at    timestamptz not null default now()
);

create index outages_starts_at_idx on outages (starts_at desc);
create index outages_district_idx  on outages (district, starts_at desc);
create index outages_active_idx    on outages (starts_at, ends_at)
  where cancelled_at is null;

create table ingest_runs (
  id             bigserial primary key,
  started_at     timestamptz not null,
  finished_at    timestamptz,
  ok             boolean not null default false,
  adapters_ok    text[] not null default '{}',
  adapters_failed text[] not null default '{}',
  created_count  int not null default 0,
  updated_count  int not null default 0,
  review_count   int not null default 0
);

-- The status bar's "last checked" reads the most recent ok run, so that lookup
-- must stay cheap as the table grows.
create index ingest_runs_ok_started_at_idx on ingest_runs (started_at desc)
  where ok;

create table review_queue (
  id          bigserial primary key,
  source      jsonb not null,
  raw_text    text not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- Row level security (§8.1). The app is read-only: anon may select outages and
-- ingest_runs and nothing else. Every write goes through the service role from
-- the ingest, which bypasses RLS. review_queue holds unparsed raw text and is
-- for the maintainer only, so anon gets no policy on it at all.
alter table outages      enable row level security;
alter table ingest_runs  enable row level security;
alter table review_queue enable row level security;

create policy outages_anon_select on outages
  for select to anon using (true);

create policy ingest_runs_anon_select on ingest_runs
  for select to anon using (true);

-- Corrections are updates, never deletes — the archive's value depends on the
-- history staying intact (§10.6).
create or replace function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger outages_set_updated_at
  before update on outages
  for each row execute function set_updated_at();
