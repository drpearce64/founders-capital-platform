# Architecture

## Overview

```
 Airtable (base appXSAE1n2PvdCQB1)
        │  nightly sync (scripts/airtable_sync.cjs)
        ▼
 Supabase Postgres  ── service-role key ──►  Express server (/api/*)  ──►  React SPA
 (project yoyrwrdzivygufbzckdv)                      │
                                              served same-origin
```

- **Client** — Vite + React in `client/`, built to static assets, served by the Express server (same origin). API calls go through `apiRequest` in `client/src/lib/queryClient.ts`.
- **Server** — Express + TypeScript in `server/`, bundled by esbuild to `dist/index.cjs`. All `/api` reads/writes use the Supabase **service-role** key (bypasses RLS), constructed in `server/supabase.ts`.
- **Sync** — `scripts/airtable_sync.cjs` maps Airtable → Supabase. Bundled by esbuild to `dist/scripts/airtable_sync.cjs`.

## Supabase

- Project ref **`yoyrwrdzivygufbzckdv`** (region eu-west-3, Postgres 17).
- **Service-role key** — server + sync writes; bypasses RLS. Required; the server fails loud at boot if it (or `SUPABASE_URL`) is missing.
- **Anon key** — client Supabase Auth and server-side JWT verification. Auth is **dark** by default (see [environment.md](./environment.md)).
- **RLS** — not enabled. The server relies on the service-role key, so reads/writes work regardless. If RLS is ever turned on, ensure the server still uses the service-role key (it does).

## Railway services

Primary project: **`impartial-youthfulness`**. Two services deploy from the same repo/`main`:

| Service | Role | `RUN_SYNC` | Domain |
|---------|------|-----------|--------|
| `founders-capital-platform` | Web app (serves SPA + `/api`) | unset | `…-production-55f8.up.railway.app` |
| `loving-vibrancy` | Nightly sync (cron) | `1` | n/a (cron) |

Both have `startCommand: "npm start"` (forced by `railway.json`, which also locks the UI field). The **same `npm start`** does different things depending on `RUN_SYNC` — see below.

> Legacy: an older service **`helpful-fascination`** (separate project, domain `…-production.up.railway.app`) serves a stale web build and exposes the (open, unauthenticated) `POST /api/sync/airtable`. It is being retired; the real nightly sync runs via `loving-vibrancy` directly (not over HTTP). An external scheduler still POSTs to its `/api/sync/airtable` twice daily — turn that off at its own source.

## The `RUN_SYNC` launcher (`scripts/start.cjs`)

`package.json` `start` → `node scripts/start.cjs`:

- `RUN_SYNC` = `1` / `true` → spawns the sync (`dist/scripts/airtable_sync.cjs`, falling back to `scripts/airtable_sync.cjs`) and exits with its code. **This is how the cron service runs the sync.**
- unset / anything else → loads `dist/index.cjs` (the web server). Identical to the old `NODE_ENV=production node dist/index.cjs`.

## Sync schedule

`loving-vibrancy` runs on a Railway cron schedule (configured in the service's
settings — **the source of truth is the Railway dashboard**, not this doc).
Empirically runs roughly daily; the [health check](./runbook.md#sync-health-check)
flags a gap of more than ~13h as a missed run.

## Build pipeline

`npm run build` → `tsx script/build.ts`:
1. `vite build` → client static assets in `dist/`
2. esbuild → `dist/index.cjs` (server, CJS, `NODE_ENV=production` baked in)
3. esbuild → `dist/scripts/airtable_sync.cjs` (sync, `@supabase/supabase-js` inlined)

`dist/` is gitignored and **rebuilt fresh on every deploy**. Type-checking is a
separate `npm run check` (`tsc --noEmit`); the build does **not** type-check
(esbuild transpiles), so a `tsc` error never blocks a deploy.
