import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtUSD, fmtDate } from "@/lib/utils";
import {
  TrendingUp, Users, Building2, DollarSign, AlertCircle,
  Network, ChevronRight, Phone, BarChart3, CheckCircle2,
  Filter, X, ArrowUpRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ValuationMarkModal } from "@/components/ValuationMarkModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 0) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const pct = (num: number, den: number) =>
  den > 0 ? ((num / den) * 100).toFixed(1) + "%" : "—";

const STAGE_COLORS: Record<string, string> = {
  "pre-seed": "#7048E8", seed: "#3B5BDB", "series-a": "#0CA678",
  "series-b": "#F59F00", "series-c": "#FA5252", growth: "#0CA678",
};

// ── Drill-down types ──────────────────────────────────────────────────────────
type DrillKey =
  | "commitments" | "called" | "nav" | "uncalled"
  | "spvs" | "cost" | "companies" | "unrealised"
  | "structure";

const DRILL_META: Record<DrillKey, { title: string; subtitle: string }> = {
  commitments: { title: "Total Commitments", subtitle: "All LP commitments across Vector Series" },
  called:      { title: "Called to Date",    subtitle: "Capital drawn from LPs" },
  nav:         { title: "Portfolio NAV",     subtitle: "Fair value of all positions" },
  uncalled:    { title: "Uncalled Capital",  subtitle: "Remaining undrawn commitments" },
  spvs:        { title: "Active SPVs",       subtitle: "Vector Series Protected Cells" },
  cost:        { title: "Cost Deployed",     subtitle: "Capital invested at cost" },
  companies:   { title: "Portfolio Companies", subtitle: "Active investment positions" },
  unrealised:  { title: "Unrealised Gain / Loss", subtitle: "Fair value vs cost basis" },
  structure:   { title: "Delaware Entity Structure", subtitle: "Founders Capital Platform LLC · Series LLC" },
};

