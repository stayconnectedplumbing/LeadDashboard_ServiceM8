# Facebook leads → Dashboard (easy setup)

One-page guide for **Same Day Home Services**. Delete this file when done.

**Two ways to get leads:**

| Method | When leads appear |
|--------|-------------------|
| **A. Sync (bulk)** | Run a URL or cron every 10–15 min — **works now** |
| **B. Webhook** | Instant when someone submits a form |

You can use **both**. Sync is the backup.

---

## Your values (fill these in)

Copy this block to Notepad and replace secrets:

```text
PAGE_ID=114076763756442
PAGE_NAME=Same Day Home Services
APP_NAME=GetLeads
APP_ID=4462629270691060

SUPABASE_PROJECT=aysanykfubrxzjrygqqi
WEBHOOK_URL=https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook
SYNC_URL=https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads

FACEBOOK_VERIFY_TOKEN=your-short-random-string
FACEBOOK_APP_SECRET=from Meta → App settings → Basic
META_PAGE_ACCESS_TOKEN=from Step 2 below (EAA... Page token)
```

Generate verify token (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## Part 1 — Meta app (one-time)

### 1.1 Create / open app

1. https://developers.facebook.com → **GetLeads** app
2. App mode: **Live**
3. **Use cases** → add **Manage everything on your Page** (if not already)

### 1.2 Add Webhooks product

1. Left menu → **Webhooks** (under Products)
2. Object: **Page**
3. Callback URL: `WEBHOOK_URL` above
4. Verify token: same as `FACEBOOK_VERIFY_TOKEN`
5. Click **Verify and save**
6. Subscribe to field: **`leadgen`**

### 1.3 Supabase secrets

Supabase → **Project Settings** → **Edge Functions** → **Secrets**:

| Name | Value |
|------|--------|
| `FACEBOOK_VERIFY_TOKEN` | your random string |
| `FACEBOOK_APP_SECRET` | Meta App Secret |
| `META_PAGE_ACCESS_TOKEN` | Page token (Step 2) |
| `FACEBOOK_APP_ID` | `4462629270691060` (optional, for health check) |

Deploy:

```powershell
cd D:\Project\Servicem8\addons\Lead
supabase functions deploy facebook-webhook --no-verify-jwt
supabase functions deploy facebook-sync-leads --no-verify-jwt
```

**Redeploy after every secret change.**

---

## Part 2 — Page access token (copy-paste commands)

Meta docs require these permissions for **reading leads**:

- `leads_retrieval`
- `pages_manage_ads`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata` (for webhooks)

### 2.1 Get User token (Graph API Explorer)

1. https://developers.facebook.com/tools/explorer/
2. App: **GetLeads**
3. **Generate Access Token** → add all permissions above + `ads_management`
4. Copy User token → save as `$userToken` below

### 2.2 Get Page token from `me/accounts`

PowerShell:

```powershell
$userToken = "PASTE_USER_TOKEN_HERE"

curl.exe -s "https://graph.facebook.com/v20.0/me/accounts?access_token=$userToken"
```

Find **Same Day Home Services** → copy its **`access_token`** → that is your **Page token**.

```powershell
$pageToken = "PASTE_PAGE_TOKEN_HERE"

# Must show Page name, NOT your personal name:
curl.exe -s "https://graph.facebook.com/v20.0/me?fields=id,name&access_token=$pageToken"
```

Good: `"name":"Same Day Home Services"`  
Bad: `"name":"Atiq Rehman"` → wrong token, go back to 2.2

Paste `$pageToken` into Supabase → `META_PAGE_ACCESS_TOKEN` → redeploy.

### 2.3 Debug token (optional)

https://developers.facebook.com/tools/debug/accesstoken/ → paste Page token → check **Scopes** include `leads_retrieval`.

---

## Part 3 — Install app on Page (required for webhooks)

Meta docs Step 3: *Install your app on the Page.*

PowerShell (use **Page token**):

```powershell
$pageToken = "PASTE_PAGE_TOKEN_HERE"
$pageId = "114076763756442"

curl.exe -X POST "https://graph.facebook.com/v20.0/$pageId/subscribed_apps?subscribed_fields=leadgen&access_token=$pageToken"
```

Want: `{"success":true}`

Verify:

```powershell
curl.exe -s "https://graph.facebook.com/v20.0/$pageId/subscribed_apps?access_token=$pageToken"
```

Want: **GetLeads** with `"subscribed_fields":["leadgen"]`

---

## Part 4 — Method A: Sync leads (bulk read) — **use this now**

Meta docs: read leads by form → `GET /{FORM_ID}/leads`

Your project already has `facebook-sync-leads` which does this for all forms.

### 4.1 Run sync manually

Browser (use **VERIFY token**, not Page token):

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads?token=YOUR_VERIFY_TOKEN
```

PowerShell:

```powershell
$verifyToken = "YOUR_VERIFY_TOKEN"
curl.exe -s "https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads?token=$verifyToken"
```

Want: `"ok":true,"synced":28` (or higher)

### 4.2 Sync one form only (manual Meta API)

List forms:

```powershell
$pageToken = "PASTE_PAGE_TOKEN_HERE"
$pageId = "114076763756442"

curl.exe -s "https://graph.facebook.com/v20.0/$pageId/leadgen_forms?fields=id,name&access_token=$pageToken"
```

Read leads from one form:

```powershell
$formId = "PASTE_FORM_ID_HERE"
$pageToken = "PASTE_PAGE_TOKEN_HERE"

curl.exe -s "https://graph.facebook.com/v20.0/$formId/leads?fields=created_time,id,ad_id,form_id,field_data&limit=25&access_token=$pageToken"
```

### 4.3 Auto sync every 15 minutes

1. https://cron-job.org → free account
2. New cron job → **GET**
3. URL: `SYNC_URL?token=YOUR_VERIFY_TOKEN`
4. Every **15 minutes**

---

## Part 5 — Method B: Webhook (real-time)

Meta flow: webhook sends `leadgen_id` → your server fetches full lead.

### 5.1 Test webhook is alive

Meta Developer → **Webhooks** → Page → **leadgen** → **Test** button.

Check Supabase → **Edge Functions** → `facebook-webhook` → **Logs** → `POST 200`.

### 5.2 Health check

Browser (`YOUR_VERIFY_TOKEN` = short string, **not** EAA token):

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook?action=health&token=YOUR_VERIFY_TOKEN
```

Want:

```json
{
  "page_token_set": true,
  "token_valid": true,
  "page_name": "Same Day Home Services"
}
```

### 5.3 Test real form submit

1. https://business.facebook.com → **Instant forms**
2. Open a form → **Test form** / **Create test lead** (not Preview)
3. Submit
4. Logs → new `POST` within ~2 min (Meta allows delay)
5. Dashboard → **Leads** → **Facebook**

### 5.4 Fetch one lead by ID (Meta docs)

When webhook gives you `leadgen_id`:

```powershell
$leadId = "PASTE_LEADGEN_ID_HERE"
$pageToken = "PASTE_PAGE_TOKEN_HERE"

curl.exe -s "https://graph.facebook.com/v20.0/$leadId?access_token=$pageToken"
```

---

## Part 6 — Check dashboard

1. Supabase → **Table Editor** → `leads` → filter `source = facebook`
2. https://leaddashboard-production-adcb.up.railway.app → **Leads** → category **Facebook**
3. Refresh page

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| `page access token required` | Use Page token from `me/accounts`, not User token |
| `token could not be decrypted` | Token corrupted when copying — use `$pageToken` variable |
| `pages_manage_ads permission` | Add to User token, regenerate Page token |
| `Invalid signature` on webhook | Fix `FACEBOOK_APP_SECRET` in Supabase |
| Health URL 403 | Use `FACEBOOK_VERIFY_TOKEN` in URL, not Page token |
| Dev Test works, real forms don't | Use **Test form** not Preview; keep sync cron running |
| Token expired | Regenerate Page token, update Supabase, redeploy |

---

## Copy-paste checklist

```text
[ ] Webhooks → Page → leadgen subscribed, URL verified
[ ] Supabase secrets set (VERIFY, APP_SECRET, PAGE_TOKEN)
[ ] Both functions deployed
[ ] POST subscribed_apps → success true
[ ] GET subscribed_apps → GetLeads listed
[ ] Health URL → token_valid true
[ ] Sync URL → synced > 0
[ ] Cron job on sync URL every 15 min
[ ] Test form submit → row in dashboard
```

---

## Official Meta docs (reference)

- Retrieving leads: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- Webhooks: install app on Page = `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`
- Bulk read: `GET /{form-id}/leads`
- Real-time: webhook → `GET /{leadgen_id}`
