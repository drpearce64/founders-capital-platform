import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, ChevronDown, ChevronUp, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtFull(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(called: number, committed: number) {
  if (committed === 0) return null;
  const pct = (called / committed) * 100;
  if (pct >= 100) return { label: "Fully Called", cls: "bg-emerald-100 text-emerald-800" };
  if (pct > 0) return { label: `${pct.toFixed(0)}% Called`, cls: "bg-blue-100 text-blue-800" };
  return { label: "Uncalled", cls: "bg-gray-100 text-gray-600" };
}

function vectorLabel(shortCode: string) {
  return shortCode?.replace("FC-", "") || shortCode;
}

export default function LPPortfolio() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "multi">("all");

  // Fetch all commitments with investor + entity details
  const { data: commitments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/commitments"],
    queryFn: () => apiRequest("GET", "/api/commitments").then(r => r.json()),
  });

  // Group by investor
  const byInvestor = commitments.reduce((acc: Record<string, any>, c: any) => {
    const id = c.investor_id;
    if (!acc[id]) {
      acc[id] = {
        investor_id: id,
        full_name: c.investors?.full_name || "—",
        email: c.investors?.email || "—",
        investor_type: c.investors?.investor_type || "—",
        commitments: [],
        total_committed: 0,
        total_called: 0,
        total_outstanding: 0,
        vectors: [],
      };
    }
    const called = Number(c.called_amount || 0);
    const committed = Number(c.committed_amount || 0);
    acc[id].commitments.push(c);
    acc[id].total_committed += committed;
    acc[id].total_called += called;
    acc[id].total_outstanding += committed - called;
    const label = vectorLabel(c.entities?.short_code);
    if (!acc[id].vectors.includes(label)) acc[id].vectors.push(label);
    return acc;
  }, {});

  let investors = Object.values(byInvestor).sort((a: any, b: any) =>
    b.total_committed - a.total_committed
  );

  // Filter
  if (filter === "multi") investors = investors.filter((i: any) => i.commitments.length > 1);
  if (search) {
    const q = search.toLowerCase();
    investors = investors.filter((i: any) =>
      i.full_name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)
    );
  }

  const multiCount = Object.values(byInvestor).filter((i: any) => i.commitments.length > 1).length;
  const grandCommitted = Object.values(byInvestor).reduce((s: number, i: any) => s + i.total_committed, 0);
  const grandCalled = Object.values(byInvestor).reduce((s: number, i: any) => s + i.total_called, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Layers className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">LP Portfolio</h1>
          <p className="text-sm text-gray-500">Consolidated view of every LP's position across all Vectors</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total LPs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{Object.keys(byInvestor).length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Multi-Vector LPs</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">{multiCount}</p>
          <p className="text-xs text-gray-500 mt-1">invested in 2+ Vectors</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Committed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(grandCommitted)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Called</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(grandCalled)}</p>
          <p className="text-xs text-gray-500 mt-1">{fmt(grandCommitted - grandCalled)} outstanding</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search LP name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 font-medium transition-colors ${filter === "all" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            All LPs
          </button>
          <button
            onClick={() => setFilter("multi")}
            className={`px-4 py-2 font-medium transition-colors border-l border-gray-300 ${filter === "multi" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Multi-Vector ({multiCount})
          </button>
        </div>
      </div>

      {/* LP Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">LP Name</th>
              <th className="px-4 py-3 text-left">Vectors</th>
              <th className="px-4 py-3 text-right">Total Committed</th>
              <th className="px-4 py-3 text-right">Total Called</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : investors.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No LPs found</td></tr>
            ) : investors.map((lp: any) => {
              const isExpanded = expandedId === lp.investor_id;
              const badge = statusBadge(lp.total_called, lp.total_committed);
              const isMulti = lp.commitments.length > 1;

              return (
                <>
                  <tr
                    key={lp.investor_id}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? "bg-violet-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : lp.investor_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{lp.full_name}</div>
                      <div className="text-xs text-gray-500">{lp.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lp.commitments.map((c: any) => {
                          const vLabel = vectorLabel(c.entities?.short_code);
                          const inv = c.entities?.investments?.[0]?.company_name ||
                                      c.entities?.investments?.company_name;
                          return (
                            <div key={c.id} className="group relative">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isMulti ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-700"}`}>
                                {vLabel}
                              </span>
                              {inv && (
                                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                                  {inv}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">
                      {fmtFull(lp.total_committed)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmtFull(lp.total_called)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${lp.total_outstanding > 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {fmtFull(lp.total_outstanding)}
                    </td>
                    <td className="px-4 py-3">
                      {badge && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </td>
                  </tr>

                  {/* Expanded breakdown */}
                  {isExpanded && (
                    <tr key={`${lp.investor_id}-detail`}>
                      <td colSpan={7} className="px-0 py-0">
                        <div className="bg-violet-50 border-t border-violet-100 px-6 py-4">
                          <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide mb-3">
                            {lp.full_name} — Position by Vector
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                            {lp.commitments.map((c: any) => {
                              const committed = Number(c.committed_amount);
                              const called = Number(c.called_amount || 0);
                              const outstanding = committed - called;
                              const pct = committed > 0 ? (called / committed) * 100 : 0;
                              const vLabel = vectorLabel(c.entities?.short_code);
                              const inv = c.entities?.investments?.[0]?.company_name ||
                                          c.entities?.investments?.company_name;
                              const fee = committed * Number(c.fee_rate || 0.06);

                              return (
                                <div key={c.id} className="bg-white rounded-xl border border-violet-200 p-4">
                                  {/* Vector header */}
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <span className="inline-block px-2 py-0.5 bg-violet-100 text-violet-800 text-xs font-bold rounded mb-1">
                                        {vLabel}
                                      </span>
                                      {inv && (
                                        <p className="text-xs text-blue-600 font-medium">{inv}</p>
                                      )}
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      pct >= 100 ? "bg-emerald-100 text-emerald-800"
                                        : pct > 0 ? "bg-blue-100 text-blue-800"
                                        : "bg-gray-100 text-gray-600"
                                    }`}>
                                      {pct >= 100 ? "Fully Called" : pct > 0 ? `${pct.toFixed(0)}% Called` : "Uncalled"}
                                    </span>
                                  </div>

                                  {/* Figures */}
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Committed</span>
                                      <span className="text-xs font-mono font-medium text-gray-900">{fmtFull(committed)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Called</span>
                                      <span className="text-xs font-mono text-gray-700">{fmtFull(called)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Outstanding</span>
                                      <span className={`text-xs font-mono ${outstanding > 0 ? "text-amber-600" : "text-gray-400"}`}>
                                        {fmtFull(outstanding)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-100">
                                      <span className="text-xs text-gray-500">6% Fee</span>
                                      <span className="text-xs font-mono text-gray-500">{fmtFull(fee)}</span>
                                    </div>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-violet-500 rounded-full transition-all"
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Consolidated totals row */}
                          {lp.commitments.length > 1 && (
                            <div className="bg-white rounded-xl border border-violet-300 p-4">
                              <p className="text-xs font-semibold text-gray-700 mb-3">Consolidated Total</p>
                              <div className="grid grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs text-gray-500">Total Committed</p>
                                  <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">{fmtFull(lp.total_committed)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Total Called</p>
                                  <p className="text-sm font-bold text-gray-900 font-mono mt-0.5">{fmtFull(lp.total_called)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Total Outstanding</p>
                                  <p className={`text-sm font-bold font-mono mt-0.5 ${lp.total_outstanding > 0 ? "text-amber-600" : "text-gray-400"}`}>
                                    {fmtFull(lp.total_outstanding)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Total 6% Fee</p>
                                  <p className="text-sm font-bold text-gray-500 font-mono mt-0.5">
                                    {fmtFull(lp.total_committed * 0.06)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        {investors.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {investors.length} LP{investors.length !== 1 ? "s" : ""}</span>
            <span>Click any row to expand Vector breakdown</span>
          </div>
        )}
      </div>
    </div>
  );
}