// ── KPI Card (clickable) ───────────────────────────────────────────────────────
function KPICard({
  label, value, sub, icon: Icon, color, loading, onClick,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className="border transition-all duration-150"
      style={{
        borderColor: "hsl(var(--border))",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      onMouseEnter={e => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = color + "88";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "hsl(var(--border))";
      }}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium mb-1 truncate uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-6 w-24 mb-1" />
            ) : (
              <p className="text-lg font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                {value}
              </p>
            )}
            {sub && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                {sub}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
            <div className="p-2 rounded-lg" style={{ background: color + "22" }}>
              <Icon size={16} style={{ color }} />
            </div>
            {onClick && (
              <ArrowUpRight size={11} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Drill-down drawer content ─────────────────────────────────────────────────
function DrillContent({
  drillKey,
  filteredCommitments,
  filteredInvestments,
  seriesSPVs,
  totalCommitted,
  totalCalled,
  totalCost,
  totalFV,
  uncalled,
}: {
  drillKey: DrillKey;
  filteredCommitments: any[];
  filteredInvestments: any[];
  seriesSPVs: any[];
  totalCommitted: number;
  totalCalled: number;
  totalCost: number;
  totalFV: number;
  uncalled: number;
}) {
  const TH = "text-xs font-medium uppercase tracking-wider pb-2 text-left";
  const TD = "py-2.5 text-sm";
  const thStyle = { color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))" };

  if (drillKey === "commitments") {
    // Sort by LP name so multi-series LPs appear adjacent
    const sorted = [...filteredCommitments].sort((a, b) => {
      const nameA = (a.investors?.full_name ?? "").toLowerCase();
      const nameB = (b.investors?.full_name ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>LP Name</th>
              <th className={TH} style={{ ...thStyle }}>Series</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Committed</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% of Total</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Called</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% Called</th>
              <th className={TH} style={{ ...thStyle, textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((c: any, i: number) => {
              const committed = parseFloat(c.committed_amount || 0);
              const called    = parseFloat(c.called_amount || 0);
              const prevName  = i > 0 ? (sorted[i-1].investors?.full_name ?? "") : "";
              const thisName  = c.investors?.full_name ?? c.investor_id;
              const isRepeat  = prevName === thisName;
              return (
                <tr key={c.id} style={ isRepeat ? { background: "hsl(var(--muted) / 0.4)" } : {} }>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    {isRepeat
                      ? <span className="text-xs pl-2" style={{ color: "hsl(var(--muted-foreground))" }}>↳</span>
                      : <span className="font-medium">{thisName}</span>
                    }
                  </td>
                  <td className={TD}>
                    {c.entities?.short_code && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium font-mono"
                        style={{ background: "#3B5BDB22", color: "#3B5BDB" }}>
                        {c.entities.short_code.replace("FC-", "")}
                      </span>
                    )}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(committed)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{pct(committed, totalCommitted)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(called)}</td>
                  <td className={TD + " text-right"}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(committed > 0 ? (called/committed)*100 : 0, 100)}%`, background: "#0CA678" }} />
                      </div>
                      <span className="font-mono text-xs w-9 text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {pct(called, committed)}
                      </span>
                    </div>
                  </td>
                  <td className={TD + " text-center"}>
                    <Badge variant="outline" className="text-xs capitalize"
                      style={{ borderColor: c.status === "active" ? "#0CA678" : "#F59F00", color: c.status === "active" ? "#0CA678" : "#F59F00" }}>
                      {c.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>
                {sorted.length} commitments · {new Set(sorted.map((c: any) => c.investor_id)).size} unique LPs
              </td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalCommitted)}</td>
              <td />
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalCalled)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "called") {
    const sorted = [...filteredCommitments]
      .filter(c => parseFloat(c.called_amount || 0) > 0)
      .sort((a, b) => (a.investors?.full_name ?? "").localeCompare(b.investors?.full_name ?? ""));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>LP Name</th>
              <th className={TH} style={thStyle}>Series</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Called</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Committed</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% Called</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((c: any, i: number) => {
              const committed = parseFloat(c.committed_amount || 0);
              const called    = parseFloat(c.called_amount || 0);
              const prevName  = i > 0 ? (sorted[i-1].investors?.full_name ?? "") : "";
              const thisName  = c.investors?.full_name ?? c.investor_id;
              const isRepeat  = prevName === thisName;
              return (
                <tr key={c.id} style={ isRepeat ? { background: "hsl(var(--muted) / 0.4)" } : {} }>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    {isRepeat
                      ? <span className="text-xs pl-2" style={{ color: "hsl(var(--muted-foreground))" }}>↳</span>
                      : <span className="font-medium">{thisName}</span>
                    }
                  </td>
                  <td className={TD}>
                    {c.entities?.short_code && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium font-mono"
                        style={{ background: "#0CA67822", color: "#0CA678" }}>
                        {c.entities.short_code.replace("FC-", "")}
                      </span>
                    )}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(called)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{fmt(committed)}</td>
                  <td className={TD + " text-right"}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min((called / committed) * 100, 100)}%`, background: "#0CA678" }} />
                      </div>
                      <span className="font-mono text-xs w-9 text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {pct(called, committed)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalCalled)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{fmt(totalCommitted)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{pct(totalCalled, totalCommitted)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "nav" || drillKey === "cost" || drillKey === "companies") {
    const sorted = [...filteredInvestments].sort((a, b) =>
      parseFloat(b.current_fair_value ?? b.cost_basis ?? 0) - parseFloat(a.current_fair_value ?? a.cost_basis ?? 0)
    );
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Cost</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Fair Value</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>MOIC</th>
              <th className={TH} style={{ ...thStyle, textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const cost = parseFloat(inv.cost_basis || 0);
              const fv   = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
              const moic = cost > 0 ? fv / cost : 1;
              const gain = fv - cost;
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      {inv.entities?.short_code && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                          {inv.entities.short_code.replace("FC-", "")}
                        </span>
                      )}
                      <span className="font-medium">{inv.company_name}</span>
                    </div>
                    <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {inv.sector && <span>{inv.sector}</span>}
                      {inv.stage && (
                        <span className="px-1.5 py-0 rounded text-xs" style={{ background: (STAGE_COLORS[inv.stage] ?? "#868E96") + "22", color: STAGE_COLORS[inv.stage] ?? "#868E96" }}>
                          {inv.stage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(cost)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(fv)}</td>
                  <td className={TD + " font-mono text-right font-medium"} style={{ color: moic >= 1 ? "#0CA678" : "#FA5252" }}>
                    {moic.toFixed(2)}x
                  </td>
                  <td className={TD + " text-center"}>
                    <Badge variant="outline" className="text-xs capitalize"
                      style={{ borderColor: inv.status === "active" ? "#0CA678" : "#F59F00", color: inv.status === "active" ? "#0CA678" : "#F59F00" }}>
                      {inv.status ?? "active"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalCost)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalFV)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalFV >= totalCost ? "#0CA678" : "#FA5252" }}>
                {totalCost > 0 ? (totalFV / totalCost).toFixed(2) + "x" : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "uncalled") {
    const sorted = [...filteredCommitments]
      .map(c => ({ ...c, _uncalled: parseFloat(c.committed_amount || 0) - parseFloat(c.called_amount || 0) }))
      .filter(c => c._uncalled > 0)
      .sort((a, b) => (a.investors?.full_name ?? "").localeCompare(b.investors?.full_name ?? ""));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>LP Name</th>
              <th className={TH} style={thStyle}>Series</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Uncalled</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Committed</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((c: any, i: number) => {
              const committed = parseFloat(c.committed_amount || 0);
              const prevName  = i > 0 ? (sorted[i-1].investors?.full_name ?? "") : "";
              const thisName  = c.investors?.full_name ?? c.investor_id;
              const isRepeat  = prevName === thisName;
              return (
                <tr key={c.id} style={ isRepeat ? { background: "hsl(var(--muted) / 0.4)" } : {} }>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    {isRepeat
                      ? <span className="text-xs pl-2" style={{ color: "hsl(var(--muted-foreground))" }}>↳</span>
                      : <span className="font-medium">{thisName}</span>
                    }
                  </td>
                  <td className={TD}>
                    {c.entities?.short_code && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium font-mono"
                        style={{ background: "#F59F0022", color: "#F59F00" }}>
                        {c.entities.short_code.replace("FC-", "")}
                      </span>
                    )}
                  </td>
                  <td className={TD + " font-mono text-right font-medium"} style={{ color: "#F59F00" }}>{fmt(c._uncalled)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{fmt(committed)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{pct(c._uncalled, committed)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total Uncalled</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "#F59F00" }}>{fmt(uncalled)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{fmt(totalCommitted)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{pct(uncalled, totalCommitted)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "spvs") {
    return (
      <div className="space-y-3">
        {seriesSPVs.map((spv: any) => {
          const spvInvestments = spv.investments ?? [];
          const company = spvInvestments[0]?.company_name;
          return (
            <div key={spv.id} className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded font-medium font-mono"
                      style={{ background: "#0CA67822", color: "#0CA678" }}>
                      {spv.short_code.replace("FC-", "")}
                    </span>
                    {company && <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{company}</span>}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{spv.name}</p>
                </div>
                <Badge variant="outline" className="text-xs capitalize"
                  style={{ borderColor: spv.status === "active" ? "#0CA678" : "#868E96", color: spv.status === "active" ? "#0CA678" : "#868E96" }}>
                  {spv.status ?? "active"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {spv.ein && (
                  <div>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>EIN</p>
                    <p className="text-xs font-mono font-medium mt-0.5" style={{ color: "hsl(var(--foreground))" }}>{spv.ein}</p>
                  </div>
                )}
                {spv.formation_date && (
                  <div>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Formed</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: "hsl(var(--foreground))" }}>{spv.formation_date}</p>
                  </div>
                )}
                {spv.base_currency && (
                  <div>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Currency</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: "hsl(var(--foreground))" }}>{spv.base_currency}</p>
                  </div>
                )}
              </div>
              {(spv.management_fee_rate || spv.carry_rate) && (
                <div className="flex gap-4 mt-2 pt-2 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                  {spv.management_fee_rate && (
                    <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Mgmt fee: <span style={{ color: "hsl(var(--foreground))" }}>{(parseFloat(spv.management_fee_rate) * 100).toFixed(1)}%</span>
                    </span>
                  )}
                  {spv.carry_rate && (
                    <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Carry: <span style={{ color: "hsl(var(--foreground))" }}>{(parseFloat(spv.carry_rate) * 100).toFixed(0)}%</span>
                    </span>
                  )}
                  {spv.preferred_return && (
                    <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Hurdle: <span style={{ color: "hsl(var(--foreground))" }}>{(parseFloat(spv.preferred_return) * 100).toFixed(0)}%</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (drillKey === "unrealised") {
    const sorted = [...filteredInvestments].sort((a, b) => {
      const gainA = parseFloat(a.current_fair_value ?? a.cost_basis ?? 0) - parseFloat(a.cost_basis || 0);
      const gainB = parseFloat(b.current_fair_value ?? b.cost_basis ?? 0) - parseFloat(b.cost_basis || 0);
      return gainB - gainA;
    });
    const totalGain = totalFV - totalCost;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Cost</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Fair Value</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Gain / Loss</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Return</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const cost = parseFloat(inv.cost_basis || 0);
              const fv   = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
              const gain = fv - cost;
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      {inv.entities?.short_code && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                          {inv.entities.short_code.replace("FC-", "")}
                        </span>
                      )}
                      <span className="font-medium">{inv.company_name}</span>
                    </div>
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(cost)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmt(fv)}</td>
                  <td className={TD + " font-mono text-right font-medium"} style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                    {gain >= 0 ? "+" : ""}{fmt(gain)}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                    {cost > 0 ? `${gain >= 0 ? "+" : ""}${((gain / cost) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalCost)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmt(totalFV)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalGain >= 0 ? "#0CA678" : "#FA5252" }}>
                {totalGain >= 0 ? "+" : ""}{fmt(totalGain)}
              </td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalGain >= 0 ? "#0CA678" : "#FA5252" }}>
                {totalCost > 0 ? `${totalGain >= 0 ? "+" : ""}${((totalGain / totalCost) * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return null;
}

// ── Delaware Entity Structure ──────────────────────────────────────────────────
const DELAWARE_STRUCTURE = {
  label: "FC Group Holding Ltd.",
  sub: "UK Ultimate Holdco · Co. No. 14797242",
  color: "hsl(0 0% 50%)",
  note: "UK (reference only)",
  children: [
    {
      label: "Founders Capital US Holdings LLC",
      sub: "FC-US-HOLDING · Delaware",
      color: "hsl(213 94% 62%)",
      children: [
        { label: "Founders Capital Platform GP, LP", sub: "FC-PLATFORM-GP · Delaware GP", color: "hsl(231 70% 60%)", children: [] },
        {
          label: "Founders Capital Platform LP",
          sub: "FC-PLATFORM-LP · Master Series LLC",
          color: "hsl(231 70% 60%)",
          children: [
            { label: "Vector I",  sub: "FC-VECTOR-I · Protected Series",  color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector II", sub: "FC-VECTOR-II · Protected Series", color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector III · Reach Power",       sub: "FC-VECTOR-III · EIN 36-5168991", color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector IV · Project Prometheus",  sub: "FC-VECTOR-IV · EIN 61-2311112",  color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector V",  sub: "FC-VECTOR-V · Protected Series",  color: "hsl(142 70% 45%)", children: [] },
          ],
        },
      ],
    },
  ],
};

interface OrgNode { label: string; sub: string; color: string; note?: string; children: OrgNode[]; }

function OrgTreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div className="relative flex items-start gap-2 mb-2">
        {hasChildren
          ? <button onClick={() => setOpen(o => !o)} className="mt-1 flex-shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity" style={{ color: node.color }}>
              <ChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          : <div className="w-5 flex-shrink-0" />}
        <div className="flex-1 rounded-lg px-3 py-2 border text-sm" style={{ borderColor: node.color + "55", background: node.color + "0D" }}>
          <div className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>
            {node.label}
            {node.note && <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>{node.note}</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{node.sub}</div>
        </div>
      </div>
      {hasChildren && open && (
        <div className="relative pl-5 border-l" style={{ borderColor: "hsl(var(--border))" }}>
          {node.children.map((child, i) => <OrgTreeNode key={i} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface DashboardData {
  spv_count: number; lp_count: number;
  total_committed: number; total_called: number; total_outstanding: number;
  total_invested: number; total_fair_value: number; unrealised_gain: number;
  spvs: any[]; recent_investments: any[];
}

export default function Dashboard() {
  const [activeDrill, setActiveDrill] = useState<DrillKey | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string>("all");
  const [valuationInv, setValuationInv] = useState<any | null>(null);

  const openDrill = (key: DrillKey) => setActiveDrill(key);
  const closeDrill = () => setActiveDrill(null);

  // ── Base data ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => apiRequest("GET", "/api/dashboard").then(r => r.json()),
  });

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const seriesSPVs = useMemo(() =>
    (entities as any[]).filter(e => e.entity_type === "series_spv" && e.short_code?.startsWith("FC-VECTOR"))
      .sort((a, b) => a.short_code.localeCompare(b.short_code)),
    [entities]
  );

  const selectedEntity = useMemo(() =>
    selectedSeries === "all" ? null : seriesSPVs.find(e => e.id === selectedSeries) ?? null,
    [selectedSeries, seriesSPVs]
  );

  const eid = selectedEntity?.id ?? undefined;

  const { data: commitments = [], isLoading: loadingCommitments } = useQuery({
    queryKey: ["/api/commitments", eid ?? "all"],
    queryFn: () => apiRequest("GET", eid ? `/api/commitments?entity_id=${eid}` : "/api/commitments").then(r => r.json()),
  });

  const { data: investments = [], isLoading: loadingInvestments } = useQuery({
    queryKey: ["/api/investments", eid ?? "all"],
    queryFn: () => apiRequest("GET", eid ? `/api/investments?entity_id=${eid}` : `/api/investments`).then(r => r.json()),
  });

  const { data: navMarks = [], isLoading: loadingNAV } = useQuery({
    queryKey: ["/api/nav-marks", eid ?? "all"],
    queryFn: () => apiRequest("GET", eid ? `/api/nav-marks?entity_id=${eid}` : "/api/nav-marks").then(r => r.json()),
  });

  // ── Computed metrics ───────────────────────────────────────────────────────
  const filteredCommitments = (commitments as any[]).filter(c =>
    c.entities?.short_code?.startsWith("FC-VECTOR")
  );

  const totalCommitted  = filteredCommitments.reduce((s, c) => s + parseFloat(c.committed_amount || 0), 0);
  const totalCalled     = filteredCommitments.reduce((s, c) => s + parseFloat(c.called_amount    || 0), 0);
  const activeCommits   = filteredCommitments.filter(c => c.status === "active").length;
  const uncalled        = totalCommitted - totalCalled;

  const filteredInvestments = (investments as any[]).filter(i =>
    i.entities?.short_code?.startsWith("FC-VECTOR")
  );
  const totalCost = filteredInvestments.reduce((s, i) => s + parseFloat(i.cost_basis || 0), 0);
  const totalFV   = filteredInvestments.reduce((s, i) => s + parseFloat(i.current_fair_value ?? i.cost_basis ?? 0), 0);
  const unrealised = totalFV - totalCost;
  const moic = totalCost > 0 ? totalFV / totalCost : 0;
  const activePositions = filteredInvestments.filter(i => i.status === "active").length;

  const lpCount  = selectedSeries === "all" ? (data?.lp_count  ?? 0) : filteredCommitments.length;
  const spvCount = selectedSeries === "all" ? (data?.spv_count ?? 0) : 1;

  const latestNAV = [...(navMarks as any[])]
    .sort((a, b) => new Date(b.mark_date).getTime() - new Date(a.mark_date).getTime())[0];

  const loading = isLoading || loadingCommitments || loadingInvestments || loadingNAV;

  const seriesLabel = selectedEntity
    ? `${selectedEntity.short_code.replace("FC-", "")}${selectedEntity.investments?.[0]?.company_name ? ` · ${selectedEntity.investments[0].company_name}` : ""}`
    : null;

  return (
    <>
    <div className="p-8 max-w-6xl mx-auto">

      {/* ── KPI Drill-down Sheet ── */}
      <Sheet open={activeDrill !== null && activeDrill !== "structure"} onOpenChange={open => { if (!open) closeDrill(); }}>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {activeDrill && activeDrill !== "structure" && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-base">{DRILL_META[activeDrill].title}</SheetTitle>
                <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {DRILL_META[activeDrill].subtitle}
                  {seriesLabel && <span className="ml-2 px-2 py-0.5 rounded text-xs" style={{ background: "hsl(231 70% 54% / 0.12)", color: "hsl(231 70% 65%)" }}>
                    {seriesLabel}
                  </span>}
                </p>
              </SheetHeader>
              <DrillContent
                drillKey={activeDrill}
                filteredCommitments={filteredCommitments}
                filteredInvestments={filteredInvestments}
                seriesSPVs={seriesSPVs}
                totalCommitted={totalCommitted}
                totalCalled={totalCalled}
                totalCost={totalCost}
                totalFV={totalFV}
                uncalled={uncalled}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Entity Structure Sheet ── */}
      <Sheet open={activeDrill === "structure"} onOpenChange={open => { if (!open) closeDrill(); }}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Network size={16} style={{ color: "hsl(213 94% 62%)" }} />
              Delaware Entity Structure
            </SheetTitle>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Founders Capital Platform LLC · Series LLC structure
            </p>
          </SheetHeader>
          <OrgTreeNode node={DELAWARE_STRUCTURE} />
          <div className="mt-6 rounded-lg p-4 text-xs space-y-1" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
            <div className="font-medium mb-2" style={{ color: "hsl(var(--foreground))" }}>Notes</div>
            <div>· UK entities shown for structural context only — no portal reporting</div>
            <div>· Protected Series SPVs are segregated cells of FC Platform LP</div>
            <div>· AIFM delegation: Paxiot Limited (FCA-Authorised, Co. No. 07455644)</div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🇺🇸</span>
            <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Delaware Dashboard
            </h1>
            <Badge variant="outline" className="text-xs">Series LLC</Badge>
            {latestNAV && (
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                NAV mark: {latestNAV.mark_date}
              </span>
            )}
          </div>
          <button
            data-testid="button-entity-structure"
            onClick={() => openDrill("structure")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
            style={{ background: "hsl(231 70% 54% / 0.10)", borderColor: "hsl(231 70% 54% / 0.30)", color: "hsl(231 70% 72%)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(231 70% 54% / 0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(231 70% 54% / 0.10)"; }}
          >
            <Network size={14} />
            Entity Structure
          </button>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Founders Capital Platform LP — Delaware Series LLC · Filed 11 July 2025
        </p>
      </div>

      {/* ── Series Filter Bar ── */}
      <div className="flex items-center gap-3 mb-6 p-3 rounded-xl border" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
        <Filter size={14} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
        <span className="text-xs font-medium uppercase tracking-wider flex-shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>
          View
        </span>
        <Select value={selectedSeries} onValueChange={setSelectedSeries}>
          <SelectTrigger className="h-8 w-64 text-sm border-0 bg-transparent shadow-none focus:ring-0 px-2" data-testid="select-series-filter">
            <SelectValue placeholder="All Series" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Series (Platform-level)</SelectItem>
            {seriesSPVs.map(spv => (
              <SelectItem key={spv.id} value={spv.id}>
                {spv.short_code.replace("FC-", "")}
                {spv.investments?.[0]?.company_name ? ` · ${spv.investments[0].company_name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {seriesLabel && (
          <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: "hsl(231 70% 54% / 0.12)", color: "hsl(231 70% 65%)" }}>
            <span>{seriesLabel}</span>
            <button onClick={() => setSelectedSeries("all")} className="hover:opacity-70 transition-opacity">
              <X size={11} />
            </button>
          </div>
        )}

        {selectedSeries !== "all" && (
          <span className="ml-auto text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Showing data for this series only
          </span>
        )}
      </div>

      {/* ── Row 1: Fund-level KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KPICard
          label="Total Commitments"
          value={fmt(totalCommitted)}
          sub={`${lpCount} LP${lpCount !== 1 ? "s" : ""} · ${activeCommits} active`}
          icon={Users} color="#3B5BDB" loading={loading}
          onClick={() => openDrill("commitments")}
        />
        <KPICard
          label="Called to Date"
          value={fmt(totalCalled)}
          sub={`${totalCommitted > 0 ? ((totalCalled / totalCommitted) * 100).toFixed(0) : 0}% of committed`}
          icon={Phone} color="#0CA678" loading={loading}
          onClick={() => openDrill("called")}
        />
        <KPICard
          label="Portfolio NAV"
          value={fmt(totalFV)}
          sub={totalCost > 0 ? `MOIC ${moic.toFixed(2)}x · ${unrealised >= 0 ? "+" : ""}${fmt(unrealised)} unrealised` : "Awaiting first mark"}
          icon={BarChart3} color="#7048E8" loading={loading}
          onClick={() => openDrill("nav")}
        />
        <KPICard
          label="Uncalled Capital"
          value={fmt(uncalled)}
          sub={`${totalCommitted > 0 ? ((uncalled / totalCommitted) * 100).toFixed(0) : 0}% of fund size remaining`}
          icon={DollarSign} color="#F59F00" loading={loading}
          onClick={() => openDrill("uncalled")}
        />
      </div>

      {/* ── Row 2 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label={selectedSeries === "all" ? "Active SPVs" : "Series"}
          value={selectedSeries === "all" ? String(spvCount) : selectedEntity?.short_code.replace("FC-", "") ?? "—"}
          sub={selectedSeries === "all" ? "Protected Series · Delaware LP" : selectedEntity?.name}
          icon={Building2} color="#0CA678" loading={loading}
          onClick={() => openDrill("spvs")}
        />
        <KPICard
          label="Cost Deployed"
          value={fmt(totalCost)}
          sub={totalFV > totalCost ? `+${fmt(totalFV - totalCost)} unrealised gain` : "At cost"}
          icon={TrendingUp} color="#3B5BDB" loading={loading}
          onClick={() => openDrill("cost")}
        />
        <KPICard
          label="Portfolio Companies"
          value={String(activePositions)}
          sub={activePositions > 0 ? `${activePositions} active position${activePositions !== 1 ? "s" : ""}` : "No positions yet"}
          icon={CheckCircle2} color="#0CA678" loading={loading}
          onClick={() => openDrill("companies")}
        />
        <KPICard
          label="Unrealised Gain"
          value={`${unrealised >= 0 ? "+" : ""}${fmt(unrealised)}`}
          sub={totalCost > 0 ? `${((unrealised / totalCost) * 100).toFixed(1)}% return on cost` : "No cost basis yet"}
          icon={AlertCircle} color={unrealised >= 0 ? "#0CA678" : "#FA5252"} loading={loading}
          onClick={() => openDrill("unrealised")}
        />
      </div>

      {/* ── Portfolio + LP commitments ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Portfolio positions */}
        <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Portfolio Positions
              {seriesLabel && <span className="ml-2 text-xs font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>· {seriesLabel}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loadingInvestments ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredInvestments.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No investments{seriesLabel ? " for this series" : " yet"}</p>
            ) : (
              <div className="space-y-3">
                {filteredInvestments.map((inv: any) => {
                  const cost = parseFloat(inv.cost_basis || 0);
                  const fv   = parseFloat(inv.current_fair_value || 0);
                  const m    = cost > 0 ? fv / cost : 1;
                  const gain = fv - cost;
                  return (
                    <div key={inv.id} className="flex items-center justify-between py-1 group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {inv.entities?.short_code && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                              {inv.entities.short_code.replace("FC-", "")}
                            </span>
                          )}
                          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>{inv.company_name}</p>
                          {inv.stage && (
                            <Badge variant="outline" className="text-xs flex-shrink-0"
                              style={{ borderColor: STAGE_COLORS[inv.stage] ?? "#868E96", color: STAGE_COLORS[inv.stage] ?? "#868E96" }}>
                              {inv.stage}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {inv.sector}{inv.instrument_type ? ` · ${inv.instrument_type.replace(/_/g, " ")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <button
                          onClick={() => setValuationInv(inv)}
                          className="text-[10px] px-2 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ borderColor: "#3B5BDB", color: "#3B5BDB", background: "transparent" }}
                        >Mark</button>
                        <div className="text-right">
                          <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>{fmt(fv)}</p>
                          <p className="text-xs font-mono" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                            {m.toFixed(2)}x {gain >= 0 ? "+" : ""}{fmt(gain)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* LP Commitments */}
        <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              LP Commitments
              {seriesLabel && <span className="ml-2 text-xs font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>· {seriesLabel}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loadingCommitments ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredCommitments.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>No LP commitments{seriesLabel ? " for this series" : " yet"}</p>
            ) : (
              <div className="space-y-3">
                {filteredCommitments.map((c: any) => {
                  const committed = parseFloat(c.committed_amount || 0);
                  const called    = parseFloat(c.called_amount    || 0);
                  const callPct   = committed > 0 ? (called / committed) * 100 : 0;
                  return (
                    <div key={c.id} className="py-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
                            {c.investors?.full_name ?? c.investor_id}
                          </p>
                          <Badge variant="outline" className="text-xs flex-shrink-0 capitalize"
                            style={{ borderColor: c.status === "active" ? "#0CA678" : "#F59F00", color: c.status === "active" ? "#0CA678" : "#F59F00" }}>
                            {c.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-mono font-medium flex-shrink-0 ml-3" style={{ color: "hsl(var(--foreground))" }}>
                          {fmt(committed)}
                        </p>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(callPct, 100)}%`, background: "#3B5BDB" }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmt(called)} called ({callPct.toFixed(0)}%) · {fmt(committed - called)} remaining
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── NAV History ── */}
      <Card className="border mb-6" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            NAV History
            {seriesLabel && <span className="ml-2 text-xs font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>· {seriesLabel}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loadingNAV ? (
            <Skeleton className="h-16 w-full" />
          ) : (navMarks as any[]).length === 0 ? (
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No marks{seriesLabel ? " for this series" : " yet"}</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
              {[...(navMarks as any[])]
                .sort((a, b) => new Date(b.mark_date).getTime() - new Date(a.mark_date).getTime())
                .map((mark: any) => {
                  const fv   = parseFloat(mark.fair_value || 0);
                  const cost = parseFloat(mark.cost_basis || 0);
                  const gain = fv - cost;
                  return (
                    <div key={mark.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{mark.mark_date}</p>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {mark.entities?.short_code?.replace("FC-", "")}
                          {mark.entities?.investments?.[0]?.company_name ? ` · ${mark.entities.investments[0].company_name}` : ""}
                          {mark.valuation_notes ? ` · ${mark.valuation_notes}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>{fmt(fv)}</p>
                        {cost > 0 && (
                          <p className="text-xs font-mono" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                            {gain >= 0 ? "+" : ""}{fmt(gain)} vs cost
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Fund Structure (always platform-level) ── */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Fund Structure
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="space-y-3">
            {[
              { label: "General Partner",  value: "Founders Capital Platform GP, LP",   note: "Delaware Limited Partnership · FC-PLATFORM-GP" },
              { label: "Master Entity",    value: "Founders Capital Platform LP",        note: "Delaware Series LLC · Filed 11 July 2025 · FC-PLATFORM-LP" },
              { label: "Series SPVs",      value: "Vector I – V (Protected Series)",     note: "Segregated cells under §17-218(b) DRULPA · ring-fenced assets" },
              { label: "US Holdco",        value: "Founders Capital US Holdings LLC",    note: "FC-US-HOLDING · 100% owned by FC Group Holding Ltd (UK)" },
              { label: "AIFM",            value: "Paxiot Limited (UK)",                 note: "FCA Authorised · Co. No. 07455644 · Management delegation" },
              { label: "Registered Agent", value: "Resident Agents Inc.",                note: "8 The Green STE R, Dover, Delaware 19901" },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-4">
                <span className="w-36 flex-shrink-0 font-medium text-xs pt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{row.label}</span>
                <div>
                  <p className="font-medium text-xs" style={{ color: "hsl(var(--foreground))" }}>{row.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{row.note}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Valuation Mark Modal */}
    <ValuationMarkModal
      investment={valuationInv}
      open={!!valuationInv}
      onClose={() => setValuationInv(null)}
    />
    </>
  );
}
