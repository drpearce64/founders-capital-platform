# Environment variables

Set in the Railway service settings (or a local `.env` for development — see
`.env.example`). Values are not stored in the repo.

## Server + sync

| Var | Required | What it does |
|-----|----------|--------------|
| `SUPABASE_URL` | ✅ | Supabase project URL. Server fails loud at boot if missing. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key for all server reads/writes and sync writes (bypasses RLS). Server fails loud at boot if missing. **Never expose to the client.** |
| `SUPABASE_ANON_KEY` | for auth | Anon key for server-side JWT verification (and client auth). |
| `AIRTABLE_API_KEY` | sync | Airtable token for the sync. `AIRTABLE_PAT` is accepted as a legacy fallback (`AIRTABLE_API_KEY || AIRTABLE_PAT`). |
| `AIRTABLE_BASE_ID` | sync | Airtable base id (defaults to `appXSAE1n2PvdCQB1`). |
| `NODE_ENV` | – | `production` in deployment. The web bundle also bakes this at build time. |
| `PORT` | – | Web server port (default 5000). |

## Cron / sync behaviour

| Var | What it does |
|-----|--------------|
| `RUN_SYNC` | `1`/`true` → `npm start` runs the **sync** and exits; unset → runs the **web server**. Set on the cron service only. |
| `SYNC_ARCHIVE_MISSING` | Archive-missing reconciliation mode: unset → **skip**; `dry` → count + log only (no writes); `true` → soft-delete Supabase rows whose Airtable source was deleted. Guards: never runs on an empty fetch set; never archives a ghost entity that still has live commitments. |
| `SYNC_MAX_AGE_HOURS` | Freshness threshold for `sync_health_check.cjs` (default `13`). |
| `SYNC_SECRET` | Optional bearer token for the machine-to-machine `POST /api/sync/*` routes. **Currently unset** → those endpoints are open. Setting it requires callers to send `Authorization: Bearer <secret>`. |

## Auth (dark by default — leave unset to keep auth OFF)

| Var | What it does |
|-----|--------------|
| `AUTH_ENABLED` | Server gate. `true` enforces `Authorization: Bearer` + role on `/api` (except `/api/ping`). Unset/anything else → **no-op** (gate disabled). |
| `VITE_AUTH_ENABLED` | Client gate (build-time). `true` shows the login screen; unset → portal renders open. |
| `VITE_SUPABASE_URL` | Client Supabase URL (build-time). Required only when `VITE_AUTH_ENABLED=true`. |
| `VITE_SUPABASE_ANON_KEY` | Client anon key (build-time). Required only when `VITE_AUTH_ENABLED=true`. The client builds a Supabase client only when both VITE_SUPABASE_* are present (else `null`, so the app can't crash with "supabaseKey is required" while auth is dark). |
| `VITE_API_URL` | Optional. Set only if the API lives on a different origin than the frontend; defaults to same-origin. |

> `VITE_*` vars are **build-time** — they're baked into the client bundle, so
> changing them requires a rebuild/redeploy, not just a restart.
