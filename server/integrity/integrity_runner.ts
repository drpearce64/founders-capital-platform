/**
 * FC Portal — Data Integrity Runner
 *
 * Fetches records from Airtable and Supabase for each CheckGroup,
 * compares field-by-field using the configured tolerances, and returns
 * a structured mismatch report.
 *
 * Uses the Airtable REST API directly (same pattern as routes.ts) and
 * the existing Supabase client — no additional SDK dependencies.
 */

import { createClient } from "@supabase/supabase-js";
import {
  AIRTABLE_BASE_ID,
  CheckGroup,
  FieldMapping,
  INTEGRITY_CHECKS,
} from "./integrity_checks";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Mismatch {
  group: string;
  record_key: string;       // deal_code / email / airtable_id
  field: string;            // supabase column or "RECORD_MISSING" / "RECORD_COUNT"
  label: string;            // human-readable field label
  airtable_val: string | number | null;
  supabase_val: string | number | null;
  pct_diff: number | null;  // null for exact/enum checks; Infinity = one-sided null
  severity: "critical" | "warning";
}

export interface IntegrityReport {
  run_at: string;
  duration_ms: number;
  mismatches: Mismatch[];
  group_summaries: Array<{
    name: string;
    records_checked: number;
    fields_checked: number;
    mismatches: number;
  }>;
  summary: {
    total_records_checked: number;
    total_fields_checked: number;
    mismatch_count: number;
    ok_count: number;
    critical_count: number;
    warning_count: number;
  };
}

// ─── Numeric helpers ──────────────────────────────────────────────────────────

export function pctDiff(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;      // both absent — no mismatch
  if (a == null || b == null) return Infinity;  // one-sided null — always flag
  if (a === 0 && b === 0) return 0;
  if (a === 0) return Infinity;
  return Math.abs((a - b) / a) * 100;
}

export function exceedsTolerance(diff: number | null, tolerance: number): boolean {
  if (diff === null) return false;
  if (!isFinite(diff)) return true;
  return diff > tolerance;
}

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function safeDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  // Normalise to YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

// ─── Airtable fetch (REST API — same pattern as routes.ts) ───────────────────

