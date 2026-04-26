import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronDown, ChevronRight, Search, Download, Users, Building2, TrendingUp, Globe } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Holding {
  deal_name: string;
  vehicle: "YC" | "Delaware";
  yc_batch: string | null;
  closing_date: string | null;
  entity_short_code: string | null;
  investment_amount_usd?: number | null;
  moic?: number | null;
  currency?: string | null;
}

interface InvestorRow {
  source: "yc" | "delaware";
  id: string;
  name: string;
  email: string | null;
  location: string | null;
  kyc_status: string | null;
  total_investments_usd: number;
  num_investments: number;
  value_of_portfolio: number;
  vehicles: string[];
  yc_deal_count?: number;
  delaware_deal_count?: number;
  holdings: Holding[];
}

interface RegisterData {
  yc: InvestorRow[];
  delaware: InvestorRow[];
  summary: {
    total_yc_investors: number;
    total_delaware_investors: number;
    total_yc_holdings: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function VehicleBadge({ label }: { label: string }) {
  const isYC = label === "YC";
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        background: isYC ? "hsl(231 70% 54% / 0.18)" : "hsl(142 60% 40% / 0.18)",
        color: isYC ? "hsl(231 70% 72%)" : "hsl(142 60% 60%)",
        border: `1px solid ${isYC ? "hsl(231 70% 54% / 0.3)" : "hsl(142 60% 40% / 0.3)"}`,
      }}
    >
      {label}
    </span>
  );
}

