/**
 * FC Portal — Data Integrity Check Configuration
 *
 * This is the single source of truth for all Airtable → Supabase field mappings
 * that are verified by the integrity runner.
 *
 * To add checks for a new portal feature:
 *   1. Add FieldMapping entries to the relevant *_FIELDS array, OR
 *   2. Add a new CheckGroup to INTEGRITY_CHECKS if a new table pair is introduced.
 *   3. Add a comment: // Added: YYYY-MM-DD — <feature name>
 *   No changes to integrity_runner.ts or routes.ts are required.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckType =
  | "numeric"       // numeric comparison with % tolerance
  | "exact_string"  // case-insensitive trimmed string match
  | "exact_enum"    // exact string match (enums, ISO codes)
  | "exact_date"    // ISO date string exact match
  | "count";        // record count comparison

export interface FieldMapping {
  /** Human-readable label for alerts */
  label: string;
  /** Airtable field name as returned by the REST API */
  airtable_field: string;
  /** Supabase column name */
  supabase_column: string;
  /** Percentage tolerance — 0 means exact match required */
  tolerance: number;
  check_type: CheckType;
  /** If true, mismatches on this field are always severity: "critical" */
  critical?: boolean;
}

export interface CheckGroup {
  /** Display name for logs and alerts */
  name: string;
  /** Airtable table name (human-readable) */
  airtable_table: string;
  /** Airtable table ID */
  airtable_table_id: string;
  /** Supabase table name */
  supabase_table: string;
  /** Airtable filterByFormula — empty string = all records */
  airtable_filter: string;
  /** Airtable field used to join to Supabase */
  airtable_join_field: string;
  /** Supabase column used to join from Airtable */
  supabase_join_field: string;
  /** Additional Airtable fields to fetch (join field always fetched) */
  fields: FieldMapping[];
}

// ─── Airtable table IDs ───────────────────────────────────────────────────────

export const AIRTABLE_BASE_ID = "appXSAE1n2PvdCQB1";