async function fetchAirtableRecords(
  tableId: string,
  fields: string[],
  filterByFormula: string,
  pat: string
): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
  const allRecords: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  let page = 0;

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`);
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
    fields.forEach(f => url.searchParams.append("fields[]", f));
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable fetch failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json: any = await res.json();
    allRecords.push(...(json.records ?? []));
    offset = json.offset;
    page++;
    if (page > 30) break; // safety cap at 3000 records
  } while (offset);

  return allRecords;
}

// ─── Compare a single field ───────────────────────────────────────────────────

function compareField(
  fm: FieldMapping,
  atRaw: unknown,
  sbRaw: unknown,
  groupName: string,
  recordKey: string
): Mismatch | null {
  let isMismatch = false;
  let diff: number | null = null;

  switch (fm.check_type) {
    case "numeric": {
      const atVal = safeNum(atRaw);
      const sbVal = safeNum(sbRaw);
      diff = pctDiff(atVal, sbVal);
      isMismatch = exceedsTolerance(diff, fm.tolerance);
      break;
    }
    case "exact_string": {
      isMismatch =
        safeStr(atRaw).toLowerCase() !== safeStr(sbRaw).toLowerCase();
      break;
    }
    case "exact_enum":
    case "exact_date": {
      const atStr = fm.check_type === "exact_date" ? safeDate(atRaw) : safeStr(atRaw);
      const sbStr = fm.check_type === "exact_date" ? safeDate(sbRaw) : safeStr(sbRaw);
      isMismatch = atStr !== sbStr;
      break;
    }
  }

  if (!isMismatch) return null;

  return {
    group: groupName,
    record_key: recordKey,
    field: fm.supabase_column,
    label: fm.label,
    airtable_val: atRaw == null ? null : (fm.check_type === "numeric" ? safeNum(atRaw) : safeStr(atRaw)),
    supabase_val: sbRaw == null ? null : (fm.check_type === "numeric" ? safeNum(sbRaw) : safeStr(sbRaw)),
    pct_diff: diff != null && isFinite(diff) ? Math.round(diff * 100) / 100 : diff,
    severity: fm.critical ? "critical" : diff === Infinity || diff === null ? "critical" : "warning",
  };
}

// ─── Run a single CheckGroup ──────────────────────────────────────────────────

async function runCheckGroup(
  group: CheckGroup,
  pat: string,
  supabase: any
): Promise<{
  mismatches: Mismatch[];
  records_checked: number;
  fields_checked: number;
}> {
  const mismatches: Mismatch[] = [];
  let records_checked = 0;
  let fields_checked = 0;

  // ── Fetch from Airtable ───────────────────────────────────────────────────
  const atFields = [
    group.airtable_join_field,
    ...group.fields.map(f => f.airtable_field),
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const atRecords = await fetchAirtableRecords(
    group.airtable_table_id,
    atFields,
    group.airtable_filter,
    pat
  );

  // ── Fetch from Supabase ───────────────────────────────────────────────────
  const sbColumns = [
    group.supabase_join_field,
    ...group.fields.map(f => f.supabase_column),
  ].filter((v, i, a) => a.indexOf(v) === i).join(", ");

  const { data: sbRows, error: sbErr } = await supabase
    .from(group.supabase_table)
    .select(sbColumns);

  if (sbErr) {
    throw new Error(`[${group.name}] Supabase fetch failed: ${sbErr.message}`);
  }

  // Build join map: joinKey → supabase row
  const sbMap = new Map<string, Record<string, unknown>>();
  for (const row of sbRows ?? []) {
    const key = safeStr((row as any)[group.supabase_join_field]).toLowerCase();
    if (key) sbMap.set(key, row as any);
  }

  // ── Compare each Airtable record ──────────────────────────────────────────
  for (const rec of atRecords) {
    const atKey = safeStr(rec.fields[group.airtable_join_field]);
    if (!atKey) continue;

    records_checked++;
    const sb = sbMap.get(atKey.toLowerCase());

    if (!sb) {
      // Record exists in Airtable but is missing from Supabase — always critical
      mismatches.push({
        group: group.name,
        record_key: atKey,
        field: "RECORD_MISSING",
        label: "Record missing in Supabase",
        airtable_val: atKey,
        supabase_val: null,
        pct_diff: null,
        severity: "critical",
      });
      fields_checked++;
      continue;
    }

    // Compare each mapped field
    for (const fm of group.fields) {
      fields_checked++;
      const atVal = rec.fields[fm.airtable_field] ?? null;
      const sbVal = (sb as any)[fm.supabase_column] ?? null;
      const mismatch = compareField(fm, atVal, sbVal, group.name, atKey);
      if (mismatch) mismatches.push(mismatch);
    }
  }

  // ── Count check: flag if Supabase has more rows than Airtable ────────────
  // (records in Supabase with no Airtable counterpart — orphans)
  const atKeys = new Set(
    atRecords.map(r => safeStr(r.fields[group.airtable_join_field]).toLowerCase()).filter(Boolean)
  );
  const orphanCount = Array.from(sbMap.keys()).filter(k => !atKeys.has(k)).length;
  if (orphanCount > 0) {
    fields_checked++;
    mismatches.push({
      group: group.name,
      record_key: `${group.supabase_table}`,
      field: "ORPHAN_RECORDS",
      label: "Supabase has records with no matching Airtable record",
      airtable_val: atRecords.length,
      supabase_val: sbMap.size,
      pct_diff: null,
      severity: "warning",
    });
  }

  return { mismatches, records_checked, fields_checked };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const startMs = Date.now();
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) throw new Error("AIRTABLE_PAT not configured");

  const supabaseUrl = process.env.SUPABASE_URL ?? "https://yoyrwrdzivygufbzckdv.supabase.co";
  const supabaseKey = process.env.SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const allMismatches: Mismatch[] = [];
  const groupSummaries: IntegrityReport["group_summaries"] = [];

  // Run all check groups — sequentially to avoid rate-limiting Airtable
  for (const group of INTEGRITY_CHECKS) {
    try {
      const result = await runCheckGroup(group, pat, supabase);
      allMismatches.push(...result.mismatches);
      groupSummaries.push({
        name: group.name,
        records_checked: result.records_checked,
        fields_checked: result.fields_checked,
        mismatches: result.mismatches.length,
      });
    } catch (err: any) {
      // Group failure = critical mismatch so it surfaces in the alert
      allMismatches.push({
        group: group.name,
        record_key: "CHECK_FAILED",
        field: "CHECK_ERROR",
        label: "Integrity check group failed to run",
        airtable_val: null,
        supabase_val: null,
        pct_diff: null,
        severity: "critical",
      });
      groupSummaries.push({
        name: group.name,
        records_checked: 0,
        fields_checked: 0,
        mismatches: 1,
      });
      console.error(`[integrity] Group "${group.name}" failed:`, err.message);
    }
  }

  const criticalCount = allMismatches.filter(m => m.severity === "critical").length;
  const warningCount  = allMismatches.filter(m => m.severity === "warning").length;
  const totalFields   = groupSummaries.reduce((s, g) => s + g.fields_checked, 0);
  const totalRecords  = groupSummaries.reduce((s, g) => s + g.records_checked, 0);

  // Persist last result to Supabase audit_log for portal UI
  try {
    await supabase.from("audit_log").insert({
      table_name:  "integrity_check",
      record_id:   null,
      action:      allMismatches.length === 0 ? "ok" : "mismatch",
      description: `Integrity check: ${allMismatches.length} mismatch(es) across ${totalRecords} records`,
      actor:       "system",
      new_values:  {
        mismatch_count: allMismatches.length,
        critical_count: criticalCount,
        warning_count:  warningCount,
        total_records:  totalRecords,
        mismatches:     allMismatches.slice(0, 50), // cap stored payload
      },
    });
  } catch (_) { /* non-fatal — audit log write failure does not block result */ }

  return {
    run_at: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
    mismatches: allMismatches,
    group_summaries: groupSummaries,
    summary: {
      total_records_checked: totalRecords,
      total_fields_checked:  totalFields,
      mismatch_count:        allMismatches.length,
      ok_count:              totalFields - allMismatches.length,
      critical_count:        criticalCount,
      warning_count:         warningCount,
    },
  };
}
