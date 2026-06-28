const assert = require("assert");
const { buildRateTable, rateForDate, convertToUsd } = require("./fx_logic.cjs");

// Sample mirrors real "Currency exchange" rows (Date / GBP-USD / USD-EUR)
const recs = [
  { fields: { "Date": "2025-01-04", "GBP-USD": 1.2421, "USD-EUR": 0.9697 } },
  { fields: { "Date": "2025-06-04", "GBP-USD": 1.3531, "USD-EUR": 0.8783 } },
  { fields: { "Date": "2025-09-11", "GBP-USD": 1.3534, "USD-EUR": 0.8543 } },
];
const table = buildRateTable(recs);
let pass = 0; const t=(n,f)=>{f();pass++;console.log("  ✓",n);};
const close=(a,b,e=0.01)=>assert(Math.abs(a-b)<e,`${a} vs ${b}`);

t("table sorted asc + eurUsd derived", () => {
  assert.strictEqual(table.length, 3);
  assert.strictEqual(table[0].date, "2025-01-04");
  close(table[1].eurUsd, 1/0.8783); // ~1.1386
});
t("rate on-or-before date", () => {
  assert.strictEqual(rateForDate(table, "2025-07-01").date, "2025-06-04");
  assert.strictEqual(rateForDate(table, "2025-09-11").date, "2025-09-11");
});
t("date before earliest falls back to earliest", () => {
  assert.strictEqual(rateForDate(table, "2024-01-01").date, "2025-01-04");
});
t("GBP→USD conversion (£400,000 in Mar-25 window)", () => {
  const r = convertToUsd(400000, "GBP", rateForDate(table, "2025-03-12"));
  close(r.usd, 400000 * 1.2421); // ~496,840 (uses on-or-before 2025-01-04 row)
  assert.strictEqual(r.basis, "GBP-USD");
});
t("EUR→USD via 1/USD-EUR", () => {
  const r = convertToUsd(10000, "EUR", rateForDate(table, "2025-09-11"));
  close(r.usd, 10000 * (1/0.8543)); // ~11,706
});
t("USD passthrough + KYD peg", () => {
  assert.deepStrictEqual(convertToUsd(5000, "USD", null), { usd:5000, rate:1, rateDate:null, basis:"identity" });
  close(convertToUsd(1000, "KYD", null).usd, 1200);
});
t("no rate → flagged USD fallback (never silently wrong)", () => {
  const r = convertToUsd(100, "GBP", null);
  assert.strictEqual(r.basis, "no_rate_fallback_usd");
});

// ── Extended coverage (additive) ────────────────────────────────────────────
t("KYD peg: fixed 1.20 rate + peg basis", () => {
  const r = convertToUsd(1000, "KYD", null);
  assert.strictEqual(r.rate, 1.20);
  assert.strictEqual(r.basis, "peg");
  close(r.usd, 1200);
});
t("EUR derivation: eurUsd = 1 / USD-EUR per row", () => {
  close(table[0].eurUsd, 1 / 0.9697);
  close(table[2].eurUsd, 1 / 0.8543);
});
t("EUR with missing USD-EUR rate → flagged fallback (not silently wrong)", () => {
  const r = convertToUsd(500, "EUR", { date: "2025-01-01", gbpUsd: 1.25, eurUsd: null });
  assert.strictEqual(r.basis, "unknown_currency_fallback_usd");
});
t("unknown currency → flagged USD fallback", () => {
  const r = convertToUsd(777, "JPY", rateForDate(table, "2025-06-04"));
  assert.strictEqual(r.usd, 777);
  assert.strictEqual(r.basis, "unknown_currency_fallback_usd");
});
t("buildRateTable skips rows missing date or GBP-USD; null eurUsd when no USD-EUR", () => {
  const tbl = buildRateTable([
    { fields: { "Date": "2025-02-02", "GBP-USD": 1.3 } },
    { fields: { "GBP-USD": 1.4 } },           // no date → skipped
    { fields: { "Date": "2025-03-03" } },     // no GBP-USD → skipped
  ]);
  assert.strictEqual(tbl.length, 1);
  assert.strictEqual(tbl[0].eurUsd, null);
});
console.log(`\n${pass} tests passed.`);
