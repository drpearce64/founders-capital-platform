import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Plus, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
}

export default function NAVMarks() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [selectedSpv, setSelectedSpv] = useState<string>("");
  const [form, setForm] = useState({
    entity_id: "",
    mark_date: new Date().toISOString().split("T")[0],
    fair_value: "",
    cost_basis: "",
    valuation_notes: "",
  });

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: marks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/nav-marks"],
    queryFn: () => apiRequest("GET", "/api/nav-marks").then(r => r.json()),
  });

  const { data: navPerLP = [] } = useQuery<any[]>({
    queryKey: ["/api/nav-marks/nav-per-lp", selectedSpv],
    queryFn: () => selectedSpv
      ? apiRequest("GET", `/api/nav-marks/nav-per-lp?entity_id=${selectedSpv}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedSpv,
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  const addMark = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/nav-marks", body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/nav-marks"] });
      toast({ title: "Fair value mark recorded" });
      setShowForm(false);
      setForm({ entity_id: "", mark_date: new Date().toISOString().split("T")[0], fair_value: "", cost_basis: "", valuation_notes: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Check for stale marks (>90 days)
  const today = new Date();
  const staleSpvs = spvs.filter((spv: any) => {
    const latestMark = marks.find((m: any) => m.entity_id === spv.id);
    if (!latestMark) return true;
    const daysSince = (today.getTime() - new Date(latestMark.mark_date).getTime()) / 86400000;
    return daysSince > 90;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Fair Value / NAV</h1>
            <p className="text-sm text-gray-500">Quarterly marks and NAV per LP across all Vectors</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Record Mark
        </button>
      </div>

      {/* Stale mark warnings */}
      {staleSpvs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Stale valuations</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {staleSpvs.map((s: any) => {
                const code = s.short_code?.replace("FC-", "") || s.name;
                const inv = s.investments?.[0]?.company_name;
                return inv ? `${code} — ${inv}` : code;
              }).join(", ")} {staleSpvs.length === 1 ? "has" : "have"} no mark in the last 90 days.
            </p>
          </div>
        </div>
      )}

      {/* Add Mark Form */}
      {showForm && (
        <div className="bg-white border border-emerald-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Record Quarterly Mark</h2>
          <form
            onSubmit={e => {
              e.preventDefault();
              addMark.mutate({ ...form, fair_value: parseFloat(form.fair_value), cost_basis: form.cost_basis ? parseFloat(form.cost_basis) : undefined });
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vector (SPV) *</label>
              <select
                value={form.entity_id}
                onChange={e => setForm({ ...form, entity_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              >
                <option value="">Select Vector…</option>
                {spvs.map((spv: any) => {
                  const label = spv.short_code?.replace("FC-", "") || spv.name;
                  const inv = spv.investments?.[0]?.company_name;
                  return <option key={spv.id} value={spv.id}>{label}{inv ? ` — ${inv}` : ""}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mark Date *</label>
              <input
                type="date"
                value={form.mark_date}
                onChange={e => setForm({ ...form, mark_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fair Value (total SPV) *</label>
              <input
                type="number"
                value={form.fair_value}
                onChange={e => setForm({ ...form, fair_value: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost Basis (if updating)</label>
              <input
                type="number"
                value={form.cost_basis}
                onChange={e => setForm({ ...form, cost_basis: e.target.value })}
                placeholder="Leave blank to use committed amount"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Valuation Notes</label>
              <input
                type="text"
                value={form.valuation_notes}
                onChange={e => setForm({ ...form, valuation_notes: e.target.value })}
                placeholder="e.g. Based on Series B round at $300M pre-money, Q1 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={addMark.isPending} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {addMark.isPending ? "Saving…" : "Record Mark"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NAV Per LP */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">NAV Per LP</h2>
          <select
            value={selectedSpv}
            onChange={e => setSelectedSpv(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Select Vector…</option>
            {spvs.map((spv: any) => {
              const label = spv.short_code?.replace("FC-", "") || spv.name;
              const inv = spv.investments?.[0]?.company_name;
              return <option key={spv.id} value={spv.id}>{label}{inv ? ` — ${inv}` : ""}</option>;
            })}
          </select>
        </div>

        {!selectedSpv ? (
          <div className="p-8 text-center text-gray-400 text-sm">Select a Vector to view per-LP NAV</div>
        ) : navPerLP.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No mark recorded for this Vector yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">LP</th>
                <th className="px-4 py-3 text-right">Committed</th>
                <th className="px-4 py-3 text-right">Ownership %</th>
                <th className="px-4 py-3 text-right">Cost Basis</th>
                <th className="px-4 py-3 text-right">Fair Value (NAV)</th>
                <th className="px-4 py-3 text-right">Unrealised G/L</th>
                <th className="px-4 py-3 text-right">Multiple</th>
              </tr>
            </thead>
            <tbody>
              {navPerLP.map((row: any) => {
                const gl = Number(row.nav) - Number(row.cost_basis);
                const glPct = Number(row.cost_basis) > 0 ? (gl / Number(row.cost_basis)) * 100 : 0;
                const multiple = Number(row.cost_basis) > 0 ? Number(row.nav) / Number(row.cost_basis) : null;
                return (
                  <tr key={row.investor_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.investor_name}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(Number(row.committed_amount))}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(row.ownership_pct).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(Number(row.cost_basis))}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">{fmt(Number(row.nav))}</td>
                    <td className={`px-4 py-3 text-right font-mono text-sm ${gl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmt(gl)} <span className="text-xs">({fmtPct(glPct)})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {multiple ? `${multiple.toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mark History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Mark History</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : marks.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No marks recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Mark Date</th>
                <th className="px-4 py-3 text-left">Vector</th>
                <th className="px-4 py-3 text-right">Fair Value</th>
                <th className="px-4 py-3 text-right">Cost Basis</th>
                <th className="px-4 py-3 text-right">Unrealised G/L</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m: any) => {
                const gl = Number(m.fair_value) - Number(m.cost_basis || 0);
                return (
                  <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{m.mark_date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{m.entities?.short_code?.replace("FC-", "") || "—"}</div>
                      {m.entities?.investments?.[0]?.company_name && (
                        <div className="text-xs text-blue-600">{m.entities.investments[0].company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">{fmt(Number(m.fair_value))}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{m.cost_basis ? fmt(Number(m.cost_basis)) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-mono ${gl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.cost_basis ? fmt(gl) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.valuation_notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
