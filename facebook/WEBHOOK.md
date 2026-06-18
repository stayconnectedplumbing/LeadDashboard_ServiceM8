# Facebook Lead Ads → Dashboard (no GHL, no n8n)

Facebook leads go **directly from Meta to Supabase**. No GoHighLevel, no n8n, no middleman.

```
Someone submits a Facebook Lead form (any form on the Page)
  → Meta webhook
  → facebook-webhook (Supabase Edge Function)
  → Graph API (fetch name, email, phone)
  → leads table
  → Dashboard (category: Facebook)
```

**Multiple forms:** One setup covers **every** Lead form on a Facebook Page — MEG Main Form, Bathroom Renovation, Drainage Inspection, Shower Repair, etc. You do **not** map each form individually.

---

## What to ask the client for

| Item | Why |
|------|-----|
| **Admin on Meta Business Suite** | Create app, webhooks, tokens |
| **Admin on the Facebook Page** (e.g. Same Day Home Services) | Subscribe Page to your app |
| **Disconnect GHL Facebook integration** (optional but recommended) | Avoid duplicate CRM; leads should only land in this dashboard + ServiceM8 |

If Facebook is still connected in GHL, leads may still flow there until the client turns it off under **GHL → Settings → Integrations → Facebook**. Your dashboard does not depend on GHL.

---

## 1. Supabase secrets

Generate a verify token:

```bash
openssl rand -hex 16
```

In Supabase → **Project Settings → Edge Functions → Secrets**, add:

| Secret | Value |
|--------|-------|
| `FACEBOOK_VERIFY_TOKEN` | the random string above (you choose it) |
| `META_PAGE_ACCESS_TOKEN` | long-lived Page token with `leads_retrieval` |
| `FACEBOOK_APP_SECRET` | App Secret from Meta Developer dashboard |
| `FACEBOOK_APP_ID` | (optional) App ID — enables token health check |

Deploy **with JWT verification disabled**:

```bash
supabase functions deploy facebook-webhook --no-verify-jwt
```

**Important:** Redeploy after changing secrets.

**Token expires:** Graph API Explorer tokens die in ~1–2 hours. Use a **System User** Page token — see **[facebook/TOKEN.md](./TOKEN.md)**.

Check token health (replace verify token):

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook?action=health&token=YOUR_FACEBOOK_VERIFY_TOKEN
```

Webhook URL (give this to Meta):

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook
```

---

## 2. Meta Developer App

