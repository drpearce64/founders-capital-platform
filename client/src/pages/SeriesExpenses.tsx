import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt, Plus, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const COST_TYPES = ["legal", "filing", "bank", "admin", "audit", "other"] as const;

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    legal: "bg-purple-100 text-purple-800",
    filing: "bg-blue-100 text-blue-800",
    bank: "bg-gray-100 text-gray-700",
    admin: "bg-yellow-100 text-yellow-800",
    audit: "bg-orange-100 text-orange-800",
    other: "bg-slate-100 text-slate-700",
  };
  return map[type] || "bg-gray-100 text-gray-700";
}

export default function SeriesExpenses() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    entity_id: "",
    vendor: "",
    cost_type: "legal",
    amount: "",
    paid_date: new Date().toISOString().split("T")[0],
    bank_reference: "",
    notes: "",
  });

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  const { data: expenses = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/series-expenses"],
    queryFn: () => apiRequest("GET", "/api/series-expenses").then(r => r.json()),
  });

  const { data: allocations = [] } = useQuery<any[]>({
    queryKey: ["/api/series-expenses", expandedId, "allocations"],
    queryFn: () => expandedId
      ? apiRequest("GET", `/api/series-expenses/${expandedId}/allocations`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!expandedId,
  });

  const addExpense = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/series-expenses", body).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/series-expenses"] });
      toast({ title: `Expense recorded and apportioned to ${data.allocation_count} LPs` });
      setShowForm(false);
      setForm({ entity_id: "", vendor: "", cost_type: "legal", amount: "", paid_date: new Date().toISOString().split("T")[0], bank_reference: "", notes: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.entity_id || !form.vendor || !form.amount) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    addExpense.mutate({ ...form, amount: parseFloat(form.amount) });
  };

  // Totals by SPV
  const totalsBySpv = expenses.reduce((acc: Record<string, number>, ex: any) => {
    acc[ex.entity_id] = (acc[ex.entity_id] || 0) + Number(ex.amount);
    return acc;
  }, {});

  const grandTotal = expenses.reduce((s: number, ex: any) => s + Number(ex.amount), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
            <Receipt className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Series Expenses</h1>
            <p className="text-sm text-gray-500">Costs directly attributable to a specific Vector — apportioned to LPs pro-rata</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700"
        >
          <Plus className="w-4 h-4" />
          Record Expense
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(grandTotal)}</p>
          <p className="text-xs text-gray-500 mt-1">{expenses.length} entries</p>
        </div>
        {spvs.slice(0, 3).map((spv: any) => {
          const label = spv.short_code?.replace("FC-", "") || spv.name;
          const inv = spv.investments?.[0]?.company_name;
          return (
            <div key={spv.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
              {inv && <p className="text-xs text-blue-600 font-medium">{inv}</p>}
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalsBySpv[spv.id] || 0)}</p>
            </div>
          );
        })}
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div className="bg-white border border-rose-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Record Series Expense</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vector (SPV) *</label>
              <select
                value={form.entity_id}
                onChange={e => setForm({ ...form, entity_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              >
                <option value="">Select Vector…</option>
                {spvs.map((spv: any) => {
                  const label = spv.short_code?.replace("FC-", "") || spv.name;
                  const inv = spv.investments?.[0]?.company_name;
                  return (
                    <option key={spv.id} value={spv.id}>
                      {label}{inv ? ` — ${inv}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cost Type *</label>
              <select
                value={form.cost_type}
                onChange={e => setForm({ ...form, cost_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {COST_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vendor / Payee *</label>
              <input
                type="text"
                value={form.vendor}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                placeholder="e.g. Cooley LLP, HSBC Bank"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount (USD) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Paid *</label>
              <input
                type="date"
                value={form.paid_date}
                onChange={e => setForm({ ...form, paid_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">HSBC Bank Reference</label>
              <input
                type="text"
                value={form.bank_reference}
                onChange={e => setForm({ ...form, bank_reference: e.target.value })}
                placeholder="e.g. TRN-20260424-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Legal fees for Series A closing — Vector III"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="md:col-span-2 bg-rose-50 border border-rose-100 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-700">
                On save, this expense will be automatically apportioned to all LPs in the selected Vector pro-rata by their commitment %. 
                The waterfall calculator will deduct total Series expenses before computing carry.
              </p>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={addExpense.isPending} className="px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">
                {addExpense.isPending ? "Recording…" : "Record & Apportion"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">All Series Expenses</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No expenses recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Vector</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Bank Ref</th>
                <th className="px-4 py-3 text-left">LPs</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((ex: any) => (
                <>
                  <tr key={ex.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{ex.paid_date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{ex.entities?.short_code?.replace("FC-", "") || "—"}</div>
                      {ex.entities?.investments?.[0]?.company_name && (
                        <div className="text-xs text-blue-600">{ex.entities.investments[0].company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{ex.vendor}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(ex.cost_type)}`}>
                        {ex.cost_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">{fmt(Number(ex.amount))}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{ex.bank_reference || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{ex.allocation_count || "—"} LPs</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedId === ex.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === ex.id && (
                    <tr key={`${ex.id}-alloc`} className="bg-rose-50">
                      <td colSpan={8} className="px-6 py-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">LP Allocations — {ex.notes || ex.vendor}</p>
                        {allocations.length === 0 ? (
                          <p className="text-xs text-gray-400">Loading allocations…</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {allocations.map((a: any) => (
                              <div key={a.id} className="bg-white rounded-lg px-3 py-2 border border-rose-100">
                                <p className="text-xs font-medium text-gray-800 truncate">{a.investors?.full_name}</p>
                                <p className="text-xs text-gray-500">{Number(a.allocation_pct).toFixed(2)}% → {fmt(Number(a.allocated_amount))}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-700">Total</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">{fmt(grandTotal)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
