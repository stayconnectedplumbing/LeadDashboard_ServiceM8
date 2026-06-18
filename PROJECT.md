# Lead Dashboard — Project Log

Living document for decisions, architecture, audit findings, and session context.  
**Update this file when requirements, infrastructure, or significant behaviour changes.**

**Last updated:** 2026-06-15

---

## What this project is

ServiceM8-embedded lead dashboard for **Stay Connected Plumbing** and related brands.  
Team tracks website + Facebook leads, marks call status, notes, and **Push ServiceM8** to create Quote jobs.

| Component | URL / ID |
|-----------|----------|
| Supabase project | `aysanykfubrxzjrygqqi` |
| Dashboard (Railway) | `https://leaddashboard-production-adcb.up.railway.app` |
| ServiceM8 add-on event | `show_lead_dashboard` / `push_lead_to_job` |
| Support email | `info@stayconnectedplumbing.com.au` |

---

## Lead source categories (3 only)

All incoming leads must map to **one of three categories**:

| Category | DB `source` value | Websites / origin |
|----------|-------------------|-------------------|
| **Same Day Home Services** | `same_day_home_services` | samedayhomeservices.com.au, samedayshowerrepairs.com.au, emergencyplumbingrepairs.com.au |
| **Stay Connected Plumbing** | `stay_connected_plumbing` | stayconnectedplumbing.com.au |
| **Facebook** | `facebook` | Facebook Lead Ads, forms, messages, enquiries |

### Auto-assignment rules

- **WordPress / Forminator:** `current_url` (or `page_url`) in webhook payload → category via `supabase/functions/_shared/lead-category.ts`
- **Facebook / n8n:** `source: facebook` in `ingest-lead` → `facebook`
- **Dashboard display:** `src/leadCategories.js` resolves category from `source` + `raw_payload` (handles legacy enum values)

### Remap existing data

Run once in Supabase SQL Editor:

`supabase/migrations/remap-lead-categories.sql`

---

## Ingestion paths

```
WordPress Forminator  →  wordpress-webhook  →  Supabase leads       →  Dashboard (Leads)
Facebook Lead Ads     →  facebook-webhook (+ facebook-sync-leads fallback)  →  Supabase leads  →  Dashboard
WildJar phone calls   →  wildjar-webhook    →  Supabase phone_calls →  Dashboard (Call Tracking)
```

- WordPress handoff: `wordpress/WEBHOOK.md`
- WildJar handoff: `wildjar/WEBHOOK.md`
- Facebook: `facebook/WEBHOOK.md` — direct Meta → Supabase; `facebook/WEBHOOK-FIX.md` for real-time webhooks; `facebook/TOKEN.md` for tokens
- **Deprecated:** Gmail parsing (`worker/`, `n8n/all email leads.json`)

---

## Push ServiceM8

### Flow

1. Staff clicks **Push ServiceM8** (or row already shows **Yes**)
2. If opened from ServiceM8 menu → add-on OAuth token → `push_lead_to_job` in `servicem8/addon-function.js`
3. Creates Quote job + company (reuse if name exists) + job contact
4. Saves `servicem8_job_uuid` + `servicem8_pushed_at` to Supabase
5. Row turns blue; **Push ServiceM8** column shows **Yes**

### Idempotency

- Checks Supabase `servicem8_job_uuid` first
- Then ServiceM8 job lookup by `purchase_order_number = lead.id`
- Re-push shows **Already in ServiceM8** (not an error)
- Company name duplicate → find existing company, continue

### Manual deploy steps (every release)

1. `git push` → Railway redeploys dashboard
2. Re-paste **entire** `servicem8/addon-function.js` into ServiceM8 → Edit Function
3. Re-upload `manifest.json` if OAuth scopes changed
4. Staff may need to re-authorize add-on after scope change

### Known ServiceM8 API note

