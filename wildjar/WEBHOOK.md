# WildJar webhook setup

Connect WildJar call tracking to the dashboard database.

## 1. Run the database migration

In Supabase → **SQL Editor**, run:

`supabase/migrations/create-phone-calls.sql`

## 2. Deploy the Edge Function

Generate a **private webhook secret** (not your Supabase anon key):

```bash
openssl rand -hex 32
```

Example output: `a3f8c2d1e9b4...` — use this as `YOUR_SECRET` below.

In Supabase → **Project Settings → Edge Functions → Secrets**, add:

| Secret | Value |
|--------|-------|
| `WILDJAR_WEBHOOK_SECRET` | the hex string you generated above |

Deploy **with JWT verification disabled** (required for external webhooks like WildJar):

```bash
supabase functions deploy wildjar-webhook --no-verify-jwt
```

**Important:** After adding or changing `WILDJAR_WEBHOOK_SECRET`, you must **redeploy** the function or the new secret will not load.

If you deploy from the Supabase Dashboard, open **Edge Functions → wildjar-webhook**, paste the latest code from `supabase/functions/wildjar-webhook/index.ts`, disable **Enforce JWT verification**, then click **Deploy**.

### Testing with the anon key (temporary)

The function also accepts your Supabase **anon key** as the webhook secret (auto-available to Edge Functions). This lets you test with:

`?secret=YOUR_ANON_KEY`

Use a dedicated random secret for production once testing works.

## 3. Configure WildJar

In WildJar → **Integrations → Webhooks → Configure → + New webhook**:

| Field | Value |
|-------|-------|
| **URL** | `https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/wildjar-webhook?secret=YOUR_SECRET` |
| **Method** | POST |
| **Events** | **Call end** (WildJar label; same as call completed) |

Replace `YOUR_SECRET` with the same value you set in `WILDJAR_WEBHOOK_SECRET`.

**Do not** put your Supabase anon key in the URL. That is a different credential and will not work as the webhook secret.

Optional: instead of `?secret=...` in the URL, add a header:

| Header | Value |
|--------|-------|
| `X-Webhook-Secret` | `YOUR_SECRET` |

URL without query string:

`https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/wildjar-webhook`

Click **Test your webhook** in WildJar and confirm you get `{ "ok": true, ... }`.

## 4. View calls in the dashboard

Open the dashboard → **Call Tracking** in the left menu. Calls appear in real time after WildJar sends webhooks.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `UNAUTHORIZED_NO_AUTH_HEADER` | Redeploy: `supabase functions deploy wildjar-webhook --no-verify-jwt` |
| `{ "error": "Unauthorized" }` | Secret in URL/header must match `WILDJAR_WEBHOOK_SECRET` **or** anon key (after redeploy). Redeploy after changing secrets. |
| `{ "error": "Server misconfigured", "detail": "No webhook secret..." }` | Function deployed but no secrets loaded — redeploy the function |
| `{ "error": "Missing WildJar call id" }` | Test payload reached the function — check WildJar sends `id` or `call_id` |
| Table does not exist | Run `supabase/migrations/create-phone-calls.sql` |

## Notes

- Phone calls are stored in the separate `phone_calls` table (not mixed with form leads).
- Re-sending the same WildJar call ID updates the row (duration, recording, status).
- Staff can mark **Followed up** and add notes in the dashboard.
- Call times use WildJar `dateStartISO` / `dateStopISO` (UTC). If you fix timezone handling, redeploy `wildjar-webhook` and run `supabase/migrations/fix-phone-calls-timezone.sql` in the SQL Editor to correct existing rows.

## All accounts & new numbers (client self-service)

See **[MULTI-ACCOUNT.md](./MULTI-ACCOUNT.md)** — how to cover Stay Connected + Same Day without one webhook per phone number, and what happens when the client adds new tracking numbers.

**Summary:** Turn **filters OFF** on each WildJar company account webhook. New numbers on that account sync automatically. Same Day needs its own webhook (account `44906`) unless WildJar supports parent-account “include sub-accounts” on webhooks.
