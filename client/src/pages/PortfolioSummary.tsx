/**
 * Portfolio Summary — 6th dashboard view
 * Unified cost vs fair value across Delaware, YC and Other Investments.
 * Each row has a "Mark" button that opens ValuationMarkModal.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, DollarSign, BarChart3, AlertTriangle,
  ChevronDown, ChevronRight, ExternalLink, Clock, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ValuationMarkModal } from "@/components/ValuationMarkModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BG   = "#F5F3EF";
const TEXT = "#1A1209";
const MUTED = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";
const ACCENT = "#3B5BDB";

function fmtUsd(n: number | null | undefined, compact = false): string {
  const v = Number(n ?? 0);
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
    if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function daysSince(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function isStale(fv_date: string | null | undefined, cost: number | null): boolean {
  if (!fv_date) return !!cost && cost > 0;
  const days = daysSince(fv_date);
  return days !== null && days > 90;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = ACCENT,
  onClick, active = false,
}: {
  label: string; value: string; sub?: string;
  icon: any; accent?: string;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-5 border transition-all"
      style={{
        background: active ? accent + "12" : "#fff",
        borderColor: active ? accent : BORDER,
        borderWidth: active ? 2 : 1,
        cursor: onClick ? "pointer" : "default",
        boxShadow: active ? `0 0 0 3px ${accent}18` : undefined,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent + "18" }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-xl font-semibold font-mono" style={{ color: TEXT }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

// ── Section row ───────────────────────────────────────────────────────────────

function SectionHeader({
  label, count, cost, fv, open, onToggle,
}: {
  label: string; count: number; cost: number; fv: number;
  open: boolean; onToggle: () => void;
}) {
  const gl = fv - cost;
  const moic = cost > 0 ? fv / cost : 1;
  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none"
      style={{ background: "hsl(var(--muted) / 0.4)", borderTop: `2px solid ${BORDER}` }}
    >
      <td className="px-4 py-2.5" colSpan={2}>
        <div className="flex items-center gap-2">
          {open
            ? <ChevronDown size={14} style={{ color: MUTED }} />
            : <ChevronRight size={14} style={{ color: MUTED }} />}
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: TEXT }}>{label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: ACCENT + "18", color: ACCENT }}>
            {count}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold" style={{ color: TEXT }}>
        {fmtUsd(cost, true)}
      </td>
      <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold" style={{ color: TEXT }}>
        {fmtUsd(fv, true)}
      </td>
      <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold"
        style={{ color: gl >= 0 ? "#0CA678" : "#FA5252" }}>
        {gl >= 0 ? "+" : ""}{fmtUsd(gl, true)}
      </td>
      <td className="px-4 py-2.5 text-right text-xs font-mono font-semibold"
        style={{ color: moic >= 1 ? "#0CA678" : "#FA5252" }}>
        {moic.toFixed(2)}x
      </td>
      <td colSpan={4} />
    </tr>
  );
}

// ── Investment row ─────────────────────────────────────────────────────────────

function InvRow({
  inv, onMark,
}: {
  inv: any;
  onMark: (inv: any) => void;
}) {
  const cost    = Number(inv.cost_basis ?? 0);
  const fv      = Number(inv.current_fair_value ?? inv.cost_basis ?? cost);
  const gl      = fv - cost;
  const moic    = cost > 0 ? fv / cost : 1;
  const stale   = isStale(inv.fair_value_date, cost);
  const marked  = !!inv.fair_value_date;
  const basisLabel = inv.valuation_basis ?? (marked ? "Marked" : "At Cost");

  return (
    <tr
      className="group"
      style={{ borderTop: `1px solid ${BORDER}`, background: "hsl(var(--card))" }}
    >
      {/* Company */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: TEXT }}>
              {inv.company_name}
            </p>
            {inv.instrument_type && (
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                {inv.instrument_type.replace(/_/g, " ")}
              </p>
            )}
          </div>
          {inv.company_website && (
            <a
              href={inv.company_website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: ACCENT }}
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </td>

      {/* Vehicle */}
      <td className="px-4 py-3">
        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "hsl(var(--muted))", color: MUTED }}>
          {inv._vehicle ?? inv.entities?.short_code?.replace("FC-", "") ?? "—"}
        </span>
      </td>

      {/* Cost */}
      <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: TEXT }}>
        {fmtUsd(cost)}
      </td>

      {/* Fair Value */}
      <td className="px-4 py-3 text-right font-mono text-sm font-medium" style={{ color: TEXT }}>
        {fmtUsd(fv)}
      </td>

      {/* G/L */}
      <td className="px-4 py-3 text-right font-mono text-sm"
        style={{ color: gl >= 0 ? "#0CA678" : "#FA5252" }}>
        {gl >= 0 ? "+" : ""}{fmtUsd(gl, true)}
      </td>

      {/* MOIC */}
      <td className="px-4 py-3 text-right font-mono text-sm font-semibold"
        style={{ color: moic >= 1 ? "#0CA678" : "#FA5252" }}>
        {moic.toFixed(2)}x
      </td>

      {/* Basis */}
      <td className="px-4 py-3">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{
            background: marked ? "#0CA67818" : "#F59F0018",
            color:      marked ? "#0CA678"    : "#E67700",
          }}
        >
          {basisLabel}
        </span>
      </td>

      {/* As At */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {stale && (
            <AlertTriangle size={11} style={{ color: "#FA5252", flexShrink: 0 }} />
          )}
          <span className="text-xs font-mono" style={{ color: stale ? "#FA5252" : MUTED }}>
            {inv.fair_value_date ? fmtDate(inv.fair_value_date) : "—"}
          </span>
        </div>
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        <button
          onClick={() => onMark(inv)}
          className="text-[10px] px-2 py-0.5 rounded border whitespace-nowrap opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ borderColor: ACCENT, color: ACCENT, background: "transparent" }}
        >
          Mark
        </button>
      </td>
    </tr>
  );
}

