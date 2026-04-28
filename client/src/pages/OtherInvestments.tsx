import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, DollarSign, Briefcase, BarChart3, Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, compact = false) {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const STAGE_COLORS: Record<string, string> = {
  "pre-seed": "#7048E8", seed: "#3B5BDB", "series-a": "#0CA678",
  "series-b": "#F59F00", "series-c": "#FA5252", growth: "#0CA678", other: "#868E96",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── component ─────────────────────────────────────────────────────────────────
export default function OtherInvestments() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cost" | "fv" | "name">("fv");

  // All investments, then filter to non-Vector, non-Cayman, non-YC
  const { data: allInvestments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/investments", "other"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  // Filter: exclude FC-VECTOR-*, FC-CAYMAN-*, and YC-tagged investments
  const investments = useMemo(() => {
    return (allInvestments as any[]).filter(i => {
      const sc = i.entities?.short_code ?? "";
      if (sc.startsWith("FC-VECTOR")) return false;
      if (sc.startsWith("FC-CAYMAN")) return false;
      // Exclude YC deals (company name contains "(YC " pattern)
      if ((i.company_name || "").includes("(YC ")) return false;
      return true;
    });
  }, [allInvestments]);

  // Filtered + searched
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return investments
      .filter(i => !q || i.company_name?.toLowerCase().includes(q) || i.entities?.short_code?.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === "name") return (a.company_name || "").localeCompare(b.company_name || "");
        if (sortBy === "cost") return (parseFloat(b.cost_basis || 0)) - (parseFloat(a.cost_basis || 0));
        const fvA = parseFloat(a.current_fair_value ?? a.cost_basis ?? 0);
        const fvB = parseFloat(b.current_fair_value ?? b.cost_basis ?? 0);
        return fvB - fvA;
      });
  }, [investments, search, sortBy]);

  // KPIs
  const totalCost = investments.reduce((s, i) => s + parseFloat(i.cost_basis || 0), 0);
  const totalFV   = investments.reduce((s, i) => s + parseFloat(i.current_fair_value ?? i.cost_basis ?? 0), 0);
  const unrealised = totalFV - totalCost;
  const moic = totalCost > 0 ? totalFV / totalCost : 0;

  const bg  = "hsl(var(--background))";
  const card = "hsl(var(--card))";
  const border = "hsl(var(--border))";
  const muted = "hsl(var(--muted-foreground))";
  const text  = "hsl(var(--foreground))";

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ background: bg }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌐</span>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: text }}>Other Investments</h1>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full ml-1"
              style={{ background: "hsl(231 70% 54% / 0.12)", color: "hsl(231 70% 65%)" }}
            >
              FC Portfolio
            </span>
          </div>
          <p className="text-sm" style={{ color: muted }}>
            All FC investments outside Delaware Series SPVs, Cayman, and YC programmes
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Cost Deployed",    value: fmt(totalCost, true),    sub: `${filtered.length} positions`,      icon: Briefcase,  accent: "#3B5BDB" },
          { label: "Portfolio FV",     value: fmt(totalFV, true),      sub: `MOIC ${moic.toFixed(2)}x`,          icon: BarChart3,  accent: "#0CA678" },
          { label: "Unrealised G/L",   value: fmt(unrealised, true),   sub: `${unrealised >= 0 ? "+" : ""}${((unrealised / (totalCost || 1)) * 100).toFixed(1)}% on cost`, icon: TrendingUp, accent: unrealised >= 0 ? "#0CA678" : "#FA5252" },
          { label: "Positions",        value: String(investments.length), sub: "active investments",             icon: DollarSign, accent: "#F59F00" },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border p-4" style={{ background: card, borderColor: border }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{label}</span>
              <span className="rounded-lg p-1.5" style={{ background: `${accent}22` }}>
                <Icon size={14} style={{ color: accent }} />
              </span>
            </div>
            <div className="text-xl font-bold font-mono" style={{ color: text }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: muted }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: muted }} />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search investments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["fv", "cost", "name"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: sortBy === s ? "hsl(231 70% 54% / 0.15)" : "transparent",
                color: sortBy === s ? "hsl(231 70% 72%)" : muted,
                border: `1px solid ${sortBy === s ? "hsl(231 70% 54% / 0.3)" : "transparent"}`,
              }}
            >
              {s === "fv" ? "Fair Value" : s === "cost" ? "Cost" : "A–Z"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: muted }}>{filtered.length} results</span>
      </div>

      {/* Investment table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: card, borderColor: border }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: muted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: muted }}>No investments found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${border}` }}>
                {["Company", "Series", "Stage", "Instrument", "Cost Basis", "Fair Value", "MOIC"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv: any, idx) => {
                const cost  = parseFloat(inv.cost_basis || 0);
                const fv    = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
                const moicI = cost > 0 ? fv / cost : 1;
                const gain  = fv - cost;
                const stageColor = STAGE_COLORS[inv.stage] || "#868E96";
                const sc = inv.entities?.short_code ?? "—";

                return (
                  <tr
                    key={inv.id || idx}
                    style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${border}` : "none" }}
                  >
                    {/* Company */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: `${stageColor}22`, color: stageColor }}
                        >
                          {initials(inv.company_name || "?")}
                        </div>
                        <span className="font-medium" style={{ color: text }}>{inv.company_name}</span>
                      </div>
                    </td>
                    {/* Series/entity code */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "hsl(0 0% 100% / 0.06)", color: muted }}>
                        {sc}
                      </span>
                    </td>
                    {/* Stage */}
                    <td className="px-4 py-3">
                      {inv.stage ? (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: `${stageColor}22`, color: stageColor }}
                        >
                          {inv.stage}
                        </span>
                      ) : <span style={{ color: muted }}>—</span>}
                    </td>
                    {/* Instrument */}
                    <td className="px-4 py-3 text-xs" style={{ color: muted }}>
                      {inv.instrument_type?.replace(/_/g, " ") || "—"}
                    </td>
                    {/* Cost */}
                    <td className="px-4 py-3 font-mono text-sm" style={{ color: text }}>
                      {fmt(cost)}
                    </td>
                    {/* FV */}
                    <td className="px-4 py-3 font-mono text-sm" style={{ color: text }}>
                      {fmt(fv)}
                      {gain !== 0 && (
                        <span className="ml-2 text-xs" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                          {gain >= 0 ? "+" : ""}{fmt(gain, true)}
                        </span>
                      )}
                    </td>
                    {/* MOIC */}
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-sm font-semibold"
                        style={{ color: moicI >= 1 ? "#0CA678" : "#FA5252" }}
                      >
                        {moicI.toFixed(2)}x
                      </span>
                    </td>
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
