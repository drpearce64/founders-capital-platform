import type { Express } from "express";
import { type Server } from "http";
import supabase from "./supabase";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Entities (SPVs) ────────────────────────────────────────────────────────

  app.get("/api/entities", async (_req, res) => {
    const { data, error } = await supabase
      .from("entities")
      .select("*, investments(company_name, deal_code, status)")
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
    res.json(data);
  });

  app.patch("/api/capital-calls/:id", async (req, res) => {
    const { data, error } = await supabase
      .from("capital_calls")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Capital Call Items ─────────────────────────────────────────────────────

  app.get("/api/capital-call-items/:callId", async (req, res) => {
    const { data, error } = await supabase
      .from("capital_call_items")
      .select("*, investors(full_name, email), investor_commitments(committed_amount)")
      .eq("capital_call_id", req.params.callId)
      .order("call_amount", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/capital-call-items/:id", async (req, res) => {
    const { data, error } = await supabase
      .from("capital_call_items")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Dashboard Summary ──────────────────────────────────────────────────────

  app.get("/api/dashboard", async (_req, res) => {
    const [entitiesRes, commitmentsRes, investmentsRes, callsRes] = await Promise.all([
      supabase.from("entities").select("*, investments(company_name, deal_code, status)").is("archived_at", null),
      supabase.from("investor_commitments").select("committed_amount, called_amount, status, entity_id").is("archived_at", null),
      supabase.from("investments").select("cost_basis, current_fair_value, company_name, entity_id, status").is("archived_at", null),
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
    const uniqueLPs = new Set(commitments.map(c => c.entity_id)).size; // proxy

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
