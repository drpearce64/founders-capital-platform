import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile, fork } from "child_process";
import { promisify } from "util";
import os from "os";
import supabase from "./supabase";
import { runIntegrityCheck } from "./integrity/integrity_runner";

const execFileAsync = promisify(execFile);

const upload = multer({ dest: "/tmp/fc-uploads/" });

// ── Audit log helper ────────────────────────────────────────────────────────
async function audit(
  table_name: string,
  record_id: string | null,
  action: string,
  description: string,
  old_values?: any,
  new_values?: any
) {
  await supabase.from("audit_log").insert({
    table_name, record_id, action, description,
    old_values: old_values ?? null,
    new_values: new_values ?? null,
    actor: "admin",
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Connectivity diagnostic ──────────────────────────────────────────────
  app.get("/api/ping", async (_req, res) => {
    const results: Record<string, any> = {
      node: process.version,
      env_supabase_url: process.env.SUPABASE_URL ? "set" : "missing",
      env_anon_key: process.env.SUPABASE_ANON_KEY ? "set" : "missing",
    };
    // Test raw HTTPS fetch to Supabase
    try {
      const r = await fetch("https://yoyrwrdzivygufbzckdv.supabase.co/rest/v1/entities?limit=1", {
        headers: {
          apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y",
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y",
        },
        signal: AbortSignal.timeout(10000),
      });
      results.supabase_fetch_status = r.status;
      results.supabase_ok = r.ok;
    } catch (e: any) {
      results.supabase_fetch_error = e?.message;
      results.supabase_fetch_cause = e?.cause?.message ?? e?.cause?.code;
    }
    res.json(results);
  });

  // ── Entities (SPVs) ────────────────────────────────────────────────────────

  app.get("/api/entities", async (_req, res) => {
    const { data, error } = await supabase
      .from("entities")
      .select("*, investments(company_name, status)")
      .is("archived_at", null)
      .order("entity_type")
      .order("name");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/entities", async (req, res) => {
    const { data, error } = await supabase
      .from("entities")
      .insert(req.body)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("entities", data.id, "create", `Created SPV: ${data.name}`);
    res.json(data);
  });

  // ── Investors ──────────────────────────────────────────────────────────────

  app.get("/api/investors", async (_req, res) => {
    const { data, error } = await supabase
      .from("investors")
      .select("*")
      .is("archived_at", null)
      .order("full_name");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/investors", async (req, res) => {
    const { data, error } = await supabase
      .from("investors")
      .insert(req.body)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("investors", data.id, "create", `Onboarded LP: ${data.full_name}`);
    res.json(data);
  });

  // ── Commitments ────────────────────────────────────────────────────────────

  app.get("/api/commitments", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("investor_commitments")
      .select("*, investors(full_name, email, investor_type), entities(name, short_code, entity_type)")
      .is("archived_at", null);

    if (entity_id) query = query.eq("entity_id", entity_id as string);

    const { data, error } = await query.order("committed_amount", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/commitments", async (req, res) => {
    const { data, error } = await supabase
      .from("investor_commitments")
      .insert(req.body)
      .select("*, investors(full_name, email), entities(name, short_code)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("investor_commitments", data.id, "create",
      `Added commitment: ${data.investors?.full_name} → ${data.entities?.short_code} $${data.committed_amount}`);
    res.json(data);
  });

  // ── Investments ────────────────────────────────────────────────────────────

  // Returns investor count per entity_id: { [entity_id]: count }
  app.get("/api/investor-counts", async (_req, res) => {
    const { data, error } = await supabase
      .from("investor_commitments")
      .select("entity_id")
      .is("archived_at", null);
    if (error) return res.status(500).json({ error: error.message });
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      if (row.entity_id) counts[row.entity_id] = (counts[row.entity_id] || 0) + 1;
    }
    res.json(counts);
  });

  app.get("/api/investments", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("investments")
      .select("*, entities(name, short_code, entity_type)")
      .is("archived_at", null);

    if (entity_id) query = query.eq("entity_id", entity_id as string);

    const { data, error } = await query.order("investment_date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/investments", async (req, res) => {
    const { data, error } = await supabase
      .from("investments")
      .insert(req.body)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("investments", data.id, "create", `Added investment: ${data.company_name}`);
    res.json(data);
  });

  // ── Valuation Marks ────────────────────────────────────────────────────────

  // GET /api/valuation-marks?investment_id=xxx  — full history for one investment
  app.get("/api/valuation-marks", async (req, res) => {
    const { investment_id } = req.query;
    if (!investment_id) return res.status(400).json({ error: "investment_id required" });
    const { data, error } = await supabase
      .from("valuation_marks")
      .select("*")
      .eq("investment_id", investment_id as string)
      .order("mark_date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // POST /api/valuation-marks  — add a new mark, then update investments.current_fair_value
  app.post("/api/valuation-marks", async (req, res) => {
    const { investment_id, mark_date, fair_value, valuation_basis, source_url, source_description, implied_valuation, marked_by, notes } = req.body;
    if (!investment_id || !mark_date || fair_value == null || !valuation_basis) {
      return res.status(400).json({ error: "investment_id, mark_date, fair_value, and valuation_basis are required" });
    }
    // Insert the mark
    const { data: mark, error: markErr } = await supabase
      .from("valuation_marks")
      .insert({ investment_id, mark_date, fair_value: Number(fair_value), valuation_basis, source_url: source_url || null, source_description: source_description || null, implied_valuation: implied_valuation ? Number(implied_valuation) : null, marked_by: marked_by || null, notes: notes || null })
      .select()
      .single();
    if (markErr) return res.status(500).json({ error: markErr.message });
    // Update the parent investment's current_fair_value and fair_value_date
    const { error: invErr } = await supabase
      .from("investments")
      .update({ current_fair_value: Number(fair_value), fair_value_date: mark_date, valuation_basis })
      .eq("id", investment_id);
    if (invErr) return res.status(500).json({ error: invErr.message });
    await audit("valuation_marks", mark.id, "create", `Valuation mark added: ${valuation_basis} at ${fair_value} on ${mark_date}`);
    res.json(mark);
  });

  // ── Capital Calls ──────────────────────────────────────────────────────────

  app.get("/api/capital-calls", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("capital_calls")
      .select("*, entities(name, short_code, investments(company_name))");

    if (entity_id) query = query.eq("entity_id", entity_id as string);

    const { data, error } = await query.order("call_date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/capital-calls", async (req, res) => {
    const { entity_id, call_date, due_date, purpose, total_call_amount,
            bank_name, account_name, account_no, routing_no, swift, reference_note } = req.body;

    // Get next call number for this entity
    const { data: existing } = await supabase
      .from("capital_calls")
      .select("call_number")
      .eq("entity_id", entity_id)
      .order("call_number", { ascending: false })
      .limit(1);

    const call_number = existing && existing.length > 0 ? existing[0].call_number + 1 : 1;

    const { data, error } = await supabase
      .from("capital_calls")
      .insert({ entity_id, call_number, call_date, due_date, purpose,
                total_call_amount, bank_name, account_name, account_no,
                routing_no, swift, reference_note, currency: "USD", status: "draft" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("capital_calls", data.id, "create",
      `Created capital call #${call_number} for ${purpose} — $${total_call_amount}`);
    res.json(data);
  });

  app.patch("/api/capital-calls/:id", async (req, res) => {
    const { data: before } = await supabase.from("capital_calls").select("status").eq("id", req.params.id).single();
    const { data, error } = await supabase
      .from("capital_calls")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    const action = req.body.status === "issued" ? "issue" : "update";
    await audit("capital_calls", data.id, action,
      `Capital call #${data.call_number} ${action}d (${before?.status} → ${data.status})`,
      before, data);
    res.json(data);
  });

  // ── Capital Call Items ─────────────────────────────────────────────────────

  app.get("/api/capital-call-items/:callId", async (req, res) => {
    const { data, error } = await supabase
      .from("capital_call_items")
      .select("*, investors(full_name, email), investor_commitments(committed_amount, fee_rate)")
      .eq("capital_call_id", req.params.callId)
      .order("call_amount", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/capital-call-items/:id", async (req, res) => {
    const { data: before } = await supabase.from("capital_call_items").select("*").eq("id", req.params.id).single();
    const { data, error } = await supabase
      .from("capital_call_items")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    const action = req.body.funded_amount !== undefined ? "mark_received" : "update";
    await audit("capital_call_items", data.id, action,
      `LP call item updated — ${action}`, before, data);
    res.json(data);
  });

  // ── Mark Receipt ───────────────────────────────────────────────────────────

  app.post("/api/capital-call-items/:id/receive", async (req, res) => {
    const { received_amount, received_date, bank_reference } = req.body;
    const { data: item } = await supabase.from("capital_call_items").select("*").eq("id", req.params.id).single();
    if (!item) return res.status(404).json({ error: "Item not found" });

    const newFunded = Number(item.funded_amount || 0) + Number(received_amount);
    const newStatus = newFunded >= Number(item.call_amount) ? "funded" : "partially_funded";

    const { data, error } = await supabase
      .from("capital_call_items")
      .update({
        funded_amount: newFunded,
        received_amount: Number(received_amount),
        received_date,
        bank_reference,
        status: newStatus,
      })
      .eq("id", req.params.id)
      .select("*, investors(full_name, email)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await audit("capital_call_items", data.id, "mark_received",
      `Received $${received_amount} from ${data.investors?.full_name} (ref: ${bank_reference || "—"})`, item, data);

    // Update parent call status
    const { data: siblings } = await supabase
      .from("capital_call_items")
      .select("status")
      .eq("capital_call_id", item.capital_call_id);
    if (siblings) {
      const allFunded = siblings.every((s: any) => s.status === "funded");
      const anyFunded = siblings.some((s: any) => s.status === "funded" || s.status === "partially_funded");
      const callStatus = allFunded ? "fully_funded" : anyFunded ? "partially_funded" : "issued";
      await supabase.from("capital_calls").update({ status: callStatus }).eq("id", item.capital_call_id);
    }

    res.json(data);
  });

  // ── Generate Fee Items for a Capital Call ─────────────────────────────────

  app.post("/api/capital-calls/:id/generate-fees", async (req, res) => {
    // Get all LP commitments for this call's SPV
    const { data: call } = await supabase.from("capital_calls").select("*, capital_call_items(*)").eq("id", req.params.id).single();
    if (!call) return res.status(404).json({ error: "Call not found" });

    // Get commitments for this SPV
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, investors(full_name)")
      .eq("entity_id", call.entity_id)
      .is("archived_at", null);

    if (!commitments || commitments.length === 0)
      return res.status(400).json({ error: "No LP commitments found for this SPV" });

    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);

    // Generate or update call items with fee calculations
    const items = commitments.map((c: any) => {
      const ownership = Number(c.committed_amount) / totalCommitted;
      const call_amount = Math.round(Number(call.total_call_amount) * ownership * 100) / 100;
      const fee_rate = Number(c.fee_rate || 0.06);
      const fee_amount = Math.round(call_amount * fee_rate * 100) / 100;

      return {
        capital_call_id: call.id,
        investor_id: c.investor_id,
        investor_commitment_id: c.id,
        call_amount,
        fee_amount,
        fee_rate,
        funded_amount: 0,
        status: "pending",
        currency: "USD",
      };
    });

    // Upsert items
    const { data, error } = await supabase
      .from("capital_call_items")
      .upsert(items, { onConflict: "capital_call_id,investor_id", ignoreDuplicates: false })
      .select("*, investors(full_name)");

    if (error) return res.status(500).json({ error: error.message });
    await audit("capital_calls", call.id, "update",
      `Generated ${items.length} LP fee items for call #${call.call_number}`);
    res.json(data);
  });

  // ── Chase Email Draft ──────────────────────────────────────────────────────

  app.get("/api/capital-calls/:id/overdue", async (req, res) => {
    const { data: call } = await supabase
      .from("capital_calls")
      .select("*, entities(name, short_code, bank_account_no, bank_swift)")
      .eq("id", req.params.id)
      .single();
    if (!call) return res.status(404).json({ error: "Call not found" });

    const { data: items } = await supabase
      .from("capital_call_items")
      .select("*, investors(full_name, email)")
      .eq("capital_call_id", req.params.id)
      .neq("status", "funded");
    if (!items) return res.json([]);

    const today = new Date();
    const dueDate = call.due_date ? new Date(call.due_date) : null;

    const overdue = items
      .filter((i: any) => Number(i.funded_amount || 0) < Number(i.call_amount))
      .map((i: any) => {
        const outstanding = Number(i.call_amount) - Number(i.funded_amount || 0);
        const daysOverdue = dueDate ? Math.floor((today.getTime() - dueDate.getTime()) / 86400000) : null;
        const ageBucket = daysOverdue === null ? "unknown"
          : daysOverdue <= 0 ? "current"
          : daysOverdue <= 15 ? "0–15 days"
          : daysOverdue <= 30 ? "15–30 days"
          : "30+ days";

        const emailDraft = `Dear ${i.investors?.full_name || "LP"},

We write regarding your capital commitment to ${call.entities?.name}.

Capital Call #${call.call_number} was issued on ${call.call_date} with a due date of ${call.due_date}.

Outstanding amount: $${outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}

Please wire funds to:
  Bank: HSBC Bank USA NA
  Account: ${call.entities?.bank_account_no || call.account_no || "—"}
  SWIFT/BIC: ${call.entities?.bank_swift || call.swift || "MRMDUS33"}
  Reference: ${call.reference_note || call.entities?.short_code || ""}

If you have already sent payment, please disregard this notice and share your wire confirmation.

Regards,
Founders Capital`;

        return {
          item_id: i.id,
          investor_name: i.investors?.full_name,
          investor_email: i.investors?.email,
          call_amount: i.call_amount,
          funded_amount: i.funded_amount,
          outstanding,
          days_overdue: daysOverdue,
          age_bucket: ageBucket,
          chase_count: i.chase_count || 0,
          last_chase_at: i.last_chase_at,
          email_draft: emailDraft,
        };
      })
      .filter((i: any) => i.age_bucket !== "current");

    res.json({ call, overdue });
  });

  app.post("/api/capital-call-items/:id/chase", async (req, res) => {
    const { data: item } = await supabase.from("capital_call_items").select("*").eq("id", req.params.id).single();
    if (!item) return res.status(404).json({ error: "Not found" });

    const { data, error } = await supabase
      .from("capital_call_items")
      .update({ last_chase_at: new Date().toISOString(), chase_count: (item.chase_count || 0) + 1 })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("capital_call_items", item.id, "chase_sent",
      `Chase #${(item.chase_count || 0) + 1} logged for LP call item`);
    res.json(data);
  });

  // ── Waterfall Calculator ───────────────────────────────────────────────────

  app.post("/api/waterfall", async (req, res) => {
    const { entity_id, total_proceeds, carry_rate = 0.20 } = req.body;
    if (!entity_id || !total_proceeds)
      return res.status(400).json({ error: "entity_id and total_proceeds required" });

    // Get all active commitments for this SPV
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, investors(full_name)")
      .eq("entity_id", entity_id)
      .is("archived_at", null);

    if (!commitments || commitments.length === 0)
      return res.status(400).json({ error: "No LP commitments found" });

    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.called_amount || c.committed_amount), 0);
    const proceeds = Number(total_proceeds);

    // Waterfall: 1) Return of capital to LPs  2) 20% carry to GP  3) Remaining to LPs
    const returnOfCapital = Math.min(proceeds, totalCommitted);
    const profit = Math.max(0, proceeds - returnOfCapital);
    const carriedInterest = Math.round(profit * Number(carry_rate) * 100) / 100;
    const netToLPs = proceeds - carriedInterest;

    const lpItems = commitments.map((c: any) => {
      const called = Number(c.called_amount || c.committed_amount);
      const ownershipPct = called / totalCommitted;
      const lpReturnOfCapital = Math.round(returnOfCapital * ownershipPct * 100) / 100;
      const lpProfitShare = Math.round(profit * (1 - Number(carry_rate)) * ownershipPct * 100) / 100;
      const lpNet = lpReturnOfCapital + lpProfitShare;
      const lpCarryWithheld = Math.round(profit * Number(carry_rate) * ownershipPct * 100) / 100;

      return {
        investor_id: c.investor_id,
        investor_name: c.investors?.full_name,
        committed_amount: c.committed_amount,
        called_amount: called,
        ownership_pct: Math.round(ownershipPct * 10000) / 100, // as percentage
        return_of_capital: lpReturnOfCapital,
        profit_share: lpProfitShare,
        carry_withheld: lpCarryWithheld,
        net_distribution: lpNet,
        multiple: called > 0 ? Math.round((lpNet / called) * 100) / 100 : null,
      };
    });

    res.json({
      entity_id,
      total_proceeds: proceeds,
      total_committed: totalCommitted,
      return_of_capital: returnOfCapital,
      profit,
      carried_interest: carriedInterest,
      net_to_lps: netToLPs,
      carry_rate: Number(carry_rate),
      gp_carry: carriedInterest,
      lp_count: commitments.length,
      lp_items: lpItems,
    });
  });

  // ── Audit Log ──────────────────────────────────────────────────────────────

  app.get("/api/audit-log", async (req, res) => {
    const { table_name, limit = "50" } = req.query;
    let query = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Number(limit));

    if (table_name) query = query.eq("table_name", table_name as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Dashboard Summary ──────────────────────────────────────────────────────

  app.get("/api/dashboard", async (_req, res) => {
    // Delaware Series SPVs only — restricted to FC-VECTOR-* entities
    const vectorEntitiesRes = await supabase
      .from("entities")
      .select("id")
      .like("short_code", "FC-VECTOR-%");
    const vectorIds = (vectorEntitiesRes.data || []).map((e: any) => e.id);

    const [entitiesRes, commitmentsRes, investmentsRes, callsRes] = await Promise.all([
      supabase.from("entities").select("*, investments(company_name, company_website, status)")
        .like("short_code", "FC-VECTOR-%").is("archived_at", null),
      supabase.from("investor_commitments").select("committed_amount, called_amount, status, entity_id")
        .in("entity_id", vectorIds).is("archived_at", null),
      supabase.from("investments").select("cost_basis, current_fair_value, company_name, entity_id, status, entities(short_code, jurisdiction)")
        .in("entity_id", vectorIds).is("archived_at", null),
      supabase.from("capital_calls").select("total_call_amount, status, entity_id")
        .in("entity_id", vectorIds),
    ]);

    if (entitiesRes.error) return res.status(500).json({ error: entitiesRes.error.message });

    const spvs = (entitiesRes.data || []).filter((e: any) => e.entity_type === 'series_spv');
    const commitments = commitmentsRes.data || [];
    const investments = investmentsRes.data || [];

    const totalCommitted = commitments.reduce((s, c) => s + Number(c.committed_amount), 0);
    const totalCalled = commitments.reduce((s, c) => s + Number(c.called_amount), 0);
    const totalOutstanding = totalCommitted - totalCalled;
    const totalInvested = investments.reduce((s, i) => s + Number(i.cost_basis), 0);
    const totalFairValue = investments.reduce((s, i) => s + Number(i.current_fair_value || i.cost_basis), 0);

    res.json({
      spv_count: spvs.length,
      lp_count: commitments.length,
      total_committed: totalCommitted,
      total_called: totalCalled,
      total_outstanding: totalOutstanding,
      total_invested: totalInvested,
      total_fair_value: totalFairValue,
      unrealised_gain: totalFairValue - totalInvested,
      spvs,
      recent_investments: investments,
    });
  });

  // ── Series Expenses ────────────────────────────────────────────────────────

  app.get("/api/series-expenses", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("series_expenses")
      .select("*, entities(name, short_code, investments(company_name))")
      .order("paid_date", { ascending: false });
    if (entity_id) query = query.eq("entity_id", entity_id as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Attach allocation counts
    const withCounts = await Promise.all((data || []).map(async (ex: any) => {
      const { count } = await supabase
        .from("series_expense_allocations")
        .select("*", { count: "exact", head: true })
        .eq("expense_id", ex.id);
      return { ...ex, allocation_count: count || 0 };
    }));
    res.json(withCounts);
  });

  app.post("/api/series-expenses", async (req, res) => {
    const { entity_id, vendor, cost_type, amount, paid_date, bank_reference, notes } = req.body;

    // Insert expense
    const { data: expense, error } = await supabase
      .from("series_expenses")
      .insert({ entity_id, vendor, cost_type, amount, paid_date, bank_reference, notes })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Get LP commitments to apportion
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("id, investor_id, committed_amount")
      .eq("entity_id", entity_id)
      .is("archived_at", null);

    let allocation_count = 0;
    if (commitments && commitments.length > 0) {
      const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
      const allocations = commitments.map((c: any) => {
        const pct = totalCommitted > 0 ? (Number(c.committed_amount) / totalCommitted) * 100 : 0;
        const allocated_amount = Math.round((Number(amount) * pct / 100) * 100) / 100;
        return { expense_id: expense.id, investor_id: c.investor_id, commitment_id: c.id, allocation_pct: pct, allocated_amount };
      });
      await supabase.from("series_expense_allocations").insert(allocations);
      await supabase.from("series_expenses").update({ apportioned: true }).eq("id", expense.id);
      allocation_count = allocations.length;
    }

    await audit("series_expenses", expense.id, "create",
      `Recorded ${cost_type} expense: ${vendor} $${amount} — apportioned to ${allocation_count} LPs`);
    res.json({ ...expense, allocation_count });
  });

  app.get("/api/series-expenses/:id/allocations", async (req, res) => {
    const { data, error } = await supabase
      .from("series_expense_allocations")
      .select("*, investors(full_name, email)")
      .eq("expense_id", req.params.id)
      .order("allocated_amount", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Expenses summary per entity (for waterfall)
  app.get("/api/series-expenses/total/:entity_id", async (req, res) => {
    const { data, error } = await supabase
      .from("series_expenses")
      .select("amount")
      .eq("entity_id", req.params.entity_id);
    if (error) return res.status(500).json({ error: error.message });
    const total = (data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
    res.json({ entity_id: req.params.entity_id, total_expenses: total });
  });

  // ── NAV Marks ──────────────────────────────────────────────────────────────

  app.get("/api/nav-marks", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("nav_marks")
      .select("*, entities(name, short_code, investments(company_name))")
      .order("mark_date", { ascending: false });
    if (entity_id) query = query.eq("entity_id", entity_id as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/nav-marks", async (req, res) => {
    const { data, error } = await supabase
      .from("nav_marks")
      .insert({ ...req.body, marked_by: "admin" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("nav_marks", data.id, "create",
      `Recorded fair value mark: $${data.fair_value} on ${data.mark_date}`);
    res.json(data);
  });

  // NAV per LP — latest mark for an entity apportioned by ownership %
  app.get("/api/nav-marks/nav-per-lp", async (req, res) => {
    const { entity_id } = req.query;
    if (!entity_id) return res.status(400).json({ error: "entity_id required" });

    // Latest mark for this entity
    const { data: mark } = await supabase
      .from("nav_marks")
      .select("*")
      .eq("entity_id", entity_id as string)
      .order("mark_date", { ascending: false })
      .limit(1)
      .single();
    if (!mark) return res.json([]);

    // LP commitments
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, investors(full_name)")
      .eq("entity_id", entity_id as string)
      .is("archived_at", null);
    if (!commitments) return res.json([]);

    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
    const fairValue = Number(mark.fair_value);

    const navPerLP = commitments.map((c: any) => {
      const ownershipPct = totalCommitted > 0 ? (Number(c.committed_amount) / totalCommitted) * 100 : 0;
      const costBasis = mark.cost_basis
        ? Number(mark.cost_basis) * (ownershipPct / 100)
        : Number(c.committed_amount);
      const nav = Math.round(fairValue * (ownershipPct / 100) * 100) / 100;
      return {
        investor_id: c.investor_id,
        investor_name: c.investors?.full_name,
        committed_amount: c.committed_amount,
        ownership_pct: Math.round(ownershipPct * 100) / 100,
        cost_basis: Math.round(costBasis * 100) / 100,
        nav,
        mark_date: mark.mark_date,
      };
    });

    res.json(navPerLP);
  });

  // ── Documents ──────────────────────────────────────────────────────────────

  app.get("/api/documents", async (req, res) => {
    const { entity_id, investor_id, document_type } = req.query;
    let query = supabase
      .from("documents")
      .select("*, entities(name, short_code, investments(company_name)), investors(full_name)")
      .order("created_at", { ascending: false });
    if (entity_id) query = query.eq("entity_id", entity_id as string);
    if (investor_id) query = query.eq("investor_id", investor_id as string);
    if (document_type) query = query.eq("document_type", document_type as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/documents/upload", upload.single("file"), async (req: any, res) => {
    const { entity_id, investor_id, document_type, name, period, is_lp_visible } = req.body;
    const file = req.file;

    let storage_path: string | null = null;
    let file_size_bytes: number | null = null;
    let mime_type: string | null = null;

    if (file) {
      // Store file in Supabase Storage (bucket: documents)
      const fileBuffer = fs.readFileSync(file.path);
      const storagePath = `${entity_id || "fund"}/${Date.now()}-${file.originalname}`;
      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, fileBuffer, { contentType: file.mimetype, upsert: false });

      if (!storageError) {
        storage_path = storagePath;
        file_size_bytes = file.size;
        mime_type = file.mimetype;
      }
      fs.unlinkSync(file.path);
    }

    const { data, error } = await supabase
      .from("documents")
      .insert({
        entity_id: entity_id || null,
        investor_id: investor_id || null,
        document_type,
        name,
        period: period || null,
        storage_path,
        mime_type,
        file_size_bytes,
        is_lp_visible: is_lp_visible === "true" || is_lp_visible === true,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("documents", data.id, "create", `Uploaded document: ${name} (${document_type})`);
    res.json(data);
  });

  app.get("/api/documents/:id/download", async (req, res) => {
    const { data: doc } = await supabase.from("documents").select("*").eq("id", req.params.id).single();
    if (!doc || !doc.storage_path) return res.status(404).json({ error: "Document not found" });
    const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300);
    if (!signed) return res.status(500).json({ error: "Could not generate download link" });
    res.redirect(signed.signedUrl);
  });

  app.delete("/api/documents/:id", async (req, res) => {
    const { data: doc } = await supabase.from("documents").select("*").eq("id", req.params.id).single();
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (doc.storage_path) {
      await supabase.storage.from("documents").remove([doc.storage_path]);
    }
    await supabase.from("documents").delete().eq("id", req.params.id);
    await audit("documents", req.params.id, "delete", `Deleted document: ${doc.name}`);
    res.json({ success: true });
  });

  // ── User Roles ─────────────────────────────────────────────────────────────

  app.get("/api/user-roles", async (_req, res) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*, investors(full_name, email)")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/user-roles", async (req, res) => {
    const { data, error } = await supabase
      .from("user_roles")
      .upsert(req.body, { onConflict: "email" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("user_roles", data.id, "create", `Added user role: ${data.email} → ${data.role}`);
    res.json(data);
  });

  app.delete("/api/user-roles/:id", async (req, res) => {
    const { data: role } = await supabase.from("user_roles").select("email").eq("id", req.params.id).single();
    await supabase.from("user_roles").delete().eq("id", req.params.id);
    await audit("user_roles", req.params.id, "delete", `Removed role for ${role?.email}`);
    res.json({ success: true });
  });

  // ── Distribution Notices ───────────────────────────────────────────────────

  app.get("/api/distributions", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("distributions")
      .select("*, entities(name, short_code, investments(company_name))")
      .order("distribution_date", { ascending: false });
    if (entity_id) query = query.eq("entity_id", entity_id as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/api/distribution-notices", async (req, res) => {
    const { distribution_id, investor_id } = req.query;
    let query = supabase
      .from("distribution_notices")
      .select("*, investors(full_name, email), entities(name, short_code)")
      .order("created_at", { ascending: false });
    if (distribution_id) query = query.eq("distribution_id", distribution_id as string);
    if (investor_id) query = query.eq("investor_id", investor_id as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Generate distribution notices from waterfall output
  app.post("/api/distribution-notices/generate", async (req, res) => {
    const { entity_id, distribution_id, total_proceeds, carry_rate = 0.20 } = req.body;
    if (!entity_id || !total_proceeds)
      return res.status(400).json({ error: "entity_id and total_proceeds required" });

    // Reuse waterfall logic
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, investors(full_name, email)")
      .eq("entity_id", entity_id)
      .is("archived_at", null);
    if (!commitments || commitments.length === 0)
      return res.status(400).json({ error: "No LP commitments found" });

    // Deduct series expenses from proceeds
    const { data: expenses } = await supabase
      .from("series_expenses")
      .select("amount")
      .eq("entity_id", entity_id);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
    const netProceeds = Math.max(0, Number(total_proceeds) - totalExpenses);

    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.called_amount || c.committed_amount), 0);
    const returnOfCapital = Math.min(netProceeds, totalCommitted);
    const profit = Math.max(0, netProceeds - returnOfCapital);
    const carriedInterest = Math.round(profit * Number(carry_rate) * 100) / 100;

    const notices = commitments.map((c: any) => {
      const called = Number(c.called_amount || c.committed_amount);
      const ownershipPct = called / totalCommitted;
      const lpROC = Math.round(returnOfCapital * ownershipPct * 100) / 100;
      const lpProfit = Math.round(profit * (1 - Number(carry_rate)) * ownershipPct * 100) / 100;
      const lpCarry = Math.round(profit * Number(carry_rate) * ownershipPct * 100) / 100;
      const netDist = lpROC + lpProfit;

      return {
        distribution_id: distribution_id || null,
        investor_id: c.investor_id,
        entity_id,
        notice_date: new Date().toISOString().split("T")[0],
        gross_proceeds: Math.round(Number(total_proceeds) * ownershipPct * 100) / 100,
        return_of_capital: lpROC,
        carry_withheld: lpCarry,
        net_distribution: netDist,
      };
    });

    const { data, error } = await supabase
      .from("distribution_notices")
      .insert(notices)
      .select("*, investors(full_name, email)");
    if (error) return res.status(500).json({ error: error.message });
    await audit("distribution_notices", null, "create",
      `Generated ${notices.length} distribution notices (gross: $${total_proceeds}, expenses deducted: $${totalExpenses.toFixed(2)})`);
    res.json({ notices: data, total_expenses_deducted: totalExpenses, net_proceeds: netProceeds, carried_interest: carriedInterest });
  });

  // ── Capital Call Notices ────────────────────────────────────────────────────

  app.post("/api/capital-calls/:id/generate-notices", async (req, res) => {
    const { data: call } = await supabase
      .from("capital_calls")
      .select("*, entities(name, short_code, bank_account_no, bank_routing_no, bank_swift, bank_account_name, investments(company_name))")
      .eq("id", req.params.id)
      .single();
    if (!call) return res.status(404).json({ error: "Call not found" });

    const { data: items } = await supabase
      .from("capital_call_items")
      .select("*, investors(full_name, email), investor_commitments(committed_amount)")
      .eq("capital_call_id", req.params.id);
    if (!items || items.length === 0)
      return res.status(400).json({ error: "No LP items on this call — generate fees first" });

    const notices = items.map((item: any) => ({
      capital_call_id: call.id,
      capital_call_item_id: item.id,
      investor_id: item.investor_id,
      entity_id: call.entity_id,
      notice_date: new Date().toISOString().split("T")[0],
      call_amount: item.call_amount,
      fee_amount: item.fee_amount,
      total_amount: Number(item.call_amount) + Number(item.fee_amount || 0),
      due_date: call.due_date,
    }));

    const { data, error } = await supabase
      .from("capital_call_notices")
      .upsert(notices, { onConflict: "capital_call_id,investor_id", ignoreDuplicates: false })
      .select("*, investors(full_name, email)");
    if (error) return res.status(500).json({ error: error.message });
    await audit("capital_call_notices", call.id, "create",
      `Generated ${notices.length} call notices for Call #${call.call_number}`);
    res.json(data);
  });

  app.get("/api/capital-calls/:id/notices", async (req, res) => {
    const { data, error } = await supabase
      .from("capital_call_notices")
      .select("*, investors(full_name, email), entities(name, short_code)")
      .eq("capital_call_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Quarterly Statement Generator ────────────────────────────────────────

  app.get("/api/reports/quarterly-statement/:investor_id", async (req, res) => {
    const { investor_id } = req.params;
    const { period = "Q1 2026" } = req.query;

    // 1. Investor details
    const { data: investor } = await supabase
      .from("investors")
      .select("*")
      .eq("id", investor_id)
      .single();
    if (!investor) return res.status(404).json({ error: "Investor not found" });

    // 2. All commitments for this LP
    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, entities(id, name, short_code, investments(company_name, investment_date, cost_basis, current_fair_value))")
      .eq("investor_id", investor_id)
      .is("archived_at", null)
      .order("committed_amount", { ascending: false });
    if (!commitments || commitments.length === 0)
      return res.status(400).json({ error: "No commitments found for this LP" });

    // 3. Build positions array
    const positions = await Promise.all(commitments.map(async (c: any) => {
      const entityId = c.entity_id;
      const inv = Array.isArray(c.entities?.investments)
        ? c.entities.investments[0]
        : c.entities?.investments;

      // SPV total committed (for ownership %)
      const { data: spvCommitments } = await supabase
        .from("investor_commitments")
        .select("committed_amount")
        .eq("entity_id", entityId)
        .is("archived_at", null);
      const spvTotal = (spvCommitments || []).reduce((s: number, x: any) => s + Number(x.committed_amount), 0);

      // Capital calls for this LP on this SPV
      const { data: callItems } = await supabase
        .from("capital_call_items")
        .select("call_amount, fee_amount, funded_amount, status, capital_calls(call_number, call_date, due_date)")
        .eq("investor_id", investor_id)
        .order("created_at");

      const callsForSpv = (callItems || []).filter((ci: any) => {
        // Filter via the parent call — we need entity_id on calls
        return true; // included for now — refine per entity if needed
      }).map((ci: any) => ({
        call_number: ci.capital_calls?.call_number,
        call_date: ci.capital_calls?.call_date,
        due_date: ci.capital_calls?.due_date,
        call_amount: ci.call_amount,
        fee_amount: ci.fee_amount,
        status: ci.status,
      }));

      // Expense allocations for this LP on this SPV
      const { data: expAllocs } = await supabase
        .from("series_expense_allocations")
        .select("allocated_amount, allocation_pct, series_expenses(vendor, cost_type, paid_date, amount)")
        .eq("investor_id", investor_id);

      const expForSpv = (expAllocs || []).map((ea: any) => ({
        vendor: ea.series_expenses?.vendor,
        cost_type: ea.series_expenses?.cost_type,
        paid_date: ea.series_expenses?.paid_date,
        expense_amount: ea.series_expenses?.amount,
        allocated_amount: ea.allocated_amount,
      }));

      // Latest NAV mark for this SPV
      const { data: navMark } = await supabase
        .from("nav_marks")
        .select("fair_value, mark_date")
        .eq("entity_id", entityId)
        .order("mark_date", { ascending: false })
        .limit(1)
        .single();

      // Capital account for this LP on this SPV (most recent tax year)
      const { data: capAcctRows } = await supabase
        .from("lp_capital_account_balances")
        .select("*")
        .eq("entity_id", entityId)
        .eq("investor_id", investor_id)
        .order("tax_year", { ascending: false })
        .limit(1);
      const capAcct = capAcctRows && capAcctRows.length > 0 ? capAcctRows[0] : null;

      return {
        short_code: c.entities?.short_code,
        entity_name: c.entities?.name,
        company_name: inv?.company_name,
        committed_amount: c.committed_amount,
        called_amount: c.called_amount,
        fee_rate: c.fee_rate,
        carry_rate: c.carry_rate,
        commitment_date: c.commitment_date,
        investment_date: inv?.investment_date,
        cost_basis: inv?.cost_basis,
        current_fair_value: navMark?.fair_value || inv?.current_fair_value,
        nav_mark_date: navMark?.mark_date,
        spv_total_committed: spvTotal,
        capital_calls: callsForSpv.slice(0, 10),
        expense_allocations: expForSpv,
        capital_account: capAcct ? {
          tax_year: capAcct.tax_year,
          opening_balance: capAcct.opening_balance,
          total_contributions: capAcct.total_contributions,
          total_fees: capAcct.total_fees,
          total_gain_allocations: capAcct.total_gain_allocations,
          total_carry_allocations: capAcct.total_carry_allocations,
          total_distributions: capAcct.total_distributions,
          closing_balance: capAcct.closing_balance,
        } : null,
      };
    }));

    // 4. Totals
    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
    const totalCalled = commitments.reduce((s: number, c: any) => s + Number(c.called_amount || 0), 0);

    const payload = {
      investor: {
        id: investor.id,
        full_name: investor.full_name,
        email: investor.email,
        investor_type: investor.investor_type,
        country_of_residence: investor.country_of_residence,
      },
      period: period as string,
      report_date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      totals: {
        total_committed: totalCommitted,
        total_called: totalCalled,
        total_outstanding: totalCommitted - totalCalled,
        total_fee: totalCommitted * 0.06,
      },
      positions,
    };

    // 5. Write JSON to temp file, call Python, return PDF
    const tmpDir = os.tmpdir();
    const jsonPath = path.join(tmpDir, `stmt-${investor_id}-${Date.now()}.json`);
    const pdfPath  = path.join(tmpDir, `stmt-${investor_id}-${Date.now()}.pdf`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload));

    // Find Python and script
    const scriptPath = path.join(process.cwd(), "scripts", "generate_statement.py");
    const python = process.env.PYTHON_BIN || "python3";

    try {
      await execFileAsync(python, [scriptPath, jsonPath, pdfPath], { timeout: 30000 });
      const pdfBuffer = fs.readFileSync(pdfPath);
      const safeName = investor.full_name.replace(/[^a-z0-9]/gi, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="FC_Statement_${safeName}_${period.replace(/\s/g,"_")}.pdf"`);
      res.send(pdfBuffer);

      // Log to audit + save reference to documents table
      await audit("documents", null, "generate",
        `Generated quarterly statement for ${investor.full_name} — ${period}`);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      return res.status(500).json({ error: "PDF generation failed", detail: err.message });
    } finally {
      try { fs.unlinkSync(jsonPath); fs.unlinkSync(pdfPath); } catch {}
    }
  });

  // Preview payload (no PDF — for frontend to show summary before download)
  app.get("/api/reports/quarterly-statement/:investor_id/preview", async (req, res) => {
    const { investor_id } = req.params;
    const { period = "Q1 2026" } = req.query;

    const { data: investor } = await supabase
      .from("investors")
      .select("id, full_name, email, investor_type, country_of_residence")
      .eq("id", investor_id)
      .single();
    if (!investor) return res.status(404).json({ error: "Investor not found" });

    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, entities(id, name, short_code, investments(company_name, cost_basis, current_fair_value))")
      .eq("investor_id", investor_id)
      .is("archived_at", null);

    const totalCommitted = (commitments || []).reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
    const totalCalled    = (commitments || []).reduce((s: number, c: any) => s + Number(c.called_amount || 0), 0);

    const positions = (commitments || []).map((c: any) => {
      const inv = Array.isArray(c.entities?.investments) ? c.entities.investments[0] : c.entities?.investments;
      return {
        short_code: c.entities?.short_code,
        entity_name: c.entities?.name,
        company_name: inv?.company_name,
        committed_amount: c.committed_amount,
        called_amount: c.called_amount,
        fee_rate: c.fee_rate,
        cost_basis: inv?.cost_basis ?? null,
        current_fair_value: inv?.current_fair_value ?? null,
        investment_date: inv?.investment_date ?? null,
      };
    });

    res.json({
      investor,
      period,
      positions,
      totals: {
        total_committed: totalCommitted,
        total_called: totalCalled,
        total_outstanding: totalCommitted - totalCalled,
        total_fee: totalCommitted * 0.06,
        position_count: (commitments || []).length,
      },
    });
  });

  // Update waterfall to deduct series expenses automatically
  app.post("/api/waterfall-v2", async (req, res) => {
    const { entity_id, total_proceeds, carry_rate = 0.20 } = req.body;
    if (!entity_id || !total_proceeds)
      return res.status(400).json({ error: "entity_id and total_proceeds required" });

    const { data: commitments } = await supabase
      .from("investor_commitments")
      .select("*, investors(full_name)")
      .eq("entity_id", entity_id)
      .is("archived_at", null);
    if (!commitments || commitments.length === 0)
      return res.status(400).json({ error: "No LP commitments found" });

    // Deduct series expenses
    const { data: expenses } = await supabase
      .from("series_expenses")
      .select("amount, vendor, cost_type")
      .eq("entity_id", entity_id);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
    const netProceeds = Math.max(0, Number(total_proceeds) - totalExpenses);

    const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.called_amount || c.committed_amount), 0);
    const returnOfCapital = Math.min(netProceeds, totalCommitted);
    const profit = Math.max(0, netProceeds - returnOfCapital);
    const carriedInterest = Math.round(profit * Number(carry_rate) * 100) / 100;
    const netToLPs = netProceeds - carriedInterest;

    const lpItems = commitments.map((c: any) => {
      const called = Number(c.called_amount || c.committed_amount);
      const ownershipPct = called / totalCommitted;
      const lpROC = Math.round(returnOfCapital * ownershipPct * 100) / 100;
      const lpProfit = Math.round(profit * (1 - Number(carry_rate)) * ownershipPct * 100) / 100;
      const lpCarry = Math.round(profit * Number(carry_rate) * ownershipPct * 100) / 100;
      const lpExpenseShare = Math.round(totalExpenses * ownershipPct * 100) / 100;
      const lpNet = lpROC + lpProfit;
      return {
        investor_id: c.investor_id,
        investor_name: c.investors?.full_name,
        committed_amount: c.committed_amount,
        called_amount: called,
        ownership_pct: Math.round(ownershipPct * 10000) / 100,
        expense_share: lpExpenseShare,
        return_of_capital: lpROC,
        profit_share: lpProfit,
        carry_withheld: lpCarry,
        net_distribution: lpNet,
        multiple: called > 0 ? Math.round((lpNet / called) * 100) / 100 : null,
      };
    });

    res.json({
      entity_id,
      total_proceeds: Number(total_proceeds),
      total_expenses: totalExpenses,
      expenses_detail: expenses || [],
      net_proceeds: netProceeds,
      total_committed: totalCommitted,
      return_of_capital: returnOfCapital,
      profit,
      carried_interest: carriedInterest,
      net_to_lps: netToLPs,
      carry_rate: Number(carry_rate),
      gp_carry: carriedInterest,
      lp_count: commitments.length,
      lp_items: lpItems,
    });
  });

  // ── Airtable Sync ─────────────────────────────────────────────────────────

  // POST /api/sync/airtable  — trigger a full sync (called by Railway cron or manually)
  app.post("/api/sync/airtable", async (req, res) => {
    // Validate optional bearer token if SYNC_SECRET is set
    const secret = process.env.SYNC_SECRET;
    if (secret) {
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // In dev: __dirname = server/, script at ../scripts/airtable_sync.js
    // In prod: __dirname = dist/,   script at scripts/airtable_sync.js (copied by build)
    const scriptPath = path.join(__dirname, "scripts", "airtable_sync.cjs");
    const SUPA_URL = process.env.SUPABASE_URL || "https://yoyrwrdzivygufbzckdv.supabase.co";
    const SUPA_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";

    const child = fork(scriptPath, [], {
      env: {
        ...process.env,
        AIRTABLE_PAT:      process.env.AIRTABLE_PAT     ?? "",
        AIRTABLE_BASE_ID:  process.env.AIRTABLE_BASE_ID ?? "appXSAE1n2PvdCQB1",
        SUPABASE_URL:      SUPA_URL,
        SUPABASE_ANON_KEY: SUPA_KEY,
      },
      detached: false,
      silent: true,
    });

    let output = "";
    child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    child.on("close", async (code) => {
      try {
        await supabase.from("audit_log").insert({
          table_name:  "airtable_sync",
          record_id:   null,
          action:      "create",
          description: `Airtable sync finished with exit code ${code}`,
          actor:       "system",
          new_values:  { exit_code: code, output: output.slice(-2000) },
        });
      } catch (_) { /* non-fatal */ }
    });

    res.json({ status: "sync_started", message: "Airtable sync running in background" });
  });

  // POST /api/sync/gmail-invoices — trigger Gmail invoice scan
  app.post("/api/sync/gmail-invoices", async (req, res) => {
    const secret = process.env.SYNC_SECRET;
    if (secret) {
      const auth = req.headers.authorization ?? "";
      if (auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // Require Gmail credentials
    if (!process.env.GMAIL_REFRESH_TOKEN) {
      return res.status(200).json({
        status: "skipped",
        synced: 0,
        skipped: 0,
        errors: [],
        message: "GMAIL_REFRESH_TOKEN not configured — Gmail sync disabled",
      });
    }

    const scriptPath = path.join(__dirname, "scripts", "gmail_invoice_sync.cjs"); // bundled by esbuild
    const child = fork(scriptPath, [], {
      env: {
        ...process.env,
        SUPABASE_URL:          process.env.SUPABASE_URL          ?? "https://yoyrwrdzivygufbzckdv.supabase.co",
        SUPABASE_ANON_KEY:     process.env.SUPABASE_ANON_KEY     ?? "",
        GMAIL_CLIENT_ID:       process.env.GMAIL_CLIENT_ID       ?? "",
        GMAIL_CLIENT_SECRET:   process.env.GMAIL_CLIENT_SECRET   ?? "",
        GMAIL_REFRESH_TOKEN:   process.env.GMAIL_REFRESH_TOKEN   ?? "",
      },
      detached: false,
      silent: true,
    });

    let output = "";
    let result: any = { synced: 0, skipped: 0, errors: [] };
    child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    // Run synchronously (wait up to 120s) so cron can read result
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 120_000);
      child.on("close", (code) => {
        clearTimeout(timeout);
        // Try to parse last JSON line from stdout
        const lines = output.split("\n").filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try { result = JSON.parse(lines[i]); break; } catch {}
        }
        resolve();
      });
    });

    try {
      await supabase.from("audit_log").insert({
        table_name:  "gmail_invoice_sync",
        record_id:   null,
        action:      "create",
        description: `Gmail invoice sync: ${result.synced} synced, ${result.skipped} skipped, ${result.errors?.length ?? 0} errors`,
        actor:       "system",
        new_values:  { result, output: output.slice(-2000) },
      });
    } catch (_) { /* non-fatal */ }

    res.json({
      status: "ok",
      synced:  result.synced  ?? 0,
      skipped: result.skipped ?? 0,
      errors:  result.errors  ?? [],
    });
  });

  // POST /api/sync/ap-ledger — upsert AP ledger rows parsed by the cron agent from Google Drive
  // Body: { file_id: string, rows: Array<{ sheet, invoice_ref, vendor, description, invoice_date, due_date,
  //   category, currency, invoice_amount, fx_rate_to_usd, amount_usd, status, paid_date, payment_ref, notes }> }
  app.post("/api/sync/ap-ledger", async (req, res) => {
    const { file_id, rows } = req.body as {
      file_id: string;
      rows: Array<{
        entity_id: string;
        invoice_ref?: string;
        vendor?: string;
        description?: string;
        cost_date?: string;
        due_date?: string;
        category?: string;
        currency?: string;
        amount?: number;
        fx_rate_to_usd?: number;
        amount_usd?: number;
        status?: string;
        paid_date?: string;
        payment_reference?: string;
        notes?: string;
        drive_link?: string;
      }>;
    };

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: "rows array required" });
    }

    let upserted = 0;
    let skipped  = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.entity_id) { skipped++; continue; }

      // Build upsert payload — invoice_ref + entity_id = natural key
      const payload: Record<string, any> = {
        entity_id:         row.entity_id,
        invoice_ref:       row.invoice_ref   || null,
        vendor:            row.vendor        || null,
        description:       row.description   || row.vendor || "(AP Ledger import)",
        cost_date:         row.cost_date     || new Date().toISOString().slice(0, 10),
        due_date:          row.due_date      || null,
        category:          (() => {
          const c = (row.category || "").toLowerCase();
          if (c === "formation") return "formation";
          if (c === "legal" || c.includes("legal") || c.includes("professional")) return "legal";
          return "other";
        })(),
        currency:          row.currency      || "USD",
        amount:            row.amount        ?? 0,
        fx_rate_to_usd:    row.fx_rate_to_usd ?? 1,
        // amount_usd is a generated column (amount * fx_rate_to_usd) — DO NOT include in upsert
        status:            row.status        || "accrued",
        paid_date:         row.paid_date     || null,
        payment_reference: row.payment_reference || null,
        notes:             row.notes         || null,
        drive_link:        row.drive_link    || null,
      };

      try {
        if (row.invoice_ref) {
          // Check if row exists first (no unique constraint — use select-then-update/insert)
          const { data: existing } = await supabase
            .from("entity_costs")
            .select("id")
            .eq("entity_id", row.entity_id)
            .eq("invoice_ref", row.invoice_ref)
            .limit(1);
          if (existing && existing.length > 0) {
            // Update existing row
            const { error } = await supabase
              .from("entity_costs")
              .update(payload)
              .eq("id", existing[0].id);
            if (error) { errors.push(`${row.invoice_ref}: ${error.message}`); }
            else upserted++;
          } else {
            // Insert new row
            const { error } = await supabase
              .from("entity_costs")
              .insert(payload);
            if (error) { errors.push(`${row.invoice_ref}: ${error.message}`); }
            else upserted++;
          }
        } else {
          // No invoice_ref — insert only if no existing row with same entity+vendor+date+amount
          const { data: existing } = await supabase
            .from("entity_costs")
            .select("id")
            .eq("entity_id", row.entity_id)
            .eq("vendor", row.vendor || "")
            .eq("amount", payload.amount)
            .limit(1);
          if (existing && existing.length > 0) { skipped++; continue; }
          const { error } = await supabase.from("entity_costs").insert(payload);
          if (error) { errors.push(`(no ref) ${row.vendor}: ${error.message}`); }
          else upserted++;
        }
      } catch (e: any) {
        errors.push(`${row.invoice_ref || row.vendor}: ${e.message}`);
      }
    }

    // Log the sync
    await audit("entity_costs", null, "ap_ledger_sync",
      `AP Ledger sync from Drive file ${file_id}: ${upserted} upserted, ${skipped} skipped, ${errors.length} errors`);

    res.json({
      ok: true,
      file_id,
      upserted,
      skipped,
      errors,
      total_rows: rows.length,
      synced_at: new Date().toISOString(),
    });
  });

  // POST /api/sync/ap-ledger/trigger — queue an on-demand sync (portal “Sync from Drive” button)
  app.post("/api/sync/ap-ledger/trigger", async (_req, res) => {
    const { error } = await supabase
      .from("sync_triggers")
      .insert({ sync_type: "ap_ledger", status: "pending" });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, message: "AP ledger sync queued — will run within the next scheduled check" });
  });

  // GET /api/sync/ap-ledger/status — last sync result from audit log
  app.get("/api/sync/ap-ledger/status", async (_req, res) => {
    const { data, error } = await supabase
      .from("audit_log")
      .select("description,created_at")
      .eq("action", "ap_ledger_sync")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) return res.json({ last_sync: null });
    res.json({ last_sync: data.created_at, summary: data.description });
  });

  // GET /api/sync/airtable/log  — recent sync log entries
  app.get("/api/sync/airtable/log", async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const { data, error } = await supabase
      .from("airtable_sync_log")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET /api/sync/airtable/status  — last summary row
  app.get("/api/sync/airtable/status", async (_req, res) => {
    const { data, error } = await supabase
      .from("airtable_sync_log")
      .select("*")
      .eq("action", "sync_complete")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? { status: "no_sync_yet" });
  });

  // ── Data Integrity Check ──────────────────────────────────────────────────

  // GET /api/integrity/status — last check result from audit_log (fast, no Airtable call)
  app.get("/api/integrity/status", async (_req, res) => {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("table_name", "integrity_check")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? { action: "no_check_yet", description: "No integrity check has run yet" });
  });

  // POST /api/integrity/run — trigger a full integrity check (runs in-process, ~30s)
  app.post("/api/integrity/run", async (_req, res) => {
    try {
      const report = await runIntegrityCheck();
      res.json(report);
    } catch (err: any) {
      console.error("[integrity] Manual run failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Vector Series Wizard ────────────────────────────────────────────────────

  // Helper: build VECTOR_DEAL_MAP dynamically from Supabase entities
  // Returns { [airtable_deal_id]: { entityId, dealCode, shortCode } }
  async function buildVectorDealMap() {
    const { data: vectorEntities } = await supabase
      .from("entities")
      .select("id, short_code, airtable_deal_id")
      .like("short_code", "FC-VECTOR-%")
      .not("airtable_deal_id", "is", null);

    // Also get the deal_code stored in the linked investments.notes field
    const entityIds = (vectorEntities ?? []).map((e: any) => e.id);
    const { data: investments } = entityIds.length
      ? await supabase.from("investments").select("entity_id, notes").in("entity_id", entityIds)
      : { data: [] };

    const invMap: Record<string, string> = {};
    for (const inv of investments ?? []) invMap[inv.entity_id] = inv.notes ?? "";

    const map: Record<string, { entityId: string; dealCode: string; shortCode: string }> = {};
    for (const e of vectorEntities ?? []) {
      if (e.airtable_deal_id) {
        map[e.airtable_deal_id] = {
          entityId: e.id,
          dealCode: invMap[e.id] ?? "",
          shortCode: e.short_code,
        };
      }
    }
    return map;
  }

  // GET /api/vector/lookup?deal_code=CLY-0526-DEL — fetch deal from Airtable and suggest config
  app.get("/api/vector/lookup", async (req, res) => {
    const dealCode = String((req.query as any).deal_code ?? "").trim().toUpperCase();
    if (!dealCode) return res.status(400).json({ error: "deal_code is required" });

    const PAT = process.env.AIRTABLE_PAT;
    if (!PAT) return res.status(500).json({ error: "AIRTABLE_PAT not configured" });

    try {
      // Search Airtable for the deal code
      const url = new URL(`https://api.airtable.com/v0/appXSAE1n2PvdCQB1/tbln6AszmitsErPgh`);
      url.searchParams.set("filterByFormula", `{Deal Code}='${dealCode}'`);
      url.searchParams.set("maxRecords", "1");
      [
        "Deal Code", "CompanyName", "Closing Date", "Status", "Investment Currency",
        "Total Received", "USD INVESTMENT VALUE", "Cap", "Carry", "Total Fee",
        "Company Description", "URL",
      ].forEach(f => url.searchParams.append("fields[]", f));

      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PAT}` } });
      if (!r.ok) return res.status(r.status).json({ error: `Airtable error: ${await r.text()}` });
      const json: any = await r.json();
      const records = json.records ?? [];
      if (!records.length) return res.status(404).json({ error: `No deal found with code ${dealCode}` });

      const rec = records[0];
      const f = rec.fields;

      // Determine next Vector number from existing FC-VECTOR-* entities
      const { data: existing } = await supabase
        .from("entities")
        .select("short_code")
        .like("short_code", "FC-VECTOR-%");

      const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X"];
      const usedNums = new Set(
        (existing ?? []).map((e: any) => {
          const m = e.short_code.match(/FC-VECTOR-(.+)/);
          return m ? ROMAN.indexOf(m[1]) : -1;
        }).filter((n: number) => n >= 0)
      );
      let nextIdx = 0;
      while (usedNums.has(nextIdx)) nextIdx++;
      const nextRoman = ROMAN[nextIdx] ?? `${nextIdx + 1}`;

      return res.json({
        airtable_record_id: rec.id,
        deal_code: dealCode,
        company_name: f["CompanyName"] ?? "",
        closing_date: f["Closing Date"] ?? null,
        status: f["Status"] ?? "",
        currency: f["Investment Currency"] ?? "USD",
        total_received: f["Total Received"] ?? null,
        usd_investment_value: f["USD INVESTMENT VALUE"] ?? null,
        cap: f["Cap"] ?? null,
        carry_rate: f["Carry"] ?? 0.20,
        management_fee_rate: f["Total Fee"] ?? 0.06,
        description: f["Company Description"] ?? "",
        url: f["URL"] ?? "",
        // Suggested portal config
        suggested_short_code: `FC-VECTOR-${nextRoman}`,
        suggested_name: `FC Platform LP Vector ${nextRoman} Series`,
        suggested_account_name: `FC Platform LP Vector ${nextRoman} Series`,
        next_vector_roman: nextRoman,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vector/provision — create/update the Vector entity, link to Airtable, optionally trigger SPA sync
  app.post("/api/vector/provision", async (req, res) => {
    const {
      airtable_record_id,
      deal_code,
      short_code,       // e.g. FC-VECTOR-VI
      name,             // e.g. FC Platform LP Vector VI Series
      bank_name,
      bank_account_name,
      bank_account_no,
      bank_swift,
      hsbc_account_ref,
      sync_spa,         // boolean — whether to immediately sync SPAs
    } = req.body;

    if (!airtable_record_id || !deal_code || !short_code || !name) {
      return res.status(400).json({ error: "airtable_record_id, deal_code, short_code and name are required" });
    }

    const PAT = process.env.AIRTABLE_PAT;
    if (!PAT) return res.status(500).json({ error: "AIRTABLE_PAT not configured" });

    try {
      // 1. Check if entity already exists (by airtable_deal_id or short_code)
      const { data: existing } = await supabase
        .from("entities")
        .select("id, short_code, name")
        .or(`airtable_deal_id.eq.${airtable_record_id},short_code.eq.${short_code}`)
        .maybeSingle();

      const masterEntity = await supabase
        .from("entities")
        .select("id")
        .eq("entity_type", "master")
        .maybeSingle();
      const masterId = masterEntity.data?.id ?? null;

      let entityId: string;

      const entityRow = {
        name,
        short_code,
        entity_type: "series_spv",
        jurisdiction: "Delaware, USA",
        status: "active",
        airtable_deal_id: airtable_record_id,
        base_currency: "USD",
        fiscal_year_end: "12-31",
        parent_entity_id: masterId,
        bank_name:         bank_name         || "HSBC Bank USA NA",
        bank_account_name: bank_account_name || name,
        bank_account_no:   bank_account_no   || null,
        bank_swift:        bank_swift        || "MRMDUS33",
        hsbc_account_ref:  hsbc_account_ref  || bank_account_no || null,
      };

      if (existing) {
        // Update existing entity — correct short_code, name, and bank details
        const { error: updErr } = await supabase
          .from("entities")
          .update(entityRow)
          .eq("id", existing.id);
        if (updErr) throw new Error(`Entity update failed: ${updErr.message}`);
        entityId = existing.id;
      } else {
        // Insert new entity
        const { data: inserted, error: insErr } = await supabase
          .from("entities")
          .insert(entityRow)
          .select("id")
          .single();
        if (insErr) throw new Error(`Entity insert failed: ${insErr.message}`);
        entityId = inserted.id;
      }

      // 2. Ensure an investment record exists for this entity
      const { data: existingInv } = await supabase
        .from("investments")
        .select("id")
        .eq("entity_id", entityId)
        .maybeSingle();

      if (!existingInv) {
        // Fetch deal details from Airtable for cost_basis
        const atRes = await fetch(
          `https://api.airtable.com/v0/appXSAE1n2PvdCQB1/tbln6AszmitsErPgh/${airtable_record_id}`,
          { headers: { Authorization: `Bearer ${PAT}` } }
        );
        const atData: any = atRes.ok ? await atRes.json() : {};
        const af = atData.fields ?? {};
        const received = typeof af["Total Received"] === "number" ? af["Total Received"] : 0;
        const companyName = af["CompanyName"] ?? name.replace("FC Platform LP Vector ", "").replace(" Series", "");

        await supabase.from("investments").insert({
          entity_id: entityId,
          airtable_deal_id: airtable_record_id,
          company_name: companyName,
          investment_date: af["Closing Date"] ?? null,
          cost_basis: received,
          current_fair_value: received,
          status: "active",
          instrument_type: "other",
          notes: deal_code,
        });
      } else {
        // Update notes with deal_code so integrity check can join correctly
        await supabase.from("investments").update({ notes: deal_code }).eq("id", existingInv.id);
      }

      // 3. Audit log
      try {
        await supabase.from("audit_log").insert({
          table_name: "entities",
          record_id: entityId,
          action: existing ? "update" : "create",
          description: `Vector series wizard: ${existing ? "updated" : "provisioned"} ${short_code} (${deal_code})`,
          actor: "wizard",
          new_values: { short_code, name, deal_code, airtable_record_id },
        });
      } catch (_) { /* non-fatal */ }

      // 4. Optionally trigger SPA sync for this specific entity
      let spaResult: any = null;
      if (sync_spa) {
        const AIRTABLE_BASE = "appXSAE1n2PvdCQB1";
        const DEALS_TABLE   = "tbln6AszmitsErPgh";
        try {
          try { await supabase.storage.createBucket("documents", { public: false }); } catch (_) { /* ignore if exists */ }
          const atRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/${DEALS_TABLE}/${airtable_record_id}`,
            { headers: { Authorization: `Bearer ${PAT}` } }
          );
          if (atRes.ok) {
            const record: any = await atRes.json();
            const fields = record.fields ?? {};
            let attachments: any[] = fields["Unredacted Fully Executed Investment Agreement"] || [];
            if (!attachments.length) {
              const invAgree: any[] = fields["Investment agreement"] || [];
              attachments = invAgree.filter((a: any) =>
                /stock.?purchase|\bspa\b|series.?agree/i.test(a.filename || "")
              );
            }
            if (attachments.length) {
              const att = attachments.find((a: any) => a.type === "application/pdf") || attachments[0];
              const fileRes = await fetch(att.url);
              if (fileRes.ok) {
                const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
                const storagePath = `${entityId}/spa-${Date.now()}-${att.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
                const { error: uploadErr } = await supabase.storage
                  .from("documents")
                  .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: true });
                if (!uploadErr) {
                  await supabase.from("documents").insert({
                    entity_id: entityId,
                    document_type: "stock_purchase_agreement",
                    name: att.filename,
                    storage_path: storagePath,
                    file_size_bytes: fileBuffer.length,
                    is_lp_visible: false,
                  });
                  spaResult = { status: "synced", filename: att.filename };
                } else {
                  spaResult = { status: "upload_failed", error: uploadErr.message };
                }
              } else {
                spaResult = { status: "download_failed" };
              }
            } else {
              spaResult = { status: "no_spa_found" };
            }
          }
        } catch (spaErr: any) {
          spaResult = { status: "error", error: spaErr.message };
        }
      }

      return res.json({
        success: true,
        entity_id: entityId,
        short_code,
        name,
        action: existing ? "updated" : "created",
        spa: spaResult,
        next_steps: [
          existing ? null : "Run Airtable sync to populate financial fields (or wait for tonight's nightly sync)",
          !bank_account_no ? "Add bank account number once received from HSBC" : null,
          sync_spa && spaResult?.status === "no_spa_found" ? "No SPA found in Airtable yet — sync again once uploaded" : null,
        ].filter(Boolean),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/vector/series — list all existing Vector series with their status
  app.get("/api/vector/series", async (_req, res) => {
    const { data: entities, error } = await supabase
      .from("entities")
      .select("id, name, short_code, status, airtable_deal_id, bank_name, bank_account_no, bank_swift, formation_date, vehicle_subscription_amount, gross_allocated_amount, funds_received, final_investment_usd")
      .like("short_code", "FC-VECTOR-%")
      .order("short_code");
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with investment company name
    const ids = (entities ?? []).map((e: any) => e.id);
    const { data: invs } = ids.length
      ? await supabase.from("investments").select("entity_id, company_name, notes").in("entity_id", ids)
      : { data: [] };
    const invMap: Record<string, any> = {};
    for (const inv of invs ?? []) invMap[inv.entity_id] = inv;

    const result = (entities ?? []).map((e: any) => ({
      ...e,
      investment_company: invMap[e.id]?.company_name ?? null,
      deal_code: invMap[e.id]?.notes ?? null,
    }));

    res.json(result);
  });

  // GET /api/debug/airtable-fields/:recordId — temporary debug: dump raw Airtable field keys + attachment filenames
  app.get("/api/debug/airtable-fields/:recordId", async (req, res) => {
    const PAT = process.env.AIRTABLE_PAT!;
    const r = await fetch(`https://api.airtable.com/v0/appXSAE1n2PvdCQB1/tbln6AszmitsErPgh/${req.params.recordId}`, { headers: { Authorization: `Bearer ${PAT}` } });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const data = await r.json() as any;
    const fields = data.fields || {};
    const summary: any = {};
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v) && (v as any[]).length && (v as any[])[0]?.url) {
        summary[k] = (v as any[]).map((a: any) => ({ filename: a.filename, type: a.type }));
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        summary[k] = v;
      } else {
        summary[k] = `[${typeof v}]`;
      }
    }
    res.json(summary);
  });

  // POST /api/sync/spa-documents — pull executed SPAs from Airtable and store in Supabase
  app.post("/api/sync/spa-documents", async (_req, res) => {
    const AIRTABLE_PAT  = process.env.AIRTABLE_PAT!;
    const AIRTABLE_BASE = "appXSAE1n2PvdCQB1";
    const DEALS_TABLE   = "tbln6AszmitsErPgh";

    // Vector SPV entity_id → Airtable deal record id — loaded dynamically from Supabase
    const VECTOR_DEAL_MAP = await buildVectorDealMap();

    const results: any[] = [];
    let synced = 0, skipped = 0;
    const errors: string[] = [];

    try {
      // Ensure storage bucket exists
      try { await supabase.storage.createBucket("documents", { public: false }); } catch (_) { /* ignore if exists */ }

      for (const [airtableRecordId, { entityId, dealCode }] of Object.entries(VECTOR_DEAL_MAP)) {
        try {
          // Fetch Airtable record
          const atRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/${DEALS_TABLE}/${airtableRecordId}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } }
          );
          if (!atRes.ok) { errors.push(`${dealCode}: Airtable fetch failed (${atRes.status})`); continue; }
          const record = await atRes.json() as any;
          const fields = record.fields || {};

          // Prefer "Unredacted Fully Executed Investment Agreement", fall back to "Investment agreement"
          // In fallback case only accept if filename contains 'Stock Purchase' or 'SPA'
          let attachments: any[] = fields["Unredacted Fully Executed Investment Agreement"] || [];
          if (!attachments.length) {
            const invAgree: any[] = fields["Investment agreement"] || [];
            attachments = invAgree.filter((a: any) =>
              /stock.?purchase|\bspa\b|series.?agree/i.test(a.filename || "")
            );
          }

          if (!attachments.length) {
            skipped++;
            results.push({ dealCode, status: "no_spa_found" });
            continue;
          }

          // Use first PDF attachment
          const att = attachments.find((a: any) => a.type === "application/pdf") || attachments[0];
          const filename = att.filename as string;

          // Check if we already have this exact file stored (by name + entity)
          const { data: existing } = await supabase
            .from("documents")
            .select("id, name, created_at")
            .eq("entity_id", entityId)
            .eq("document_type", "stock_purchase_agreement")
            .maybeSingle();

          if (existing && existing.name === filename) {
            skipped++;
            results.push({ dealCode, status: "already_current", filename });
            continue;
          }

          // Download from Airtable (URL is a signed temporary URL — must download immediately)
          const fileRes = await fetch(att.url);
          if (!fileRes.ok) { errors.push(`${dealCode}: download failed (${fileRes.status})`); continue; }
          const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

          // Upload to Supabase Storage
          const storagePath = `${entityId}/spa-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: uploadErr } = await supabase.storage
            .from("documents")
            .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: true });
          if (uploadErr) { errors.push(`${dealCode}: storage upload failed — ${uploadErr.message}`); continue; }

          // Remove old SPA record if replacing
          if (existing) {
            if (existing.name !== filename) {
              // Delete old storage file (best-effort)
              const { data: oldDoc } = await supabase.from("documents").select("storage_path").eq("id", existing.id).single();
              if (oldDoc?.storage_path) await supabase.storage.from("documents").remove([oldDoc.storage_path]);
              await supabase.from("documents").delete().eq("id", existing.id);
            }
          }

          // Upsert documents row
          const { error: insertErr } = await supabase.from("documents").insert({
            entity_id: entityId,
            document_type: "stock_purchase_agreement",
            name: filename,
            storage_path: storagePath,
            file_size_bytes: fileBuffer.length,
            is_lp_visible: false,
          });
          if (insertErr) { errors.push(`${dealCode}: DB insert failed — ${insertErr.message}`); continue; }

          synced++;
          results.push({ dealCode, status: "synced", filename, bytes: fileBuffer.length });
        } catch (e: any) {
          errors.push(`${dealCode}: unexpected error — ${e.message}`);
        }
      }

      res.json({ status: "ok", synced, skipped, errors, results });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // GET /api/sync/spa-documents/status — last sync summary
  app.get("/api/sync/spa-documents/status", async (_req, res) => {
    const { data } = await supabase
      .from("documents")
      .select("entity_id, name, created_at, entities(short_code)")
      .eq("document_type", "stock_purchase_agreement")
      .order("created_at", { ascending: false });
    res.json(data ?? []);
  });

  // ── LP Capital Account Ledger ──────────────────────────────────────────────────

  // GET all entries — filterable by entity_id, investor_id, tax_year
  app.get("/api/capital-accounts", async (req, res) => {
    let query = supabase
      .from("lp_capital_account_entries")
      .select(`
        *,
        investors(full_name, email),
        entities(name, short_code)
      `)
      .order("entry_date", { ascending: false });

    if (req.query.entity_id)   query = query.eq("entity_id",  req.query.entity_id as string);
    if (req.query.investor_id) query = query.eq("investor_id", req.query.investor_id as string);
    if (req.query.tax_year)    query = query.eq("tax_year",    parseInt(req.query.tax_year as string));
    if (req.query.entry_type)  query = query.eq("entry_type",  req.query.entry_type as string);
    if (req.query.limit)       query = query.limit(parseInt(req.query.limit as string));

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET per-LP running balance summary (from view)
  app.get("/api/capital-accounts/balances", async (req, res) => {
    let query = supabase
      .from("lp_capital_account_balances")
      .select("*")
      .order("tax_year", { ascending: true });

    if (req.query.entity_id)   query = query.eq("entity_id",  req.query.entity_id as string);
    if (req.query.investor_id) query = query.eq("investor_id", req.query.investor_id as string);
    if (req.query.tax_year)    query = query.eq("tax_year",    parseInt(req.query.tax_year as string));

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET K-1 summary for a given tax year — one row per LP per entity
  app.get("/api/capital-accounts/k1-summary", async (req, res) => {
    const tax_year = req.query.tax_year
      ? parseInt(req.query.tax_year as string)
      : new Date().getFullYear();

    let query = supabase
      .from("lp_capital_account_balances")
      .select("*")
      .eq("tax_year", tax_year)
      .order("entity_short_code", { ascending: true });

    if (req.query.entity_id) query = query.eq("entity_id", req.query.entity_id as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ tax_year, entries: data });
  });

  // POST a manual capital account entry
  app.post("/api/capital-accounts/entries", async (req, res) => {
    const { entity_id, investor_id, entry_type, tax_year, period,
            entry_date, amount, description, reference_id, reference_table } = req.body;

    if (!entity_id || !investor_id || !entry_type || !tax_year || !entry_date || amount == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { data, error } = await supabase
      .from("lp_capital_account_entries")
      .insert({ entity_id, investor_id, entry_type, tax_year, period,
                entry_date, amount, description, reference_id, reference_table })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await audit("lp_capital_account_entries", data.id, "INSERT",
      `Capital account entry: ${entry_type} £${amount} for investor ${investor_id}`, null, data);

    res.status(201).json(data);
  });

  // POST /api/capital-accounts/sync — auto-populate from capital_call_items + nav_marks
  app.post("/api/capital-accounts/sync", async (req, res) => {
    const results = { contributions: 0, fees: 0, gain_allocations: 0, skipped: 0, errors: [] as string[] };

    try {
      // ── 1. CONTRIBUTIONS from capital_call_items (received_amount) ─────────────────────
      const { data: callItems, error: ciErr } = await supabase
        .from("capital_call_items")
        .select(`
          id, investor_id, received_amount, received_date, fee_amount,
          capital_calls(entity_id, call_date)
        `)
        .not("received_amount", "is", null)
        .gt("received_amount", 0);

      if (ciErr) throw new Error(`capital_call_items: ${ciErr.message}`);

      for (const item of (callItems || [])) {
        const call = item.capital_calls as any;
        if (!call?.entity_id || !item.received_date) { results.skipped++; continue; }

        const taxYear = new Date(item.received_date).getFullYear();
        const entryDate = item.received_date;

        // Check if already synced (idempotent)
        const { data: existing } = await supabase
          .from("lp_capital_account_entries")
          .select("id")
          .eq("investor_id",    item.investor_id)
          .eq("entity_id",      call.entity_id)
          .eq("entry_type",     "contribution")
          .eq("reference_id",   item.id)
          .maybeSingle();

        if (existing) { results.skipped++; continue; }

        // Insert contribution
        const { error: insErr } = await supabase.from("lp_capital_account_entries").insert({
          entity_id:       call.entity_id,
          investor_id:     item.investor_id,
          entry_type:      "contribution",
          tax_year:        taxYear,
          period:          `Q${Math.ceil((new Date(item.received_date).getMonth() + 1) / 3)}`,
          entry_date:      entryDate,
          amount:          item.received_amount,
          description:     "Capital contribution from capital call",
          reference_id:    item.id,
          reference_table: "capital_call_items",
        });
        if (insErr) { results.errors.push(insErr.message); continue; }
        results.contributions++;

        // Insert fee if present
        if (item.fee_amount && Number(item.fee_amount) > 0) {
          const { error: feeErr } = await supabase.from("lp_capital_account_entries").insert({
            entity_id:       call.entity_id,
            investor_id:     item.investor_id,
            entry_type:      "fee",
            tax_year:        taxYear,
            period:          `Q${Math.ceil((new Date(item.received_date).getMonth() + 1) / 3)}`,
            entry_date:      entryDate,
            amount:          -Math.abs(Number(item.fee_amount)), // fees reduce LP account
            description:     "Deal fee charged at capital call",
            reference_id:    item.id,
            reference_table: "capital_call_items",
          });
          if (!feeErr) results.fees++;
        }
      }

      // ── 2. GAIN ALLOCATIONS from nav_marks ───────────────────────────────────
      const { data: navMarks, error: navErr } = await supabase
        .from("nav_marks")
        .select("*")
        .order("mark_date", { ascending: true });

      if (navErr) throw new Error(`nav_marks: ${navErr.message}`);

      for (const mark of (navMarks || [])) {
        if (!mark.fair_value || !mark.cost_basis) continue;
        const totalGain = Number(mark.fair_value) - Number(mark.cost_basis);
        if (Math.abs(totalGain) < 0.01) continue;

        const taxYear = new Date(mark.mark_date).getFullYear();

        // Get all LPs in this entity with their pro-rata share
        const { data: commitments, error: cmtErr } = await supabase
          .from("investor_commitments")
          .select("investor_id, committed_amount")
          .eq("entity_id", mark.entity_id)
          .is("archived_at", null);

        if (cmtErr || !commitments?.length) continue;

        const totalCommitted = commitments.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
        if (totalCommitted === 0) continue;

        for (const cmt of commitments) {
          const proRata = Number(cmt.committed_amount) / totalCommitted;
          const lpGain  = Math.round(totalGain * proRata * 100) / 100;
          if (Math.abs(lpGain) < 0.01) continue;

          // Idempotent check
          const { data: existingNav } = await supabase
            .from("lp_capital_account_entries")
            .select("id")
            .eq("investor_id",  cmt.investor_id)
            .eq("entity_id",    mark.entity_id)
            .in("entry_type",   ["gain_allocation", "loss_allocation"])
            .eq("reference_id", mark.id)
            .maybeSingle();

          if (existingNav) { results.skipped++; continue; }

          const entryType = lpGain >= 0 ? "gain_allocation" : "loss_allocation";
          const { error: gainErr } = await supabase.from("lp_capital_account_entries").insert({
            entity_id:       mark.entity_id,
            investor_id:     cmt.investor_id,
            entry_type:      entryType,
            tax_year:        taxYear,
            period:          "Annual",
            entry_date:      mark.mark_date,
            amount:          lpGain,
            description:     `Unrealised ${entryType === "gain_allocation" ? "gain" : "loss"} allocation (pro-rata ${(proRata * 100).toFixed(2)}%)`,
            reference_id:    mark.id,
            reference_table: "nav_marks",
          });
          if (!gainErr) results.gain_allocations++;
        }
      }

      await audit("lp_capital_account_entries", null, "SYNC",
        `Capital account sync: ${results.contributions} contributions, ${results.fees} fees, ${results.gain_allocations} gain allocations, ${results.skipped} skipped`);

      res.json({ success: true, ...results });
    } catch (err: any) {
      res.status(500).json({ error: err.message, ...results });
    }
  });

  // ── P&L Model download (generated live from Supabase on each request) ──────
  app.get("/api/reports/pl-model", async (_req, res) => {
    // Locate the generator script (dist/scripts in prod, scripts/ in dev)
    const generatorProd = path.join(process.cwd(), "dist", "scripts", "generate_pl_model.cjs");
    const generatorDev  = path.join(process.cwd(), "scripts", "generate_pl_model.cjs");
    const generatorPath = fs.existsSync(generatorProd) ? generatorProd : generatorDev;

    if (!fs.existsSync(generatorPath)) {
      return res.status(500).json({ error: "P&L generator script not found on server." });
    }

    // Write to a unique temp file so concurrent requests don't collide
    const tmpFile = path.join(os.tmpdir(), `fc_pl_model_${Date.now()}.xlsx`);

    try {
      // Run the generator (inherits SUPABASE_URL + SUPABASE_ANON_KEY from env)
      await execFileAsync(process.execPath, [generatorPath, tmpFile], {
        timeout: 30_000,
        env: process.env,
      });

      if (!fs.existsSync(tmpFile)) {
        return res.status(500).json({ error: "Generator ran but produced no output file." });
      }

      const stat = fs.statSync(tmpFile);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="FC_PL_Model_${new Date().toISOString().slice(0,10)}.xlsx"`
      );
      res.setHeader("Content-Length", stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.on("end", () => {
        // Clean up temp file after streaming
        fs.unlink(tmpFile, () => {});
      });
      stream.pipe(res);
    } catch (err: any) {
      // Clean up if generator failed
      fs.unlink(tmpFile, () => {});
      console.error("[PLModel] Generator error:", err.message);
      return res.status(500).json({
        error: "Failed to generate P&L model.",
        detail: err.message,
      });
    }
  });

  // ── Cayman P&L Model download ────────────────────────────────────────────────
  app.get("/api/reports/cayman-pl-model", async (_req, res) => {
    const generatorProd = path.join(process.cwd(), "dist", "scripts", "generate_cayman_pl_model.cjs");
    const generatorDev  = path.join(process.cwd(), "scripts", "generate_cayman_pl_model.cjs");
    const generatorPath = fs.existsSync(generatorProd) ? generatorProd : generatorDev;

    if (!fs.existsSync(generatorPath)) {
      return res.status(500).json({ error: "Cayman P&L generator script not found on server." });
    }

    const tmpFile = path.join(os.tmpdir(), `fc_cayman_pl_model_${Date.now()}.xlsx`);

    try {
      await execFileAsync(process.execPath, [generatorPath, tmpFile], {
        timeout: 30_000,
        env: process.env,
      });

      if (!fs.existsSync(tmpFile)) {
        return res.status(500).json({ error: "Generator ran but produced no output file." });
      }

      const stat = fs.statSync(tmpFile);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="FC_Cayman_PL_Model_${new Date().toISOString().slice(0,10)}.xlsx"`
      );
      res.setHeader("Content-Length", stat.size);

      const stream = fs.createReadStream(tmpFile);
      stream.on("end", () => { fs.unlink(tmpFile, () => {}); });
      stream.pipe(res);
    } catch (err: any) {
      fs.unlink(tmpFile, () => {});
      console.error("[CaymanPLModel] Generator error:", err.message);
      return res.status(500).json({
        error: "Failed to generate Cayman P&L model.",
        detail: err.message,
      });
    }
  });

  // ── Accounts Payable — Invoices ──────────────────────────────────────────────

  // GET /api/invoices — list all invoices with optional filters
  app.get("/api/invoices", async (req, res) => {
    let query = supabase
      .from("invoices")
      .select("*")
      .order("invoice_date", { ascending: false });

    if (req.query.status && req.query.status !== "all") {
      query = query.eq("status", req.query.status as string);
    }
    if (req.query.series_tag && req.query.series_tag !== "all") {
      query = query.eq("series_tag", req.query.series_tag as string);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // POST /api/invoices — create a new invoice manually
  app.post("/api/invoices", async (req, res) => {
    const allowed = [
      "vendor", "description", "invoice_number", "invoice_date", "due_date",
      "amount", "currency", "entity_id", "series_tag", "status",
      "notes", "payment_reference",
    ];
    const payload: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    if (!payload.vendor) return res.status(400).json({ error: "vendor is required" });
    if (payload.amount === undefined) return res.status(400).json({ error: "amount is required" });

    // If series_tag supplied but no entity_id, look up entity
    if (payload.series_tag && !payload.entity_id) {
      const tagMap: Record<string, string> = {
        "VECTOR-III": "FC-VECTOR-III",
        "VECTOR-IV":  "FC-VECTOR-IV",
        "VECTOR-I":   "FC-VECTOR-I",
        "PLATFORM":   "FC-PLATFORM",
      };
      const shortCode = tagMap[payload.series_tag];
      if (shortCode) {
        const { data: ent } = await supabase
          .from("entities")
          .select("id")
          .eq("short_code", shortCode)
          .single();
        if (ent) payload.entity_id = ent.id;
      }
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await audit("invoices", data.id, "create",
      `Invoice created: ${data.vendor} ${data.amount} ${data.currency}`);
    res.json(data);
  });

  // POST /api/invoices/upload — drag-and-drop PDF or CSV invoice upload
  app.post("/api/invoices/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const { mimetype, originalname, path: tmpPath, size } = req.file;
      const meta = req.body; // jurisdiction, series_tag, entity_id, vendor, notes, currency

      const invoices: any[] = [];

      // ── CSV: parse rows into invoice records ──────────────────────────────
      if (mimetype === "text/csv" || originalname.endsWith(".csv")) {
        const fs = await import("fs");
        const raw = fs.readFileSync(tmpPath, "utf-8");
        const lines = raw.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return res.status(400).json({ error: "CSV has no data rows" });

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        const getCol = (row: string[], name: string) => {
          const i = headers.indexOf(name);
          return i >= 0 ? row[i]?.trim() : undefined;
        };

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const amount = parseFloat(getCol(cols, "amount") ?? getCol(cols, "total") ?? "0");
          if (!amount) continue;
          invoices.push({
            vendor:          getCol(cols, "vendor")        || getCol(cols, "supplier") || meta.vendor || "Unknown",
            invoice_number:  getCol(cols, "invoice_number") || getCol(cols, "invoice_no") || null,
            invoice_date:    getCol(cols, "invoice_date")   || getCol(cols, "date")       || null,
            due_date:        getCol(cols, "due_date")        || null,
            description:     `[CSV upload: ${originalname}] ` + (getCol(cols, "description") || getCol(cols, "narrative") || ""),
            amount,
            currency:        getCol(cols, "currency")        || meta.currency || "USD",
            series_tag:      meta.series_tag  || null,
            entity_id:       meta.entity_id   || null,
            notes:           meta.notes || null,
            status:          "draft",
          });
        }
      }

      // ── PDF: store file in Supabase Storage + create a draft invoice ────
      else if (mimetype === "application/pdf" || originalname.endsWith(".pdf")) {
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(tmpPath);

        // Upload to Supabase Storage
        const storageKey = `invoices/${Date.now()}_${originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        try { await supabase.storage.createBucket("documents", { public: false }); } catch (_) {}
        const { error: uploadErr } = await supabase.storage
          .from("documents")
          .upload(storageKey, fileBuffer, { contentType: "application/pdf", upsert: true });

        // Best-effort PDF text extraction for vendor/amount hints
        let vendorHint = meta.vendor || "";
        let amountHint: number | null = null;
        let invoiceDateHint: string | null = null;
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData = await pdfParse(fileBuffer);
          const text = pdfData.text || "";

          // Try to extract amount (look for largest currency figure)
          const amounts = [...text.matchAll(/[$£€]?\s?([\d,]+\.\d{2})/g)]
            .map(m => parseFloat(m[1].replace(/,/g, "")))
            .filter(n => n > 0 && n < 10_000_000)
            .sort((a, b) => b - a);
          if (amounts.length) amountHint = amounts[0];

          // Try to extract date
          const dateMatch = text.match(/(\d{1,2}[\s/.-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
          if (dateMatch) invoiceDateHint = dateMatch[1];
        } catch (_) { /* pdf-parse failure is non-fatal */ }

        invoices.push({
          vendor:           vendorHint || "Unknown (PDF)",
          description:      `[PDF upload: ${originalname}]` + (meta.notes ? ` ${meta.notes}` : ""),
          invoice_date:     invoiceDateHint || null,
          amount:           amountHint || 0,
          currency:         meta.currency || "USD",
          series_tag:       meta.series_tag  || null,
          entity_id:        meta.entity_id   || null,
          notes:            uploadErr ? null : `Storage: ${storageKey}`,
          has_attachment:   !uploadErr,
          status:           "draft",
          gmail_subject:    `Uploaded PDF: ${originalname}`,
        });
      } else {
        return res.status(400).json({ error: "Only PDF and CSV files are supported" });
      }

      if (!invoices.length) return res.status(400).json({ error: "No valid invoice rows found in file" });

      // Insert all parsed invoices
      const { data, error } = await supabase
        .from("invoices")
        .insert(invoices)
        .select();
      if (error) return res.status(500).json({ error: error.message });

      // Clean up tmp file
      try { const fs = await import("fs"); fs.unlinkSync(tmpPath); } catch (_) {}

      res.json({ imported: data?.length ?? 0, invoices: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // PATCH /api/invoices/:id — update invoice (mark paid, update status, etc.)
  app.patch("/api/invoices/:id", async (req, res) => {
    const allowed = [
      "status", "paid_date", "payment_reference", "due_date",
      "notes", "series_tag", "vendor", "amount", "description",
    ];
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Invoice not found" });

    await audit("invoices", req.params.id, "update",
      `Invoice updated: ${data.vendor} → status: ${payload.status || data.status}`);
    res.json(data);
  });

  // GET /api/ap/summary — AP totals grouped by series (from view)
  app.get("/api/ap/summary", async (_req, res) => {
    const { data, error } = await supabase
      .from("ap_summary_by_series")
      .select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET /api/ap/aging — aging breakdown (from view)
  app.get("/api/ap/aging", async (_req, res) => {
    const { data, error } = await supabase
      .from("ap_aging")
      .select("*")
      .order("days_overdue", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Entity Costs (Group Structure) ────────────────────────────────────────

  // GET /api/entities-full — all entities including group hierarchy (no archived filter issues)
  app.get("/api/entities-full", async (_req, res) => {
    const { data, error } = await supabase
      .from("entities")
      .select("id, short_code, name, entity_type, jurisdiction, reporting_currency, parent_entity_id, archived_at")
      .order("entity_type")
      .order("name");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // GET /api/entity-costs — list all entity costs, optional ?entity_id= filter
  app.get("/api/entity-costs", async (req, res) => {
    let query = supabase
      .from("entity_costs")
      .select("*")
      .order("cost_date", { ascending: false });
    if (req.query.entity_id) {
      query = query.eq("entity_id", req.query.entity_id as string);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // POST /api/entity-costs — create a cost entry
  app.post("/api/entity-costs", async (req, res) => {
    const allowed = [
      "entity_id", "cost_date", "description", "category",
      "amount", "currency", "fx_rate_to_usd",
      "status", "paid_date", "payment_reference",
      "is_recharged", "recharged_to_entity_id", "notes",
    ];
    const payload: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    // Default fx_rate_to_usd to 1.0 if USD and not provided
    if (!payload.fx_rate_to_usd) payload.fx_rate_to_usd = 1.0;

    const { data, error } = await supabase
      .from("entity_costs")
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit("entity_costs", data.id, "create",
      `Cost created: ${data.description} ${data.amount} ${data.currency}`);
    res.json(data);
  });

  // POST /api/entity-costs/upload — drag-and-drop PDF or CSV for Cayman entity costs
  app.post("/api/entity-costs/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });
      const { mimetype, originalname, path: tmpPath } = req.file;
      const meta = req.body;
      const entity_id = meta.entity_id || null;
      const currency  = meta.currency  || "USD";
      const costs: any[] = [];

      // ── CSV ─────────────────────────────────────────────────────────
      if (mimetype === "text/csv" || originalname.endsWith(".csv")) {
        const fs = await import("fs");
        const raw = fs.readFileSync(tmpPath, "utf-8");
        const lines = raw.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return res.status(400).json({ error: "CSV has no data rows" });
        const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        const col = (row: string[], name: string) => { const i = headers.indexOf(name); return i >= 0 ? row[i]?.trim() : undefined; };
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const amount = parseFloat(col(cols, "amount") ?? col(cols, "total") ?? "0");
          if (!amount) continue;
          const csvVendor = col(cols, "vendor") || col(cols, "supplier") || meta.vendor || null;
          const csvInvRef = col(cols, "invoice_ref") || col(cols, "invoice_number") || col(cols, "inv_ref") || meta.invoice_ref || null;
          costs.push({
            entity_id,
            cost_date:       col(cols, "date") || col(cols, "invoice_date") || new Date().toISOString().slice(0, 10),
            due_date:        col(cols, "due_date") || null,
            description:     col(cols, "description") || csvVendor || `[CSV: ${originalname}]`,
            category:        col(cols, "category") || meta.category || "other",
            amount,
            currency:        col(cols, "currency") || currency,
            fx_rate_to_usd:  parseFloat(col(cols, "fx_rate") ?? "1") || 1.0,
            status:          col(cols, "status") || "accrued",
            vendor:          csvVendor,
            invoice_ref:     csvInvRef,
            notes:           meta.notes || null,
          });
        }
      }

      // ── PDF ─────────────────────────────────────────────────────────
      else if (mimetype === "application/pdf" || originalname.endsWith(".pdf")) {
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(tmpPath);
        let amountHint: number | null = null;
        let dateHint: string | null = null;
        let vendorHint = meta.vendor || "";
        try {
          const pdfParse = (await import("pdf-parse")).default;
          const text = (await pdfParse(fileBuffer)).text || "";
          const amounts = [...text.matchAll(/[$£€]?\s?([\d,]+\.\d{2})/g)]
            .map((m: RegExpMatchArray) => parseFloat(m[1].replace(/,/g, "")))
            .filter((n: number) => n > 0 && n < 10_000_000).sort((a: number, b: number) => b - a);
          if (amounts.length) amountHint = amounts[0];
          const dateMatch = text.match(/(\d{1,2}[\s/.-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
          if (dateMatch) dateHint = dateMatch[1];
        } catch (_) {}
        // Store file in Supabase Storage
        const storageKey = `invoices/${Date.now()}_${originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        try { await supabase.storage.createBucket("documents", { public: false }); } catch (_) {}
        await supabase.storage.from("documents").upload(storageKey, fileBuffer, { contentType: "application/pdf", upsert: true });
        costs.push({
          entity_id,
          cost_date:     dateHint || new Date().toISOString().slice(0, 10),
          description:   meta.notes || vendorHint || `[PDF: ${originalname}]`,
          category:      meta.category || "other",
          amount:        amountHint || 0,
          currency,
          fx_rate_to_usd: parseFloat(meta.fx_rate_to_usd) || 1.0,
          status:        "accrued",
          vendor:        vendorHint || null,
          invoice_ref:   meta.invoice_ref || null,
          due_date:      meta.due_date || null,
          notes:         `PDF stored: ${storageKey}`,
        });
      } else {
        return res.status(400).json({ error: "Only PDF and CSV files are supported" });
      }

      if (!costs.length) return res.status(400).json({ error: "No valid rows found in file" });
      const { data, error } = await supabase.from("entity_costs").insert(costs).select();
      if (error) return res.status(500).json({ error: error.message });
      try { const fs = await import("fs"); fs.unlinkSync(tmpPath); } catch (_) {}
      res.json({ imported: data?.length ?? 0, costs: data });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // PATCH /api/entity-costs/:id — mark paid / update status
  app.patch("/api/entity-costs/:id", async (req, res) => {
    const allowed = [
      "status", "paid_date", "payment_reference", "notes",
      "fx_rate_to_usd", "description", "category",
      "invoice_ref", "vendor", "due_date", "drive_link",
      "amount", "currency", "cost_date",
    ];
    const payload: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    const { data, error } = await supabase
      .from("entity_costs")
      .update(payload)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Cost entry not found" });
    await audit("entity_costs", req.params.id, "update",
      `Cost updated: ${data.description} → ${payload.status || data.status}`);
    res.json(data);
  });

  // DELETE /api/entity-costs/:id — soft-delete by setting status to 'void'
  app.delete("/api/entity-costs/:id", async (req, res) => {
    const { data, error } = await supabase
      .from("entity_costs")
      .update({ status: "void" })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Cost entry not found" });
    await audit("entity_costs", req.params.id, "delete",
      `Cost voided: ${data.description}`);
    res.json({ ok: true });
  });

  // GET /api/entity-costs/summary — from entity_costs_summary view
  app.get("/api/entity-costs/summary", async (_req, res) => {
    const { data, error } = await supabase
      .from("entity_costs_summary")
      .select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });


  // ── Investor Register ────────────────────────────────────────────────────────
  // GET /api/investor-register — unified view across Delaware LPs + YC investors
  app.get("/api/investor-register", async (_req, res) => {
    try {
      // YC investors with their holdings
      const { data: ycInvestors, error: ycErr } = await supabase
        .from("yc_investors")
        .select(`
          id, airtable_id, name, email, location, kyc_status,
          total_investments_usd, num_investments, value_of_portfolio,
          capital_deployed, member_id, yc_deal_count, delaware_deal_count,
          yc_holdings ( deal_name, yc_batch, closing_date, vehicle, investment_amount_usd, moic, currency )
        `)
        .order("name");
      if (ycErr) return res.status(500).json({ error: ycErr.message });

      // Delaware investors with their commitments
      const { data: delawareInvestors, error: delErr } = await supabase
        .from("investors")
        .select(`
          id, full_name, email, country_of_residence, kyc_status,
          investor_commitments (
            id, entity_id, committed_amount, called_amount, status,
            entities ( name, short_code )
          )
        `)
        .is("archived_at", null)
        .order("full_name");
      if (delErr) return res.status(500).json({ error: delErr.message });

      // Shape Delaware investors to match register format
      const delawareShaped = (delawareInvestors ?? []).map((inv: any) => ({
        source: "delaware" as const,
        id: inv.id,
        name: inv.full_name,
        email: inv.email,
        location: inv.country_of_residence,
        kyc_status: inv.kyc_status,
        total_investments_usd: (inv.investor_commitments ?? []).reduce(
          (sum: number, c: any) => sum + (Number(c.committed_amount) || 0), 0
        ),
        num_investments: (inv.investor_commitments ?? []).length,
        value_of_portfolio: 0,
        vehicles: ["Delaware"],
        holdings: (inv.investor_commitments ?? []).map((c: any) => ({
          deal_name: c.entities?.name ?? "Unknown SPV",
          vehicle: "Delaware",
          yc_batch: null,
          closing_date: null,
          entity_short_code: c.entities?.short_code ?? null,
        })),
      }));

      // Shape YC investors — some also have Delaware holdings
      const ycShaped = (ycInvestors ?? []).map((inv: any) => {
        const vehicles: string[] = [];
        if (inv.yc_deal_count > 0) vehicles.push("YC");
        if (inv.delaware_deal_count > 0) vehicles.push("Delaware");
        return {
          source: "yc" as const,
          id: inv.id,
          name: inv.name,
          email: inv.email,
          location: inv.location,
          kyc_status: inv.kyc_status,
          total_investments_usd: inv.total_investments_usd,
          num_investments: inv.num_investments,
          value_of_portfolio: inv.value_of_portfolio,
          capital_deployed: inv.capital_deployed,
          member_id: inv.member_id,
          yc_deal_count: inv.yc_deal_count,
          delaware_deal_count: inv.delaware_deal_count,
          vehicles,
          holdings: (inv.yc_holdings ?? []).map((h: any) => ({
            deal_name: h.deal_name,
            vehicle: "YC",
            yc_batch: h.yc_batch,
            closing_date: h.closing_date,
            entity_short_code: null,
            investment_amount_usd: h.investment_amount_usd ?? null,
            moic: h.moic ?? null,
            currency: h.currency ?? null,
          })),
        };
      });

      // Merge: if a YC investor also appears in Delaware, they get both.
      // For this internal register, return both lists separately and let frontend merge by email.
      const summary = {
        total_yc_investors: ycShaped.length,
        total_delaware_investors: delawareShaped.length,
        total_yc_holdings: ycShaped.reduce((s: number, i: any) => s + i.yc_deal_count, 0),
      };

      res.json({ yc: ycShaped, delaware: delawareShaped, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // ── NAV / Fair Value — Portfolio Summary ─────────────────────────────────────
  // GET /api/nav-marks/portfolio — Delaware investments + YC deals for unified NAV page
  app.get("/api/nav-marks/portfolio", async (_req, res) => {
    try {
      // Delaware: investments joined to entities (non-Cayman SPVs only)
      const { data: delawareInvs, error: dErr } = await supabase
        .from("investments")
        .select("*, entities(id, name, short_code, base_currency)")
        .is("archived_at", null)
        .order("investment_date", { ascending: false });
      if (dErr) return res.status(500).json({ error: dErr.message });

      const delaware = (delawareInvs ?? []).filter((i: any) =>
        !i.entities?.short_code?.startsWith("FC-CAYMAN")
      ).map((i: any) => ({
        id: i.id,
        entity_id: i.entity_id,
        entity_name: i.entities?.name ?? null,
        short_code: i.entities?.short_code ?? null,
        company_name: i.company_name,
        instrument_type: i.instrument_type,
        investment_date: i.investment_date,
        cost_basis: i.cost_basis ? Number(i.cost_basis) : null,
        current_fair_value: i.current_fair_value ? Number(i.current_fair_value) : null,
        fair_value_date: i.fair_value_date,
        valuation_basis: i.valuation_basis,
        moic: i.moic ? Number(i.moic) : null,
        status: i.status,
        sector: i.sector,
        stage: i.stage,
        jurisdiction: "delaware",
      }));

      // YC: aggregate from yc_deals
      const { data: ycDeals, error: yErr } = await supabase
        .from("yc_deals")
        .select("id, name, batch, fc_investment, usd_investment_value, live_market_value_usd, moic, status, stage, closing_date, has_followon, followon_round, followon_amount_usd")
        .order("batch", { ascending: true })
        .order("name", { ascending: true });
      if (yErr) return res.status(500).json({ error: yErr.message });

      const ycTotal = (ycDeals ?? []).reduce((s: number, d: any) => s + (Number(d.usd_investment_value) || 0), 0);
      const ycFV = (ycDeals ?? []).reduce((s: number, d: any) => s + (Number(d.live_market_value_usd) || 0), 0);

      // Delaware totals
      const dTotal = delaware.reduce((s: number, i: any) => s + (i.cost_basis || 0), 0);
      const dFV = delaware.reduce((s: number, i: any) => s + (i.current_fair_value || 0), 0);

      res.json({
        delaware,
        yc: {
          deals: ycDeals ?? [],
          total_cost: ycTotal,
          total_fv: ycFV,
          count: (ycDeals ?? []).length,
          at_cost: true, // valuations not yet updated with real marks
        },
        summary: {
          delaware_cost: dTotal,
          delaware_fv: dFV,
          yc_cost: ycTotal,
          yc_fv: ycFV,
          total_cost: dTotal + ycTotal,
          total_fv: dFV + ycFV,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // ── Cayman Capital Calls — LP commitment summary ────────────────────────────
  // GET /api/cayman/capital-calls — capital calls + Weeks8 commitment
  app.get("/api/cayman/capital-calls", async (_req, res) => {
    try {
      const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

      // Capital calls
      const { data: calls, error: ccErr } = await supabase
        .from("capital_calls")
        .select("*")
        .eq("entity_id", CAYMAN_FUND_ID)
        .order("call_number", { ascending: true });
      if (ccErr) return res.status(500).json({ error: ccErr.message });

      // LP commitments (Weeks8 Holdings)
      const { data: commitments, error: icErr } = await supabase
        .from("investor_commitments")
        .select("*, investors(full_name, investor_type, country_of_residence)")
        .eq("entity_id", CAYMAN_FUND_ID)
        .is("archived_at", null);
      if (icErr) return res.status(500).json({ error: icErr.message });

      const totalCalled = (calls ?? []).filter((c: any) => c.status !== "cancelled")
        .reduce((s: number, c: any) => s + (Number(c.total_call_amount) || 0), 0);
      const totalSettled = (calls ?? []).filter((c: any) => c.status === "fully_funded")
        .reduce((s: number, c: any) => s + (Number(c.total_call_amount) || 0), 0);
      const totalCommitted = (commitments ?? []).reduce((s: number, c: any) => s + (Number(c.committed_amount) || 0), 0);

      res.json({
        calls: calls ?? [],
        commitments: (commitments ?? []).map((c: any) => ({
          ...c,
          investor_name: c.investors?.full_name ?? "Unknown",
          investor_type: c.investors?.investor_type ?? null,
          country: c.investors?.country_of_residence ?? null,
        })),
        summary: {
          total_committed: totalCommitted,
          total_called: totalCalled,
          total_uncalled: totalCommitted - totalCalled,
          total_settled: totalSettled,
          total_outstanding: totalCalled - totalSettled,
          call_count: (calls ?? []).length,
          currency: "USD",
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // ── Cayman Transactions ─────────────────────────────────────────────────────
  // GET /api/cayman/transactions — bank_transactions for Cayman Fund + GP entities
  app.get("/api/cayman/transactions", async (req, res) => {
    try {
      const CAYMAN_ENTITY_IDS = [
        "14d76562-2219-4121-b0bd-5379018ac3b4", // Fund LP
        "3540df09-f8bb-43ca-a4de-b89945b6b16b", // GP
      ];
      const limit  = Math.min(parseInt(String(req.query.limit  ?? "200"), 10), 500);
      const offset = parseInt(String(req.query.offset ?? "0"),   10);
      const entity = req.query.entity as string | undefined; // optional filter: 'fund' | 'gp'

      const entityIds = entity === "fund"
        ? [CAYMAN_ENTITY_IDS[0]]
        : entity === "gp"
        ? [CAYMAN_ENTITY_IDS[1]]
        : CAYMAN_ENTITY_IDS;

      const { data, error, count } = await supabase
        .from("bank_transactions")
        .select("*", { count: "exact" })
        .in("entity_id", entityIds)
        .order("transaction_date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });

      const rows = data ?? [];

      // Summary stats
      const totalCredits = rows.reduce((s: number, r: any) => s + (Number(r.credit_amount) || 0), 0);
      const totalDebits  = rows.reduce((s: number, r: any) => s + (Number(r.debit_amount)  || 0), 0);

      res.json({
        transactions: rows,
        summary: {
          count: count ?? rows.length,
          total_credits_usd: totalCredits,
          total_debits_usd:  totalDebits,
          net_usd:           totalCredits - totalDebits,
        },
        pagination: { limit, offset, total: count ?? rows.length },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // ── Reporting Calendar ─────────────────────────────────────────────────────────
  // GET /api/reporting-calendar/completions — all completions (optionally filtered by period)
  app.get("/api/reporting-calendar/completions", async (req, res) => {
    try {
      const { period } = req.query;
      let q = supabase.from("reporting_completions").select("*").order("completed_at", { ascending: false });
      if (period) q = q.eq("period", period as string);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // POST /api/reporting-calendar/completions — mark an item complete for a period
  app.post("/api/reporting-calendar/completions", async (req, res) => {
    try {
      const { item_id, period, completed_by, notes } = req.body;
      if (!item_id || !period) return res.status(400).json({ error: "item_id and period required" });
      const { data, error } = await supabase
        .from("reporting_completions")
        .upsert({ item_id, period, completed_by: completed_by || "FC Portal", notes: notes || null,
                  completed_at: new Date().toISOString() },
                { onConflict: "item_id,period" })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // DELETE /api/reporting-calendar/completions — unmark an item (undo complete)
  app.delete("/api/reporting-calendar/completions", async (req, res) => {
    try {
      const { item_id, period } = req.body;
      if (!item_id || !period) return res.status(400).json({ error: "item_id and period required" });
      const { error } = await supabase
        .from("reporting_completions")
        .delete()
        .eq("item_id", item_id)
        .eq("period", period);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // GET /api/fc-investments-debug — returns raw Airtable fields for first 5 -FC records
  app.get("/api/fc-investments-debug", async (_req, res) => {
    try {
      const AIRTABLE_BASE = "appXSAE1n2PvdCQB1";
      const AIRTABLE_TABLE = "tbln6AszmitsErPgh";
      const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
      if (!AIRTABLE_PAT) return res.status(500).json({ error: "no PAT" });
      // Support ?name=OpenAI to filter by company name (partial, case-insensitive)
      const nameFilter = ((_req as any).query?.name ?? "").toString().toLowerCase();
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
      url.searchParams.set("maxRecords", "500");
      // If name filter provided, search by it; otherwise broad filter
      const formula = nameFilter
        ? `SEARCH(LOWER('${nameFilter.replace(/'/g, "\\' ")}'), LOWER({CompanyName}))>0`
        : `NOT(OR({Status}='Pipeline',{Status}='Prospecting',{Status}='Dead',{Status}='Pass'))`;
      url.searchParams.set("filterByFormula", formula);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } });
      const j: any = await r.json();
      const out = (j.records ?? []).filter((rec: any) => {
        const code = (rec.fields?.["Deal Code"] ?? "").endsWith("-FC");
        if (nameFilter) return true; // show all matching name regardless of code
        return code;
      }).map((rec: any) => {
        const f = rec.fields;
        return {
          name: f["CompanyName"],
          deal_code: f["Deal Code"],
          fc_investment_amount: f["FC investment amount"],
          fc_investment_usd_conversion: f["FC Investment USD Conversion"],
          fc_investment_pv_usd: f["FC Investment PV USD"],
          usd_investment_value: f["USD INVESTMENT VALUE"],
          investment_currency: f["Investment Currency"],
          init_inv_pe: f["Initial Investment value updated with PEs (Still Invested)"],
          live_market_value_usd: f["Live Market Value of Investment USD"],
          fc_investment_deal_currency: f["FC Investment Deal Currency (from Investments 2)"],
        };
      });
      res.json(out);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── FC Own Investments (Airtable live proxy) ───────────────────────────────
  // GET /api/fc-investments — fetches directly from Airtable Deals table
  // and returns cleaned deal records for the FC Own Investments dashboard.
  app.get("/api/fc-investments", async (_req, res) => {
    try {
      const AIRTABLE_BASE = "appXSAE1n2PvdCQB1";
      const AIRTABLE_TABLE = "tbln6AszmitsErPgh";
      const AIRTABLE_PAT = process.env.AIRTABLE_PAT;

      if (!AIRTABLE_PAT) {
        return res.status(500).json({ error: "AIRTABLE_PAT not configured on server" });
      }

      const fields = [
        "CompanyName", "Deal Code", "Status", "Holding Status",
        "Stage", "Closing Date", "Quarter closed", "Month Closed",
        "Investment Currency", "FC investment amount",
        "FC Investment Deal Currency (from Investments 2)",
        "FC Investment USD Conversion", "FC Investment PV USD",
        "USD INVESTMENT VALUE", "MOIC",
        "investors per deal", "Pre-money valuation",
        "Business Type", "Location", "Underlying Company Jurisdiction",
        "Direct / Indirect", "Type", "URL", "Company Description",
        "Deal Square Image", "Share class", "Running Return",
        "Portfolio Appreciation ($)",
      ];

      // Airtable returns max 100 records per page — must follow offset pagination
      const baseUrl = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
      // Exclude pipeline/prospecting only — FC-specific filtering done in JS below
      baseUrl.searchParams.set("filterByFormula", `NOT(OR({Status}='Pipeline',{Status}='Prospecting',{Status}='Dead',{Status}='Pass'))`);
      fields.forEach(f => baseUrl.searchParams.append("fields[]", f));

      const allRawRecords: any[] = [];
      let offset: string | undefined = undefined;
      let pageCount = 0;
      do {
        const pageUrl = new URL(baseUrl.toString());
        if (offset) pageUrl.searchParams.set("offset", offset);
        const airtableRes = await fetch(pageUrl.toString(), {
          headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
        });
        if (!airtableRes.ok) {
          const text = await airtableRes.text();
          let parsed: any;
          try { parsed = JSON.parse(text); } catch { parsed = { error: { message: text } }; }
          const msg = parsed?.error?.message ?? text;
          const isPermission = msg.includes("INVALID_PERMISSIONS") || airtableRes.status === 403;
          const displayMsg = isPermission
            ? `Airtable token permission error: the AIRTABLE_PAT on Railway must have 'data.records:read' scope AND access to the 'Founders Capital 2.0' base. Update the token at airtable.com/create/tokens.`
            : msg;
          return res.status(airtableRes.status).json({ error: displayMsg });
        }
        const json: any = await airtableRes.json();
        allRawRecords.push(...(json.records ?? []));
        offset = json.offset;
        pageCount++;
        if (pageCount > 20) break; // safety cap at 2000 records
      } while (offset);

      // Keep records that are FC's own holdings:
      // Primary: deal code ends in -FC
      // Also include non-FC-coded records where FC Investment USD Conversion is populated
      // (e.g. OAI-1125-SYD has -SYD code but fc_investment_usd_conversion reflects FC's slice)
      // Exclude pure co-investor records: -OD, -DEL, -TF, -JP, -SYDFS with no FC rollup
      const fcRecords = allRawRecords.filter((r: any) => {
        const code: string = r.fields?.["Deal Code"] ?? "";
        if (code.endsWith("-FC")) return true;
        // Include if FC Investment USD Conversion is populated (FC has a direct tracked slice)
        const conv = r.fields?.["FC Investment USD Conversion"];
        const convVal = Array.isArray(conv)
          ? conv.reduce((a: number, b: number) => a + b, 0)
          : typeof conv === "number" ? conv : 0;
        return convVal > 0;
      });

      const records = fcRecords.map((r: any) => {
        const f = r.fields;

        // Cost basis: FC Investment USD Conversion rollup is authoritative when populated —
        // it reflects FC's exact tracked slice (e.g. OAI-1024-FC shows $5,587.49 not $500K).
        // Fall back to FC investment amount only when rollup is absent.
        const rawUsdConv = f["FC Investment USD Conversion"];
        const convVal = Array.isArray(rawUsdConv)
          ? rawUsdConv.reduce((a: number, b: number) => a + b, 0)
          : typeof rawUsdConv === "number" && rawUsdConv > 0 ? rawUsdConv : 0;
        const fcInvestedUsd: number = convVal > 0 ? convVal : (f["FC investment amount"] ?? 0);

        // PV: FC Investment PV USD rollup. Fall back to cost if absent.
        const rawPvUsd = f["FC Investment PV USD"];
        const pvFromRollup = Array.isArray(rawPvUsd)
          ? rawPvUsd.reduce((a: number, b: number) => a + b, 0)
          : typeof rawPvUsd === "number" && rawPvUsd > 0 ? rawPvUsd : 0;
        const fcPvUsd = pvFromRollup > 0 ? pvFromRollup : fcInvestedUsd;
        const squareImage = Array.isArray(f["Deal Square Image"]) && f["Deal Square Image"].length > 0
          ? f["Deal Square Image"][0]?.thumbnails?.large?.url ?? f["Deal Square Image"][0]?.url ?? null
          : null;
        return {
          id: r.id,
          name: f["CompanyName"] ?? "Unknown",
          deal_code: f["Deal Code"] ?? "",
          status: f["Status"] ?? "",
          holding_status: f["Holding Status"] || "Portfolio company",
          stage: f["Stage"] ?? "",
          closing_date: f["Closing Date"] ?? null,
          quarter_closed: f["Quarter closed"] ?? "",
          investment_currency: f["Investment Currency"] ?? "USD",
          fc_investment_amount_raw: (() => {
            // Prefer FC Investment Deal Currency (rollup from linked Investments 2 table)
            // as it reflects the actual GBP/EUR amount paid. Fall back to FC investment amount.
            const dealCcy = f["FC Investment Deal Currency (from Investments 2)"];
            const dealVal = Array.isArray(dealCcy)
              ? dealCcy.reduce((a: number, b: number) => a + b, 0)
              : typeof dealCcy === "number" ? dealCcy : 0;
            if (dealVal > 0) return dealVal;
            return f["FC investment amount"] ?? null;
          })(),
          fc_invested_usd: fcInvestedUsd,
          fc_pv_usd: fcPvUsd,
          deal_size_usd: f["USD INVESTMENT VALUE"] ?? 0,
          moic: f["MOIC"] ?? 1,
          investor_count: f["investors per deal"] ?? 0,
          pre_money_valuation: f["Pre-money valuation"] ?? null,
          business_type: Array.isArray(f["Business Type"]) ? f["Business Type"] : [],
          location: f["Location"] ?? f["Underlying Company Jurisdiction"] ?? "",
          deal_type: f["Type"] ?? "",
          direct_indirect: f["Direct / Indirect"] ?? "",
          website: f["URL"] ?? null,
          description: f["Company Description"] ?? "",
          square_image: squareImage,
          share_class: f["Share class"] ?? "",
          running_return: f["Running Return"] ?? 0,
          portfolio_appreciation: f["Portfolio Appreciation ($)"] ?? 0,
        };
      });

      // Sort by closing_date descending
      records.sort((a: any, b: any) => {
        if (!a.closing_date && !b.closing_date) return 0;
        if (!a.closing_date) return 1;
        if (!b.closing_date) return -1;
        return new Date(b.closing_date).getTime() - new Date(a.closing_date).getTime();
      });

      res.json({ investments: records, total: records.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // ── YC Portfolio ──────────────────────────────────────────────────────────────
  // PATCH /api/yc-deals/:id/health-status — update health status + optional note
  app.patch("/api/yc-deals/:id/health-status", async (req, res) => {
    const { id } = req.params;
    const { health_status, health_status_note } = req.body as {
      health_status: string;
      health_status_note?: string;
    };
    const allowed = ["Active", "At Risk", "Written Off", "Exited"];
    if (!allowed.includes(health_status)) {
      return res.status(400).json({ error: `Invalid health_status. Must be one of: ${allowed.join(", ")}` });
    }
    try {
      const updateData: any = {
        health_status,
        health_status_note: health_status_note ?? null,
        health_status_updated_at: new Date().toISOString(),
      };
      // If writing off, also zero the live market value
      if (health_status === "Written Off") {
        updateData.live_market_value_usd = 0;
        updateData.moic = 0;
      }
      const { error } = await supabase
        .from("yc_deals")
        .update(updateData)
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });

      // If written off, also insert a valuation_mark at $0 for the matching investments row
      if (health_status === "Written Off") {
        const { data: invRows } = await supabase
          .from("investments")
          .select("id, company_name")
          .ilike("company_name", `%${id.replace(/_/g, " ").replace(/\(.*\)/, "").trim()}%`)
          .limit(5);
        // Try to match by fetching the deal name first
        const { data: dealRow } = await supabase
          .from("yc_deals")
          .select("name")
          .eq("id", id)
          .single();
        if (dealRow?.name && invRows && invRows.length > 0) {
          const match = invRows.find(
            (r: any) => r.company_name?.toLowerCase() === dealRow.name?.toLowerCase()
          ) ?? invRows[0];
          if (match) {
            await supabase.from("valuation_marks").insert({
              investment_id: match.id,
              mark_date: new Date().toISOString().slice(0, 10),
              fair_value: 0,
              valuation_basis: "Write-off",
              source_description: health_status_note ?? "Marked as written off",
              implied_valuation: 0,
              marked_by: "Manual (health status update)",
              notes: health_status_note ?? null,
            });
            await supabase.from("investments").update({
              current_fair_value: 0,
              fair_value_date: new Date().toISOString().slice(0, 10),
              valuation_basis: "Write-off",
            }).eq("id", match.id);
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // GET /api/yc-deals/:dealName/lp-breakdown — LP breakdown for a single YC deal
  app.get("/api/yc-deals/:dealName/lp-breakdown", async (req, res) => {
    try {
      const dealName = decodeURIComponent(req.params.dealName);

      // Step 1: fetch holdings for this deal
      const { data: holdings, error: hErr } = await supabase
        .from("yc_holdings")
        .select("investor_id, investment_amount_usd, currency, moic")
        .eq("deal_name", dealName);
      if (hErr) return res.status(500).json({ error: hErr.message });

      // Deduplicate by investor_id
      const seen = new Set<string>();
      const deduped = (holdings ?? []).filter((h: any) => {
        if (seen.has(h.investor_id)) return false;
        seen.add(h.investor_id);
        return true;
      });

      // Step 2: fetch investor names in one query
      const investorIds = Array.from(seen);
      const { data: investors, error: iErr } = await supabase
        .from("investors")
        .select("id, full_name, email, investor_type")
        .in("id", investorIds);
      if (iErr) return res.status(500).json({ error: iErr.message });

      const investorMap = new Map((investors ?? []).map((i: any) => [i.id, i]));

      const lps = deduped
        .map((h: any) => ({
          investor_id:           h.investor_id,
          full_name:             investorMap.get(h.investor_id)?.full_name ?? "Unknown",
          email:                 investorMap.get(h.investor_id)?.email ?? null,
          investor_type:         investorMap.get(h.investor_id)?.investor_type ?? null,
          investment_amount_usd: Number(h.investment_amount_usd) || 0,
          currency:              h.currency ?? "USD",
          moic:                  Number(h.moic) || 1,
        }))
        .sort((a: any, b: any) => b.investment_amount_usd - a.investment_amount_usd);

      const total_usd = lps.reduce((s: number, r: any) => s + r.investment_amount_usd, 0);
      res.json({ deal_name: dealName, lp_count: lps.length, total_usd, lps });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  // GET /api/yc-deals — read from Supabase yc_deals table (seeded from Airtable)
  app.get("/api/yc-deals", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("yc_deals")
        .select("*")
        .order("batch", { ascending: true })
        .order("name", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ deals: data ?? [], total: (data ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Unknown error" });
    }
  });

  return httpServer;
}
// force redeploy 20260527161643
// redeploy 20260528T093300
// redeploy 20260530T060604
// redeploy 20260530T060719

