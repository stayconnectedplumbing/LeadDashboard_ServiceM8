# Fix Facebook webhooks (real-time leads)

Sync works — this guide fixes **instant** delivery when someone submits a form.

**Your status today:**

| Check | Status |
|-------|--------|
| `facebook-webhook` deployed | Done |
| Developer **Test** button | Works |
| Page subscribed (`GetLeads` + `leadgen`) | Done |
| Page token valid | Done |
| `facebook-sync-leads` | Works (28 leads) |
| **Real form → webhook** | Not working yet |

**Root cause:** Meta only sends **real** lead webhooks to **Live** apps (or to **Testers** while in Development mode).

---

## Step 1 — Confirm webhook config (5 min)

[developers.facebook.com](https://developers.facebook.com) → **GetLeads** app:

### A. Webhooks product

1. **Webhooks** (left menu or Products)
2. Object: **Page**
3. Callback URL:
   ```text
   https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook
   ```
4. Verify token = Supabase `FACEBOOK_VERIFY_TOKEN` (short random string — **not** the `EAA...` token)
5. Click **Verify and save**
6. Under Page subscriptions → **`leadgen`** must show **Subscribed**

### B. Page subscription (you did this — verify)

Graph API Explorer with **Page token**:

**GET** `114076763756442/subscribed_apps`

Must include:

```json
{
  "name": "GetLeads",
  "subscribed_fields": ["leadgen"]
}
```

If missing, **POST** `114076763756442/subscribed_apps?subscribed_fields=leadgen`

### C. Supabase secrets

| Secret | Must be |
|--------|---------|
| `FACEBOOK_VERIFY_TOKEN` | Same as Meta webhook verify field |
| `FACEBOOK_APP_SECRET` | Meta → Settings → Basic → App secret |
| `META_PAGE_ACCESS_TOKEN` | Page token from `me/accounts` with `leads_retrieval` |

Redeploy after any change:

```bash
supabase functions deploy facebook-webhook --no-verify-jwt
```

---

## Step 2 — Switch app to **Live** mode (required for real customers)

1. developers.facebook.com → **GetLeads**
2. Top toggle: **In development** → switch to **Live**

Meta may block Live until you complete:

| Requirement | Where |
|-------------|--------|
| Privacy Policy URL | Settings → Basic |
| App icon | Settings → Basic |
| Business Verification | Business Settings → Security Center |
| Data Use Checkup | App dashboard prompt |

Use the client’s privacy policy URL (e.g. their website `/privacy-policy`).

---

## Step 3 — `leads_retrieval` not in App Review list?

Meta’s dashboard moved permissions under **Use cases**. If you don’t see `leads_retrieval` under App Review → Permissions and Features, try this:

### A. Add the right use case

1. developers.facebook.com → **GetLeads** app
2. Left menu: **Use cases** (or **App settings → Use cases**)
3. **Add use cases** → pick one of:
   - **Manage everything on your Page**, or
   - **Create & manage ads** / **Ads and monetization** (wording varies)
4. Open the use case → **Add permissions** or **Customize**
5. Search **`lead`** → add **`leads_retrieval`**
6. Save → return to **App Review** — it should appear now

### B. Add dependent permissions first

`leads_retrieval` depends on these (add via Graph API Explorer token or use case):

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_ads`
- `pages_manage_metadata`
- `business_management` (sometimes)

You already use `pages_manage_ads` for sync — good.

### C. Request Advanced Access (when it appears)

1. **App Review** → **Permissions and Features**
2. Find **`leads_retrieval`** (use search box — list is long)
3. Status **Standard access** = OK for Pages **you admin** (your sync already proves this works)
4. For all public leads at scale → **Request advanced access** + screencast

### D. You may already have it

If **sync returned 28 leads**, your Page token already has `leads_retrieval` (at least Standard access for Same Day Home Services). Missing from the App Review UI does **not** mean the permission is missing from your token.

Check token scopes:

1. [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
2. Paste your **Page token** → **Debug**
3. Look for `leads_retrieval` under **Scopes**

Or set `FACEBOOK_APP_ID` in Supabase secrets and open the health URL — `has_leads_retrieval: true` means you’re fine for API access.

**Webhook delivery is separate** — Live mode + Page `subscribed_apps` + webhook `leadgen` subscription matter more than seeing the row in App Review.

---

## Step 4 — Test while waiting (Development + Tester)

If app is still **Development** or Advanced Access pending:

1. App → **App roles** → **Roles** → **Add people**
2. Add your Facebook account as **Tester** (or client’s account)
3. Log into Facebook as that **Tester**
4. Business Suite → Instant forms → **Test form** / **Create test lead** → submit
5. Supabase → `facebook-webhook` → **Logs** → look for **POST** at that exact time

| Log result | Meaning |
|------------|---------|
| New POST, `processed: 1` | Webhook fixed for testers |
| No POST | Re-check Steps 1–2 |
| POST 401 | Wrong `FACEBOOK_APP_SECRET` |

**Do not use Form Preview** — it often skips webhooks.

---

## Step 5 — Prove webhook works

After Live mode (or as Tester):

1. Submit **Test form** lead
2. Within 10 seconds:
   - Supabase logs → new `POST` (body often **larger than 271 bytes** for real leads)
   - `leads` table → new row with real name
   - Dashboard → Facebook category

3. Health check (use verify token):
   ```text
   https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook?action=health&token=YOUR_VERIFY_TOKEN
   ```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Dev Test works, real forms silent | App not **Live**, or submitter not **Tester** |
| POST 401 in logs | Fix `FACEBOOK_APP_SECRET`; redeploy |
| POST 200, `processed: 0` | Check logs for payload errors; redeploy latest `facebook-webhook` |
| POST 200, row with empty name | Regenerate Page token with `leads_retrieval` |
| Webhook works for Tester only | Normal in Dev mode — complete Step 3 + Live |
| Leads in Facebook, no webhook ever | Use `facebook-sync-leads` cron until Live approved |

---

## Until webhooks are fully Live

Keep scheduled sync running every 10–15 min:

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-sync-leads?token=YOUR_VERIFY_TOKEN
```

Remove the cron once real-time webhooks are confirmed.

---

## Checklist (print this)

- [ ] Webhooks → Page → `leadgen` subscribed, URL verified
- [ ] `GET /114076763756442/subscribed_apps` shows GetLeads
- [ ] Supabase secrets correct + redeployed
- [ ] App switched to **Live**
- [ ] Privacy policy URL set
- [ ] `leads_retrieval` **Advanced Access** requested/approved
- [ ] Test form submit → POST in logs → row in dashboard
- [ ] Cron sync as backup until confirmed
