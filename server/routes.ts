import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import supabase from "./supabase";

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
    const [entitiesRes, commitmentsRes, investmentsRes, callsRes] = await Promise.all([
      supabase.from("entities").select("*, investments(company_name, status)").is("archived_at", null),
      supabase.from("investor_commitments").select("committed_amount, called_amount, status, entity_id").is("archived_at", null),
      supabase.from("investments").select("cost_basis, current_fair_value, company_name, entity_id, status, entities(short_code)").is("archived_at", null),
      supabase.from("capital_calls").select("total_call_amount, status, entity_id"),
    ]);

    if (entitiesRes.error) return res.status(500).json({ error: entitiesRes.error.message });

    const spvs = (entitiesRes.data || []).filter(e => e.entity_type === 'series_spv');
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

  return httpServer;
}
