#!/usr/bin/env node
"use strict";
//
// scripts/sync_health_check.cjs — READ-ONLY sync freshness/health check.
//
// Inspects the latest airtable_sync_log "_summary" row and exits:
//   0  OK    — last run succeeded and is recent
//   1  FAIL  — no run, last run failed/had errors, or it's older than the
//              freshness threshold (a scheduled run was likely missed)
//
// Detection only — wires NO alert channel. Intended as the basis for a future
// cron/monitor. Performs only SELECT reads (no writes).
//
//   railway run node scripts/sync_health_check.cjs
//   SYNC_MAX_AGE_HOURS=13 (default) — max age before a run is "stale"
//
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_AGE_HOURS = Number(process.env.SYNC_MAX_AGE_HOURS || 13);

function fail(msg) { console.error(`SYNC HEALTH: FAIL — ${msg}`); process.exit(1); }
function ok(msg) { console.log(`SYNC HEALTH: OK — ${msg}`); process.exit(0); }

if (!SUPABASE_URL || !SUPABASE_KEY) fail("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  const { data, error } = await supabase
    .from("airtable_sync_log")
    .select("synced_at, status, action, detail")
    .eq("table_name", "_summary")
    .order("synced_at", { ascending: false })
    .limit(1);

  if (error) fail(`could not read airtable_sync_log: ${error.message}`);
  if (!data || data.length === 0) fail("no _summary row in airtable_sync_log — the sync has never completed");

  const row = data[0];
  const ageHours = (Date.now() - new Date(row.synced_at).getTime()) / 3_600_000;
  const ageStr = `${ageHours.toFixed(1)}h ago (${row.synced_at})`;

  // Sum per-table error counts from the detail JSON, if present.
  let totalErrors = 0;
  let stats = null;
  try {
    stats = JSON.parse(row.detail || "{}");
    for (const k of Object.keys(stats)) {
      const e = stats[k] && stats[k].errors;
      if (typeof e === "number") totalErrors += e;
    }
  } catch { /* detail not JSON — ignore */ }

  if (row.status !== "ok") fail(`last sync status="${row.status}" — ${ageStr}`);
  if (totalErrors > 0) fail(`last sync reported ${totalErrors} table error(s) — ${ageStr}`);
  if (ageHours > MAX_AGE_HOURS) {
    fail(`last sync ${ageStr} exceeds the ${MAX_AGE_HOURS}h freshness threshold — a scheduled run was likely missed`);
  }

  const counts = stats
    ? Object.entries(stats)
        .filter(([, v]) => v && typeof v.upserted === "number")
        .map(([k, v]) => `${k}:${v.upserted}`)
        .join(" ")
    : "";
  ok(`last sync ${ageStr}, 0 errors${counts ? " · " + counts : ""}`);
})().catch((e) => fail(`unexpected: ${e.message}`));