// ── Section subtotal row ──────────────────────────────────────────────────────

function SubtotalRow({ cost, fv }: { cost: number; fv: number }) {
  const gl   = fv - cost;
  const moic = cost > 0 ? fv / cost : 1;
  return (
    <tr style={{ background: "hsl(var(--muted) / 0.2)", borderTop: `1px solid ${BORDER}` }}>
      <td className="px-4 py-2 text-xs font-semibold" style={{ color: MUTED }} colSpan={2}>Subtotal</td>
      <td className="px-4 py-2 text-right text-xs font-mono font-semibold" style={{ color: TEXT }}>{fmtUsd(cost)}</td>
      <td className="px-4 py-2 text-right text-xs font-mono font-semibold" style={{ color: TEXT }}>{fmtUsd(fv)}</td>
      <td className="px-4 py-2 text-right text-xs font-mono font-semibold" style={{ color: gl >= 0 ? "#0CA678" : "#FA5252" }}>
        {gl >= 0 ? "+" : ""}{fmtUsd(gl, true)}
      </td>
      <td className="px-4 py-2 text-right text-xs font-mono font-semibold" style={{ color: moic >= 1 ? "#0CA678" : "#FA5252" }}>
        {moic.toFixed(2)}x
      </td>
      <td colSpan={4} />
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterKey = "all" | "stale" | "marked" | "atcost";
type DrillKey = "cost" | "fv" | "gl" | "marks" | null;

export default function PortfolioSummary() {
  const qc = useQueryClient();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    delaware: true, yc: true, other: true,
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [valuationInv, setValuationInv] = useState<any | null>(null);
  const [activeDrill, setActiveDrill] = useState<DrillKey>(null);

  function openDrill(key: DrillKey) {
    setActiveDrill(prev => prev === key ? null : key);
  }

  function toggleSection(key: string) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  // All investments (Delaware + Other)
  const { data: allInvestments = [], isLoading: invLoading } = useQuery<any[]>({
    queryKey: ["/api/investments", "portfolio-summary"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  // YC deals
  const { data: ycData, isLoading: ycLoading } = useQuery<any>({
    queryKey: ["/api/yc-deals"],
    queryFn: () => apiRequest("GET", "/api/yc-deals").then(r => r.json()),
  });

  const loading = invLoading || ycLoading;

  // ── Split investments ──────────────────────────────────────────────────────

  const delawareInvs = useMemo(() =>
    allInvestments.filter((i: any) =>
      i.entities?.short_code?.startsWith("FC-VECTOR") &&
      !(i.company_name ?? "").includes("(YC ")
    ),
    [allInvestments]
  );

  const otherInvs = useMemo(() =>
    allInvestments.filter((i: any) => {
      const sc = i.entities?.short_code ?? "";
      if (sc.startsWith("FC-CAYMAN")) return false;
      if (sc.startsWith("FC-VECTOR")) return false;
      if ((i.company_name ?? "").includes("(YC ")) return false;
      return true;
    }),
    [allInvestments]
  );

  // YC: map yc_deals to investment-like rows, then try to merge with actual investments record
  const ycInvs = useMemo(() => {
    const deals: any[] = ycData?.deals ?? [];
    // Dedup by name — keep the row with the highest fc_investment (real entry over ghost duplicates)
    const seen = new Map<string, any>();
    for (const d of deals) {
      const key = (d.name ?? "").toLowerCase();
      const existing = seen.get(key);
      if (!existing || (d.fc_investment ?? 0) > (existing.fc_investment ?? 0)) {
        seen.set(key, d);
      }
    }
    return Array.from(seen.values()).map((d: any) => {
      // Try to find matching investments row for mark data
      const match = allInvestments.find(
        (i: any) => i.company_name?.toLowerCase() === d.name?.toLowerCase()
      );
      return {
        id: match?.id ?? d.id,
        _yc_deal_id: d.id,
        company_name: d.name,
        company_website: d.url ?? null,
        _vehicle: `YC ${d.batch ?? ""}`.trim(),
        instrument_type: d.instrument ?? null,
        cost_basis: match?.cost_basis ?? d.usd_investment_value ?? d.fc_investment ?? 0,
        current_fair_value: match?.current_fair_value ?? d.live_market_value_usd ?? d.usd_investment_value ?? d.fc_investment ?? 0,
        fair_value_date: match?.fair_value_date ?? null,
        valuation_basis: match?.valuation_basis ?? null,
        entities: match?.entities ?? null,
        _noInvestmentRecord: !match,
        status: d.status,
      };
    });
  }, [ycData, allInvestments]);

  // ── Apply filter ───────────────────────────────────────────────────────────

  function applyFilter(rows: any[]): any[] {
    if (filter === "all")    return rows;
    if (filter === "stale")  return rows.filter(r => isStale(r.fair_value_date, Number(r.cost_basis ?? 0)));
    if (filter === "marked") return rows.filter(r => !!r.fair_value_date);
    if (filter === "atcost") return rows.filter(r => !r.fair_value_date);
    return rows;
  }

  const filteredDelaware = applyFilter(delawareInvs);
  const filteredYC       = applyFilter(ycInvs);
  const filteredOther    = applyFilter(otherInvs);

  // ── Totals ─────────────────────────────────────────────────────────────────

  function totals(rows: any[]) {
    return rows.reduce((acc, r) => {
      acc.cost += Number(r.cost_basis ?? 0);
      acc.fv   += Number(r.current_fair_value ?? r.cost_basis ?? 0);
      return acc;
    }, { cost: 0, fv: 0 });
  }

  const dTotals = totals(delawareInvs);
  const yTotals = totals(ycInvs);
  const oTotals = totals(otherInvs);

  const grandCost = dTotals.cost + yTotals.cost + oTotals.cost;
  const grandFV   = dTotals.fv  + yTotals.fv  + oTotals.fv;
  const grandGL   = grandFV - grandCost;
  const grandMOIC = grandCost > 0 ? grandFV / grandCost : 1;

  const staleCount = [...delawareInvs, ...ycInvs, ...otherInvs]
    .filter(r => isStale(r.fair_value_date, Number(r.cost_basis ?? 0))).length;
  const markedCount = [...delawareInvs, ...ycInvs, ...otherInvs]
    .filter(r => !!r.fair_value_date).length;
  const totalCount = delawareInvs.length + ycInvs.length + otherInvs.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  const TH = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left";

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
              Portfolio Summary
            </h1>
            <p className="text-sm mt-1" style={{ color: MUTED }}>
              All investments at cost and fair value · {totalCount} positions across 3 vehicles
            </p>
          </div>
          {staleCount > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer"
              style={{ borderColor: "#FA525240", background: "#FA525210", color: "#FA5252" }}
              onClick={() => setFilter(f => f === "stale" ? "all" : "stale")}
            >
              <AlertTriangle size={13} />
              {staleCount} stale {staleCount === 1 ? "mark" : "marks"} · click to filter
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Cost"
            value={fmtUsd(grandCost, true)}
            sub={`${totalCount} positions`}
            icon={DollarSign}
            accent={ACCENT}
            onClick={() => openDrill("cost")}
            active={activeDrill === "cost"}
          />
          <KpiCard
            label="Fair Value"
            value={fmtUsd(grandFV, true)}
            sub={`MOIC ${grandMOIC.toFixed(2)}x`}
            icon={BarChart3}
            accent="#0CA678"
            onClick={() => openDrill("fv")}
            active={activeDrill === "fv"}
          />
          <KpiCard
            label="Unrealised G/L"
            value={(grandGL >= 0 ? "+" : "") + fmtUsd(grandGL, true)}
            sub={grandCost > 0 ? `${((grandGL / grandCost) * 100).toFixed(1)}% return` : undefined}
            icon={TrendingUp}
            accent={grandGL >= 0 ? "#0CA678" : "#FA5252"}
            onClick={() => openDrill("gl")}
            active={activeDrill === "gl"}
          />
          <KpiCard
            label="Marks"
            value={`${markedCount} / ${totalCount}`}
            sub={staleCount > 0 ? `${staleCount} stale (90d+)` : "All marks current"}
            icon={Clock}
            accent={staleCount > 0 ? "#FA5252" : "#0CA678"}
            onClick={() => openDrill("marks")}
            active={activeDrill === "marks"}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b pb-0" style={{ borderColor: BORDER }}>
          {([
            { id: "all",    label: "All Positions" },
            { id: "marked", label: "Marked" },
            { id: "atcost", label: "At Cost" },
            { id: "stale",  label: `Stale (${staleCount})` },
          ] as { id: FilterKey; label: string }[]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
              style={{
                borderColor: filter === f.id ? ACCENT : "transparent",
                color:       filter === f.id ? ACCENT  : MUTED,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          {loading ? (
            <div className="p-12 text-center text-sm" style={{ color: MUTED }}>Loading portfolio…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted) / 0.5)", borderBottom: `1px solid ${BORDER}` }}>
                  <th className={TH} style={{ color: MUTED }}>Company</th>
                  <th className={TH} style={{ color: MUTED }}>Vehicle</th>
                  <th className={TH + " text-right"} style={{ color: MUTED }}>Cost (USD)</th>
                  <th className={TH + " text-right"} style={{ color: MUTED }}>Fair Value (USD)</th>
                  <th className={TH + " text-right"} style={{ color: MUTED }}>G / L</th>
                  <th className={TH + " text-right"} style={{ color: MUTED }}>MOIC</th>
                  <th className={TH} style={{ color: MUTED }}>Basis</th>
                  <th className={TH} style={{ color: MUTED }}>As At</th>
                  <th className={TH} style={{ color: MUTED }}></th>
                </tr>
              </thead>
              <tbody>

                {/* ── Delaware ── */}
                <SectionHeader
                  label="🇺🇸 Delaware SPVs"
                  count={filteredDelaware.length}
                  cost={dTotals.cost}
                  fv={dTotals.fv}
                  open={openSections.delaware}
                  onToggle={() => toggleSection("delaware")}
                />
                {openSections.delaware && filteredDelaware.map((inv: any) => (
                  <InvRow key={inv.id} inv={inv} onMark={setValuationInv} />
                ))}
                {openSections.delaware && filteredDelaware.length > 1 && (
                  <SubtotalRow cost={totals(filteredDelaware).cost} fv={totals(filteredDelaware).fv} />
                )}
                {openSections.delaware && filteredDelaware.length === 0 && (
                  <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td colSpan={9} className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>
                      No positions match this filter.
                    </td>
                  </tr>
                )}

                {/* ── YC ── */}
                <SectionHeader
                  label="🇺🇸 YC Portfolio"
                  count={filteredYC.length}
                  cost={yTotals.cost}
                  fv={yTotals.fv}
                  open={openSections.yc}
                  onToggle={() => toggleSection("yc")}
                />
                {openSections.yc && filteredYC.map((inv: any) => (
                  <InvRow key={inv.id ?? inv._yc_deal_id} inv={inv} onMark={setValuationInv} />
                ))}
                {openSections.yc && filteredYC.length > 1 && (
                  <SubtotalRow cost={totals(filteredYC).cost} fv={totals(filteredYC).fv} />
                )}
                {openSections.yc && filteredYC.length === 0 && (
                  <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td colSpan={9} className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>
                      No positions match this filter.
                    </td>
                  </tr>
                )}

                {/* ── Other ── */}
                <SectionHeader
                  label="🌐 Other Investments"
                  count={filteredOther.length}
                  cost={oTotals.cost}
                  fv={oTotals.fv}
                  open={openSections.other}
                  onToggle={() => toggleSection("other")}
                />
                {openSections.other && filteredOther.map((inv: any) => (
                  <InvRow key={inv.id} inv={inv} onMark={setValuationInv} />
                ))}
                {openSections.other && filteredOther.length > 1 && (
                  <SubtotalRow cost={totals(filteredOther).cost} fv={totals(filteredOther).fv} />
                )}
                {openSections.other && filteredOther.length === 0 && (
                  <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td colSpan={9} className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>
                      No positions match this filter.
                    </td>
                  </tr>
                )}

                {/* ── Grand Total ── */}
                <tr style={{ background: "hsl(var(--muted) / 0.6)", borderTop: `2px solid ${BORDER}` }}>
                  <td className="px-4 py-3 text-sm font-bold" style={{ color: TEXT }} colSpan={2}>
                    Grand Total · {totalCount} positions
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-sm" style={{ color: TEXT }}>
                    {fmtUsd(grandCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-sm" style={{ color: TEXT }}>
                    {fmtUsd(grandFV)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-sm"
                    style={{ color: grandGL >= 0 ? "#0CA678" : "#FA5252" }}>
                    {grandGL >= 0 ? "+" : ""}{fmtUsd(grandGL, true)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-sm"
                    style={{ color: grandMOIC >= 1 ? "#0CA678" : "#FA5252" }}>
                    {grandMOIC.toFixed(2)}x
                  </td>
                  <td colSpan={4} />
                </tr>

              </tbody>
            </table>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs" style={{ color: MUTED }}>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#0CA67818", border: "1px solid #0CA678" }} />
            Marked — fair value recorded via valuation mark
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#F59F0018", border: "1px solid #E67700" }} />
            At Cost — no mark yet, FV = entry cost
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={11} style={{ color: "#FA5252" }} />
            Stale — last mark older than 90 days
          </div>
        </div>

      </div>

      {/* Valuation Mark Modal */}
      <ValuationMarkModal
        investment={valuationInv}
        open={!!valuationInv}
        onClose={() => setValuationInv(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/api/investments"] });
          qc.invalidateQueries({ queryKey: ["/api/investments", "portfolio-summary"] });
        }}
      />

      {/* KPI Drill-down Sheets */}
      <PortfolioDrillSheet
        drillKey={activeDrill}
        onClose={() => setActiveDrill(null)}
        allRows={[...delawareInvs, ...ycInvs, ...otherInvs]}
        grandCost={grandCost}
        grandFV={grandFV}
        grandGL={grandGL}
        markedCount={markedCount}
        staleCount={staleCount}
        totalCount={totalCount}
      />
    </div>
  );
}

// ── Portfolio Drill Sheet ──────────────────────────────────────────────────────

function PortfolioDrillSheet({
  drillKey, onClose, allRows,
  grandCost, grandFV, grandGL, markedCount, staleCount, totalCount,
}: {
  drillKey: DrillKey;
  onClose: () => void;
  allRows: any[];
  grandCost: number; grandFV: number; grandGL: number;
  markedCount: number; staleCount: number; totalCount: number;
}) {
  const open = drillKey !== null;

  const config: Record<NonNullable<DrillKey>, {
    title: string; subtitle: string; accent: string;
    rows: any[]; cols: { label: string; getValue: (r: any) => string; right?: boolean; accent?: (r: any) => string }[];
  }> = {
    cost: {
      title: "Total Cost Breakdown",
      subtitle: `${totalCount} positions · sorted by cost`,
      accent: ACCENT,
      rows: [...allRows].sort((a, b) => Number(b.cost_basis ?? 0) - Number(a.cost_basis ?? 0)),
      cols: [
        { label: "Company",  getValue: r => r.company_name ?? "—" },
        { label: "Vehicle",  getValue: r => r._vehicle ?? r.entities?.short_code ?? "—" },
        { label: "Cost",     getValue: r => fmtUsd(Number(r.cost_basis ?? 0)), right: true },
        { label: "% of Total", getValue: r => grandCost > 0 ? ((Number(r.cost_basis ?? 0) / grandCost) * 100).toFixed(1) + "%" : "—", right: true },
      ],
    },
    fv: {
      title: "Fair Value Breakdown",
      subtitle: `MOIC ${grandCost > 0 ? (grandFV / grandCost).toFixed(2) : "1.00"}x across ${totalCount} positions`,
      accent: "#0CA678",
      rows: [...allRows].sort((a, b) => Number(b.current_fair_value ?? 0) - Number(a.current_fair_value ?? 0)),
      cols: [
        { label: "Company",  getValue: r => r.company_name ?? "—" },
        { label: "Vehicle",  getValue: r => r._vehicle ?? r.entities?.short_code ?? "—" },
        { label: "Cost",     getValue: r => fmtUsd(Number(r.cost_basis ?? 0)), right: true },
        { label: "Fair Value", getValue: r => fmtUsd(Number(r.current_fair_value ?? r.cost_basis ?? 0)), right: true },
        { label: "MOIC", getValue: r => {
          const c = Number(r.cost_basis ?? 0);
          const fv = Number(r.current_fair_value ?? c);
          return c > 0 ? (fv / c).toFixed(2) + "x" : "—";
        }, right: true, accent: r => {
          const c = Number(r.cost_basis ?? 0);
          const fv = Number(r.current_fair_value ?? c);
          return c > 0 && fv > c ? "#0CA678" : c > 0 && fv < c ? "#FA5252" : MUTED;
        }},
      ],
    },
    gl: {
      title: "Unrealised G / L",
      subtitle: `${grandGL >= 0 ? "+" : ""}${fmtUsd(grandGL, true)} total · ${grandCost > 0 ? ((grandGL / grandCost) * 100).toFixed(1) : "0"}% return`,
      accent: grandGL >= 0 ? "#0CA678" : "#FA5252",
      rows: [...allRows].sort((a, b) => {
        const glA = Number(a.current_fair_value ?? a.cost_basis ?? 0) - Number(a.cost_basis ?? 0);
        const glB = Number(b.current_fair_value ?? b.cost_basis ?? 0) - Number(b.cost_basis ?? 0);
        return glB - glA;
      }),
      cols: [
        { label: "Company", getValue: r => r.company_name ?? "—" },
        { label: "Vehicle", getValue: r => r._vehicle ?? r.entities?.short_code ?? "—" },
        { label: "Cost",    getValue: r => fmtUsd(Number(r.cost_basis ?? 0)), right: true },
        { label: "G / L",  getValue: r => {
          const gl = Number(r.current_fair_value ?? r.cost_basis ?? 0) - Number(r.cost_basis ?? 0);
          return (gl >= 0 ? "+" : "") + fmtUsd(gl);
        }, right: true, accent: r => {
          const gl = Number(r.current_fair_value ?? r.cost_basis ?? 0) - Number(r.cost_basis ?? 0);
          return gl > 0 ? "#0CA678" : gl < 0 ? "#FA5252" : MUTED;
        }},
        { label: "Return", getValue: r => {
          const c = Number(r.cost_basis ?? 0);
          const gl = Number(r.current_fair_value ?? c) - c;
          return c > 0 ? ((gl / c) * 100).toFixed(1) + "%" : "—";
        }, right: true, accent: r => {
          const c = Number(r.cost_basis ?? 0);
          const gl = Number(r.current_fair_value ?? c) - c;
          return c > 0 && gl > 0 ? "#0CA678" : c > 0 && gl < 0 ? "#FA5252" : MUTED;
        }},
      ],
    },
    marks: {
      title: "Valuation Marks",
      subtitle: `${markedCount} marked · ${staleCount} stale (90d+) · ${totalCount - markedCount} at cost`,
      accent: staleCount > 0 ? "#FA5252" : "#0CA678",
      rows: [...allRows].sort((a, b) => {
        // Stale first, then marked, then at cost
        const staleA = isStale(a.fair_value_date, Number(a.cost_basis ?? 0)) ? 0 : a.fair_value_date ? 1 : 2;
        const staleB = isStale(b.fair_value_date, Number(b.cost_basis ?? 0)) ? 0 : b.fair_value_date ? 1 : 2;
        return staleA - staleB;
      }),
      cols: [
        { label: "Company",  getValue: r => r.company_name ?? "—" },
        { label: "Vehicle",  getValue: r => r._vehicle ?? r.entities?.short_code ?? "—" },
        { label: "Status", getValue: r => {
          if (isStale(r.fair_value_date, Number(r.cost_basis ?? 0))) return "Stale";
          if (r.fair_value_date) return "Marked";
          return "At Cost";
        }, accent: r => {
          if (isStale(r.fair_value_date, Number(r.cost_basis ?? 0))) return "#FA5252";
          if (r.fair_value_date) return "#0CA678";
          return "#E67700";
        }},
        { label: "Basis",   getValue: r => r.valuation_basis ?? "—" },
        { label: "As At",   getValue: r => fmtDate(r.fair_value_date) },
        { label: "Fair Value", getValue: r => fmtUsd(Number(r.current_fair_value ?? r.cost_basis ?? 0)), right: true },
      ],
    },
  };

  if (!drillKey || !config[drillKey]) return null;
  const { title, subtitle, accent, rows, cols } = config[drillKey];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-base font-semibold" style={{ color: TEXT }}>{title}</SheetTitle>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>{subtitle}</p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-black/5 transition-colors">
              <X size={16} style={{ color: MUTED }} />
            </button>
          </div>
        </SheetHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "hsl(var(--muted)/0.5)", borderBottom: `1px solid ${BORDER}` }}>
                {cols.map(c => (
                  <th
                    key={c.label}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${c.right ? "text-right" : "text-left"}`}
                    style={{ color: MUTED }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id ?? r._yc_deal_id ?? i}
                  className="border-b transition-colors hover:bg-black/[0.02]"
                  style={{ borderColor: BORDER }}
                >
                  {cols.map(c => {
                    const val = c.getValue(r);
                    const color = c.accent ? c.accent(r) : TEXT;
                    return (
                      <td
                        key={c.label}
                        className={`px-4 py-2.5 font-mono text-xs ${c.right ? "text-right" : ""}`}
                        style={{ color }}
                      >
                        {c.label === "Company" ? (
                          <span className="font-sans font-medium" style={{ color: TEXT }}>{val}</span>
                        ) : val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: BORDER, background: "hsl(var(--muted)/0.3)" }}>
          <div className="flex items-center justify-between text-xs font-semibold" style={{ color: TEXT }}>
            <span>{rows.length} positions</span>
            {drillKey === "cost" && <span style={{ color: accent }}>{fmtUsd(grandCost)}</span>}
            {drillKey === "fv"   && <span style={{ color: accent }}>{fmtUsd(grandFV)} · MOIC {grandCost > 0 ? (grandFV / grandCost).toFixed(2) : "1.00"}x</span>}
            {drillKey === "gl"   && <span style={{ color: accent }}>{grandGL >= 0 ? "+" : ""}{fmtUsd(grandGL)} · {grandCost > 0 ? ((grandGL / grandCost) * 100).toFixed(1) : "0"}% return</span>}
            {drillKey === "marks" && <span style={{ color: accent }}>{markedCount} marked · {staleCount} stale</span>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
