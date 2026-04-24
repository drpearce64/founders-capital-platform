import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtUSD } from "@/lib/utils";
import { TrendingUp, Calculator } from "lucide-react";

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors";
const STYLE = { background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" };
const LABEL = "block text-xs font-medium mb-1.5";

export default function Waterfall() {
  const { toast } = useToast();
  const [form, setForm] = useState({ entity_id: "", total_proceeds: "", carry_rate: "0.20" });
  const [result, setResult] = useState<any>(null);

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });
  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/waterfall", {
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

  const selectedSpv = spvs.find((e: any) => e.id === form.entity_id);
  const inv = selectedSpv?.investments?.[0]?.company_name;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Waterfall Calculator
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Model carry and LP distributions for any exit scenario. Results are not saved until a distribution event is created.
        </p>
      </div>

      {/* Input card */}
      <div className="rounded-xl border p-6 mb-6" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Series SPV *</label>
            <select required className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none" style={STYLE}
              value={form.entity_id} onChange={e => { setForm(f => ({ ...f, entity_id: e.target.value })); setResult(null); }}>
              <option value="">Select SPV…</option>
              {spvs.map((e: any) => {
                const inv = e.investments?.[0]?.company_name;
                return <option key={e.id} value={e.id}>{e.short_code}{inv ? ` — ${inv}` : ""}</option>;
              })}
            </select>
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Total Proceeds (USD) *</label>
            <input type="number" min="0" className={INPUT_CLASS} style={STYLE}
              placeholder="e.g. 850000"
              value={form.total_proceeds} onChange={e => { setForm(f => ({ ...f, total_proceeds: e.target.value })); setResult(null); }} />
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
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                Waterfall Summary — {selectedSpv?.short_code}{inv ? ` · ${inv}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Proceeds", value: fmtUSD(result.total_proceeds), accent: false },
                { label: "Return of Capital", value: fmtUSD(result.return_of_capital), accent: false },
                { label: "GP Carry (20%)", value: fmtUSD(result.gp_carry), accent: true },
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
                {" · "}Carry rate applied: <span className="font-semibold">{(result.carry_rate * 100).toFixed(0)}%</span>
                {" · "}{result.lp_count} LPs
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
                    {["LP", "Called Capital", "Ownership", "Return of Capital", "Carry Withheld", "Net Distribution", "Multiple"].map(h => (
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
                        {fmtUSD(lp.called_amount)}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {lp.ownership_pct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                        {fmtUSD(lp.return_of_capital)}
                      </td>
                      <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(38 92% 60%)" }}>
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
