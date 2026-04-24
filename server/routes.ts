import type { Express } from "express";
import { type Server } from "http";
import supabase from "./supabase";

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

  return httpServer;
}