export const AIRTABLE_TABLES = {
  deals:       "tbln6AszmitsErPgh",
  members:     "tblQb339jVtJ6cwCM",   // Fixed 2026-06-11: was tblFp3PuEfCbrHFXM (wrong table)
  commitments: "tblRI3sgfam7JSLuk",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Deals → entities (SPV financial summary fields)
// ─────────────────────────────────────────────────────────────────────────────

const DEALS_ENTITIES_FIELDS: FieldMapping[] = [
  {
    label: "Fund size (Cap)",
    airtable_field: "Cap",
    supabase_column: "vehicle_subscription_amount",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Finalised allocation rollup",
    airtable_field: "Finalised Allocation - US SPVs Rollup (from Commitments)",
    supabase_column: "gross_allocated_amount",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Total received (funds received)",
    airtable_field: "Total Received",
    supabase_column: "funds_received",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "USD investment value",
    airtable_field: "USD INVESTMENT VALUE",
    supabase_column: "final_investment_usd",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Carry rate",
    airtable_field: "Carry",
    supabase_column: "carry_rate",
    tolerance: 0,
    check_type: "exact_enum",
    critical: true,
  },
  {
    label: "Management fee rate",
    airtable_field: "Total Fee",
    supabase_column: "management_fee_rate",
    tolerance: 0,
    check_type: "exact_enum",
    critical: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Deals → investments (per-deal investment record)
// ─────────────────────────────────────────────────────────────────────────────

const DEALS_INVESTMENTS_FIELDS: FieldMapping[] = [
  {
    label: "Cost basis (Total Received)",
    airtable_field: "Total Received",
    supabase_column: "cost_basis",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Current fair value (Total Received)",
    airtable_field: "Total Received",
    supabase_column: "current_fair_value",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Company name",
    airtable_field: "CompanyName",
    supabase_column: "company_name",
    tolerance: 0,
    check_type: "exact_string",
  },
  {
    label: "Investment date (Closing Date)",
    airtable_field: "Closing Date",
    supabase_column: "investment_date",
    tolerance: 0,
    check_type: "exact_date",
    critical: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Members → investors
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERS_INVESTORS_FIELDS: FieldMapping[] = [
  {
    label: "Full name",
    airtable_field: "Full name",
    supabase_column: "full_name",
    tolerance: 0,
    check_type: "exact_string",
  },
  {
    label: "Country / location",
    airtable_field: "Geographical Location",
    supabase_column: "country",
    tolerance: 0,
    check_type: "exact_string",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Commitments → investor_commitments
// ─────────────────────────────────────────────────────────────────────────────

const COMMITMENTS_FIELDS: FieldMapping[] = [
  {
    label: "Committed amount (Final Investment Value)",
    airtable_field: "Final Investment Value",
    supabase_column: "committed_amount",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Funded amount (Actually Received)",
    airtable_field: "Actually Received (from Investments)",
    supabase_column: "funded_amount",
    tolerance: 1,
    check_type: "numeric",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — YC Deals → yc_deals
// ─────────────────────────────────────────────────────────────────────────────

const YC_DEALS_FIELDS: FieldMapping[] = [
  {
    label: "FC investment amount",
    airtable_field: "FC Investment",
    supabase_column: "fc_investment",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "USD investment value",
    airtable_field: "USD Investment Value",
    supabase_column: "usd_investment_value",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Total funds committed",
    airtable_field: "Total Funds Committed",
    supabase_column: "total_funds_committed",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Live market value USD",
    airtable_field: "Live Market Value of Investment USD",
    supabase_column: "live_market_value_usd",
    tolerance: 1,
    check_type: "numeric",
  },
  {
    label: "Status",
    airtable_field: "Status",
    supabase_column: "status",
    tolerance: 0,
    check_type: "exact_enum",
  },
  {
    label: "Closing date",
    airtable_field: "Closing Date",
    supabase_column: "closing_date",
    tolerance: 0,
    check_type: "exact_date",
    critical: true,
  },
  // Added: 2026-06-07 — Initial YC integrity checks
];

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED CHECK GROUPS — all active integrity checks
// ─────────────────────────────────────────────────────────────────────────────

export const INTEGRITY_CHECKS: CheckGroup[] = [
  {
    name: "Deals → entities (SPV summary)",
    airtable_table: "Deals",
    airtable_table_id: AIRTABLE_TABLES.deals,
    supabase_table: "entities",
    // Only check deal types that map to entity records: -FC, -DEL, -YC*
    // Join via Airtable Record ID ↔ entities.airtable_deal_id (no deal_code column in entities)
    // Added: 2026-06-11 — fix broken join (entities has airtable_deal_id, not deal_code)
    airtable_filter: "AND(NOT(OR({Status}='Dead',{Status}='Pass',{Status}='Pipeline',{Status}='Prospecting')),OR(RIGHT({Deal Code},3)='-FC',RIGHT({Deal Code},4)='-DEL',SEARCH('-YC',{Deal Code})>0))",
    airtable_join_field: "Record ID",
    supabase_join_field: "airtable_deal_id",
    fields: DEALS_ENTITIES_FIELDS,
  },
  {
    name: "Deals → investments",
    airtable_table: "Deals",
    airtable_table_id: AIRTABLE_TABLES.deals,
    supabase_table: "investments",
    // Only check deal types that are actually synced to investments:
    // -FC (direct FC investments), -DEL (Delaware SPVs), -YCW* / -YCX* (YC SPVs)
    // Exclude: -OD (Other Deals / co-investor only), -TF (Third-Party Fund),
    //          -JP (Joint Participation), -SYDFS, and plain pipeline/dead records
    airtable_filter: "AND(NOT(OR({Status}='Dead',{Status}='Pass',{Status}='Pipeline',{Status}='Prospecting')),OR(RIGHT({Deal Code},3)='-FC',RIGHT({Deal Code},4)='-DEL',SEARCH('-YC',{Deal Code})>0))",
    // Join via Airtable Record ID ↔ investments.airtable_deal_id — avoids collision
    // where two investments share the same deal code (e.g. PER-1024-FC has two SPVs)
    // Added: 2026-06-11 — fix PER-1024-FC join collision
    airtable_join_field: "Record ID",
    supabase_join_field: "airtable_deal_id",
    fields: DEALS_INVESTMENTS_FIELDS,
  },
  {
    name: "Members → investors",
    airtable_table: "Members",
    airtable_table_id: AIRTABLE_TABLES.members,
    supabase_table: "investors",
    airtable_filter: "NOT({Status}='Rejected')",
    airtable_join_field: "Email",
    supabase_join_field: "email",
    fields: MEMBERS_INVESTORS_FIELDS,
  },
  {
    name: "Commitments → investor_commitments",
    airtable_table: "Commitments",
    airtable_table_id: AIRTABLE_TABLES.commitments,
    supabase_table: "investor_commitments",
    airtable_filter: "NOT({Commitment cancelled}='Yes')",
    airtable_join_field: "Record ID",
    supabase_join_field: "airtable_id",
    fields: COMMITMENTS_FIELDS,
  },
  {
    name: "YC Deals → yc_deals",
    airtable_table: "Deals (YC filter)",
    airtable_table_id: AIRTABLE_TABLES.deals,   // YC deals live in main Deals table
    supabase_table: "yc_deals",
    airtable_filter: "AND(SEARCH('-YC', {Deal Code})>0, NOT(OR({Status}='Dead',{Status}='Pass',{Status}='Pipeline',{Status}='Prospecting')))",
    airtable_join_field: "Deal Code",
    supabase_join_field: "deal_code",
    fields: YC_DEALS_FIELDS,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOLERANCE REFERENCE (for documentation)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1%  — monetary amounts (GBP/USD FX rounding headroom)
// 0   — rates, enums, dates, currency codes, record counts
// string — case-insensitive + trimmed before comparison
# Last updated: 2026-06-11T06:29:21Z
