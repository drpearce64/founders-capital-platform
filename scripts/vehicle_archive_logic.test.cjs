// Unit tests for the Vector vehicle→FC-VECTOR-{N} mapping (incl. ghost handling)
// and the archive-missing guards. Pure helpers exported from airtable_sync.cjs.
// Run: node vehicle_archive_logic.test.cjs   (exits non-zero on failure)
const assert = require("assert");
const {
  vectorSeriesFromVehicle, classifyVectorClaim, classifyGhostClaim, selectStaleRows,
} = require("./airtable_sync.cjs");

let pass = 0;
function t(name, fn) { fn(); pass++; console.log("  ✓", name); }

// ── vectorSeriesFromVehicle ─────────────────────────────────────────────────
t("Vector IX → FC-VECTOR-IX", () => {
  const r = vectorSeriesFromVehicle("Vector IX");
  assert.strictEqual(r.shortCode, "FC-VECTOR-IX");
  assert.strictEqual(r.name, "FC Platform LP Vector IX Series");
});
t("Vector V → FC-VECTOR-V", () => {
  assert.strictEqual(vectorSeriesFromVehicle("Vector V").shortCode, "FC-VECTOR-V");
});
t("case-insensitive + roman upper-cased", () => {
  assert.strictEqual(vectorSeriesFromVehicle("vector iii").shortCode, "FC-VECTOR-III");
});
t("leading/trailing whitespace trimmed", () => {
  assert.strictEqual(vectorSeriesFromVehicle("  Vector I  ").shortCode, "FC-VECTOR-I");
});
t("non-Vector / blank / arabic numerals → null", () => {
  assert.strictEqual(vectorSeriesFromVehicle("CortexAI"), null);
  assert.strictEqual(vectorSeriesFromVehicle("Vector"), null);
  assert.strictEqual(vectorSeriesFromVehicle("Vector 9"), null);
  assert.strictEqual(vectorSeriesFromVehicle(null), null);
  assert.strictEqual(vectorSeriesFromVehicle(""), null);
});

// ── classifyVectorClaim (pure, no DB) ───────────────────────────────────────
const fetched = new Set(["recLive1", "recLive2"]);
t("no holder → claimable", () => {
  assert.deepStrictEqual(classifyVectorClaim({ code: "FC-VECTOR-IX", holder: null, dealAirtableId: "recX", fetchedDealIds: fetched }), { ok: true });
});
t("holder is this same deal → claimable (already ours)", () => {
  const holder = { id: "e1", airtable_deal_id: "recX" };
  assert.deepStrictEqual(classifyVectorClaim({ code: "FC-VECTOR-IX", holder, dealAirtableId: "recX", fetchedDealIds: fetched }), { ok: true });
});
t("held by a different LIVE deal → not ok, flag (don't collide)", () => {
  const holder = { id: "e2", airtable_deal_id: "recLive1" };
  const r = classifyVectorClaim({ code: "FC-VECTOR-IX", holder, dealAirtableId: "recX", fetchedDealIds: fetched });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /already held by live deal/);
});
t("held by a deleted (ghost) deal → needs ghost check", () => {
  const holder = { id: "e3", airtable_deal_id: "recDeletedGhost" };
  const r = classifyVectorClaim({ code: "FC-VECTOR-I", holder, dealAirtableId: "recX", fetchedDealIds: fetched });
  assert.strictEqual(r.needsGhostCheck, true);
});

// ── classifyGhostClaim — never strand a live LP ─────────────────────────────
t("ghost WITH live commitments → do NOT free (no strand)", () => {
  const holder = { id: "e3", airtable_deal_id: "recDeletedGhost" };
  const r = classifyGhostClaim({ code: "FC-VECTOR-I", holder, liveCommitIds: ["recCommit1"] });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /live commitment/);
  assert.notStrictEqual(r.freeGhost, true);
});
t("empty ghost → free it", () => {
  const holder = { id: "e3", airtable_deal_id: "recDeletedGhost" };
  assert.deepStrictEqual(classifyGhostClaim({ code: "FC-VECTOR-I", holder, liveCommitIds: [] }), { ok: true, freeGhost: true });
  assert.deepStrictEqual(classifyGhostClaim({ code: "FC-VECTOR-I", holder, liveCommitIds: undefined }), { ok: true, freeGhost: true });
});

// ── selectStaleRows — archive-missing guards ────────────────────────────────
t("empty fetch set → archive NOTHING (no mass-delete)", () => {
  const rows = [{ id: "1", airtable_id: "recA" }, { id: "2", airtable_id: "recB" }];
  assert.deepStrictEqual(selectStaleRows(rows, new Set()), []);
  assert.deepStrictEqual(selectStaleRows(rows, null), []);
});
t("rows with airtable_id NOT in fetch → stale", () => {
  const rows = [{ id: "1", airtable_id: "recGone" }, { id: "2", airtable_id: "recKeep" }];
  const stale = selectStaleRows(rows, new Set(["recKeep"]));
  assert.strictEqual(stale.length, 1);
  assert.strictEqual(stale[0].airtable_id, "recGone");
});
t("rows with NO airtable_id are never archived", () => {
  const rows = [{ id: "1", airtable_id: null }, { id: "2", airtable_id: undefined }, { id: "3", airtable_id: "recGone" }];
  const stale = selectStaleRows(rows, new Set(["recKeep"]));
  assert.deepStrictEqual(stale.map(r => r.id), ["3"]);
});

console.log(`\n${pass} tests passed.`);
