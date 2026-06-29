-- Run in Supabase SQL Editor to soft-hide leads from the dashboard without deleting rows.

alter table public.leads add column if not exists hidden boolean not null default false;

create index if not exists leads_hidden_idx
  on public.leads (hidden)
  where hidden = false;
