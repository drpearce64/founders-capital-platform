import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, Users, Phone, Building2,
  Globe, BarChart3, AlertCircle, CheckCircle2,
} from "lucide-react";

const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

const fmt = (n: number, decimals = 0) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

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
            <p className="text-xs font-medium mb-1 truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
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

export default function CaymanDashboard() {
  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: commitments = [], isLoading: loadingCommitments } = useQuery({
    queryKey: ["/api/commitments", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/commitments?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const { data: capitalCalls = [], isLoading: loadingCalls } = useQuery({
    queryKey: ["/api/capital-calls", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/capital-calls?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const { data: investments = [], isLoading: loadingInvestments } = useQuery({
    queryKey: ["/api/investments", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/investments?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const { data: navMarks = [], isLoading: loadingNAV } = useQuery({
    queryKey: ["/api/nav-marks", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/nav-marks?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const { data: entityCosts = [], isLoading: loadingCosts } = useQuery({
    queryKey: ["/api/entity-costs", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  // ── Computed metrics ──────────────────────────────────────────────────────
  const totalCommitted  = (commitments as any[]).reduce((s, c) => s + parseFloat(c.committed_amount || 0), 0);
  const totalCalled     = (commitments as any[]).reduce((s, c) => s + parseFloat(c.called_amount    || 0), 0);
  const activeCommits   = (commitments as any[]).filter(c => c.status === "active").length;
  const totalLPs        = (commitments as any[]).length;
  const uncalled        = totalCommitted - totalCalled;

  const latestNAV       = [...(navMarks as any[])].sort((a, b) =>
    new Date(b.mark_date).getTime() - new Date(a.mark_date).getTime()
  )[0];
  const latestFV        = parseFloat(latestNAV?.fair_value  || 0);
  const latestCost      = parseFloat(latestNAV?.cost_basis  || 0);
  const fundMOIC        = latestCost > 0 ? latestFV / latestCost : 0;
  const unrealised      = latestFV - latestCost;

  const activePositions = (investments as any[]).filter(i => i.status === "active").length;
  const costDeployed    = (investments as any[]).reduce((s, i) => s + parseFloat(i.cost_basis || 0), 0);
  const totalFV         = (investments as any[]).reduce((s, i) => s + parseFloat(i.current_fair_value || 0), 0);

  const totalCapCalls   = (capitalCalls as any[]).length;
  const fundedCalls     = (capitalCalls as any[]).filter(c => c.status === "fully_funded").length;

  const accrued         = (entityCosts as any[])
    .filter(c => c.status === "accrued")
    .reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0);

  const STAGE_COLORS: Record<string, string> = {
    "pre-seed": "#7048E8", seed: "#3B5BDB", "series-a": "#0CA678",
    "series-b": "#F59F00", "series-c": "#FA5252", growth: "#0CA678",
  };

  const loading = loadingCommitments || loadingCalls || loadingInvestments || loadingNAV;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🇰🇾</span>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Cayman Islands Dashboard
          </h1>
          <Badge variant="outline" className="text-xs">Exempted LP</Badge>
          {latestNAV && (
            <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
              NAV mark: {latestNAV.mark_date}
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Founders Capital Strat. Opps. Fund I LP — Reg. No. 134092 · CIMA Registered
        </p>
      </div>

      {/* ── Row 1: Fund-level KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KPICard
          label="Total Commitments"
          value={fmt(totalCommitted)}
          sub={`${totalLPs} LP${totalLPs !== 1 ? "s" : ""} · ${activeCommits} active`}
          icon={Users} color="#3B5BDB" loading={loading}
        />
        <KPICard
          label="Called to Date"
          value={fmt(totalCalled)}
          sub={`${totalCalled > 0 && totalCommitted > 0 ? ((totalCalled / totalCommitted) * 100).toFixed(0) : 0}% of committed`}
          icon={Phone} color="#0CA678" loading={loading}
        />
        <KPICard
          label="Portfolio NAV"
          value={fmt(latestFV)}
          sub={latestCost > 0 ? `MOIC ${fundMOIC.toFixed(2)}x · ${unrealised >= 0 ? "+" : ""}${fmt(unrealised)} unrealised` : "Awaiting first mark"}
          icon={BarChart3} color="#7048E8" loading={loading}
        />
        <KPICard
          label="Uncalled Capital"
          value={fmt(uncalled)}
          sub={`${totalCommitted > 0 ? ((uncalled / totalCommitted) * 100).toFixed(0) : 0}% of fund size remaining`}
          icon={DollarSign} color="#F59F00" loading={loading}
        />
      </div>

      {/* ── Row 2: Portfolio + calls ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="Portfolio Companies"
          value={String(activePositions)}
          sub={`Target 15–20 · ${20 - activePositions} slots remaining`}
          icon={Building2} color="#0CA678" loading={loadingInvestments}
        />
        <KPICard
          label="Cost Deployed"
          value={fmt(costDeployed)}
          sub={totalFV > costDeployed ? `+${fmt(totalFV - costDeployed)} unrealised gain` : "At cost"}
          icon={TrendingUp} color="#3B5BDB" loading={loadingInvestments}
        />
        <KPICard
          label="Capital Calls"
          value={`${fundedCalls} / ${totalCapCalls}`}
          sub={`${fundedCalls} settled · ${totalCapCalls - fundedCalls} outstanding`}
          icon={CheckCircle2} color="#0CA678" loading={loadingCalls}
        />
        <KPICard
          label="Accrued Expenses"
          value={fmt(accrued, 0)}
          sub="Payable — not yet settled"
          icon={AlertCircle} color="#FA5252" loading={loadingCosts}
        />
      </div>

      {/* ── Portfolio positions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Portfolio Positions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loadingInvestments ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (investments as any[]).length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                No investments yet
              </p>
            ) : (
              <div className="space-y-3">
                {(investments as any[]).map((inv: any) => {
                  const cost   = parseFloat(inv.cost_basis || 0);
                  const fv     = parseFloat(inv.current_fair_value || 0);
                  const moic   = cost > 0 ? fv / cost : 1;
                  const gain   = fv - cost;
                  return (
                    <div key={inv.id} className="flex items-center justify-between py-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
                            {inv.company_name}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-xs flex-shrink-0"
                            style={{
                              borderColor: STAGE_COLORS[inv.stage] ?? "#868E96",
                              color:       STAGE_COLORS[inv.stage] ?? "#868E96",
                            }}
                          >
                            {inv.stage}
                          </Badge>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {inv.sector} · {inv.instrument_type?.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>
                          {fmt(fv)}
                        </p>
                        <p
                          className="text-xs font-mono"
                          style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}
                        >
                          {moic.toFixed(2)}x {gain >= 0 ? "+" : ""}{fmt(gain)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── LP commitments ── */}
        <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              LP Commitments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loadingCommitments ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (commitments as any[]).length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
                No LP commitments yet
              </p>
            ) : (
              <div className="space-y-3">
                {(commitments as any[]).map((c: any) => {
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
                          <Badge
                            variant="outline"
                            className="text-xs flex-shrink-0 capitalize"
                            style={{
                              borderColor: c.status === "active" ? "#0CA678" : "#F59F00",
                              color:       c.status === "active" ? "#0CA678" : "#F59F00",
                            }}
                          >
                            {c.status}
                          </Badge>
                        </div>
                        <p className="text-sm font-mono font-medium flex-shrink-0 ml-3" style={{ color: "hsl(var(--foreground))" }}>
                          {fmt(committed)}
                        </p>
                      </div>
                      {/* progress bar */}
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(callPct, 100)}%`, background: "#3B5BDB" }}
                        />
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

      {/* ── NAV history ── */}
      <Card className="border mb-6" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            NAV History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loadingNAV ? (
            <Skeleton className="h-16 w-full" />
          ) : (navMarks as any[]).length === 0 ? (
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No marks yet</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
              {[...(navMarks as any[])]
                .sort((a, b) => new Date(b.mark_date).getTime() - new Date(a.mark_date).getTime())
                .map((mark: any) => {
                  const fv   = parseFloat(mark.fair_value  || 0);
                  const cost = parseFloat(mark.cost_basis  || 0);
                  const gain = fv - cost;
                  return (
                    <div key={mark.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                          {mark.mark_date}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {mark.valuation_notes}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>
                          {fmt(fv)}
                        </p>
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

      {/* ── Fund structure ── */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Fund Structure
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="space-y-3">
            {[
              { label: "General Partner",   value: "FC Strat. Opps. Fund I GP Limited",         note: "Cayman Islands Exempted Company · Incorporated 9 Oct 2025" },
              { label: "Limited Partner",   value: "Founders Capital Strat. Opps. Fund I LP",   note: "Reg. No. 134092 · Registered 10 Oct 2025" },
              { label: "AIFM",             value: "Paxiot Limited (UK)",                       note: "FCA Authorised · Co. No. 07455644 · Management delegation" },
              { label: "Sole Director",     value: "Richard Hadler",                             note: "Appointed to GP entity" },
              { label: "Registered Agent",  value: "Walkers Corporate Ltd",                     note: "190 Elgin Ave, George Town, Grand Cayman KY1-9008" },
              { label: "Regulator",         value: "CIMA",                                      note: "Cayman Islands Monetary Authority · Exempted LP Register" },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-4">
                <span className="w-36 flex-shrink-0 font-medium text-xs pt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {row.label}
                </span>
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
