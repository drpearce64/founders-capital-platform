import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile, fork } from "child_process";
import { promisify } from "util";
import os from "os";
import supabase from "./supabase";

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
      .select("*, investors(full_name, email, investor_type), entities(name, short_code)")
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

  app.get("/api/investments", async (req, res) => {
    const { entity_id } = req.query;
    let query = supabase
      .from("investments")
      .select("*, entities(name, short_code)")
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
    // Delaware-only: exclude Cayman Islands jurisdiction from all aggregates
    const delawareEntityIds = await supabase
      .from("entities")
      .select("id")
      .eq("jurisdiction", "Delaware");
    const delawareIds = (delawareEntityIds.data || []).map((e: any) => e.id);

    const [entitiesRes, commitmentsRes, investmentsRes, callsRes] = await Promise.all([
      supabase.from("entities").select("*, investments(company_name, status)")
        .eq("jurisdiction", "Delaware").is("archived_at", null),
      supabase.from("investor_commitments").select("committed_amount, called_amount, status, entity_id")
        .in("entity_id", delawareIds).is("archived_at", null),
      supabase.from("investments").select("cost_basis, current_fair_value, company_name, entity_id, status, entities(short_code, jurisdiction)")
        .in("entity_id", delawareIds).is("archived_at", null),
      supabase.from("capital_calls").select("total_call_amount, status, entity_id")
        .in("entity_id", delawareIds),
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
      recent_investments: investments.slice(0, 5),
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
      await supabase.from("audit_log").insert({
        table_name:  "airtable_sync",
        record_id:   null,
        action:      "create",
        description: `Airtable sync finished with exit code ${code}`,
        actor:       "system",
        new_values:  { exit_code: code, output: output.slice(-2000) },
      }).catch(() => {});
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

    await supabase.from("audit_log").insert({
      table_name:  "gmail_invoice_sync",
      record_id:   null,
      action:      "create",
      description: `Gmail invoice sync: ${result.synced} synced, ${result.skipped} skipped, ${result.errors?.length ?? 0} errors`,
      actor:       "system",
      new_values:  { result, output: output.slice(-2000) },
    }).catch(() => {}); // non-fatal

    res.json({
      status: "ok",
      synced:  result.synced  ?? 0,
      skipped: result.skipped ?? 0,
      errors:  result.errors  ?? [],
    });
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
      .select("*, entities(short_code, name)")
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

  // PATCH /api/entity-costs/:id — mark paid / update status
  app.patch("/api/entity-costs/:id", async (req, res) => {
    const allowed = [
      "status", "paid_date", "payment_reference", "notes",
      "fx_rate_to_usd", "description", "category",
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
        "FC Investment USD Conversion", "FC Investment PV USD",
        "USD INVESTMENT VALUE", "MOIC",
        "investors per deal", "Pre-money valuation",
        "Business Type", "Location", "Underlying Company Jurisdiction",
        "Direct / Indirect", "Type", "URL", "Company Description",
        "Deal Square Image", "Share class", "Running Return",
        "Portfolio Appreciation ($)",
      ];

      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`);
      url.searchParams.set("maxRecords", "200");
      // Only fetch Closed or Live deals (exclude pipeline junk)
      url.searchParams.set("filterByFormula", `OR({Status}='Closed',{Status}='Live',{Status}='Exited')`);
      fields.forEach(f => url.searchParams.append("fields[]", f));

      const airtableRes = await fetch(url.toString(), {
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
      const records = (json.records ?? []).map((r: any) => {
        const f = r.fields;
        // Flatten FC Investment USD Conversion array -> single number
        const fcInvestedUsd = Array.isArray(f["FC Investment USD Conversion"])
          ? f["FC Investment USD Conversion"].reduce((a: number, b: number) => a + b, 0)
          : (f["FC investment amount"] ?? 0);
        const fcPvUsd = Array.isArray(f["FC Investment PV USD"])
          ? f["FC Investment PV USD"].reduce((a: number, b: number) => a + b, 0)
          : fcInvestedUsd;
        const squareImage = Array.isArray(f["Deal Square Image"]) && f["Deal Square Image"].length > 0
          ? f["Deal Square Image"][0]?.thumbnails?.large?.url ?? f["Deal Square Image"][0]?.url ?? null
          : null;
        return {
          id: r.id,
          name: f["CompanyName"] ?? "Unknown",
          deal_code: f["Deal Code"] ?? "",
          status: f["Status"] ?? "",
          holding_status: f["Holding Status"] ?? "",
          stage: f["Stage"] ?? "",
          closing_date: f["Closing Date"] ?? null,
          quarter_closed: f["Quarter closed"] ?? "",
          investment_currency: f["Investment Currency"] ?? "USD",
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
