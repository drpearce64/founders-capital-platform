/**
 * FX conversion for the Airtable → Supabase sync.
 * Rate source: Airtable "Currency exchange" table (tblJ29J4DcyiQfVnx),
 * one row per date with columns: "Date", "GBP-USD", "USD-EUR".
 * Cayman Dollar (KYD) is pegged to USD at a fixed rate.
 */
"use strict";

const KYD_USD_PEG = 1.20; // CI$1 = US$1.20 (fixed peg)

function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

// Build a date-sorted rate table from Airtable "Currency exchange" records.
// Each row: { date:'YYYY-MM-DD', gbpUsd:Number, eurUsd:Number|null }
function buildRateTable(records) {
  const rows = [];
  for (const rec of records || []) {
    const f = rec.fields || {};
    const date = f["Date"] || f["📅 Date Only"];
    const gbpUsd = num(f["GBP-USD"]);
    const usdEur = num(f["USD-EUR"]);
    if (!date || gbpUsd == null) continue;
    rows.push({
      date: String(date).slice(0, 10),
      gbpUsd,
      eurUsd: usdEur ? 1 / usdEur : null, // EUR→USD = 1 / (USD→EUR)
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

// Most recent rate on or before `dateStr`; if the date precedes all rows, use the earliest.
function rateForDate(table, dateStr) {
  if (!table || table.length === 0) return null;
  const d = String(dateStr || "").slice(0, 10);
  let chosen = table[0];
  for (const row of table) {
    if (row.date <= d) chosen = row; else break;
  }
  return chosen;
}

// Convert an original-currency amount to USD. Returns the USD value plus the
// rate and rate-date used, for auditability. Unknown currency → treated as USD (flagged).
function convertToUsd(amount, currency, rateRow) {
  const a = num(amount) ?? 0;
  const cur = String(currency || "USD").toUpperCase();
  if (cur === "USD") return { usd: a, rate: 1, rateDate: null, basis: "identity" };
  if (cur === "KYD") return { usd: a * KYD_USD_PEG, rate: KYD_USD_PEG, rateDate: null, basis: "peg" };
  if (!rateRow) return { usd: a, rate: 1, rateDate: null, basis: "no_rate_fallback_usd" };
  if (cur === "GBP") return { usd: a * rateRow.gbpUsd, rate: rateRow.gbpUsd, rateDate: rateRow.date, basis: "GBP-USD" };
  if (cur === "EUR" && rateRow.eurUsd) return { usd: a * rateRow.eurUsd, rate: rateRow.eurUsd, rateDate: rateRow.date, basis: "EUR-USD" };
  return { usd: a, rate: 1, rateDate: null, basis: "unknown_currency_fallback_usd" };
}

module.exports = { buildRateTable, rateForDate, convertToUsd, KYD_USD_PEG };
