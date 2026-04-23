import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtUSD, fmtDate } from "@/lib/utils";
import { TrendingUp, Users, Building2, DollarSign, AlertCircle } from "lucide-react";

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
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
        <div
          className="p-1.5 rounded-md"
          style={{ background: accent ? "hsl(213 94% 62% / 0.12)" : "hsl(var(--secondary))" }}
        >
          <Icon size={14} style={{ color: accent ? "hsl(213 94% 62%)" : "hsl(var(--muted-foreground))" }} />
        </div>
      </div>
      <div className="text-2xl font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          Platform Overview
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Founders Capital Platform LLC · Delaware Series LLC
        </p>
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
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {spv.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {spv.short_code}
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: spv.status === 'active' ? "hsl(142 71% 42% / 0.15)" : "hsl(var(--secondary))",
                      color: spv.status === 'active' ? "hsl(142 71% 55%)" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {spv.status}
                  </span>
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
                    <td className="px-5 py-3 font-medium" style={{ color: "hsl(var(--foreground))" }}>{inv.company_name}</td>
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