Do **not** use `job_description contains` filter — ServiceM8 returns `Invalid Record Filter Method Specified`. Only `purchase_order_number eq` is used for job lookup.

---

## Dashboard columns (current)

| Column | Purpose |
|--------|---------|
| Category | One of 3 lead categories |
| Called / Attempted | Call tracking checkboxes |
| **Push ServiceM8** | **Yes / No** (whether job exists in ServiceM8) |
| Action | Push button or View job link |
| Pushed rows | Blue background |

Filters: search, category, called, attempted, push yes/no, date range.

Stats bar: Total, Needs Call, Called, Pushed to SM8.

**Last lead by platform** — separate time since last lead for each category (Same Day Home Services, Stay Connected Plumbing, Facebook). Uses `received_at`, updates every minute. Cards highlight amber if no lead in 24+ hours.

---

## WildJar call tracking

- **Status:** Built — webhook + separate `phone_calls` table + Call Tracking UI section
- **Table:** `phone_calls` (not mixed with form `leads`)
- **Edge Function:** `wildjar-webhook` (auth via `WILDJAR_WEBHOOK_SECRET`)
- **Setup:** `wildjar/WEBHOOK.md`
- **UI:** Left sidebar → **Call Tracking** (separate from **Leads**)

---

## Security & quality audit (open items)

| Priority | Issue | Status |
|----------|-------|--------|
| Critical | WordPress webhook accepts Forminator-shaped payloads **without secret** | Open |
| Critical | No Supabase Auth — anon key can read/update all leads | Open |
| High | Push job create + Supabase save not atomic (browser saves after SM8) | Partially mitigated |
| High | Manual ServiceM8 function paste vs git drift | Process risk |
| High | Deployment requires git push (local changes not on Railway until pushed) | Process risk |
| Medium | Dead `booked` column in DB; docs partially outdated | Open |
| Medium | Original spec: column layout per source | Not built |
| Medium | `received_at` vs `created_at` for date filter | Uses `created_at` |

---

## Key decisions log

| Date | Decision |
|------|----------|
| 2026-06 | WordPress webhooks primary (not Gmail) |
| 2026-06 | Supabase source of truth; dashboard anon key only |
| 2026-06 | Railway hosts dashboard; ServiceM8 iframe embed |
| 2026-06 | Replace **Booked** toggle with **Push ServiceM8** |
| 2026-06 | Three lead categories only (Same Day / Stay Connected / Facebook) |
| 2026-06 | `PROJECT.md` is session living doc — update each significant change |

---

## File map

| File | Role |
|------|------|
| `PROJECT.md` | **This file** — session log + requirements |
| `memory.md` | Short pointer to this file |
| `claude.md` | AI technical guide (may lag behind) |
| `README.md` | Human setup / deploy |
| `src/App.jsx` | App shell + sidebar navigation |
| `src/views/LeadsView.jsx` | Form leads table |
| `src/views/CallTrackingView.jsx` | WildJar phone calls table |
| `supabase/functions/wildjar-webhook/` | WildJar webhook ingestion |
| `supabase/functions/facebook-webhook/` | Facebook Lead Ads webhook (no n8n) |
| `supabase/migrations/create-phone-calls.sql` | `phone_calls` table |
| `src/leadCategories.js` | 3-category labels + resolver |
| `servicem8/addon-function.js` | Paste into ServiceM8 (single file) |
| `supabase/functions/_shared/lead-category.ts` | Ingestion category mapping |
| `supabase/functions/_shared/servicem8.ts` | Edge Function job creation |
| `manifest.json` | ServiceM8 OAuth scopes |

---

## Rules for AI assistants

1. Read `PROJECT.md` at start of session.
2. Update `PROJECT.md` when requirements or infrastructure change.
3. Do not reintroduce Gmail as default ingestion.
4. Do not commit secrets.
5. ServiceM8 add-on = **one pasted file** (`addon-function.js`), no `require()`.
