import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, AlertTriangle, ChevronDown, ChevronRight,
  DollarSign, BarChart3, Clock, CheckCircle2, ExternalLink,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

// ── formatters ─────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtM(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt(n);
}
function fmtMoic(m: number | null | undefined) {
  if (m == null) return "—";
  return `${m.toFixed(2)}x`;
}

const VECTOR_LABEL: Record<string, string> = {
  "FC-VECTOR-I":   "Vector I",
  "FC-VECTOR-II":  "Vector II",
  "FC-VECTOR-III": "Vector III",
  "FC-VECTOR-IV":  "Vector IV",
  "FC-VECTOR-V":   "Vector V",
};

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = "emerald" }: {
  label: string; value: string; sub?: string;
  icon: any; color?: "emerald" | "blue" | "amber" | "slate";
}) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue:    "bg-blue-50 text-blue-600",
    amber:   "bg-amber-50 text-amber-600",
    slate:   "bg-slate-100 text-slate-500",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-semibold text-gray-900 font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── YC batch group rows ──────────────────────────────────────────────────────
function YCBatchSection({ batch, deals }: { batch: string; deals: any[] }) {
  const [open, setOpen] = useState(false);
  const totalCost = deals.reduce((s, d) => s + (Number(d.usd_investment_value) || 0), 0);
  const totalFV   = deals.reduce((s, d) => s + (Number(d.live_market_value_usd) || 0), 0);

  return (
    <>
      <tr
        className="border-t border-gray-100 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 font-medium text-gray-700 text-sm" colSpan={2}>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            <span>YC {batch}</span>
            <span className="text-xs text-gray-400 font-normal">{deals.length} companies</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-xs text-gray-400">—</td>
        <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">{fmtM(totalCost)}</td>
        <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">
          <span title="At cost — real marks not yet recorded">{fmtM(totalFV)}</span>
        </td>
        <td className="px-4 py-3 text-right text-gray-400 text-sm">1.00x</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">At Cost</Badge>
        </td>
        <td className="px-4 py-3"></td>
      </tr>
      {open && deals.map((d: any) => {
        const cost = Number(d.usd_investment_value) || 0;
        const fv   = Number(d.live_market_value_usd) || 0;
        const m    = cost > 0 ? fv / cost : null;
        return (
          <tr key={d.id} className="border-t border-gray-100 bg-white hover:bg-gray-50">
            <td className="px-4 py-2.5 pl-10 text-sm text-gray-700">{d.name}</td>
            <td className="px-4 py-2.5 text-xs text-gray-400">YC {d.batch}</td>
            <td className="px-4 py-2.5 text-xs text-gray-400">{d.closing_date ? d.closing_date.slice(0, 7) : "—"}</td>
            <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-600">{fmtM(cost || null)}</td>
            <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-600">
              <span className="text-gray-400 italic">{fmtM(fv || null)}</span>
            </td>
            <td className="px-4 py-2.5 text-right text-gray-400 text-sm">{fmtMoic(m)}</td>
            <td className="px-4 py-2.5">
              {d.has_followon && (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                  {d.followon_round ?? "Follow-on"}
                </Badge>
              )}
            </td>
            <td className="px-4 py-2.5"></td>
          </tr>
        );
      })}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function NAVMarks() {
  const qc = useQueryClient();
  const [selectedSpv, setSelectedSpv] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"portfolio" | "marks" | "nav-per-lp">("portfolio");

  // Portfolio data (new endpoint)
  const { data: portfolio, isLoading: portLoading } = useQuery<any>({
    queryKey: ["/api/nav-marks/portfolio"],
    queryFn: () => apiRequest("GET", "/api/nav-marks/portfolio").then(r => r.json()),
  });

  // Mark history (existing endpoint)
  const { data: marks = [], isLoading: marksLoading } = useQuery<any[]>({
    queryKey: ["/api/nav-marks"],
    queryFn: () => apiRequest("GET", "/api/nav-marks").then(r => r.json()),
  });

  // Entities for SPV select
  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  // NAV per LP
  const { data: navPerLP = [] } = useQuery<any[]>({
    queryKey: ["/api/nav-marks/nav-per-lp", selectedSpv],
    queryFn: () => selectedSpv
      ? apiRequest("GET", `/api/nav-marks/nav-per-lp?entity_id=${selectedSpv}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedSpv,
  });

  const spvs = (entities as any[]).filter((e: any) =>
    !e.short_code?.startsWith("FC-CAYMAN") && e.entity_type === "series_spv"
  );



  const delaware = portfolio?.delaware ?? [];
  const yc = portfolio?.yc;
  const summary = portfolio?.summary;

  // YC grouped by batch
  const ycByBatch: Record<string, any[]> = {};
  (yc?.deals ?? []).forEach((d: any) => {
    const b = d.batch ?? "Unknown";
    if (!ycByBatch[b]) ycByBatch[b] = [];
    ycByBatch[b].push(d);
  });
  const ycBatches = Object.keys(ycByBatch).sort().reverse();

  // Stale SPV check
  const today = new Date();
  const staleSpvs = delaware.filter((i: any) => {
    if (!i.fair_value_date) return !!i.cost_basis;
    const days = (today.getTime() - new Date(i.fair_value_date).getTime()) / 86400000;
    return days > 90;
  });

  const tabs = [
    { id: "portfolio",   label: "Portfolio" },
    { id: "marks",       label: "Mark History" },
    { id: "nav-per-lp",  label: "NAV Per LP" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">NAV / Fair Value</h1>
            <p className="text-sm text-gray-500">Delaware SPV portfolio · valuations at cost until marks recorded</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-[#3B5BDB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#3451c7] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Record Mark
        </button>
      </div>

      {/* ── Stale mark warning ───────────────────────────────────────── */}
      {staleSpvs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Stale valuations</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {staleSpvs.map((i: any) => {
                const vec = VECTOR_LABEL[i.short_code] ?? i.short_code;
                return i.company_name ? `${vec} — ${i.company_name}` : vec;
              }).join(", ")}{" "}
              {staleSpvs.length === 1 ? "has" : "have"} no mark in the last 90 days.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Cost"
          value={fmtM(summary?.total_cost)}
          sub="Delaware + YC"
          icon={DollarSign}
          color="blue"
        />
        <KpiCard
          label="Fair Value"
          value={fmtM(summary?.total_fv)}
          sub="Marks + at-cost YC"
          icon={BarChart3}
          color="emerald"
        />
        <KpiCard
          label="Delaware Positions"
          value={delaware.filter((i: any) => i.company_name).length.toString()}
          sub="Active SPV investments"
          icon={CheckCircle2}
          color="emerald"
        />
        <KpiCard
          label="YC Portfolio"
          value={`${yc?.count ?? "—"} cos.`}
          sub="All marks at cost"
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Record Mark form removed — use Portfolio Summary → Mark button on each position */}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-[#3B5BDB] text-[#3B5BDB]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Portfolio ────────────────────────────────────────────── */}
      {activeTab === "portfolio" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Portfolio Positions</h2>
            <span className="text-xs text-gray-400">YC valuations shown at cost until real marks are recorded</span>
          </div>
          {portLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Company / Vehicle</th>
                  <th className="px-4 py-3 text-left">Batch / Vector</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Cost (USD)</th>
                  <th className="px-4 py-3 text-right">Fair Value (USD)</th>
                  <th className="px-4 py-3 text-right">MOIC</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {/* Delaware investments */}
                {delaware.filter((i: any) => i.company_name).length === 0 && ycBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No investment data yet
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Delaware section header */}
                    {delaware.filter((i: any) => i.company_name).length > 0 && (
                      <tr className="bg-slate-50 border-t border-gray-100">
                        <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          🇺🇸 Delaware SPV Investments
                        </td>
                      </tr>
                    )}
                    {delaware.filter((i: any) => i.company_name).map((i: any) => {
                      const cost = i.cost_basis;
                      const fv   = i.current_fair_value;
                      const moic = fv && cost ? fv / cost : i.moic;
                      const gl   = fv != null && cost != null ? fv - cost : null;
                      const vecLabel = VECTOR_LABEL[i.short_code] ?? i.short_code?.replace("FC-", "") ?? "—";
                      const hasRealMark = fv != null && i.fair_value_date != null;
                      return (
                        <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{i.company_name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{i.instrument_type?.replace(/_/g, " ")}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {vecLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {i.investment_date ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {fmt(cost)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">
                            {fv != null ? fmt(fv) : (
                              <span className="text-amber-500 text-xs">No mark</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {moic != null ? (
                              <span className={`font-mono text-sm font-medium ${moic >= 1 ? "text-emerald-600" : "text-red-500"}`}>
                                {fmtMoic(moic)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {hasRealMark ? (
                              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                                {i.valuation_basis ?? "Marked"}
                              </Badge>
                            ) : cost != null ? (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                At Cost
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                                No data
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {i.fair_value_date ? `Valued ${i.fair_value_date}` : ""}
                          </td>
                        </tr>
                      );
                    })}

                    {/* YC section header */}
                    {ycBatches.length > 0 && (
                      <tr className="bg-slate-50 border-t border-gray-200">
                        <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          🚀 YC Portfolio — {yc?.count ?? 0} companies · All marks at cost
                        </td>
                      </tr>
                    )}
                    {ycBatches.map(batch => (
                      <YCBatchSection key={batch} batch={batch} deals={ycByBatch[batch]} />
                    ))}
                  </>
                )}
              </tbody>

              {/* Totals footer */}
              {summary && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-600">Total Portfolio</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{fmtM(summary.total_cost)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{fmtM(summary.total_fv)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-600">
                      {summary.total_cost > 0 ? `${(summary.total_fv / summary.total_cost).toFixed(2)}x` : "—"}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Mark History ────────────────────────────────────────── */}
      {activeTab === "marks" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Mark History</h2>
            <p className="text-xs text-gray-400 mt-0.5">All recorded fair value marks across Delaware SPVs</p>
          </div>
          {marksLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : marks.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No marks recorded yet</p>
              <p className="text-xs text-gray-400 mt-1">Use "Record Mark" to log quarterly fair value updates</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Mark Date</th>
                  <th className="px-4 py-3 text-left">Vector</th>
                  <th className="px-4 py-3 text-right">Fair Value</th>
                  <th className="px-4 py-3 text-right">Cost Basis</th>
                  <th className="px-4 py-3 text-right">Unrealised G/L</th>
                  <th className="px-4 py-3 text-right">MOIC</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {marks.map((m: any) => {
                  const fv   = Number(m.fair_value);
                  const cost = Number(m.cost_basis || 0);
                  const gl   = cost > 0 ? fv - cost : null;
                  const moic = cost > 0 ? fv / cost : null;
                  const sc   = m.entities?.short_code;
                  const vecLabel = sc ? (VECTOR_LABEL[sc] ?? sc.replace("FC-", "")) : "—";
                  const inv  = m.entities?.investments?.[0]?.company_name;
                  return (
                    <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{m.mark_date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{vecLabel}</div>
                        {inv && <div className="text-xs text-[#3B5BDB]">{inv}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">{fmt(fv)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{cost > 0 ? fmt(cost) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-mono ${gl == null ? "text-gray-400" : gl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {gl != null ? fmt(gl) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtMoic(moic)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{m.valuation_notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: NAV Per LP ──────────────────────────────────────────── */}
      {activeTab === "nav-per-lp" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">NAV Per LP</h2>
              <p className="text-xs text-gray-400 mt-0.5">Apportioned by ownership % from latest mark</p>
            </div>
            <select
              value={selectedSpv}
              onChange={e => setSelectedSpv(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select Vector…</option>
              {spvs.map((spv: any) => {
                const label = VECTOR_LABEL[spv.short_code] ?? spv.short_code?.replace("FC-", "") ?? spv.name;
                const matching = delaware.find((i: any) => i.entity_id === spv.id);
                return (
                  <option key={spv.id} value={spv.id}>
                    {label}{matching?.company_name ? ` — ${matching.company_name}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
          {!selectedSpv ? (
            <div className="p-8 text-center text-gray-400 text-sm">Select a Vector to view per-LP NAV</div>
          ) : navPerLP.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No mark recorded for this Vector yet — record a mark first</div>
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
                  <th className="px-4 py-3 text-right">MOIC</th>
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
                        {fmt(gl)} <span className="text-xs">({(glPct >= 0 ? "+" : "") + glPct.toFixed(1)}%)</span>
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
      )}
    </div>
  );
}
