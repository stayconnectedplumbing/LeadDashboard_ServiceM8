-- Run this in Supabase SQL Editor if you already have the leads table
-- and got: column "servicem8_job_uuid" does not exist

alter table public.leads add column if not exists servicem8_job_uuid text;
alter table public.leads add column if not exists servicem8_pushed_at timestamptz;

create index if not exists leads_servicem8_job_uuid_idx
  on public.leads (servicem8_job_uuid)
  where servicem8_job_uuid is not null;
