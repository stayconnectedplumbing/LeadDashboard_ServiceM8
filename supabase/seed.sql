insert into public.leads (
  source,
  external_id,
  full_name,
  email,
  phone,
  service_requested,
  message,
  called,
  call_attempted,
  booked,
  notes,
  raw_payload
) values
  (
    'google',
    'demo-google-001',
    'Sarah Mitchell',
    'sarah@example.com',
    '0400 123 456',
    'End of lease clean',
    'Looking for availability next Tuesday.',
    false,
    false,
    false,
    '',
    '{"demo": true}'::jsonb
  ),
  (
    'facebook',
    'demo-facebook-001',
    'James Carter',
    'james@example.com',
    '0411 987 654',
    'Commercial quote',
    'Needs call after 3pm.',
    true,
    true,
    true,
    'Booked for Friday morning.',
    '{"demo": true}'::jsonb
  )
on conflict (source, external_id)
do update set
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  service_requested = excluded.service_requested,
  message = excluded.message,
  raw_payload = excluded.raw_payload;
