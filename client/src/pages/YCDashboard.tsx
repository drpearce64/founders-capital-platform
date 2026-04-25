import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import {
  TrendingUp, DollarSign, Building2, Filter, ExternalLink,
  BarChart3, Layers, Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface YCDeal {
  id: string;
  name: string;
  status: string;
  stage: string;
  batch: string;
  instrument: string;
  currency: string;
  fc_investment: number;
  usd_investment_value: number;
  total_funds_committed: number;
  moic: number;
  live_market_value_usd: number | null;
  portfolio_appreciation: number | null;
  closing_date: string;
  quarter: string;
  year: string;
  description: string;
  url: string;
  deal_code: string;
  business_type: string;
  location: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return "$" + fmt(n, decimals);
}

function fmtMoic(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toFixed(2) + "x";
}

const BATCH_ORDER = ["W25", "S25", "X25", "F25", "W26", "S26"];

function sortBatch(a: string, b: string): number {
  const ai = BATCH_ORDER.indexOf(a);
  const bi = BATCH_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

// Batch label mapping
function batchLabel(b: string): string {
  const map: Record<string, string> = {
    W25: "Winter 2025", S25: "Summer 2025", X25: "Fall 2025",
    F25: "Fall 2025",   W26: "Winter 2026", S26: "Summer 2026",
  };
  return map[b] ?? b;
}

// Batch colour chip
function BatchBadge({ batch }: { batch: string }) {
  const colours: Record<string, string> = {
    W25: "bg-blue-100 text-blue-800",
    S25: "bg-green-100 text-green-800",
    X25: "bg-orange-100 text-orange-800",
    F25: "bg-orange-100 text-orange-800",
    W26: "bg-purple-100 text-purple-800",
    S26: "bg-teal-100 text-teal-800",
  };
  const cls = colours[batch] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${cls}`}>
      {batch}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    Closed:  "bg-emerald-100 text-emerald-800",
    Open:    "bg-amber-100 text-amber-800",
    Exited:  "bg-red-100 text-red-800",
  };
  const cls = colours[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-2"
      style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
        <Icon size={16} style={{ color: "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="text-xl font-semibold font-mono" style={{ color: "hsl(var(--foreground))" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function YCDashboard() {
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof YCDeal>("batch");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isLoading, error } = useQuery<{ deals: YCDeal[]; total: number }>({
    queryKey: ["/api/yc-deals"],
    queryFn: () => apiRequest("GET", "/api/yc-deals").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const deals = data?.deals ?? [];

  // Unique batches
  const batches = useMemo(() => {
    const b = [...new Set(deals.map((d) => d.batch).filter(Boolean))];
    return b.sort(sortBatch);
  }, [deals]);

  // Filtered + sorted deals
  const filtered = useMemo(() => {
    let d = batchFilter === "all" ? deals : deals.filter((x) => x.batch === batchFilter);
    d = [...d].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return d;
  }, [deals, batchFilter, sortField, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const src = batchFilter === "all" ? deals : filtered;
    const totalFCDeployed = src.reduce((s, d) => s + (d.fc_investment ?? 0), 0);
    const totalSPVSize    = src.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0);
    const totalLiveValue  = src.reduce((s, d) => s + (d.live_market_value_usd ?? d.usd_investment_value ?? 0), 0);
    const portfolioMoic   = totalSPVSize > 0 ? totalLiveValue / totalSPVSize : 1;
    const companies       = src.length;
    const batchCount      = new Set(src.map((d) => d.batch).filter(Boolean)).size;

    return { totalFCDeployed, totalSPVSize, totalLiveValue, portfolioMoic, companies, batchCount };
  }, [deals, filtered, batchFilter]);

  function toggleSort(field: keyof YCDeal) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: keyof YCDeal }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 flex items-center justify-center h-full">
          <div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Loading YC portfolio from Airtable…
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load YC deals: {String(error)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div
          className="px-8 py-5 border-b flex-shrink-0"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                YC Portfolio
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                {deals.length} investments across {batches.length} batches · Live data from Airtable
              </p>
            </div>
            {/* Batch filter */}
            <div className="flex items-center gap-2">
              <Filter size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
              <div className="flex gap-1">
                <button
                  onClick={() => setBatchFilter("all")}
                  data-testid="filter-batch-all"
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    batchFilter === "all"
                      ? "text-white"
                      : "border"
                  }`}
                  style={
                    batchFilter === "all"
                      ? { background: "hsl(var(--primary))" }
                      : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  All
                </button>
                {batches.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBatchFilter(b)}
                    data-testid={`filter-batch-${b}`}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors ${
                      batchFilter === b ? "text-white" : "border"
                    }`}
                    style={
                      batchFilter === b
                        ? { background: "hsl(var(--primary))" }
                        : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={Building2}
              label="Companies"
              value={String(kpis.companies)}
              sub={`${kpis.batchCount} batch${kpis.batchCount !== 1 ? "es" : ""}`}
            />
            <KpiCard
              icon={DollarSign}
              label="FC Deployed"
              value={fmtUsd(kpis.totalFCDeployed)}
              sub="FC's own capital"
            />
            <KpiCard
              icon={Layers}
              label="Total SPV Size"
              value={fmtUsd(kpis.totalSPVSize)}
              sub="All investor capital"
            />
            <KpiCard
              icon={TrendingUp}
              label="Portfolio MOIC"
              value={fmtMoic(kpis.portfolioMoic)}
              sub="Live / cost"
            />
          </div>

          {/* Batch breakdown */}
          {batchFilter === "all" && (
            <div className="rounded-xl border p-5" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: "hsl(var(--foreground))" }}>
                By Batch
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {batches.map((b) => {
                  const batchDeals = deals.filter((d) => d.batch === b);
                  const spvSize = batchDeals.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0);
                  const fcDep   = batchDeals.reduce((s, d) => s + (d.fc_investment ?? 0), 0);
                  return (
                    <button
                      key={b}
                      onClick={() => setBatchFilter(b)}
                      data-testid={`batch-card-${b}`}
                      className="text-left rounded-lg border p-3 hover:border-blue-300 transition-colors"
                      style={{ borderColor: "hsl(var(--border))" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <BatchBadge batch={b} />
                        <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {batchDeals.length}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {batchLabel(b)}
                      </div>
                      <div className="mt-1 text-xs font-mono" style={{ color: "hsl(var(--foreground))" }}>
                        SPV: {fmtUsd(spvSize)}
                      </div>
                      {fcDep > 0 && (
                        <div className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                          FC: {fmtUsd(fcDep)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio Table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <div
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                Portfolio Companies
              </span>
              <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                {filtered.length} {batchFilter !== "all" ? `· ${batchFilter}` : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-xs"
                    style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                  >
                    {(
                      [
                        { label: "Company", field: "name" as keyof YCDeal, align: "left" },
                        { label: "Batch",   field: "batch" as keyof YCDeal, align: "left" },
                        { label: "Stage",   field: "stage" as keyof YCDeal, align: "left" },
                        { label: "Instrument", field: "instrument" as keyof YCDeal, align: "left" },
                        { label: "FC Investment", field: "fc_investment" as keyof YCDeal, align: "right" },
                        { label: "SPV Total",     field: "usd_investment_value" as keyof YCDeal, align: "right" },
                        { label: "MOIC",  field: "moic" as keyof YCDeal, align: "right" },
                        { label: "Status", field: "status" as keyof YCDeal, align: "left" },
                        { label: "Closed", field: "closing_date" as keyof YCDeal, align: "left" },
                      ] as const
                    ).map(({ label, field, align }) => (
                      <th
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={`px-4 py-3 font-medium cursor-pointer hover:opacity-70 select-none text-${align}`}
                      >
                        {label}
                        <SortIcon field={field} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((deal, i) => (
                    <tr
                      key={deal.id}
                      data-testid={`row-deal-${deal.id}`}
                      className="border-b hover:opacity-80 transition-opacity"
                      style={{
                        borderColor: "hsl(var(--border))",
                        background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted) / 0.3)",
                      }}
                    >
                      {/* Company */}
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-xs" style={{ color: "hsl(var(--foreground))" }}>
                            {deal.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}
                          </div>
                          {deal.description && (
                            <div
                              className="text-xs mt-0.5 max-w-xs truncate"
                              style={{ color: "hsl(var(--muted-foreground))" }}
                              title={deal.description}
                            >
                              {deal.description}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Batch */}
                      <td className="px-4 py-3">
                        {deal.batch ? <BatchBadge batch={deal.batch} /> : "—"}
                      </td>
                      {/* Stage */}
                      <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.stage || "—"}
                      </td>
                      {/* Instrument */}
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.instrument || "—"}
                      </td>
                      {/* FC Investment */}
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "hsl(var(--foreground))" }}>
                        {deal.fc_investment > 0 ? fmtUsd(deal.fc_investment) : "—"}
                      </td>
                      {/* SPV Total */}
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmtUsd(deal.usd_investment_value)}
                      </td>
                      {/* MOIC */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <span
                          className={
                            (deal.moic ?? 1) > 1.5
                              ? "text-emerald-600"
                              : (deal.moic ?? 1) < 1
                              ? "text-red-600"
                              : ""
                          }
                          style={(deal.moic ?? 1) >= 1 && (deal.moic ?? 1) <= 1.5 ? { color: "hsl(var(--foreground))" } : {}}
                        >
                          {fmtMoic(deal.moic)}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={deal.status} />
                      </td>
                      {/* Closing date */}
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.closing_date ? deal.closing_date.slice(0, 10) : deal.quarter || "—"}
                      </td>
                      {/* Link */}
                      <td className="px-4 py-3">
                        {deal.url ? (
                          <a
                            href={deal.url}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`link-deal-${deal.id}`}
                            className="inline-flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                            style={{ color: "hsl(var(--primary))" }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        No deals found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Footer totals */}
                {filtered.length > 0 && (
                  <tfoot>
                    <tr
                      className="border-t font-semibold text-xs"
                      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}
                    >
                      <td className="px-4 py-3" style={{ color: "hsl(var(--foreground))" }}>
                        Total ({filtered.length})
                      </td>
                      <td colSpan={3} />
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "hsl(var(--foreground))" }}>
                        {fmtUsd(filtered.reduce((s, d) => s + (d.fc_investment ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmtUsd(filtered.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
