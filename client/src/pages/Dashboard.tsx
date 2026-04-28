import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtUSD, fmtDate } from "@/lib/utils";
import {
  TrendingUp, Users, Building2, DollarSign, AlertCircle,
  Network, ChevronRight, Phone, BarChart3, CheckCircle2,
  Filter, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 0) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const STAGE_COLORS: Record<string, string> = {
  "pre-seed": "#7048E8", seed: "#3B5BDB", "series-a": "#0CA678",
  "series-b": "#F59F00", "series-c": "#FA5252", growth: "#0CA678",
};

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KPICard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
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
          <div className="p-2 rounded-lg flex-shrink-0 ml-2" style={{ background: color + "22" }}>
            <Icon size={16} style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Delaware Entity Structure (slide-out) ──────────────────────────────────────
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
  const [structureOpen, setStructureOpen] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<string>("all");

  // ── Base data ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => apiRequest("GET", "/api/dashboard").then(r => r.json()),
  });

  // All Delaware entities (for the series picker)
  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  // Series SPVs only (for the picker dropdown)
  const seriesSPVs = useMemo(() =>
    (entities as any[]).filter(e => e.entity_type === "series_spv")
      .sort((a, b) => a.short_code.localeCompare(b.short_code)),
    [entities]
  );

  // Selected entity object
  const selectedEntity = useMemo(() =>
    selectedSeries === "all" ? null : seriesSPVs.find(e => e.id === selectedSeries) ?? null,
    [selectedSeries, seriesSPVs]
  );

  // Filtered entity_id param
  const eid = selectedEntity?.id ?? undefined;

  // ── Filtered queries (re-run when series changes) ──────────────────────────
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

  // ── Computed metrics — always derived from filtered queries ─────────────────
  const filteredCommitments = (commitments as any[]).filter(c =>
    // Delaware dashboard: series SPVs only (exclude Cayman and non-SPV entities)
    !c.entities?.short_code?.startsWith("FC-CAYMAN") &&
    c.entities?.entity_type === "series_spv"
  );

  const totalCommitted  = filteredCommitments.reduce((s, c) => s + parseFloat(c.committed_amount || 0), 0);
  const totalCalled     = filteredCommitments.reduce((s, c) => s + parseFloat(c.called_amount    || 0), 0);
  const activeCommits   = filteredCommitments.filter(c => c.status === "active").length;
  const uncalled        = totalCommitted - totalCalled;

  const filteredInvestments = (investments as any[]).filter(i =>
    !i.entities?.short_code?.startsWith("FC-CAYMAN") &&
    i.entities?.entity_type === "series_spv"
  );
  const totalCost = filteredInvestments.reduce((s, i) => s + parseFloat(i.cost_basis  || 0), 0);
  const totalFV   = filteredInvestments.reduce((s, i) => s + parseFloat(i.current_fair_value || 0), 0);
  const unrealised = totalFV - totalCost;
  const moic = totalCost > 0 ? totalFV / totalCost : 0;
  const activePositions = filteredInvestments.filter(i => i.status === "active").length;

  // When "all", fall back to dashboard totals for LP count / SPV count
  const lpCount  = selectedSeries === "all" ? (data?.lp_count  ?? 0) : filteredCommitments.length;
  const spvCount = selectedSeries === "all" ? (data?.spv_count ?? 0) : 1;

  const latestNAV = [...(navMarks as any[])]
    .sort((a, b) => new Date(b.mark_date).getTime() - new Date(a.mark_date).getTime())[0];

  const loading = isLoading || loadingCommitments || loadingInvestments || loadingNAV;

  // ── Series filter badge label ───────────────────────────────────────────────
  const seriesLabel = selectedEntity
    ? `${selectedEntity.short_code.replace("FC-", "")}${selectedEntity.investments?.[0]?.company_name ? ` · ${selectedEntity.investments[0].company_name}` : ""}`
    : null;

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Entity Structure Sheet */}
      <Sheet open={structureOpen} onOpenChange={setStructureOpen}>
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
            onClick={() => setStructureOpen(true)}
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

        {/* Active filter pill */}
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
        />
        <KPICard
          label="Called to Date"
          value={fmt(totalCalled)}
          sub={`${totalCommitted > 0 ? ((totalCalled / totalCommitted) * 100).toFixed(0) : 0}% of committed`}
          icon={Phone} color="#0CA678" loading={loading}
        />
        <KPICard
          label="Portfolio NAV"
          value={fmt(totalFV)}
          sub={totalCost > 0 ? `MOIC ${moic.toFixed(2)}x · ${unrealised >= 0 ? "+" : ""}${fmt(unrealised)} unrealised` : "Awaiting first mark"}
          icon={BarChart3} color="#7048E8" loading={loading}
        />
        <KPICard
          label="Uncalled Capital"
          value={fmt(uncalled)}
          sub={`${totalCommitted > 0 ? ((uncalled / totalCommitted) * 100).toFixed(0) : 0}% of fund size remaining`}
          icon={DollarSign} color="#F59F00" loading={loading}
        />
      </div>

      {/* ── Row 2 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label={selectedSeries === "all" ? "Active SPVs" : "Series"}
          value={selectedSeries === "all" ? String(spvCount) : selectedEntity?.short_code.replace("FC-", "") ?? "—"}
          sub={selectedSeries === "all" ? "Protected Series · Delaware LP" : selectedEntity?.name}
          icon={Building2} color="#0CA678" loading={loading}
        />
        <KPICard
          label="Cost Deployed"
          value={fmt(totalCost)}
          sub={totalFV > totalCost ? `+${fmt(totalFV - totalCost)} unrealised gain` : "At cost"}
          icon={TrendingUp} color="#3B5BDB" loading={loading}
        />
        <KPICard
          label="Portfolio Companies"
          value={String(activePositions)}
          sub={activePositions > 0 ? `${activePositions} active position${activePositions !== 1 ? "s" : ""}` : "No positions yet"}
          icon={CheckCircle2} color="#0CA678" loading={loading}
        />
        <KPICard
          label="Unrealised Gain"
          value={`${unrealised >= 0 ? "+" : ""}${fmt(unrealised)}`}
          sub={totalCost > 0 ? `${((unrealised / totalCost) * 100).toFixed(1)}% return on cost` : "No cost basis yet"}
          icon={AlertCircle} color={unrealised >= 0 ? "#0CA678" : "#FA5252"} loading={loading}
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
                    <div key={inv.id} className="flex items-center justify-between py-1">
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
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>{fmt(fv)}</p>
                        <p className="text-xs font-mono" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                          {m.toFixed(2)}x {gain >= 0 ? "+" : ""}{fmt(gain)}
                        </p>
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
  );
}
