-- WildJar phone call tracking (separate from form leads)
-- Run once in Supabase SQL Editor

create table if not exists public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  wildjar_call_id text not null,
  event_type text,
  caller_phone text,
  tracking_number text,
  tracking_source text,
  call_status text,
  duration_seconds integer,
  talk_time_seconds integer,
  first_time_caller boolean,
  caller_area text,
  web_source text,
  web_medium text,
  ivr_option text,
  recording_url text,
  account_name text,
  brand text,
  notes text not null default '',
  followed_up boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  call_started_at timestamptz,
  call_ended_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists phone_calls_wildjar_call_id_key
  on public.phone_calls (wildjar_call_id);

create index if not exists phone_calls_call_started_at_idx
  on public.phone_calls (call_started_at desc nulls last);

create index if not exists phone_calls_call_status_idx
  on public.phone_calls (call_status);

create index if not exists phone_calls_brand_idx
  on public.phone_calls (brand);

drop trigger if exists set_phone_calls_updated_at on public.phone_calls;

create trigger set_phone_calls_updated_at
before update on public.phone_calls
for each row
execute function public.set_updated_at();

alter table public.phone_calls enable row level security;

drop policy if exists "Anyone can read phone calls" on public.phone_calls;
create policy "Anyone can read phone calls"
on public.phone_calls
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can update phone call tracking" on public.phone_calls;
create policy "Anyone can update phone call tracking"
on public.phone_calls
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Service role can manage phone calls" on public.phone_calls;
create policy "Service role can manage phone calls"
on public.phone_calls
for all
to service_role
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.phone_calls;
exception
  when duplicate_object then null;
end;
$$;

comment on table public.phone_calls is
  'Inbound phone calls from WildJar webhooks. Separate from website/Facebook form leads.';
