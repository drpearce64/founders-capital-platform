/**
 * Founders Capital — Airtable → Supabase Nightly Sync
 * ─────────────────────────────────────────────────────
 * Maps four Airtable tables to Supabase:
 *   Members      → investors
 *   Deals        → entities (SPVs) + investments
 *   Commitments  → investor_commitments
 *   Deals (YC)   → yc_deals + yc_investors + yc_holdings
 *
 * Run:  node scripts/airtable_sync.js
 * Env:  SUPABASE_URL, SUPABASE_ANON_KEY, AIRTABLE_PAT, AIRTABLE_BASE_ID
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL      || "https://yoyrwrdzivygufbzckdv.supabase.co";
const SUPABASE_KEY      = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";
const AIRTABLE_PAT      = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID  = process.env.AIRTABLE_BASE_ID || "appXSAE1n2PvdCQB1";

const AIRTABLE_TABLES = {
  members:     "tblQb339jVtJ6cwCM",
  commitments: "tblRI3sgfam7JSLuk",
  deals:       "tbln6AszmitsErPgh",
};

const AIRTABLE_API = "https://api.airtable.com/v0";

// ── Supabase client (bundled by esbuild — no external dep needed at runtime) ───

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Airtable fetch helper ────────────────────────────────────────────────────

async function fetchAirtableTable(tableId, fields = []) {
  const records = [];
  let offset = null;

  do {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    fields.forEach(f => params.append("fields[]", f));

    const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tableId}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable fetch failed for ${tableId}: ${res.status} ${body}`);
    }

    const json = await res.json();
    records.push(...(json.records || []));
    offset = json.offset || null;
  } while (offset);

  return records;
}

// ── Logging helper ───────────────────────────────────────────────────────────

async function logSync(table_name, airtable_record_id, action, status, detail = null) {
  try {
    await supabase.from("airtable_sync_log").insert({
      table_name,
      airtable_record_id,
      action,
      status,
      detail,
    });
  } catch {
    // non-fatal — don't let log failures break the sync
  }
}

// ── Safe string helpers ──────────────────────────────────────────────────────

function firstStr(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return String(val);
}

function safeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

// ── Counters ─────────────────────────────────────────────────────────────────

const stats = {
  investors:    { upserted: 0, skipped: 0, errors: 0 },
  spvs:         { upserted: 0, skipped: 0, errors: 0 },
  investments:  { upserted: 0, skipped: 0, errors: 0 },
  commitments:  { upserted: 0, skipped: 0, errors: 0 },
  yc_deals:     { upserted: 0, skipped: 0, errors: 0 },
  yc_investors: { upserted: 0, skipped: 0, errors: 0 },
  yc_holdings:  { upserted: 0, skipped: 0, errors: 0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Sync Members → investors
// ─────────────────────────────────────────────────────────────────────────────

async function syncMembers() {
  console.log("\n[1/3] Syncing Members → investors…");

  const records = await fetchAirtableTable(AIRTABLE_TABLES.members, [
    "Email",
    "Full name",
    "Phone",
    "Status",
    "KYC Status",
    "Record_ID",
    "CreatedAt",
  ]);

  console.log(`  Fetched ${records.length} members from Airtable`);

  for (const rec of records) {
    const f = rec.fields;
    const airtable_id = rec.id;

    // Skip unapproved / rejected members
    const status = f["Status"];
    if (status === "Rejected") {
      stats.investors.skipped++;
      continue;
    }

    const email     = f["Email"] ? String(f["Email"]).toLowerCase().trim() : null;
    const full_name = f["Full name"] ? String(f["Full name"]).trim() : null;

    if (!email && !full_name) {
      stats.investors.skipped++;
      continue;
    }

    const kyc_raw   = f["KYC Status"];
    const kyc_status =
      kyc_raw === "Completed" ? "approved" :
      kyc_raw === "Pending"   ? "pending"  : "pending";

    const row = {
      airtable_id,
      full_name:     full_name ?? email,
      email,
      phone:         f["Phone"]        ? String(f["Phone"]).trim()  : null,
      investor_type: "individual",     // Members are always individuals in Airtable
      kyc_status,
      onboarded_at:  safeDate(f["CreatedAt"]) ?? new Date().toISOString().split("T")[0],
    };

    try {
      const { error } = await supabase
        .from("investors")
        .upsert(row, {
          onConflict:        "airtable_id",
          ignoreDuplicates:  false,
        });

      if (error) throw error;

      stats.investors.upserted++;
      await logSync("investors", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.investors.errors++;
      console.error(`  ✗ investor ${airtable_id}: ${err.message}`);
      await logSync("investors", airtable_id, "upsert", "error", err.message);
    }
  }

  console.log(`  ✓ investors — upserted: ${stats.investors.upserted}, skipped: ${stats.investors.skipped}, errors: ${stats.investors.errors}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Sync Deals → entities (SPV) + investments
// ─────────────────────────────────────────────────────────────────────────────

async function syncDeals() {
  console.log("\n[2/3] Syncing Deals → entities + investments…");

  const records = await fetchAirtableTable(AIRTABLE_TABLES.deals, [
    "Record_ID",
    "CompanyName",
    "Status",
    "Stage",
    "Type",
    "Closing Date",
    "Pre-money valuation",
    "Total Funds Committed",
    "Total Received",
    "Carry",
    "Total Fee",
    "Investment Currency",
    "Deal Code",
    "Company Description",
    "URL",
    "Quarter closed",
    "Platform",
  ]);

  console.log(`  Fetched ${records.length} deals from Airtable`);

  for (const rec of records) {
    const f = rec.fields;
    const airtable_id = rec.id;

    // Only sync Founders Capital platform deals
    if (f["Platform"] && f["Platform"] !== "Founders Capital") {
      stats.spvs.skipped++;
      continue;
    }

    const company_name  = f["CompanyName"] ? String(f["CompanyName"]).trim() : null;
    const deal_code     = f["Deal Code"]   ? String(f["Deal Code"]).trim()   : null;
    if (!company_name) {
      stats.spvs.skipped++;
      continue;
    }

    // Derive a short_code: "VEC-IV" style isn't known from Deals table,
    // so we use the deal code prefix (e.g. REV-1124-FC → REV) or company initials
    const short_code = deal_code
      ? deal_code.split("-")[0].toUpperCase().slice(0, 10)
      : company_name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();

    // ── Upsert entity (SPV wrapper for this deal) ──────────────────────────
    const entity_row = {
      airtable_deal_id:  airtable_id,
      name:              `FC ${company_name} SPV`,
      short_code,
      entity_type:       "series_spv",
      jurisdiction:      "Delaware",
      status:            f["Status"] === "Closed" ? "closed" : "active",
      formation_date:    safeDate(f["Closing Date"]),
      currency:          f["Investment Currency"] ? String(f["Investment Currency"]) : "USD",
      carry_rate:        safeNum(f["Carry"]) ?? 0.20,
      management_fee_rate: safeNum(f["Total Fee"]) ?? 0.06,
      notes:             f["Company Description"] ? String(f["Company Description"]).slice(0, 1000) : null,
    };

    let entity_id = null;

    try {
      const { data: existingEntity } = await supabase
        .from("entities")
        .select("id")
        .eq("airtable_deal_id", airtable_id)
        .maybeSingle();

      if (existingEntity) {
        const { error } = await supabase
          .from("entities")
          .update(entity_row)
          .eq("id", existingEntity.id);
        if (error) throw error;
        entity_id = existingEntity.id;
      } else {
        const { data: newEntity, error } = await supabase
          .from("entities")
          .insert(entity_row)
          .select("id")
          .single();
        if (error) throw error;
        entity_id = newEntity.id;
      }

      stats.spvs.upserted++;
      await logSync("entities", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.spvs.errors++;
      console.error(`  ✗ entity ${airtable_id}: ${err.message}`);
      await logSync("entities", airtable_id, "upsert", "error", err.message);
      continue; // can't sync investment without entity
    }

    // ── Upsert investment linked to this entity ────────────────────────────
    const investment_row = {
      airtable_deal_id:    airtable_id,
      entity_id,
      company_name,
      investment_date:     safeDate(f["Closing Date"]),
      cost_basis:          safeNum(f["Total Received"]) ?? 0,
      current_fair_value:  safeNum(f["Total Received"]) ?? 0,
      status:              f["Status"] === "Closed" ? "active" : "pending",
      stage:               f["Stage"] ? String(f["Stage"]).toLowerCase() : null,
      notes:               deal_code ?? null,
    };

    try {
      const { data: existingInv } = await supabase
        .from("investments")
        .select("id")
        .eq("airtable_deal_id", airtable_id)
        .maybeSingle();

      if (existingInv) {
        const { error } = await supabase
          .from("investments")
          .update(investment_row)
          .eq("id", existingInv.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("investments")
          .insert(investment_row);
        if (error) throw error;
      }

      stats.investments.upserted++;
      await logSync("investments", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.investments.errors++;
      console.error(`  ✗ investment ${airtable_id}: ${err.message}`);
      await logSync("investments", airtable_id, "upsert", "error", err.message);
    }
  }

  console.log(`  ✓ entities     — upserted: ${stats.spvs.upserted}, skipped: ${stats.spvs.skipped}, errors: ${stats.spvs.errors}`);
  console.log(`  ✓ investments  — upserted: ${stats.investments.upserted}, errors: ${stats.investments.errors}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Sync Commitments → investor_commitments
// ─────────────────────────────────────────────────────────────────────────────

async function syncCommitments() {
  console.log("\n[3/3] Syncing Commitments → investor_commitments…");

  const records = await fetchAirtableTable(AIRTABLE_TABLES.commitments, [
    "Record ID",
    "Member",
    "Deal",
    "Final Investment Value",
    "Amount to Wire",
    "Fee",
    "Status (from Investments)",
    "Commitment cancelled",
    "Wiring currency",
    "Created",
    "CompanyName (from Deal)",
    "Closing Date (from Deal)",
    "Email (from Member)",
    "Name (from Member)",
    "Status",
    "Discounted fee",
    "Carry %",
    "Actually Received (from Investments)",
  ]);

  console.log(`  Fetched ${records.length} commitments from Airtable`);

  for (const rec of records) {
    const f = rec.fields;
    const airtable_id = rec.id;

    // Skip cancelled commitments
    if (f["Commitment cancelled"] === "Yes") {
      stats.commitments.skipped++;
      continue;
    }

    // Resolve Supabase investor by airtable_id of member
    const member_airtable_id = firstStr(f["Member"]);
    const deal_airtable_id   = firstStr(f["Deal"]);

    if (!member_airtable_id || !deal_airtable_id) {
      stats.commitments.skipped++;
      continue;
    }

    // Look up investor
    const { data: investor } = await supabase
      .from("investors")
      .select("id")
      .eq("airtable_id", member_airtable_id)
      .maybeSingle();

    // Look up entity
    const { data: entity } = await supabase
      .from("entities")
      .select("id")
      .eq("airtable_deal_id", deal_airtable_id)
      .maybeSingle();

    if (!investor || !entity) {
      // Referenced records not synced yet — skip gracefully
      stats.commitments.skipped++;
      await logSync("investor_commitments", airtable_id, "skip",
        "warning", `Missing investor(${member_airtable_id}) or entity(${deal_airtable_id})`);
      continue;
    }

    // Map fund received status
    const inv_status   = firstStr(f["Status (from Investments)"]);
    const commit_status =
      inv_status === "Funds received" ? "funded"   :
      inv_status === "Sent"           ? "called"   : "committed";

    const committed  = safeNum(f["Final Investment Value"]) ?? 0;
    const received   = safeNum(firstStr(f["Actually Received (from Investments)"])) ?? 0;
    const fee_amount = safeNum(f["Fee"]) ?? 0;

    const row = {
      airtable_id,
      entity_id:        entity.id,
      investor_id:      investor.id,
      committed_amount: committed,
      called_amount:    fee_amount > 0 ? committed + fee_amount : committed,
      funded_amount:    received,
      status:           commit_status,
      fee_rate:         safeNum(f["Discounted fee"]) ?? 0.06,
      carry_rate:       safeNum(f["Carry %"]) ? (safeNum(f["Carry %"]) / 100) : 0.20,
      currency:         f["Wiring currency"]
        ? String(f["Wiring currency"]).includes("USD") ? "USD" : "GBP"
        : "USD",
      commitment_date:  safeDate(f["Created"]) ?? new Date().toISOString().split("T")[0],
    };

    try {
      const { error } = await supabase
        .from("investor_commitments")
        .upsert(row, {
          onConflict:       "airtable_id",
          ignoreDuplicates: false,
        });

      if (error) throw error;

      stats.commitments.upserted++;
      await logSync("investor_commitments", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.commitments.errors++;
      console.error(`  ✗ commitment ${airtable_id}: ${err.message}`);
      await logSync("investor_commitments", airtable_id, "upsert", "error", err.message);
    }
  }

  console.log(`  ✓ commitments — upserted: ${stats.commitments.upserted}, skipped: ${stats.commitments.skipped}, errors: ${stats.commitments.errors}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Sync YC Deals → yc_deals + yc_investors + yc_holdings
// ─────────────────────────────────────────────────────────────────────────────

function extractBatch(name) {
  const m = String(name || "").match(/\(YC\s+([A-Z]\d+)\)/);
  return m ? m[1] : null;
}

async function syncYC() {
  console.log("\n[4/4] Syncing YC Deals + Members → yc_deals / yc_investors / yc_holdings…");

  // ── 4a: Sync yc_deals from Deals table (YC-named rows only) ──────────────
  const dealRecords = await fetchAirtableTable(AIRTABLE_TABLES.deals, [
    "Name",
    "Status",
    "Stage",
    "Batch",
    "Instrument",
    "Currency",
    "FC Investment",
    "USD Investment Value",
    "Total Funds Committed",
    "MOIC",
    "Live Market Value of Investment USD",
    "Portfolio Appreciation",
    "Closing Date",
    "Quarter",
    "Year",
    "Description",
    "URL",
    "Deal Code",
    "Business Type",
    "Location",
    "Round",
    "Pre-money valuation",
    "Total round size",
  ]);

  const ycDealRecords = dealRecords.filter(r => String(r.fields["Name"] || "").includes("(YC"));
  console.log(`  Found ${ycDealRecords.length} YC deals in Airtable`);

  // Build airtable_id → supabase id map for later use in holdings
  const ycDealIdMap = {}; // airtable_rec_id → supabase yc_deals.id

  for (const rec of ycDealRecords) {
    const f = rec.fields;
    const airtable_id = rec.id;
    const name = String(f["Name"] || "").trim();
    const batch = extractBatch(name);

    const row = {
      id:                    name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_"),
      name,
      batch,
      status:                f["Status"] ? String(f["Status"]) : null,
      stage:                 f["Stage"]  ? String(f["Stage"])  : null,
      instrument:            f["Instrument"] ? String(f["Instrument"]) : null,
      currency:              f["Currency"]   ? String(f["Currency"])   : "USD",
      fc_investment:         safeNum(f["FC Investment"]) ?? 0,
      usd_investment_value:  safeNum(f["USD Investment Value"]) ?? 0,
      total_funds_committed: safeNum(f["Total Funds Committed"]) ?? 0,
      moic:                  safeNum(f["MOIC"]) ?? 1,
      live_market_value_usd: safeNum(f["Live Market Value of Investment USD"]),
      portfolio_appreciation:safeNum(f["Portfolio Appreciation"]),
      closing_date:          safeDate(f["Closing Date"]),
      quarter:               f["Quarter"] ? String(f["Quarter"]) : null,
      year:                  f["Year"]    ? String(f["Year"])    : null,
      description:           f["Description"] ? String(f["Description"]) : null,
      url:                   f["URL"]    ? String(f["URL"])    : null,
      deal_code:             f["Deal Code"] ? String(f["Deal Code"]) : null,
      business_type:         f["Business Type"] ? String(f["Business Type"]) : null,
      location:              f["Location"] ? String(f["Location"]) : null,
    };

    try {
      const { error } = await supabase.from("yc_deals").upsert(row, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) throw error;
      ycDealIdMap[airtable_id] = row.id;
      stats.yc_deals.upserted++;
      await logSync("yc_deals", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.yc_deals.errors++;
      console.error(`  ✗ yc_deal ${name}: ${err.message}`);
      await logSync("yc_deals", airtable_id, "upsert", "error", err.message);
    }
  }

  console.log(`  ✓ yc_deals — upserted: ${stats.yc_deals.upserted}, errors: ${stats.yc_deals.errors}`);

  // ── 4b: Sync YC investors + holdings from Members ─────────────────────────
  const memberRecords = await fetchAirtableTable(AIRTABLE_TABLES.members, [
    "Full name",
    "Email",
    "Geographical Location",
    "KYC Status",
    "Total investments",
    "Number of Investments Made",
    "Value of Portfolio",
    "*Investor Capital Deployed",
    "Member ID",
    "CompanyName (from Deal) (from Commitments)",
    "Closing Date (from Deal) (from Commitments)",
    "Commitments",
  ]);

  console.log(`  Fetched ${memberRecords.length} members for YC holdings sync`);

  for (const rec of memberRecords) {
    const f = rec.fields;
    const airtable_id = rec.id;

    const companyNames = Array.isArray(f["CompanyName (from Deal) (from Commitments)"])
      ? f["CompanyName (from Deal) (from Commitments)"]
      : [];

    const ycDeals = companyNames.filter(n => String(n).includes("(YC"));
    if (ycDeals.length === 0) {
      stats.yc_investors.skipped++;
      continue;
    }

    const name  = String(f["Full name"] || "").trim();
    const email = f["Email"] ? String(f["Email"]).toLowerCase().trim() : null;
    if (!name && !email) { stats.yc_investors.skipped++; continue; }

    const allDeals = companyNames;
    const delawareDeals = allDeals.filter(n => !String(n).includes("(YC"));

    const investorRow = {
      airtable_id,
      name,
      email,
      location:              f["Geographical Location"] ? String(f["Geographical Location"]) : null,
      kyc_status:            f["KYC Status"] ? String(f["KYC Status"]) : null,
      total_investments_usd: safeNum(f["Total investments"]) ?? 0,
      num_investments:       parseInt(f["Number of Investments Made"] || 0, 10),
      value_of_portfolio:    safeNum(f["Value of Portfolio"]) ?? 0,
      capital_deployed:      safeNum(f["*Investor Capital Deployed"]) ?? 0,
      member_id:             f["Member ID"] ? String(f["Member ID"]) : null,
      yc_deal_count:         ycDeals.length,
      delaware_deal_count:   delawareDeals.length,
    };

    try {
      const { data: upserted, error: invErr } = await supabase
        .from("yc_investors")
        .upsert(investorRow, { onConflict: "airtable_id", ignoreDuplicates: false })
        .select("id")
        .maybeSingle();

      if (invErr) throw invErr;

      // Fetch the investor UUID (upsert may not return it reliably)
      const { data: invRow } = await supabase
        .from("yc_investors")
        .select("id")
        .eq("airtable_id", airtable_id)
        .maybeSingle();

      const investorUuid = invRow?.id;
      stats.yc_investors.upserted++;

      if (!investorUuid) continue;

      // Sync yc_holdings — delete existing for this investor, re-insert
      await supabase.from("yc_holdings").delete().eq("investor_airtable_id", airtable_id);

      const closingDates = Array.isArray(f["Closing Date (from Deal) (from Commitments)"])
        ? f["Closing Date (from Deal) (from Commitments)"]
        : [];

      const holdingRows = ycDeals.map((dealName, i) => {
        const batch       = extractBatch(dealName);
        const closingDate = closingDates[allDeals.indexOf(dealName)] ?? null;
        return {
          investor_id:          investorUuid,
          investor_airtable_id: airtable_id,
          deal_name:            dealName,
          yc_batch:             batch,
          closing_date:         safeDate(closingDate),
          vehicle:              "YC",
        };
      });

      if (holdingRows.length > 0) {
        const { error: hErr } = await supabase.from("yc_holdings").insert(holdingRows);
        if (hErr) throw hErr;
        stats.yc_holdings.upserted += holdingRows.length;
      }

      await logSync("yc_investors", airtable_id, "upsert", "ok");
    } catch (err) {
      stats.yc_investors.errors++;
      console.error(`  ✗ yc_investor ${name}: ${err.message}`);
      await logSync("yc_investors", airtable_id, "upsert", "error", err.message);
    }
  }

  // Re-populate investment_amount_usd + moic on holdings from yc_deals
  try {
    await supabase.rpc ? null : null; // no rpc needed — use a direct update
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/refresh_yc_holdings_amounts`,
      { method: "POST", headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" }, body: "{}" }
    ).catch(() => null); // non-fatal — run separately if needed
  } catch { /* non-fatal */ }

  console.log(`  ✓ yc_investors — upserted: ${stats.yc_investors.upserted}, skipped: ${stats.yc_investors.skipped}, errors: ${stats.yc_investors.errors}`);
  console.log(`  ✓ yc_holdings  — inserted: ${stats.yc_holdings.upserted}, errors: ${stats.yc_holdings.errors}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Founders Capital — Airtable → Supabase Sync");
  console.log(`  ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════");

  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY");
  if (!AIRTABLE_PAT)                  throw new Error("Missing AIRTABLE_PAT");

  const t0 = Date.now();

  // Steps run in order — commitments depend on investors + entities existing first
  await syncMembers();
  await syncDeals();
  await syncCommitments();
  await syncYC();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  Sync complete in ${elapsed}s`);
  console.log(`  investors:    ${stats.investors.upserted} upserted, ${stats.investors.errors} errors`);
  console.log(`  entities:     ${stats.spvs.upserted} upserted, ${stats.spvs.errors} errors`);
  console.log(`  investments:  ${stats.investments.upserted} upserted, ${stats.investments.errors} errors`);
  console.log(`  commitments:  ${stats.commitments.upserted} upserted, ${stats.commitments.errors} errors`);
  console.log(`  yc_deals:     ${stats.yc_deals.upserted} upserted, ${stats.yc_deals.errors} errors`);
  console.log(`  yc_investors: ${stats.yc_investors.upserted} upserted, ${stats.yc_investors.errors} errors`);
  console.log(`  yc_holdings:  ${stats.yc_holdings.upserted} upserted, ${stats.yc_holdings.errors} errors`);
  console.log("═══════════════════════════════════════════════════\n");

  // Write a final summary row to the sync log
  await supabase.from("airtable_sync_log").insert({
    table_name:          "_summary",
    airtable_record_id:  null,
    action:              "sync_complete",
    status:              "ok",
    detail: JSON.stringify({
      elapsed_seconds:  parseFloat(elapsed),
      investors:        stats.investors,
      entities:         stats.spvs,
      investments:      stats.investments,
      commitments:      stats.commitments,
      yc_deals:         stats.yc_deals,
      yc_investors:     stats.yc_investors,
      yc_holdings:      stats.yc_holdings,
    }),
  });
}

main().catch(async err => {
  console.error("SYNC FAILED:", err);
  // Write a failure row so /api/sync/airtable/status reflects the error
  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      await supabase.from("airtable_sync_log").insert({
        table_name:         "_summary",
        airtable_record_id: null,
        action:             "sync_complete",
        status:             "error",
        detail:             JSON.stringify({ error: err.message }),
      });
    }
  } catch (logErr) {
    console.error("Failed to write error log:", logErr.message);
  }
  process.exit(1);
});
