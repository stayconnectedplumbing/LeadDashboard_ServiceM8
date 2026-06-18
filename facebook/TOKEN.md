# Facebook Page token (long-lived) — required for real leads

**Graph API Explorer tokens expire in ~1–2 hours.** If `META_PAGE_ACCESS_TOKEN` is expired, Meta’s Developer **Test** may still create a row, but **real leads will have empty name/email** or never fetch correctly.

Your database already showed:

```text
Session has expired ... OAuthException code 190
```

Fix: use a **long-lived Page token** from a **System User** (below), not a quick Explorer token.

---

## Step 1 — System User token (recommended, does not expire quickly)

### Create system user + assign Page

1. Open [Meta Business Settings](https://business.facebook.com/settings).
2. **Users** → **System users** → **Add** (or pick existing).
3. **Add assets** → **Pages** → **Same Day Home Services** → **Full control** → Save.

### Fix: “No permissions available”

If **Generate token** shows:

```text
No permissions available
Assign an app role to the system user, or select another app to continue.
```

You assigned the **Page** but not the **App**. Do this:

1. Business Settings → **Users** → **System users** → your system user.
2. **Add assets** → open the **Apps** tab (not Pages).
3. If the app is not listed:
   - **Accounts** → **Apps** → **Add** → **Add an app** → enter **App ID** from developers.facebook.com → Settings → Basic.
4. Select your Lead Dashboard app → role **Admin** or **Develop app** → **Save**.
5. **Generate token** again — permissions should appear.

**Also required:** the app must belong to this Business Manager. If you created the app on a personal developer account, the client (Business Admin) must add it under **Accounts → Apps**, or create the app inside their business.

You need **Business Admin** for system users. If you don’t have that, ask the client to do this step, or use the **Alternative** section at the bottom.

### Generate token

1. System user → **Generate token** → select your app.
2. Check: `leads_retrieval`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`.
3. **Generate** → copy token.

### Get the Page access token (not user token)

In [Graph API Explorer](https://developers.facebook.com/tools/explorer/):

1. Keep **User token** with `leads_retrieval`, `pages_show_list`, `pages_read_engagement`.
2. **GET** `me/accounts` → Submit.
3. Find **Same Day Home Services** → copy the full **`access_token`** string from JSON (long `EAA...` value).

**Do not use the “User or Page” dropdown** — it often reloads and stays on User token.

4. Click inside the **Access Token** text box in the sidebar.
5. Select all → **paste** the Page token you copied (overwrite whatever is there).
6. Confirm: **GET** `me` → response should show the **Page name** and Page id (not your personal Facebook name).

7. Put that same Page token in Supabase → `META_PAGE_ACCESS_TOKEN`.

### Subscribe the Page (must use pasted Page token)

With the Page token pasted in the Access Token box:

**POST** `114076763756442/subscribed_apps?subscribed_fields=leadgen`

(Use your real Page id from `me/accounts`.)

Success: `{"success":true}`

**Verify — GET** `114076763756442/subscribed_apps` → your app should be listed.

### If Explorer still won’t cooperate — use curl

Replace `PAGE_TOKEN` with the token from `me/accounts`:

```bash
curl -X POST "https://graph.facebook.com/v20.0/114076763756442/subscribed_apps?subscribed_fields=leadgen&access_token=PAGE_TOKEN"
```

---

## Step 2 — Subscribe Page to your app

Still in Graph API Explorer, use the **Page token** from step 1 (paste into Access Token box — do not rely on User/Page dropdown):

**POST** (change method to POST):

```text
/{page-id}/subscribed_apps?subscribed_fields=leadgen
```

`page-id` = `id` from `me/accounts` for Same Day Home Services.

Success: `{"success":true}`

**Verify — GET:**

```text
/{page-id}/subscribed_apps
```

Your app name must appear. If only GoHighLevel appears, add yours with the POST above (both can coexist).

---

## Step 3 — Update Supabase and redeploy

1. Supabase → **Project Settings** → **Edge Functions** → **Secrets**
2. Set `META_PAGE_ACCESS_TOKEN` = Page token from Step 1
3. **Redeploy** (secrets do not reload until redeploy):

```bash
supabase functions deploy facebook-webhook --no-verify-jwt
```

---

## Step 4 — Verify token is alive

Open in browser (replace `YOUR_VERIFY_TOKEN`):

```text
https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/facebook-webhook?action=health&token=YOUR_VERIFY_TOKEN
```

You want:

```json
{
  "page_token_set": true,
  "token_valid": true,
  "page_name": "Same Day Home Services",
  "has_leads_retrieval": true
}
```

If `token_valid: false` → generate a new token and repeat.

---

## Step 5 — Test a real lead

1. Business Suite → **Instant forms** → open a form
2. Use **Test form** / **Create test lead** (not Preview only)
3. Submit
4. Supabase logs → new `POST` at that time
5. Dashboard → real name/email

---

## Common mistakes

| Mistake | Result |
|---------|--------|
| User token instead of Page token | Graph API errors |
| Explorer token without redeploy | Old expired token still used |
| Added `leads_retrieval` but kept old token | Permission not on token until regenerated |
| Skipped `subscribed_apps` POST | Test works, real forms silent |
| Form Preview only | Often no webhook |

---

## Alternative — Graph API Explorer (no System User)

Use this if you’re not Business Admin or can’t link the app to a system user.

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) → select **your app**.
2. **Get User Access Token** → add `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`.
3. **GET** `me/accounts` → copy **`access_token`** for **Same Day Home Services** (Page token).
4. Supabase → `META_PAGE_ACCESS_TOKEN` → paste → **redeploy**.

This token lasts longer than a raw Explorer click but may still expire (~60 days). System User is better for production.

To extend (~60 days), exchange the user token:

```text
GET https://graph.facebook.com/v20.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=YOUR_APP_ID
  &client_secret=YOUR_APP_SECRET
  &fb_exchange_token=SHORT_LIVED_USER_TOKEN
```

Then **GET** `me/accounts` again and use the Page `access_token`.
