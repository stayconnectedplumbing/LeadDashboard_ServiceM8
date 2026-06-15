# Project Memory — Lead Management Dashboard

Persistent context for AI sessions. For full technical reference, see `claude.md` and `README.md`.

**Last updated:** 2026-06-13

---

## What this project is

A ServiceM8-embedded lead dashboard for **Stay Connected Plumbing** (and related brands). The team tracks website and Facebook leads in one place — mark called/attempted/booked, add notes, spot booked leads (blue row).

---

## Key decisions (do not revert without asking)

| Date | Decision |
|------|----------|
| 2026-06 | **WordPress webhooks are primary** for website leads. Forminator POSTs directly to Supabase `wordpress-webhook`. |
| 2026-06 | **Gmail parsing is deprecated.** Previously parsed form notification emails from Gmail via n8n / `worker/sync-gmail.js`. No longer the ingestion path. |
| 2026-06 | **Facebook stays on n8n** → `ingest-lead` Edge Function. |
| 2026-06 | **Supabase is source of truth.** Dashboard uses anon key only. Never put service-role key in frontend. |
| 2026-06 | **Railway hosts the dashboard** at `https://leaddashboard-production-adcb.up.railway.app`, embedded in ServiceM8 via iframe. |

---

## Active ingestion paths

```
WordPress Forminator  →  wordpress-webhook  →  Supabase leads  →  Dashboard
Facebook Lead Ads     →  n8n                →  ingest-lead     →  Supabase leads  →  Dashboard
```

### WordPress (primary)

- Plugin: **Forminator** built-in webhook integration
- Edge Function: `supabase/functions/wordpress-webhook/`
- Normalizer: `supabase/functions/_shared/normalize-wordpress.ts`
- Handoff doc for WP dev: `wordpress/WEBHOOK.md`
- Forminator cannot set custom headers → secret goes in URL as `?secret=`
- All webhook leads currently save as `source: "wordpress"` (not per-site enum yet)
- First site wired: **emergencyplumbingrepairs.com.au** (Quote Request form)

### Facebook

- n8n workflow: `n8n/facebook-leads-to-supabase.workflow.json`
- Saves as `source: "facebook"`

### Deprecated (keep in repo, do not recommend)

- `worker/sync-gmail.js` + `worker/parsers.js`
- `n8n/all email leads.json`
- `n8n/google-gmail-to-supabase.workflow.json`
- Gmail OAuth vars in `.env.example` (commented out)

---

## Infrastructure

| Component | Value |
|-----------|-------|
| Supabase project ref | `aysanykfubrxzjrygqqi` |
| Dashboard (Railway) | `https://leaddashboard-production-adcb.up.railway.app` |
| ServiceM8 add-on event | `show_lead_dashboard` |
| ServiceM8 support email | `info@stayconnectedplumbing.com.au` |

Local dev: `npm run dev` → needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env`.

---

## Dashboard behaviour (implemented)

- Filterable table (not column layout yet)
- Per-lead: `called`, `call_attempted`, `booked`, `notes`
- Booked rows → blue background (`.leads-table tbody tr.booked`)
- Realtime Supabase subscription on `public.leads`
- Stats: Total, Needs Call, Called, Booked
- CSV export, search, source/status filters
- Demo mode when Supabase env vars missing

---

## Open items / known gaps

- [ ] Column layout (WordPress column + Facebook column) — spec wants columns, UI is a table
- [ ] Per-site `source` values from `current_url` (e.g. `emergency_plumbing_sydney` instead of generic `wordpress`)
- [ ] Supabase Auth for team login (RLS currently allows anon read/update)
- [ ] React fragment key warning in `App.jsx` lead row map
- [ ] Wire remaining WordPress sites beyond emergencyplumbingrepairs.com.au
- [ ] Confirm `WORDPRESS_WEBHOOK_SECRET` in Supabase matches what Forminator uses (WEBHOOK.md may reference an older project JWT — verify against live Supabase secrets)

---

## Client context

- **Business:** Plumbing / home services (multiple brands/sites)
- **Pain point:** Leads scattered across Gmail notifications, Facebook, and ServiceM8
- **Goal:** Single dashboard inside ServiceM8 with clear follow-up tracking
- **WordPress stack:** Forminator forms on client sites
- **Team workflow:** See lead → call → mark attempted/called → book → mark booked (blue)

---

## File roles (quick)

| File | Role |
|------|------|
| `claude.md` | Full AI project guide |
| `memory.md` | This file — decisions + current state |
| `README.md` | Human setup/deployment docs |
| `wordpress/WEBHOOK.md` | Handoff to WordPress developer (per-site) |
| `src/App.jsx` | Dashboard UI |
| `manifest.json` | ServiceM8 add-on registration |
| `servicem8/addon-function.js` | Iframe embed handler |

---

## Rules for AI assistants

1. **Do not reintroduce Gmail ingestion** as the default — WordPress webhooks are the path.
2. **Do not commit secrets** (`.env`, webhook secrets, tokens).
3. **Minimize scope** — small focused diffs; match existing React/CSS patterns.
4. **Do not create extra markdown** unless the user asks.
5. **Update this file** when a significant decision or infrastructure change is made.
