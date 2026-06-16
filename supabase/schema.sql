create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type lead_source as enum ('google', 'facebook', 'google_form', 'wordpress', 'stay_connected_plumbing', 'same_day_home_services', 'same_day_shower_repairs', 'emergency_plumbing_sydney');
  end if;
end
$$;

-- If the type already exists, add new values
do $$
begin
  alter type lead_source add value if not exists 'google_form';
  alter type lead_source add value if not exists 'wordpress';
  alter type lead_source add value if not exists 'stay_connected_plumbing';
  alter type lead_source add value if not exists 'same_day_home_services';
  alter type lead_source add value if not exists 'same_day_shower_repairs';
  alter type lead_source add value if not exists 'emergency_plumbing_sydney';
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source lead_source not null,
  external_id text not null,
  full_name text,
  email text,
  phone text,
  service_requested text,
  message text,
  called boolean not null default false,
  call_attempted boolean not null default false,
  booked boolean not null default false,
  servicem8_job_uuid text,
  servicem8_pushed_at timestamptz,
  notes text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_source_external_id_key
  on public.leads (source, external_id);

create index if not exists leads_source_created_at_idx
  on public.leads (source, created_at desc);

create index if not exists leads_booked_idx
  on public.leads (booked);

-- Migration for existing databases (columns must exist before the index below)
alter table public.leads add column if not exists servicem8_job_uuid text;
alter table public.leads add column if not exists servicem8_pushed_at timestamptz;

create index if not exists leads_servicem8_job_uuid_idx
  on public.leads (servicem8_job_uuid)
  where servicem8_job_uuid is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_leads_updated_at on public.leads;

create trigger set_leads_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

alter table public.leads enable row level security;

drop policy if exists "Anyone can read leads" on public.leads;
create policy "Anyone can read leads"
on public.leads
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can update tracking fields" on public.leads;
create policy "Anyone can update tracking fields"
on public.leads
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Service role can manage leads" on public.leads;
create policy "Service role can manage leads"
on public.leads
for all
to service_role
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception
  when duplicate_object then null;
end;
$$;

comment on table public.leads is
  'Lead inbox for ServiceM8 dashboard, populated by WordPress webhooks and Facebook Lead Ads via n8n.';

comment on column public.leads.external_id is
  'Source-specific stable ID, such as Forminator submission ID or Facebook leadgen ID, used for idempotent upserts.';

-- WildJar phone calls (see supabase/migrations/create-phone-calls.sql for full migration)
-- Run create-phone-calls.sql on existing databases.