1. [developers.facebook.com](https://developers.facebook.com) → **Create App** → type **Business**.
2. Add product **Webhooks**.
3. User object: **Page** → click **Subscribe** → field **`leadgen`**.
4. Callback URL: webhook URL above.
5. Verify token: same value as `FACEBOOK_VERIFY_TOKEN`.
6. Click **Verify and save**.

Copy **App Secret** (Settings → Basic) into `FACEBOOK_APP_SECRET` in Supabase.

---

## 3. Page access token

Token must include **`leads_retrieval`**.

### Quick test (Graph API Explorer)

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app + the client’s Facebook Page.
3. Add permissions: `leads_retrieval`, `pages_manage_metadata`, `pages_read_engagement`.
4. Generate token → copy into `META_PAGE_ACCESS_TOKEN` → redeploy if already deployed.

### Production (recommended)

Meta Business Settings → **System Users** → create system user → assign the Page → generate token with `leads_retrieval`. Long-lived; survives staff logins.

---

## 4. Subscribe the Page (required for real forms)

The Developer Console **Test** button sends a fake payload **directly** to your URL. It does **not** prove real form submissions will work.

Real form submits only notify your app if the **Facebook Page is subscribed** to **your** app for `leadgen`.

### Subscribe (Graph API Explorer)

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select **your app** (same app as the webhook).
3. **Get Page ID:** query `me/accounts` or use Page settings → Page ID.
4. Permissions on the token: `pages_manage_metadata`, `pages_read_engagement`, `leads_retrieval`.
5. **POST** (not GET):

   ```text
   /{page-id}/subscribed_apps?subscribed_fields=leadgen
   ```

   Example: `/123456789/subscribed_apps?subscribed_fields=leadgen`

6. Success looks like: `{"success": true}`

### Verify subscription

**GET** in Graph API Explorer:

```text
/{page-id}/subscribed_apps
```

Your app should appear in the list. If only GoHighLevel (or another CRM) appears, real leads may go there — subscribe **your** app too (both can be subscribed).

**Without this step, Meta Test works but real form submits do nothing.**

---

## 5. Test

### Meta "Test" button (Developer Console)

Meta's leadgen **Test** sends a **fake** lead ID (e.g. `444444444`) — not a real person. It only checks that your server responds.

After deploying the latest `facebook-webhook`, you should see **Meta Webhook Test Lead** in the dashboard.

If Meta says **successful** but nothing appears:

1. Supabase → **Edge Functions → facebook-webhook → Logs** — look for `invalid X-Hub-Signature-256`
2. **Invalid signature** → `FACEBOOK_APP_SECRET` does not match Meta App Secret → fix it, or temporarily **delete** that secret and redeploy
3. Supabase → **Table Editor → leads** → filter `source = facebook`

### Real form test (recommended)

**Important:** Form **Preview** often does **not** send webhooks. Use **Create test lead** / **Test form** instead.

#### How to tell what triggered a webhook

In Supabase → **facebook-webhook** → **Logs**, when you submit a form you should see a **new** `POST` line at that exact time.

| What you did | New POST in logs? | Row in dashboard? |
|--------------|-------------------|-------------------|
| Developer Console → Test | Yes (~271 byte body) | Test / fake lead |
| Form preview only | Often **no** | **No** |
| Create test lead / live submit (Page subscribed) | Yes | Real name/email |

#### Option A — Create test lead (best)

1. [Meta Business Suite](https://business.facebook.com) → **All tools** → **Instant forms**.
2. Page: **Same Day Home Services**.
3. Open a form → look for **Test form**, **Create test lead**, or **⋯** menu → test options.
4. Submit test data.

Or in **Ads Manager** → **All tools** → **Forms library** → select form → **Test form**.

#### Option B — Form preview (often does not webhook)

Preview is useful to see the form UI, but many preview submits **never call your webhook**. Do not rely on preview alone.

#### Option C — Live ad

Small-budget Lead Ad → submit the form yourself on mobile.

#### Token required for real details

Your database already shows Graph API **missing permissions** on test leads. Regenerate `META_PAGE_ACCESS_TOKEN` with **`leads_retrieval`**, then redeploy. Without it you may get a row with empty name/email and an error in Message.

---

## Forms on Same Day Home Services Page

All Lead forms on the Page are included automatically, for example:

- MEG - Main Form
- Bathroom Renovation / Bathroom Renovation-copy
- Drainage Inspection Form 1
- Mould Inspection Form 1
- NEW SHOWER REPAIR FORM
- SDHS Bathroom Renovation Form
- Other untitled / legacy forms

The **Service** column shows the Facebook form name when the form has no separate service field.

If the client has **other Facebook Pages** (e.g. Stay Connected Plumbing), repeat step 4 for each Page and ensure the Page token covers those Pages.

---

## Past leads (before this setup)

Webhooks only capture **new** submissions. For older leads:

1. Meta **Lead Ads centre** or **Forms** → export CSV per form, or
2. Ask client to export from wherever they stored them.

Import into Supabase manually if needed (one-time).

---

## Manual sync (pull leads from Facebook API)

If webhooks do not fire but your token works, **pull leads manually**:

1. Deploy:
   ```bash
   supabase functions deploy facebook-sync-leads --no-verify-jwt
   ```
2. Open in browser (use `FACEBOOK_VERIFY_TOKEN`, not Page token):
   ```text
   https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads?token=YOUR_VERIFY_TOKEN
   ```

This fetches recent leads from all forms on the Page and upserts into `leads`.

| Sync result | Meaning |
|-------------|---------|
| `synced: 1+` | Leads exist in Facebook; token works — webhook delivery is the problem |
| `synced: 0` | No leads in Facebook yet, or API permission blocked |
| Error about `pages_manage_ads` | Add `pages_manage_ads` to token, regenerate Page token, update Supabase |
| Error about permissions | Need **Advanced Access** for `leads_retrieval` |

**Token permissions for sync:** `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`.

### Keep new leads coming (pick one)

**A. Real-time (best)** — fix webhooks: app **Live** mode + `leads_retrieval` Advanced Access (see below).

**B. Scheduled sync (works now)** — call the sync URL every 10–15 minutes until webhooks work:

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads?token=YOUR_VERIFY_TOKEN
```

Use [cron-job.org](https://cron-job.org), Railway cron, or Windows Task Scheduler to GET that URL on a schedule.

---

## App Development vs Live mode (common blocker)

If **Developer Test** works but **real form submits never POST** to your webhook:

1. developers.facebook.com → your app → top banner: **Live** or **Development**?
2. **Development mode:** webhooks only fire for people with a **role on the app** (Admin, Developer, Tester).
3. Fix options:
   - Switch app to **Live** mode (may need Business Verification + `leads_retrieval` Advanced Access), **or**
   - App → **App roles** → **Roles** → add your Facebook account as **Tester**, then submit the form **while logged in as that account**, **or**
   - Use **manual sync** above until Live mode is approved.

Also check App Review → **Permissions and Features** → `leads_retrieval` → request **Advanced Access** if status is Standard only.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Meta test "successful", no row | Bad `FACEBOOK_APP_SECRET` (401) or old function deployed | Edge Function logs; fix secret; redeploy |
| Row in Supabase, not dashboard | Railway missing `VITE_SUPABASE_*` | Update Railway env + redeploy dashboard |
| Only "Meta Webhook Test Lead" | Only used Meta's fake test button | Submit a real form preview |
| Real leads missing | Page not subscribed OR app in Development mode | Subscribe Page + go Live or add Tester role |
| Webhook silent, sync works | App Development mode or preview-only submit | Live mode / Tester / Test form |
| Graph API error in logs | Bad `META_PAGE_ACCESS_TOKEN` | Regenerate with `leads_retrieval` |

**Temporarily disable signature check:** delete `FACEBOOK_APP_SECRET` in Supabase secrets → redeploy → test → re-add correct secret.

| Issue | Fix |
|-------|-----|
| Webhook verify fails | `FACEBOOK_VERIFY_TOKEN` must match Meta exactly; redeploy after changing |
| Empty name/email/phone | Custom form fields — update `normalize-facebook.ts` |
| Only some forms | Wrong Page subscribed, or forms on a different Page |

## Field mapping

Edit `supabase/functions/_shared/normalize-facebook.ts` if forms use non-standard field names:

| Facebook field names | Dashboard column |
|----------------------|------------------|
| `full_name`, `name`, `first_name` | Name |
| `email` | Email |
| `phone_number`, `phone`, `mobile` | Phone |
| `service`, `service_requested` | Service |
| `message`, `comments`, `details` | Message |
