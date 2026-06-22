# WildJar — all accounts & new numbers (no developer needed)

Your client should **not** need a developer when adding a new tracking number.  
They **may** need a one-time webhook setup per **WildJar company/account** (Stay Connected vs Same Day), not per phone number.

---

## How WildJar decides what gets sent

| Scenario | Developer needed? |
|----------|-------------------|
| New number added to **Same Day** account (`44906`) and webhook is on that account, filters **OFF** | **No** — automatic |
| New number added to **Stay Connected** account (`43032`) and webhook is on that account, filters **OFF** | **No** — automatic |
| New number on Same Day but webhook only on Stay Connected | **Yes** (until Same Day webhook exists) |
| New **WildJar sub-account/company** added | One-time webhook on that account (client can do it — see below) |

**You do not need one webhook per phone number.**  
You need webhook coverage for each **WildJar account/company** that owns numbers.

---

## Recommended setup (client can do this)

### Step 1 — Root / parent account (best if available)

In WildJar → **Integrations → Webhooks**:

1. Select the **top-level / master billing account** (parent of Stay Connected + Same Day if you have one).
2. If WildJar shows **“Include sub-accounts”** — turn it **ON** (same as the Calls report filter).
3. **Filters → OFF** (send all tracking numbers).
4. Event: **Call end**.
5. URL:
   ```text
   https://aysanykfubrxzjrygqqi.supabase.co/functions/v1/wildjar-webhook?secret=YOUR_SECRET
   ```

If parent + include sub-accounts works for webhooks, **all current and future numbers** under that tree sync automatically.

> If you’re unsure whether webhooks support “include sub-accounts”, email WildJar support (hello@wildjar.com / 1300 317 533) and ask: *“Can one webhook on our master account receive call-end events for all sub-accounts (Stay Connected + Same Day)?”*

---

### Step 2 — If parent webhook is not supported (your situation today)

Create **two webhooks** — same URL and secret on both:

| Webhook name | WildJar account | Account ID (from your sheet) |
|--------------|-----------------|------------------------------|
| Dashboard — Stay Connected | Stay Connected Plumbing Pty Ltd | `43032` (+ emergency `43086`) |
| Dashboard — Same Day | Same Day | `44906` |

On **each** webhook:

- Event: **Call end**
- **Filters: OFF** (all numbers on that account)
- Same Supabase URL + secret

After this, when the client adds a new `1800…` number under **Same Day**, it appears in the dashboard **without any code changes**.

When they add a number under **Stay Connected**, same thing.

They only contact a developer if they create a **brand-new WildJar company/account** — then add one more webhook (copy/paste URL).

---

## Your numbers (reference)

### Stay Connected — account `43032` / `43086`

| Number | Label |
|--------|--------|
| `61291399983` | Outbound |
| `611300040483` | Stay Connected main |
| `611300113782` | Emergency |

### Same Day — account `44906`

| Number |
|--------|
| `611800571926` |
| `611800700262` |
| `611800870175` |
| `611800225546` |
| `611800083913` |
| `611800718508` |
| `611800192651` |
| `611800053229` |
| `611800232446` |
| `611800229830` |

---

## Long-term option: API sync (fully automatic)

WildJar **REST API v2** can **pull** call logs for all accounts your login can see (OAuth username/password).

| Approach | New number on existing account | New sub-account |
|----------|-------------------------------|-----------------|
| Webhooks (per account) | Automatic | Add webhook once (client) |
| **API sync every 5–15 min** | Automatic | Automatic if API user sees that account |

We can add a `wildjar-sync-calls` Edge Function + scheduled job that:

1. Logs into WildJar API with credentials stored in Supabase secrets (set once).
2. Pulls call logs for **all accessible accounts** since last sync.
3. Upserts into `phone_calls` (same as webhook).

Then the client only adds numbers in WildJar — no webhook changes ever.

**Requires:** WildJar dashboard API access + API User Guide from WildJar.  
Ask your developer to implement this when you have API credentials.

---

## What to tell your client

> “Add tracking numbers in WildJar as usual. We have webhooks on Stay Connected and Same Day with **no number filters**, so new numbers on those accounts show up automatically. If you add a **new company** in WildJar, duplicate the webhook once with the same URL — no code deploy needed.”

---

## Quick checklist

- [ ] Webhook on Stay Connected account — filters **OFF**
- [ ] Webhook on Same Day account (`44906`) — filters **OFF**
- [ ] Both use same Supabase URL + `WILDJAR_WEBHOOK_SECRET`
- [ ] Event: **Call end** on both
- [ ] Test call to a Same Day `1800…` number → appears in **Call Tracking**

See also: [WEBHOOK.md](./WEBHOOK.md) for deploy steps.
