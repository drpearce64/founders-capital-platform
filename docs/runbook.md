# Runbook

## Manual Airtable → Supabase sync

The sync writes to the **production** Supabase. It is idempotent (upserts).

```bash
# From a checkout of the commit you want to run, with Railway env injected:
railway run node scripts/airtable_sync.cjs
```

- Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (the linked Railway service provides these via `railway run`).
- The scheduled equivalent is the `loving-vibrancy` cron with `RUN_SYNC=1`.
- Verify afterwards: the run prints `Resolved N investors …` and a summary; or run the [health check](#sync-health-check).

> ⚠️ Run the **current** sync code. If running a bundled `dist/scripts/airtable_sync.cjs`, make sure it was built from the commit you intend (a stale local `dist/` once produced `Resolved 1000` due to an old pre-pagination build).

## Sync health check

```bash
railway run node scripts/sync_health_check.cjs        # exit 0 = OK, 1 = unhealthy
SYNC_MAX_AGE_HOURS=13 railway run node scripts/sync_health_check.cjs
```

Read-only. Fails if the latest sync failed, reported table errors, or is older
than the threshold (a scheduled run was likely missed). Detection only — no
alert channel is wired.

## Data-quality report

```bash
railway run node scripts/data_quality_report.cjs       # read-only, console only
```

Reports called>committed, missing USD, FX coverage, duplicate active
commitments, orphan investors.

## Deploy procedure

Railway auto-deploys `main` on push. To force a deploy:

```bash
# Deploy the LATEST main commit (pulls fresh source):
railway redeploy --from-source
```

> ⚠️ **Deploy the latest commit only — never re-run an old deployment.**
> Plain `railway redeploy` (without `--from-source`) **rebuilds the last
> deployment's commit**, which can resurrect old code. A prior incident: a fix
> auto-deployed correctly, then a plain `redeploy` of an older commit landed on
> top and served the stale bundle. Always use `--from-source`, then confirm:
> - active commit == intended `main` HEAD
> - the live client bundle hash changed (`curl -s <domain>/?cb=$(date +%s) | grep -oE 'assets/index-[A-Za-z0-9_]+\.js'`)

`dist/` is gitignored and rebuilt fresh on every deploy, so deploys never serve
a committed prebuilt bundle.

## Rollbacks

### Auth flags
Auth is **dark** when `AUTH_ENABLED` (server) and `VITE_AUTH_ENABLED` (client)
are unset. To roll back an auth enablement:
1. Unset `AUTH_ENABLED` on the web service (server gate becomes a no-op immediately on restart).
2. Unset `VITE_AUTH_ENABLED` and **rebuild/redeploy** (it's a build-time client flag).
3. The portal renders open again; `/api/ping` is always public.

Before enabling auth: Supabase Auth must have users, `public.user_roles` must be
seeded (admin), the client must send the Bearer token, and the machine-to-machine
`/api/sync/*` routes need a decision (they'd 401 under the gate — only `/api/ping`
is excluded).

### RLS
RLS is **not enabled**; the server uses the service-role key (bypasses RLS). If
RLS is enabled and breaks reads/writes, either disable RLS in the Supabase
dashboard or confirm the server is still using `SUPABASE_SERVICE_ROLE_KEY` (not
the anon key).

### Archive-missing
`SYNC_ARCHIVE_MISSING` defaults to skip. Use `dry` to preview before ever
setting `true`. To roll back, set it back to unset/`dry`. Soft-deletes set
`archived_at`; rows are recoverable by clearing it.
