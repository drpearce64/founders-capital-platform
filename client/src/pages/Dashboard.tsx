import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtUSD, fmtDate } from "@/lib/utils";
import { TrendingUp, Users, Building2, DollarSign, AlertCircle, Network, ChevronRight, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";

interface DashboardData {
  spv_count: number;
  lp_count: number;
  total_committed: number;
  total_called: number;
  total_outstanding: number;
  total_invested: number;
  total_fair_value: number;
  unrealised_gain: number;
  spvs: any[];
  recent_investments: any[];
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: any; accent?: boolean;
}) {
  const iconColor = accent ? "hsl(231 70% 54%)" : "hsl(var(--muted-foreground))";
  return (
    <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
              {label}
            </p>
            <p className="text-xl font-semibold leading-tight mono" style={{ color: "hsl(var(--foreground))" }}>
              {value}
            </p>
            {sub && (
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                {sub}
              </p>
            )}
          </div>
          <div
            className="p-2 rounded-lg flex-shrink-0 ml-3"
            style={{ background: iconColor + "22" }}
          >
            <Icon size={15} style={{ color: iconColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Delaware Entity Structure ────────────────────────────────────────────────
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
        {
          label: "Founders Capital Platform GP, LP",
          sub: "FC-PLATFORM-GP · Delaware GP",
          color: "hsl(231 70% 60%)",
          children: [],
        },
        {
          label: "Founders Capital Platform LP",
          sub: "FC-PLATFORM-LP · Master Series LLC",
          color: "hsl(231 70% 60%)",
          children: [
            { label: "Vector I",  sub: "FC-VECTOR-I · Protected Series",  color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector II", sub: "FC-VECTOR-II · Protected Series", color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector III · Reach Power",  sub: "FC-VECTOR-III · EIN 36-5168991",  color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector IV · Project Prometheus", sub: "FC-VECTOR-IV · EIN 61-2311112", color: "hsl(142 70% 45%)", children: [] },
            { label: "Vector V",  sub: "FC-VECTOR-V · Protected Series",  color: "hsl(142 70% 45%)", children: [] },
          ],
        },
      ],
    },
  ],
};

interface OrgNode {
  label: string;
  sub: string;
  color: string;
  note?: string;
  children: OrgNode[];
}

function OrgTreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      {depth > 0 && (
        <div
          className="absolute"
          style={{
            left: -12, top: 14,
            width: 12, height: 1,
            background: "hsl(var(--border))",
          }}
        />
      )}
      <div className="relative flex items-start gap-2 mb-2">
        {hasChildren && (
          <button
            onClick={() => setOpen(o => !o)}
            className="mt-1 flex-shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity"
            style={{ color: node.color }}
          >
            <ChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        )}
        {!hasChildren && <div className="w-5 flex-shrink-0" />}
        <div
          className="flex-1 rounded-lg px-3 py-2 border text-sm"
          style={{
            borderColor: node.color + "55",
            background: node.color + "0D",
          }}
        >
          <div className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>
            {node.label}
            {node.note && (
              <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                {node.note}
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{node.sub}</div>
        </div>
      </div>
      {hasChildren && open && (
        <div className="relative pl-5 border-l" style={{ borderColor: "hsl(var(--border))" }}>
          {node.children.map((child, i) => (
            <OrgTreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [structureOpen, setStructureOpen] = useState(false);

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => apiRequest("GET", "/api/dashboard").then(r => r.json()),
  });

  if (isLoading) return (
    <div className="p-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl p-5 border animate-pulse h-28"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8 flex items-center gap-3 text-sm" style={{ color: "hsl(var(--destructive))" }}>
      <AlertCircle size={16} /> Failed to load dashboard data
    </div>
  );

  return (
    <div className="p-8 max-w-6xl">
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
          <div
            className="mt-6 rounded-lg p-4 text-xs space-y-1"
            style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
          >
            <div className="font-medium mb-2" style={{ color: "hsl(var(--foreground))" }}>Notes</div>
            <div>· UK entities are shown for structural context only — no portal reporting</div>
            <div>· Protected Series SPVs are segregated cells of FC Platform LP</div>
            <div>· AIFM delegation: Paxiot Limited (FCA-Authorised, Co. No. 07455644)</div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Platform Overview
            </h1>
            <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Founders Capital Platform LLC · Delaware Series LLC
            </p>
          </div>
          <button
            data-testid="button-entity-structure"
            onClick={() => setStructureOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
            style={{
              background: "hsl(231 70% 54% / 0.10)",
              borderColor: "hsl(231 70% 54% / 0.30)",
              color: "hsl(231 70% 72%)",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "hsl(231 70% 54% / 0.18)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "hsl(231 70% 54% / 0.10)";
            }}
          >
            <Network size={14} />
            Entity Structure
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active SPVs" value={String(data?.spv_count ?? 0)} icon={Building2} />
        <StatCard label="Total LPs" value={String(data?.lp_count ?? 0)} icon={Users} />
        <StatCard
          label="Total Committed"
          value={fmtUSD(data?.total_committed)}
          sub={`${fmtUSD(data?.total_outstanding)} outstanding`}
          icon={DollarSign}
          accent
        />
        <StatCard
          label="Fair Value"
          value={fmtUSD(data?.total_fair_value)}
          sub={data?.unrealised_gain !== undefined
            ? `${data.unrealised_gain >= 0 ? "+" : ""}${fmtUSD(data.unrealised_gain)} unrealised`
            : undefined}
          icon={TrendingUp}
          accent
        />
      </div>

      {/* SPV cards */}
      {data?.spvs && data.spvs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
            Series SPVs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.spvs.map((spv: any) => (
              <div
                key={spv.id}
                data-testid={`spv-card-${spv.id}`}
                className="rounded-xl p-5 border"
                style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
              >
                <div className="mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold leading-snug" style={{ color: "hsl(var(--foreground))" }}>
                      {spv.name}
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        background: spv.status === 'active' ? "hsl(142 71% 42% / 0.15)" : "hsl(var(--secondary))",
                        color: spv.status === 'active' ? "hsl(142 71% 55%)" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {spv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {spv.short_code}
                    </div>
                    {spv.investments && spv.investments.length > 0 && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}
                      >
                        {spv.investments[0].company_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {spv.bank_account_no && (
                    <div className="flex justify-between">
                      <span>Account</span>
                      <span className="mono" style={{ color: "hsl(var(--foreground))" }}>{spv.bank_account_no}</span>
                    </div>
                  )}
                  {spv.hsbc_account_ref && (
                    <div className="flex justify-between">
                      <span>HSBC Ref</span>
                      <span className="mono" style={{ color: "hsl(var(--foreground))" }}>{spv.hsbc_account_ref}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Formed</span>
                    <span>{fmtDate(spv.formation_date) || spv.jurisdiction}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent investments */}
      {data?.recent_investments && data.recent_investments.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
            Portfolio
          </h2>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "hsl(var(--border))" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                  <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Company</th>
                  <th className="text-right px-5 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Cost Basis</th>
                  <th className="text-right px-5 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Fair Value</th>
                  <th className="text-right px-5 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_investments.map((inv: any, i: number) => (
                  <tr
                    key={inv.id}
                    data-testid={`investment-row-${inv.id}`}
                    style={{
                      background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))",
                      borderBottom: "1px solid hsl(var(--border))",
                    }}
                  >
                    <td className="px-5 py-3" style={{ color: "hsl(var(--foreground))" }}>
                      <div className="flex items-center gap-2">
                        {inv.entities?.short_code && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                            {inv.entities.short_code.replace("FC-", "")}
                          </span>
                        )}
                        <span className="font-medium">{inv.company_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right mono" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(inv.cost_basis)}</td>
                    <td className="px-5 py-3 text-right mono" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(inv.current_fair_value)}</td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: "hsl(142 71% 42% / 0.15)",
                          color: "hsl(142 71% 55%)",
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
