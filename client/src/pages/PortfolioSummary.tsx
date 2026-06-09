/**
 * Portfolio Summary — Executive GP Overview
 * Fund-level performance metrics, allocation breakdown, health status,
 * valuation hygiene, and recent activity. No per-position detail table —
 * that lives on each jurisdiction dashboard.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  TrendingUp, DollarSign, BarChart3, AlertTriangle,
  Activity, CheckCircle2, XCircle, Clock, ArrowUpRight,
  Zap, PieChart,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const BG     = "#F5F3EF";
const TEXT   = "#1A1209";
const MUTED  = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";
const ACCENT = "#3B5BDB";
const GREEN  = "#0CA678";
const RED    = "#FA5252";
const AMBER  = "#E67700";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function daysSince(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function isStale(fv_date: string | null | undefined, cost: number): boolean {
  if (!fv_date) return cost > 0;
  const d = daysSince(fv_date);
  return d !== null && d > 90;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon: Icon, accent = ACCENT, note,
}: {
  label: string; value: string; sub?: string; icon: any; accent?: string; note?: string;
}) {
  return (
    <div className="rounded-xl p-5 border bg-white" style={{ borderColor: BORDER }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: accent + "18" }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono tracking-tight" style={{ color: TEXT }}>{value}</p>
      {sub && <p className="text-xs mt-1.5 font-medium" style={{ color: accent }}>{sub}</p>}
      {note && <p className="text-xs mt-1" style={{ color: MUTED, fontStyle: "italic" }}>{note}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: MUTED }}>
      {children}
    </h2>
  );
}

// ── Allocation donut (pure CSS arc) — replaced with bar chart for reliability
function AllocationBar({ items }: {
  items: { label: string; value: number; color: string; pct: number }[];
}) {
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
              <span className="text-sm" style={{ color: TEXT }}>{item.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono" style={{ color: MUTED }}>{fmt(item.value, true)}</span>
              <span className="text-xs font-semibold font-mono w-10 text-right" style={{ color: TEXT }}>
                {item.pct.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${item.pct}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PortfolioSummary() {
  const [, navigate] = useLocation();

  // ── Fetch all investments ─────────────────────────────────────────────────
  const { data: allInvestments = [], isLoading: invLoading } = useQuery<any[]>({
    queryKey: ["/api/investments", "portfolio-summary"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  // ── Fetch YC deals ────────────────────────────────────────────────────────
  const { data: ycData, isLoading: ycLoading } = useQuery<any>({
    queryKey: ["/api/yc-deals"],
    queryFn: () => apiRequest("GET", "/api/yc-deals").then(r => r.json()),
  });

  const loading = invLoading || ycLoading;

  // ── Computed data ─────────────────────────────────────────────────────────
  const {
    // Fund-level metrics
    totalDeployed, totalFV, totalExitProceeds, totalDistributions,
    tvpi, dpi, rvpi, grossMOIC,
    // Allocation
    delawareCost, ycCost, otherCost,
    delawareFV, ycFV, otherFV,
    // Top positions
    topPositions,
    // Health
    activeCount, atRiskCount, writtenOffCount, exitedCount,
    activeValue, atRiskValue, writtenOffValue, exitedValue,
    // Valuation hygiene
    totalPositions, markedCount, staleCount, atCostCount,
    oldestMark, newestMark,
    // Follow-on activity
    followOnDeals, followOnRaisedTotal,
    // Recent additions (last 90d)
    recentInvestments,
    // Deployment by vintage
    vintageData,
  } = useMemo(() => {
    const deals: any[] = ycData?.deals ?? [];

    // Deduplicate YC by name, prefer highest fc_investment
    const ycSeen = new Map<string, any>();
    for (const d of deals) {
      const key = (d.name ?? "").toLowerCase();
      const existing = ycSeen.get(key);
      if (!existing || (d.fc_investment ?? 0) > (existing.fc_investment ?? 0)) ycSeen.set(key, d);
    }
    const ycDeals = Array.from(ycSeen.values());

    // Split investments
    const delawareInvs = allInvestments.filter((i: any) =>
      i.entities?.short_code?.startsWith("FC-VECTOR") && !(i.company_name ?? "").includes("(YC ")
    );
    const otherInvs = allInvestments.filter((i: any) => {
      const sc = i.entities?.short_code ?? "";
      if (sc.startsWith("FC-CAYMAN")) return false;
      if (sc.startsWith("FC-VECTOR")) return false;
      if ((i.company_name ?? "").includes("(YC ")) return false;
      return true;
    });

    // Map YC deals to investment-like rows
    const ycInvs = ycDeals.map((d: any) => {
      const match = allInvestments.find(
        (i: any) => i.company_name?.toLowerCase() === d.name?.toLowerCase()
      );
      return {
        id: match?.id ?? d.id,
        company_name: d.name,
        _vehicle: `YC ${d.batch ?? ""}`.trim(),
        cost_basis: match?.cost_basis ?? d.usd_investment_value ?? d.fc_investment ?? 0,
        current_fair_value: match?.current_fair_value ?? d.live_market_value_usd ?? d.usd_investment_value ?? d.fc_investment ?? 0,
        fair_value_date: match?.fair_value_date ?? null,
        valuation_basis: match?.valuation_basis ?? null,
        status: d.health_status?.toLowerCase().replace(" ", "_") ?? "active",
        investment_date: match?.investment_date ?? null,
        exit_proceeds: match?.exit_proceeds ?? null,
        _has_followon: d.has_followon ?? false,
        _followon_round: d.followon_round ?? null,
        _followon_amount: d.followon_amount_usd ?? 0,
        _followon_company: d.name,
        entities: match?.entities ?? null,
      };
    });

    const allRows = [...delawareInvs, ...ycInvs, ...otherInvs];

    // ── Totals ──────────────────────────────────────────────────────────────
    const totalDeployed = allRows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0);
    const totalFV       = allRows.reduce((s, r) => s + Number(r.current_fair_value ?? r.cost_basis ?? 0), 0);
    const totalExitProceeds = allRows.reduce((s, r) => s + Number(r.exit_proceeds ?? 0), 0);
    // distributions = exit_proceeds for now (no separate distribution table populated)
    const totalDistributions = totalExitProceeds;

    // Fund-level multiples
    const tvpi  = totalDeployed > 0 ? (totalFV + totalDistributions) / totalDeployed : 1;
    const dpi   = totalDeployed > 0 ? totalDistributions / totalDeployed : 0;
    const rvpi  = totalDeployed > 0 ? totalFV / totalDeployed : 1;
    const grossMOIC = totalDeployed > 0 ? totalFV / totalDeployed : 1;

    // ── Allocation by vehicle ───────────────────────────────────────────────
    const sum = (rows: any[]) => ({
      cost: rows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0),
      fv:   rows.reduce((s, r) => s + Number(r.current_fair_value ?? r.cost_basis ?? 0), 0),
    });
    const dSums = sum(delawareInvs);
    const ySums = sum(ycInvs);
    const oSums = sum(otherInvs);

    // ── Top positions by cost ───────────────────────────────────────────────
    const topPositions = [...allRows]
      .sort((a, b) => Number(b.cost_basis ?? 0) - Number(a.cost_basis ?? 0))
      .slice(0, 8)
      .map(r => ({
        name: r.company_name,
        cost: Number(r.cost_basis ?? 0),
        fv: Number(r.current_fair_value ?? r.cost_basis ?? 0),
        pct: totalDeployed > 0 ? (Number(r.cost_basis ?? 0) / totalDeployed) * 100 : 0,
        vehicle: r._vehicle ?? r.entities?.short_code?.replace("FC-", "") ?? "—",
      }));

    // ── Health status ───────────────────────────────────────────────────────
    const isActive    = (r: any) => !["exited", "written_off", "at_risk"].includes((r.status ?? "").toLowerCase());
    const isAtRisk    = (r: any) => (r.status ?? "").toLowerCase() === "at_risk";
    const isWrittenOff = (r: any) => (r.status ?? "").toLowerCase() === "written_off";
    const isExited    = (r: any) => (r.status ?? "").toLowerCase() === "exited";

    const activeRows     = allRows.filter(isActive);
    const atRiskRows     = allRows.filter(isAtRisk);
    const writtenOffRows = allRows.filter(isWrittenOff);
    const exitedRows     = allRows.filter(isExited);

    const activeCount     = activeRows.length;
    const atRiskCount     = atRiskRows.length;
    const writtenOffCount = writtenOffRows.length;
    const exitedCount     = exitedRows.length;
    const activeValue     = activeRows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0);
    const atRiskValue     = atRiskRows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0);
    const writtenOffValue = writtenOffRows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0);
    const exitedValue     = exitedRows.reduce((s, r) => s + Number(r.cost_basis ?? 0), 0);

    // ── Valuation hygiene ───────────────────────────────────────────────────
    const totalPositions = allRows.length;
    const markedRows     = allRows.filter(r => !!r.fair_value_date);
    const markedCount    = markedRows.length;
    const staleCount     = allRows.filter(r => isStale(r.fair_value_date, Number(r.cost_basis ?? 0))).length;
    const atCostCount    = allRows.filter(r => !r.fair_value_date).length;

    const markDates = markedRows.map(r => r.fair_value_date).filter(Boolean).sort();
    const oldestMark = markDates[0] ?? null;
    const newestMark = markDates[markDates.length - 1] ?? null;

    // ── Follow-on activity (YC) ─────────────────────────────────────────────
    const followOnRows = ycInvs.filter(r => r._has_followon);
    const followOnDeals = followOnRows.map(r => ({
      name: r._followon_company,
      round: r._followon_round,
      amount: r._followon_amount,
    })).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 5);
    const followOnRaisedTotal = followOnRows.reduce((s, r) => s + (r._followon_amount ?? 0), 0);

    // ── Recent investments (last 90d) ───────────────────────────────────────
    const cutoff = Date.now() - 90 * 86_400_000;
    const recentInvestments = allInvestments
      .filter((r: any) => r.investment_date && new Date(r.investment_date).getTime() > cutoff)
      .sort((a: any, b: any) => new Date(b.investment_date).getTime() - new Date(a.investment_date).getTime())
      .slice(0, 5);

    // ── Vintage / deployment by year ────────────────────────────────────────
    const byYear: Record<string, number> = {};
    for (const r of allInvestments) {
      if (!r.investment_date) continue;
      const yr = new Date(r.investment_date).getFullYear().toString();
      byYear[yr] = (byYear[yr] ?? 0) + Number(r.cost_basis ?? 0);
    }
    const vintageData = Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([yr, v]) => ({ year: yr, value: v }));

    return {
      totalDeployed, totalFV, totalExitProceeds, totalDistributions,
      tvpi, dpi, rvpi, grossMOIC,
      delawareCost: dSums.cost, ycCost: ySums.cost, otherCost: oSums.cost,
      delawareFV: dSums.fv, ycFV: ySums.fv, otherFV: oSums.fv,
      topPositions,
      activeCount, atRiskCount, writtenOffCount, exitedCount,
      activeValue, atRiskValue, writtenOffValue, exitedValue,
      totalPositions, markedCount, staleCount, atCostCount,
      oldestMark, newestMark,
      followOnDeals, followOnRaisedTotal,
      recentInvestments,
      vintageData,
    };
  }, [allInvestments, ycData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="text-sm" style={{ color: MUTED }}>Loading portfolio…</div>
      </div>
    );
  }

  const maxVintage = Math.max(...vintageData.map(v => v.value), 1);
  const allocationTotal = delawareCost + ycCost + otherCost;

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
              Portfolio Overview
            </h1>
            <p className="text-sm mt-1" style={{ color: MUTED }}>
              {totalPositions} positions · as at {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          {staleCount > 0 && (
            <button
              onClick={() => navigate("/marks")}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors hover:bg-red-50"
              style={{ borderColor: RED + "40", background: RED + "10", color: RED }}
            >
              <AlertTriangle size={13} />
              {staleCount} stale mark{staleCount !== 1 ? "s" : ""} — update now
            </button>
          )}
        </div>

        {/* ── Section 1: Fund Performance Metrics ────────────────────────── */}
        <div>
          <SectionLabel>Fund Performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard
              label="TVPI"
              value={`${tvpi.toFixed(2)}x`}
              sub="Total Value / Paid-In"
              icon={TrendingUp}
              accent={tvpi >= 1.5 ? GREEN : tvpi >= 1 ? ACCENT : RED}
              note={tvpi === 1.0 ? "At cost — marks pending" : undefined}
            />
            <MetricCard
              label="DPI"
              value={`${dpi.toFixed(2)}x`}
              sub="Distributions / Paid-In"
              icon={DollarSign}
              accent={dpi >= 1 ? GREEN : MUTED}
              note={dpi === 0 ? "No exits recorded yet" : undefined}
            />
            <MetricCard
              label="RVPI"
              value={`${rvpi.toFixed(2)}x`}
              sub="Residual Value / Paid-In"
              icon={BarChart3}
              accent={ACCENT}
            />
            <MetricCard
              label="NAV"
              value={fmt(totalFV, true)}
              sub={`Cost: ${fmt(totalDeployed, true)}`}
              icon={PieChart}
              accent={GREEN}
            />
            <MetricCard
              label="Gross MOIC"
              value={`${grossMOIC.toFixed(2)}x`}
              sub={`${fmt(totalFV, true)} FV on ${fmt(totalDeployed, true)}`}
              icon={Activity}
              accent={grossMOIC >= 2 ? GREEN : grossMOIC >= 1 ? ACCENT : RED}
            />
          </div>

          {/* DPI gap note */}
          {dpi === 0 && (
            <div
              className="mt-3 flex items-start gap-2 px-4 py-3 rounded-lg border text-xs"
              style={{ borderColor: AMBER + "40", background: AMBER + "0D", color: AMBER }}
            >
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>DPI = 0.00x</strong> — no exit proceeds are recorded in the system.
                Groq and any other partial or full distributions should be entered via the
                <strong> exit_proceeds</strong> field on each investment record.
                The Anthropic (Dec 24) disposal is marked <em>Exited</em> but has no exit proceeds value set.
              </span>
            </div>
          )}
        </div>

        {/* ── Section 2: Allocation + Top Positions ─────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Allocation by vehicle */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <SectionLabel>Capital Allocation by Vehicle</SectionLabel>
            <AllocationBar
              items={[
                { label: "Delaware SPVs",  value: delawareCost, color: ACCENT,   pct: allocationTotal > 0 ? (delawareCost / allocationTotal) * 100 : 0 },
                { label: "YC Portfolio",   value: ycCost,       color: GREEN,    pct: allocationTotal > 0 ? (ycCost / allocationTotal) * 100 : 0 },
                { label: "Other",          value: otherCost,    color: "#F59F00", pct: allocationTotal > 0 ? (otherCost / allocationTotal) * 100 : 0 },
              ]}
            />
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center" style={{ borderColor: BORDER }}>
              {[
                { label: "DE SPVs NAV",  value: fmt(delawareFV, true), color: ACCENT },
                { label: "YC NAV",       value: fmt(ycFV, true),       color: GREEN },
                { label: "Other NAV",    value: fmt(otherFV, true),    color: "#F59F00" },
              ].map(k => (
                <div key={k.label}>
                  <p className="text-xs" style={{ color: MUTED }}>{k.label}</p>
                  <p className="text-sm font-semibold font-mono mt-0.5" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top 8 positions */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <SectionLabel>Top Positions by Cost</SectionLabel>
            <div className="space-y-2.5">
              {topPositions.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-4 flex-shrink-0" style={{ color: MUTED }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate" style={{ color: TEXT }}>{p.name}</span>
                      <span className="text-xs font-mono flex-shrink-0 ml-2" style={{ color: MUTED }}>{p.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${p.pct}%`,
                          background: i < 3 ? ACCENT : i < 6 ? GREEN : "#94A3B8",
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono w-14 text-right flex-shrink-0" style={{ color: TEXT }}>
                    {fmt(p.cost, true)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-4 pt-3 border-t" style={{ color: MUTED, borderColor: BORDER }}>
              Top 8 positions represent {totalDeployed > 0 ? ((topPositions.reduce((s, p) => s + p.cost, 0) / totalDeployed) * 100).toFixed(1) : 0}% of total deployed capital.
            </p>
          </div>
        </div>

        {/* ── Section 3: Portfolio Health + Deployment Vintage ─────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Health status */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <SectionLabel>Portfolio Health</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Active",      count: activeCount,     value: activeValue,     color: GREEN,  icon: CheckCircle2 },
                { label: "At Risk",     count: atRiskCount,     value: atRiskValue,     color: AMBER,  icon: AlertTriangle },
                { label: "Written Off", count: writtenOffCount, value: writtenOffValue, color: RED,    icon: XCircle },
                { label: "Exited",      count: exitedCount,     value: exitedValue,     color: ACCENT, icon: ArrowUpRight },
              ].map(h => (
                <div
                  key={h.label}
                  className="rounded-lg p-3 border"
                  style={{ borderColor: h.color + "30", background: h.color + "08" }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <h.icon size={13} style={{ color: h.color }} />
                    <span className="text-xs font-medium" style={{ color: h.color }}>{h.label}</span>
                  </div>
                  <p className="text-2xl font-bold font-mono" style={{ color: TEXT }}>{h.count}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: MUTED }}>{fmt(h.value, true)}</p>
                </div>
              ))}
            </div>
            {exitedCount > 0 && (
              <p className="text-xs mt-3 pt-3 border-t" style={{ color: MUTED, borderColor: BORDER }}>
                {exitedCount} exited position{exitedCount !== 1 ? "s" : ""} — ensure exit_proceeds are recorded to populate DPI.
              </p>
            )}
          </div>

          {/* Deployment vintage */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <SectionLabel>Deployment by Year</SectionLabel>
            {vintageData.length === 0 ? (
              <p className="text-xs" style={{ color: MUTED }}>No investment dates recorded.</p>
            ) : (
              <div className="space-y-3">
                {vintageData.map(v => (
                  <div key={v.year}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: TEXT }}>{v.year}</span>
                      <span className="text-xs font-mono" style={{ color: MUTED }}>{fmt(v.value, true)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(v.value / maxVintage) * 100}%`, background: ACCENT }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: BORDER }}>
              <span className="text-xs" style={{ color: MUTED }}>Total deployed</span>
              <span className="text-sm font-bold font-mono" style={{ color: TEXT }}>{fmt(totalDeployed)}</span>
            </div>
          </div>
        </div>

        {/* ── Section 4: Valuation Hygiene ───────────────────────────────── */}
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
          <SectionLabel>Valuation Hygiene</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Total Positions", value: totalPositions.toString(), color: TEXT,  note: undefined },
              { label: "Marked",          value: markedCount.toString(),    color: GREEN, note: newestMark ? `Latest: ${fmtDate(newestMark)}` : undefined },
              { label: "At Cost",         value: atCostCount.toString(),    color: AMBER, note: "No FMV recorded" },
              { label: "Stale (>90d)",    value: staleCount.toString(),     color: staleCount > 0 ? RED : GREEN, note: staleCount > 0 ? `Oldest: ${fmtDate(oldestMark)}` : "All marks current" },
            ].map(k => (
              <div key={k.label} className="text-center p-3 rounded-lg" style={{ background: "hsl(var(--muted) / 0.3)" }}>
                <p className="text-xs mb-1" style={{ color: MUTED }}>{k.label}</p>
                <p className="text-2xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
                {k.note && <p className="text-xs mt-1" style={{ color: MUTED }}>{k.note}</p>}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: MUTED }}>
              Marks coverage: <strong style={{ color: TEXT }}>{totalPositions > 0 ? ((markedCount / totalPositions) * 100).toFixed(0) : 0}%</strong> of positions have a recorded fair value.
            </p>
            <button
              onClick={() => navigate("/marks")}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-blue-50"
              style={{ borderColor: ACCENT + "40", color: ACCENT }}
            >
              Go to NAV Marks →
            </button>
          </div>
        </div>

        {/* ── Section 5: Follow-on Activity + Recent Investments ──────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* YC follow-on activity */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>YC Follow-on Activity</SectionLabel>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: GREEN + "18", color: GREEN }}>
                {followOnDeals.length} of top 5
              </span>
            </div>
            {followOnDeals.length === 0 ? (
              <p className="text-xs" style={{ color: MUTED }}>No follow-on rounds recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {followOnDeals.map(f => (
                  <div key={f.name} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: BORDER }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: TEXT }}>{f.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: MUTED }}>{f.round ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                      <Zap size={11} style={{ color: GREEN }} />
                      <span className="text-xs font-semibold font-mono" style={{ color: GREEN }}>
                        {fmt(f.amount ?? 0, true)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs mt-3 pt-3 border-t" style={{ color: MUTED, borderColor: BORDER }}>
              {followOnRaisedTotal > 0
                ? `Top 5 rounds raised ${fmt(followOnRaisedTotal, true)} combined.`
                : "Follow-on data updated weekly via the YC health check cron."}
            </p>
          </div>

          {/* Recent new investments */}
          <div className="rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Recent Investments</SectionLabel>
              <span className="text-xs" style={{ color: MUTED }}>Last 90 days</span>
            </div>
            {recentInvestments.length === 0 ? (
              <p className="text-xs" style={{ color: MUTED }}>No new investments in the last 90 days.</p>
            ) : (
              <div className="space-y-3">
                {recentInvestments.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: BORDER }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: TEXT }}>{r.company_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                        {r.entities?.short_code?.replace("FC-", "") ?? "—"} · {fmtDate(r.investment_date)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold font-mono flex-shrink-0 ml-3" style={{ color: ACCENT }}>
                      {fmt(Number(r.cost_basis ?? 0), true)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
