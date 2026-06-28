// Unit tests for the pure helpers added to airtable_sync.cjs
// Run: node sync_logic.test.cjs   (exits non-zero on failure)
const assert = require("assert");
const { normalizeCurrency, cappedCalled } = require("./airtable_sync.cjs");

let pass = 0;
function t(name, fn) { fn(); pass++; console.log("  ✓", name); }

// normalizeCurrency — fixes EUR/KYD being mislabelled as GBP
t("USD variants", () => {
  assert.strictEqual(normalizeCurrency("USD"), "USD");
  assert.strictEqual(normalizeCurrency("US Dollar ($)"), "USD");
  assert.strictEqual(normalizeCurrency(null), "USD");
  assert.strictEqual(normalizeCurrency(""), "USD");
});
t("GBP variants", () => {
  assert.strictEqual(normalizeCurrency("GBP"), "GBP");
  assert.strictEqual(normalizeCurrency("£ Sterling"), "GBP");
  assert.strictEqual(normalizeCurrency(["GBP"]), "GBP");
});
t("EUR no longer mislabelled GBP", () => {
  assert.strictEqual(normalizeCurrency("EUR"), "EUR");
  assert.strictEqual(normalizeCurrency("Euro (€)"), "EUR");
});
t("KYD recognised", () => {
  assert.strictEqual(normalizeCurrency("KYD"), "KYD");
});

// cappedCalled — called capital never exceeds commitment (fixes >100% / negative remaining)
t("over-call capped at committed", () => {
  assert.strictEqual(cappedCalled(100000, 106000), 100000); // was 106000 -> -6000 remaining
  assert.strictEqual(cappedCalled(50000, 53000), 50000);
});
t("partial draw preserved", () => {
  assert.strictEqual(cappedCalled(50000, 30000), 30000);
});
t("not yet received falls back to committed (unchanged behaviour)", () => {
  assert.strictEqual(cappedCalled(50000, 0), 50000);
});
t("exact match", () => {
  assert.strictEqual(cappedCalled(25000, 25000), 25000);
});

console.log(`\n${pass} tests passed.`);

// ── feeAmount (access fee = received above committed) ───────────────────────
const { feeAmount } = require("./airtable_sync.cjs");
t("fee = cash above commitment", () => {
  assert.strictEqual(feeAmount(100000, 106000), 6000);
  assert.ok(Math.abs(feeAmount(599971.15, 623970) - 23998.85) < 0.01);
});
t("no fee when fully/under funded at commitment", () => {
  assert.strictEqual(feeAmount(50000, 50000), 0);
  assert.strictEqual(feeAmount(50000, 30000), 0);
  assert.strictEqual(feeAmount(50000, 0), 0);
});
t("called + fee reconciles to funded when over-funded", () => {
  const C=100000, R=106000;
  assert.strictEqual(cappedCalled(C,R) + feeAmount(C,R), R);
});

// ── Extended coverage (additive) ────────────────────────────────────────────
t("cappedCalled: large over-call still capped at commitment", () => {
  assert.strictEqual(cappedCalled(10000, 999999), 10000);
});
t("cappedCalled: zero commitment stays 0 (no negative remaining)", () => {
  assert.strictEqual(cappedCalled(0, 5000), 0);
});
t("feeAmount: fractional over-funding", () => {
  assert.ok(Math.abs(feeAmount(1000.50, 1100.75) - 100.25) < 0.001);
});
t("called + fee reconciles across funded/under/exact cases", () => {
  for (const [C, R] of [[100000,106000],[50000,30000],[25000,25000]]) {
    assert.strictEqual(cappedCalled(C, R) + feeAmount(C, R), R);
  }
});
console.log(`\n${pass} tests passed (sync_logic, incl. extended).`);
