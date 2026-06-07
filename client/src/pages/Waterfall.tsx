import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtUSD } from "@/lib/utils";
import { TrendingUp, Calculator, Zap, Save, Info } from "lucide-react";

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors";
const STYLE = { background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" };
const LABEL = "block text-xs font-medium mb-1.5";

export default function Waterfall() {
  const { toast } = useToast();
  const [form, setForm] = useState({ entity_id: "", total_proceeds: "", carry_rate: "0.20" });
  const [result, setResult] = useState<any>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // All series SPVs
  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });
  const spvs = entities.filter((e: any) => e.entity_type === "series_spv" && e.short_code?.startsWith("FC-VECTOR"));

  // Live investments data for auto-populate
  const { data: investments = [] } = useQuery<any[]>({
    queryKey: ["/api/investments"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  // Use waterfall-v2 for richer output (includes expense deductions)
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/waterfall-v2", {
      entity_id: form.entity_id,
      total_proceeds: parseFloat(form.total_proceeds),
      carry_rate: parseFloat(form.carry_rate),
    }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      setResult(data);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Save snapshot to distribution_notices via waterfall-v2
  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/distribution-notices/generate", {
      entity_id: form.entity_id,
      total_proceeds: parseFloat(form.total_proceeds),
      carry_rate: parseFloat(form.carry_rate),
    }).then(r => r.json()),
    onSuccess: () => toast({ title: "Snapshot saved", description: "Distribution notices recorded in the database." }),
    onError: (e: any) => toast({ title: "Error saving snapshot", description: e.message, variant: "destructive" }),
  });

  const selectedSpv = spvs.find((e: any) => e.id === form.entity_id);
  const inv = selectedSpv?.investments?.[0]?.company_name;

  // Auto-populate: find fair value for selected SPV from investments table
  const autoPopulate = () => {
    if (!form.entity_id) {
      toast({ title: "Select a SPV first", variant: "destructive" });
      return;
    }
    const spvInvestment = investments.find((i: any) => i.entity_id === form.entity_id);
    if (!spvInvestment) {
      toast({ title: "No investment data found for this SPV", description: "Check the investments table in Supabase.", variant: "destructive" });
      return;
    }
    const fv = spvInvestment.current_fair_value ?? spvInvestment.cost_basis ?? 0;
    setForm(f => ({ ...f, total_proceeds: String(fv) }));
    setAutoLoaded(true);
    setResult(null);
    toast({
      title: "Proceeds auto-populated",
      description: `Using current fair value of ${fmtUSD(fv)} for ${spvInvestment.company_name}`,
    });
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Waterfall Calculator
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Model carry and LP distributions for any exit scenario. Series expenses are automatically deducted from proceeds.
        </p>
      </div>

      {/* Input card */}
      <div className="rounded-xl border p-6 mb-6" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Series SPV *</label>
            <select required className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none" style={STYLE}
              value={form.entity_id} onChange={e => { setForm(f => ({ ...f, entity_id: e.target.value })); setResult(null); setAutoLoaded(false); }}>
              <option value="">Select SPV…</option>
              {spvs.map((e: any) => {
                const inv = e.investments?.[0]?.company_name;
                return <option key={e.id} value={e.id}>{e.short_code}{inv ? ` — ${inv}` : ""}</option>;
              })}
            </select>
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>
              Total Proceeds (USD) *
              {autoLoaded && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" }}>
                  live NAV
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input type="number" min="0" className={INPUT_CLASS} style={STYLE}
                placeholder="e.g. 850000"
                value={form.total_proceeds} onChange={e => { setForm(f => ({ ...f, total_proceeds: e.target.value })); setResult(null); setAutoLoaded(false); }} />
              <button
                type="button"
                onClick={autoPopulate}
                title="Auto-populate from current fair value"
                className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
                <Zap size={12} /> Live NAV
              </button>
            </div>
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Carry Rate</label>
            <select className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none" style={STYLE}
              value={form.carry_rate} onChange={e => { setForm(f => ({ ...f, carry_rate: e.target.value })); setResult(null); }}>
              <option value="0.20">20% (standard)</option>
              <option value="0.15">15%</option>
              <option value="0.10">10%</option>
              <option value="0.00">0% (no carry)</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.entity_id || !form.total_proceeds || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
              opacity: (!form.entity_id || !form.total_proceeds) ? 0.5 : 1 }}>
            <Calculator size={15} />
            {mutation.isPending ? "Calculating…" : "Calculate Waterfall"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Summary */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} style={{ color: "hsl(var(--primary))" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Waterfall Summary — {selectedSpv?.short_code}{inv ? ` · ${inv}` : ""}
                </span>
              </div>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                <Save size={12} />
                {saveMutation.isPending ? "Saving…" : "Save Snapshot"}
              </button>
            </div>

            {/* Expense deduction banner */}
            {result.total_expenses > 0 && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg mb-4 text-xs"
                style={{ background: "hsl(38 92% 52% / 0.08)", border: "1px solid hsl(38 92% 52% / 0.2)", color: "hsl(var(--muted-foreground))" }}>
                <Info size={13} style={{ color: "hsl(38 92% 60%)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <span style={{ color: "hsl(var(--foreground))" }}>Series expenses deducted: </span>
                  <span className="mono font-semibold" style={{ color: "hsl(38 92% 60%)" }}>{fmtUSD(result.total_expenses)}</span>
                  {result.expenses_detail?.length > 0 && (
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      {" "}({result.expenses_detail.map((e: any) => `${e.vendor} ${fmtUSD(e.amount)}`).join(", ")})
                    </span>
                  )}
                  <span style={{ color: "hsl(var(--foreground))" }}> · Net proceeds: </span>
                  <span className="mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(result.net_proceeds)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Gross Proceeds", value: fmtUSD(result.total_proceeds), accent: false },
                { label: "Net After Expenses", value: fmtUSD(result.net_proceeds), accent: false },
                { label: `GP Carry (${(result.carry_rate * 100).toFixed(0)}%)`, value: fmtUSD(result.gp_carry), accent: true },
                { label: "Net to LPs", value: fmtUSD(result.net_to_lps), accent: true },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 border"
                  style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
                  <div className="text-lg font-semibold mono"
                    style={{ color: s.accent ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {result.profit > 0 && (
              <div className="mt-3 px-4 py-2.5 rounded-lg text-xs" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                Profit above cost basis: <span className="mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(result.profit)}</span>
                {" · "}Carry rate: <span className="font-semibold">{(result.carry_rate * 100).toFixed(0)}%</span>
                {" · "}{result.lp_count} LP{result.lp_count !== 1 ? "s" : ""}
                {" · "}Return of capital: <span className="mono font-semibold">{fmtUSD(result.return_of_capital)}</span>
              </div>
            )}
          </div>

          {/* LP breakdown */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
              Per-LP Distribution
            </h3>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))" }}>
                    {["LP", "Called Capital", "Ownership", "Return of Capital", "Expense Share", "Carry Withheld", "Net Distribution", "Multiple"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.lp_items.map((lp: any, i: number) => (
                    <tr key={lp.investor_id}
                      style={{ borderTop: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                        {lp.investor_name}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                        {fmtUSD(lp.called_amount ?? lp.committed_amount)}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {lp.ownership_pct?.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                        {fmtUSD(lp.return_of_capital)}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(38 92% 60%)" }}>
                        {lp.expense_share > 0 ? fmtUSD(lp.expense_share) : "—"}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(0 72% 55%)" }}>
                        {lp.carry_withheld > 0 ? fmtUSD(lp.carry_withheld) : "—"}
                      </td>
                      <td className="px-4 py-2.5 mono text-right font-semibold" style={{ color: "hsl(var(--primary))" }}>
                        {fmtUSD(lp.net_distribution)}
                      </td>
                      <td className="px-4 py-2.5 mono text-right">
                        {lp.multiple !== null ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={lp.multiple >= 1
                              ? { background: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" }
                              : { background: "hsl(0 72% 55% / 0.15)", color: "hsl(0 72% 60%)" }}>
                            {lp.multiple}×
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
