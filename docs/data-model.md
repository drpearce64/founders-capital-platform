# Airtable → Supabase data model

Source: Airtable base `appXSAE1n2PvdCQB1`. The nightly sync
(`scripts/airtable_sync.cjs`) maps it to Supabase.

## Table mapping

| Airtable table | Supabase table(s) | Key |
|----------------|-------------------|-----|
| Members (`tblQb339jVtJ6cwCM`) | `investors` | `airtable_id` |
| Deals (`tbln6AszmitsErPgh`) | `entities` (SPVs) + `investments` | `airtable_deal_id` |
| Commitments (`tblRI3sgfam7JSLuk`) | `investor_commitments` | `airtable_id` |
| Deals (YC) | `yc_deals`, `yc_investors`, `yc_holdings` | |
| Transactions (`tblY3GpWW9Gb1orKb`) | `bank_transactions` | |
| Currency exchange (`tblJ29J4DcyiQfVnx`) | (FX rate table, in-memory) | |

## Platform filter

Only deals with **`Platform = "Founders Capital"`** sync to entities. **Odin**
and **Sydecar** deals (external SPV platforms, ~46 rows) are skipped by design.
Blank/`test` deals are also skipped.

## FC-VECTOR vehicle mapping

The canonical Vector-series entity is derived from the Airtable
**`Vehicle Name Abbrv`** field, not the deal code:

- `"Vector IX"` → `short_code = FC-VECTOR-IX`, `name = "FC Platform LP Vector IX Series"`
- This overrides the deal-code auto-derivation **and** relabels existing rows.
- Implemented by `vectorSeriesFromVehicle()` + `claimVectorShortCode()` (unit-tested).

**Uniqueness / ghost handling** (`classifyVectorClaim` / `classifyGhostClaim`):
- code free / already this deal's → claim it
- held by another **live** deal → flag (vehicle has >1 deal); don't collide
- held by a **ghost** (its Airtable deal was deleted):
  - ghost has **live commitments** → **do not** free it (would strand an LP) — fix the Airtable link first
  - empty ghost → archive + rename (`GHOST-…`) and claim the code

> The dashboard's Vector view filters `short_code LIKE 'FC-VECTOR-%'`. An entity
> coded by the deal prefix (e.g. `RPL`) won't appear there until it's mapped to
> `FC-VECTOR-{N}`.

## Cayman fund

`FC-CAYMAN-FUND` ("Founders Capital Strat. Opps. Fund I LP") is a **hand-seeded**
Supabase entity (`airtable_deal_id = null`). There is **no** Cayman deal/platform
in the Airtable Deals table, so the sync never populates it — its portfolio/LP
register lives outside this base. The Cayman dashboard shows an empty-state until
a data source is connected.

## Money rules (pure, unit-tested in `scripts/*.test.cjs`)

- **FX** (`scripts/fx_logic.cjs`): GBP→USD via the `GBP-USD` rate; EUR→USD via `1 / USD-EUR` (derived); **KYD pegged at 1.20**; unknown currency or missing rate → flagged USD fallback (never silently wrong).
- **Capping** (`cappedCalled`): called capital never exceeds the commitment; cash above it is fee.
- **Access fee** (`feeAmount`): cash received above the commitment (0 if not over-funded).

## Pagination (the 1000-row cap)

PostgREST returns **at most 1000 rows** per query by default. Any unbounded
select on a growing table must page with `.range()`:
- the sync's `buildIdMap` (investors, entities) and `reconcileArchiveMissing` page.
- the server uses `selectAllRows()` (`server/supabase.ts`) for unbounded list/aggregation endpoints.

A silent cap here once truncated the investor map → ~1000 of 2300+ investors
resolved, dropping commitments as `unresolved_ref`. Always paginate, and order
by a unique tiebreaker (`id`) so page boundaries can't skip/duplicate rows.

## Archive-missing reconciliation

Gated by `SYNC_ARCHIVE_MISSING` (unset/`dry`/`true`). Soft-deletes Supabase rows
whose `airtable_id` is no longer in the Airtable fetch (`selectStaleRows`).
Guards: empty fetch set → archive nothing; rows without an `airtable_id` are
never archived.

## Known data-quality notes (as of this engagement)

- A small number of duplicate / `$0` commitment rows exist (see
  `data_quality_report.cjs`). **Do not** add a uniqueness index or bulk-clean
  these without sign-off — some are legitimate multi-tranche commitments.
- One commitment had `called > committed`; a few lack `committed_amount_usd`.
- ~1900 investors have zero commitments (prospects / YC-only members).
