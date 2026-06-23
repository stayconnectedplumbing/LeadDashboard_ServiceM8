-- Remap samedayshowerrepairs.com.au leads to their own category.
-- Run once in Supabase SQL Editor after deploying category logic.

update public.leads
set source = 'same_day_shower_repairs'
where source <> 'facebook'
  and source <> 'stay_connected_plumbing'
  and (
    source = 'same_day_shower_repairs'
    or coalesce(raw_payload->>'current_url', '') ilike '%samedayshowerrepairs.com.au%'
    or coalesce(raw_payload->>'page_url', '') ilike '%samedayshowerrepairs.com.au%'
    or coalesce(raw_payload->>'Page URL', '') ilike '%samedayshowerrepairs.com.au%'
    or coalesce(raw_payload->>'referer_url', '') ilike '%samedayshowerrepairs.com.au%'
  );
