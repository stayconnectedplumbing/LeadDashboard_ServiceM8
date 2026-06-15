-- Remap existing leads to the three category source values.
-- Run once in Supabase SQL Editor after deploying category logic.

update public.leads
set source = 'facebook'
where source in ('facebook');

update public.leads
set source = 'stay_connected_plumbing'
where source <> 'facebook'
  and (
    source = 'stay_connected_plumbing'
    or coalesce(raw_payload->>'current_url', '') ilike '%stayconnectedplumbing.com.au%'
    or coalesce(raw_payload->>'page_url', '') ilike '%stayconnectedplumbing.com.au%'
  );

update public.leads
set source = 'same_day_home_services'
where source <> 'facebook'
  and source <> 'stay_connected_plumbing';
