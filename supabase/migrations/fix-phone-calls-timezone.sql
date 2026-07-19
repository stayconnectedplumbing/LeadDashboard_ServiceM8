-- Fix WildJar call timestamps stored from dateStartLocal without Sydney timezone.
-- Prefer dateStartISO / dateStopISO from raw_payload (authoritative UTC from WildJar).

update public.phone_calls
set
  call_started_at = (raw_payload->>'dateStartISO')::timestamptz,
  call_ended_at = coalesce(
    (raw_payload->>'dateStopISO')::timestamptz,
    call_ended_at
  ),
  web_source = coalesce(
    nullif(web_source, ''),
    nullif(raw_payload #>> '{web,source}', '')
  ),
  web_medium = coalesce(
    nullif(web_medium, ''),
    nullif(raw_payload #>> '{web,medium}', '')
  )
where raw_payload ? 'dateStartISO'
  and nullif(raw_payload->>'dateStartISO', '') is not null
  and (
    call_started_at is distinct from (raw_payload->>'dateStartISO')::timestamptz
    or call_ended_at is distinct from (raw_payload->>'dateStopISO')::timestamptz
    or (web_source is null and raw_payload #>> '{web,source}' is not null)
    or (web_medium is null and raw_payload #>> '{web,medium}' is not null)
  );
