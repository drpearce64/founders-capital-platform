# Founders Capital Platform — Operations Docs

Operational runbook and architecture for the Founders Capital platform
(Vite + React client, Express + TypeScript server, Supabase Postgres, Railway,
Airtable → Supabase nightly sync).

| Doc | Covers |
|-----|--------|
| [architecture.md](./architecture.md) | Supabase project, the two Railway services (web + cron), the `RUN_SYNC` launcher, build pipeline |
| [environment.md](./environment.md) | Every environment variable and what it does |
| [runbook.md](./runbook.md) | Manual sync, deploy procedure, rollback (RLS / auth), health check |
| [data-model.md](./data-model.md) | Airtable → Supabase mapping, the FC-VECTOR vehicle mapping, FX/capping/fees, pagination |

> These docs capture what was learned during the platform engagement. Where a
> value can drift (cron schedule, exact env values), the doc points at the
> source of truth (Railway/Supabase dashboards) rather than hard-coding it.
