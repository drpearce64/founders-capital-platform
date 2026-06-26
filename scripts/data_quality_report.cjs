#!/usr/bin/env node
"use strict";
//
// scripts/data_quality_report.cjs — READ-ONLY data-quality report.
//
// Prints data-quality checks to the console only. Performs NO writes (only
// SELECT/.select reads via the service-role key). Safe to run against prod.
//
//   railway run node scripts/data_quality_report.cjs
//
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[data-quality] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Paginated read past PostgREST's 1000-row default. .order("id") keeps paging stable.
async function fetchAll(table, columns) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table} failed: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const num = (v) => Number(v ?? 0);
const fmtUsd = (n) =>
  "$" + Math.round(n).toLocaleString("en-US");

function section(title) {
  console.log("\n" + "─".repeat(64));
  console.log(title);
  console.log("─".repeat(64));
}

(async () => {
  console.log("FOUNDERS CAPITAL — DATA QUALITY REPORT (read-only)");
  console.log("generated:", new Date().toISOString());

  const commits = await fetchAll(
    "investor_commitments",
    "id,investor_id,entity_id,committed_amount,called_amount,committed_amount_usd,currency,archived_at",
  );
  const active = commits.filter((c) => c.archived_at == null);
  console.log(`\nLoaded ${commits.length} commitments (${active.length} active / not archived).`);

  // 1. called > committed
  section("1. Called > Committed (active)");
  const calledOver = active.filter((c) => num(c.called_amount) > num(c.committed_amount));
  console.log(`  ${calledOver.length} commitment(s) with called_amount > committed_amount`);
  calledOver.slice(0, 10).forEach((c) =>
    console.log(`    - ${c.id}: called ${fmtUsd(num(c.called_amount))} > committed ${fmtUsd(num(c.committed_amount))}`),
  );

  // 2. Missing committed_amount_usd
  section("2. Active commitments missing committed_amount_usd");
  const missingUsd = active.filter((c) => c.committed_amount_usd == null && c.committed_amount != null);
  console.log(`  ${missingUsd.length} active commitment(s) have committed_amount but no committed_amount_usd`);
  missingUsd.slice(0, 10).forEach((c) =>
    console.log(`    - ${c.id}: ${num(c.committed_amount)} ${c.currency || "?"} (no USD)`),
  );

  // 3. FX coverage (non-USD commitments converted to USD)
  section("3. FX coverage (non-USD active commitments)");
  const byCurrency = {};
  for (const c of active) {
    const cur = (c.currency || "USD").toUpperCase();
    byCurrency[cur] = byCurrency[cur] || { total: 0, withUsd: 0 };
    byCurrency[cur].total += 1;
    if (c.committed_amount_usd != null) byCurrency[cur].withUsd += 1;
  }
  Object.entries(byCurrency)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([cur, s]) => {
      const pct = s.total ? Math.round((s.withUsd / s.total) * 100) : 0;
      console.log(`  ${cur.padEnd(5)} ${String(s.withUsd).padStart(5)}/${String(s.total).padEnd(5)} have USD (${pct}%)`);
    });

  // 4. Duplicate active commitments (same investor + deal)
  section("4. Duplicate active commitments (same investor + entity)");
  const groups = new Map();
  for (const c of active) {
    if (!c.investor_id || !c.entity_id) continue;
    const k = `${c.investor_id}|${c.entity_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c.id);
  }
  const dups = Array.from(groups.entries()).filter(([, ids]) => ids.length > 1);
  console.log(`  ${dups.length} (investor, entity) pair(s) with >1 active commitment`);
  dups.slice(0, 10).forEach(([k, ids]) => {
    const [inv, ent] = k.split("|");
    console.log(`    - investor ${inv} × entity ${ent}: ${ids.length} rows [${ids.join(", ")}]`);
  });

  // 5. Orphan investors (no commitments) + orphaned commitment refs
  section("5. Orphan investors");
  const investors = await fetchAll("investors", "id,full_name");
  const investorIds = new Set(investors.map((i) => i.id));
  const idsWithCommits = new Set(commits.map((c) => c.investor_id));
  const investorsNoCommits = investors.filter((i) => !idsWithCommits.has(i.id));
  const danglingRefs = commits.filter((c) => c.investor_id && !investorIds.has(c.investor_id));
  console.log(`  ${investorsNoCommits.length} investor(s) with zero commitments`);
  investorsNoCommits.slice(0, 10).forEach((i) => console.log(`    - ${i.id}: ${i.full_name ?? "(no name)"}`));
  console.log(`  ${danglingRefs.length} commitment(s) whose investor_id has no matching investor row`);
  danglingRefs.slice(0, 10).forEach((c) => console.log(`    - commitment ${c.id} → missing investor ${c.investor_id}`));

  console.log("\n" + "─".repeat(64));
  console.log("Done. (read-only — no data changed)");
})().catch((e) => {
  console.error("[data-quality] failed:", e.message);
  process.exit(1);
});