function KYCBadge({ status }: { status: string | null }) {
  const s = status?.toLowerCase() ?? "";
  const isOk = s === "completed" || s === "approved";
  const isPending = s === "pending";
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        background: isOk ? "hsl(142 60% 40% / 0.15)" : isPending ? "hsl(38 90% 55% / 0.15)" : "hsl(0 0% 100% / 0.06)",
        color: isOk ? "hsl(142 60% 58%)" : isPending ? "hsl(38 90% 65%)" : "hsl(0 0% 50%)",
      }}
    >
      {isOk ? "✓" : isPending ? "⏳" : "–"} {status ?? "Unknown"}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InvestorRegister() {
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "yc" | "delaware" | "both">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "total" | "holdings">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isLoading, error } = useQuery<RegisterData>({
    queryKey: ["/api/investor-register"],
    queryFn: () => apiRequest("GET", "/api/investor-register").then(r => r.json()),
  });

  // ── Merge & deduplicate by email ──────────────────────────────────────────
  const mergedInvestors = useMemo(() => {
    if (!data) return [];
    const byEmail = new Map<string, InvestorRow & { _ids: string[] }>();

    // YC investors first (they have the richer profile — total_investments covers all)
    for (const inv of data.yc) {
      const key = inv.email?.toLowerCase() ?? `yc-${inv.id}`;
      byEmail.set(key, { ...inv, _ids: [inv.id] });
    }

    // Delaware investors — if already in map (via email match) merge holdings, else add new
    for (const inv of data.delaware) {
      const key = inv.email?.toLowerCase() ?? `del-${inv.id}`;
      if (byEmail.has(key)) {
        const existing = byEmail.get(key)!;
        // Add Delaware holdings that aren't already listed
        const existingNames = new Set(existing.holdings.map(h => h.deal_name));
        const newHoldings = inv.holdings.filter(h => !existingNames.has(h.deal_name));
        existing.holdings = [...existing.holdings, ...newHoldings];
        if (!existing.vehicles.includes("Delaware")) existing.vehicles.push("Delaware");
        existing._ids.push(inv.id);
      } else {
        byEmail.set(key, { ...inv, _ids: [inv.id] });
      }
    }

    return Array.from(byEmail.values());
  }, [data]);

  // ── Filters + sort ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = mergedInvestors;

    if (vehicleFilter === "yc") rows = rows.filter(r => r.vehicles.includes("YC") && !r.vehicles.includes("Delaware"));
    else if (vehicleFilter === "delaware") rows = rows.filter(r => r.vehicles.includes("Delaware") && !r.vehicles.includes("YC"));
    else if (vehicleFilter === "both") rows = rows.filter(r => r.vehicles.includes("YC") && r.vehicles.includes("Delaware"));

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.location ?? "").toLowerCase().includes(q) ||
        r.holdings.some(h => h.deal_name.toLowerCase().includes(q))
      );
    }

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "total") cmp = a.total_investments_usd - b.total_investments_usd;
      else cmp = a.holdings.length - b.holdings.length;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [mergedInvestors, search, vehicleFilter, sortBy, sortDir]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort(col: "name" | "total" | "holdings") {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  }

  // ── KPI summaries ────────────────────────────────────────────────────────
  const totalUSD = mergedInvestors.reduce((s, i) => s + i.total_investments_usd, 0);
  const ycOnly = mergedInvestors.filter(i => i.vehicles.includes("YC") && !i.vehicles.includes("Delaware")).length;
  const delOnly = mergedInvestors.filter(i => i.vehicles.includes("Delaware") && !i.vehicles.includes("YC")).length;
  const bothCount = mergedInvestors.filter(i => i.vehicles.includes("YC") && i.vehicles.includes("Delaware")).length;

  // ── CSV export ───────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [["Name", "Email", "Location", "KYC Status", "Vehicles", "Total Invested (USD)", "# Holdings", "Holdings"]];
    for (const inv of filtered) {
      rows.push([
        inv.name,
        inv.email ?? "",
        inv.location ?? "",
        inv.kyc_status ?? "",
        inv.vehicles.join(" + "),
        inv.total_investments_usd.toFixed(2),
        String(inv.holdings.length),
        inv.holdings.map(h => `${h.deal_name}${h.yc_batch ? ` [${h.yc_batch}]` : ""}`).join("; "),
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fc-investor-register.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg" style={{ background: "hsl(0 0% 100% / 0.06)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center" style={{ color: "hsl(0 65% 60%)" }}>
        Failed to load investor register. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-screen-2xl mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
          Investor Register
        </h1>
        <p className="text-sm" style={{ color: "hsl(0 0% 50%)" }}>
          Unified internal view across all FC investment vehicles — YC and Delaware SPVs
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Investors", value: mergedInvestors.length.toString(), icon: Users, sub: "across all vehicles" },
          { label: "Total Deployed", value: fmt(totalUSD), icon: TrendingUp, sub: "USD committed" },
          { label: "YC Only", value: ycOnly.toString(), icon: Building2, sub: `+ ${bothCount} cross-vehicle` },
          { label: "Delaware Only", value: delOnly.toString(), icon: Globe, sub: `+ ${bothCount} cross-vehicle` },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="rounded-xl p-4 border"
            style={{ background: "hsl(0 0% 100% / 0.04)", borderColor: "hsl(0 0% 100% / 0.08)" }}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(0 0% 45%)" }}>
                {kpi.label}
              </span>
              <kpi.icon size={14} style={{ color: "hsl(231 70% 65%)" }} />
            </div>
            <div className="text-xl font-semibold font-mono" style={{ color: "hsl(var(--foreground))" }}>
              {kpi.value}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "hsl(0 0% 40%)" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(0 0% 40%)" }} />
          <input
            type="text"
            placeholder="Search by name, email, location, or holding…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "hsl(0 0% 100% / 0.06)",
              border: "1px solid hsl(0 0% 100% / 0.1)",
              color: "hsl(var(--foreground))",
            }}
            data-testid="input-search"
          />
        </div>

        {/* Vehicle filter */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "hsl(0 0% 100% / 0.1)" }}>
          {(["all", "yc", "delaware", "both"] as const).map(f => (
            <button
              key={f}
              onClick={() => setVehicleFilter(f)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: vehicleFilter === f ? "hsl(231 70% 54% / 0.22)" : "hsl(0 0% 100% / 0.04)",
                color: vehicleFilter === f ? "hsl(231 70% 76%)" : "hsl(0 0% 50%)",
                borderRight: f !== "both" ? "1px solid hsl(0 0% 100% / 0.1)" : "none",
              }}
              data-testid={`filter-${f}`}
            >
              {f === "all" ? "All" : f === "yc" ? "YC Only" : f === "delaware" ? "Delaware Only" : "Both"}
            </button>
          ))}
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
          style={{
            background: "hsl(0 0% 100% / 0.04)",
            borderColor: "hsl(0 0% 100% / 0.1)",
            color: "hsl(0 0% 60%)",
          }}
          data-testid="button-export"
        >
          <Download size={13} />
          Export CSV
        </button>

        <span className="text-xs ml-auto" style={{ color: "hsl(0 0% 40%)" }}>
          {filtered.length} investor{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(0 0% 100% / 0.08)" }}>
        {/* Header */}
        <div
          className="grid text-xs font-semibold uppercase tracking-wider px-4 py-3 border-b"
          style={{
            gridTemplateColumns: "28px 2fr 1.5fr 1fr 0.8fr 1fr 1fr 80px",
            background: "hsl(0 0% 100% / 0.04)",
            borderColor: "hsl(0 0% 100% / 0.08)",
            color: "hsl(0 0% 45%)",
          }}
        >
          <div />
          <button className="text-left hover:opacity-80 flex items-center gap-1" onClick={() => toggleSort("name")}>
            Investor {sortBy === "name" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <div>Email</div>
          <div>Location</div>
          <div>KYC</div>
          <div>Vehicle(s)</div>
          <button className="text-right hover:opacity-80" onClick={() => toggleSort("total")}>
            Invested {sortBy === "total" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <button className="text-right hover:opacity-80" onClick={() => toggleSort("holdings")}>
            Holdings {sortBy === "holdings" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "hsl(0 0% 40%)" }}>
            No investors match your filters.
          </div>
        ) : (
          filtered.map((inv, idx) => {
            const rowKey = inv.email ?? inv.id;
            const expanded = expandedIds.has(rowKey);
            const isEven = idx % 2 === 0;

            return (
              <div key={rowKey}>
                {/* Main row */}
                <div
                  className="grid items-center px-4 py-3 cursor-pointer transition-colors border-b hover:brightness-110"
                  style={{
                    gridTemplateColumns: "28px 2fr 1.5fr 1fr 0.8fr 1fr 1fr 80px",
                    background: isEven ? "hsl(0 0% 100% / 0.02)" : "transparent",
                    borderColor: "hsl(0 0% 100% / 0.06)",
                  }}
                  onClick={() => toggleExpand(rowKey)}
                  data-testid={`row-investor-${idx}`}
                >
                  {/* Expand chevron */}
                  <div style={{ color: "hsl(0 0% 40%)" }}>
                    {inv.holdings.length > 0 ? (
                      expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : null}
                  </div>

                  {/* Name */}
                  <div>
                    <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {inv.name}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="text-xs truncate" style={{ color: "hsl(0 0% 50%)" }}>
                    {inv.email ?? "—"}
                  </div>

                  {/* Location */}
                  <div className="text-xs" style={{ color: "hsl(0 0% 50%)" }}>
                    {inv.location ? inv.location.split(",")[0].trim() : "—"}
                  </div>

                  {/* KYC */}
                  <div>
                    <KYCBadge status={inv.kyc_status} />
                  </div>

                  {/* Vehicles */}
                  <div className="flex flex-wrap gap-1">
                    {inv.vehicles.map(v => <VehicleBadge key={v} label={v} />)}
                  </div>

                  {/* Total invested */}
                  <div className="text-sm font-mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                    {fmt(inv.total_investments_usd)}
                  </div>

                  {/* Holdings count */}
                  <div className="text-sm font-mono text-right" style={{ color: "hsl(0 0% 55%)" }}>
                    {inv.holdings.length}
                  </div>
                </div>

                {/* Expanded holdings */}
                {expanded && inv.holdings.length > 0 && (
                  <div
                    className="border-b"
                    style={{
                      background: "hsl(231 70% 10% / 0.15)",
                      borderColor: "hsl(0 0% 100% / 0.06)",
                    }}
                  >
                    {/* Holdings sub-header */}
                    <div
                      className="grid text-xs font-semibold uppercase tracking-wider px-10 py-2 border-b"
                      style={{
                        gridTemplateColumns: "2fr 0.7fr 0.7fr 1fr 1fr 0.7fr",
                        borderColor: "hsl(0 0% 100% / 0.06)",
                        color: "hsl(0 0% 35%)",
                      }}
                    >
                      <div>Holding</div>
                      <div>Vehicle</div>
                      <div>Batch</div>
                      <div className="text-right">FC Investment</div>
                      <div>Closing Date</div>
                      <div className="text-right">MOIC</div>
                    </div>

                    {/* Holdings rows */}
                    {inv.holdings.map((h, hi) => (
                      <div
                        key={hi}
                        className="grid items-center px-10 py-2 text-xs border-b last:border-b-0"
                        style={{
                          gridTemplateColumns: "2fr 0.7fr 0.7fr 1fr 1fr 0.7fr",
                          borderColor: "hsl(0 0% 100% / 0.04)",
                          color: "hsl(0 0% 60%)",
                        }}
                        data-testid={`holding-${idx}-${hi}`}
                      >
                        <div className="font-medium" style={{ color: "hsl(0 0% 78%)" }}>
                          {h.deal_name}
                          {h.entity_short_code && (
                            <span className="ml-2 text-xs" style={{ color: "hsl(0 0% 40%)" }}>
                              [{h.entity_short_code}]
                            </span>
                          )}
                        </div>
                        <div><VehicleBadge label={h.vehicle} /></div>
                        <div>{h.yc_batch ?? "—"}</div>
                        <div className="font-mono text-right" style={{ color: "hsl(0 0% 70%)" }}>
                          {h.investment_amount_usd != null ? fmt(h.investment_amount_usd) : "—"}
                        </div>
                        <div>{h.closing_date ? new Date(h.closing_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</div>
                        <div className="font-mono text-right" style={{
                          color: h.moic != null && h.moic > 1 ? "hsl(142 60% 58%)" : "hsl(0 0% 55%)"
                        }}>
                          {h.moic != null ? `${h.moic.toFixed(2)}x` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
