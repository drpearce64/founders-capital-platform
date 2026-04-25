import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, Users, DollarSign, TrendingUp, Globe, Building2 } from "lucide-react";

export default function CaymanDashboard() {
  const { data: entities } = useQuery({
    queryKey: ["/api/entities-full"],
    queryFn: () => apiRequest("GET", "/api/entities-full").then(r => r.json()),
  });

  const caymanEntities = Array.isArray(entities)
    ? entities.filter((e: any) => e.jurisdiction === "Cayman Islands")
    : [];

  const kpis = [
    {
      label: "Fund Strategy",
      value: "AI & Robotics",
      sub: "Early & Late Stage",
      icon: TrendingUp,
      color: "#3B5BDB",
    },
    {
      label: "Target Positions",
      value: "15–20",
      sub: "Portfolio companies",
      icon: Building2,
      color: "#0CA678",
    },
    {
      label: "Base Currency",
      value: "USD",
      sub: "All reporting in USD",
      icon: DollarSign,
      color: "#F59F00",
    },
    {
      label: "AIFM",
      value: "Paxiot Limited",
      sub: "FCA Authorised",
      icon: Globe,
      color: "#7048E8",
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🇰🇾</span>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Cayman Islands Dashboard
          </h1>
          <Badge variant="outline" className="ml-1 text-xs">Exempted LP</Badge>
        </div>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Founders Capital Strat. Opps. Fund I LP — Reg. No. 134092 · CIMA Registered
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {kpi.label}
                  </p>
                  <p className="text-lg font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                    {kpi.value}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {kpi.sub}
                  </p>
                </div>
                <div className="p-2 rounded-lg" style={{ background: kpi.color + "22" }}>
                  <kpi.icon size={16} style={{ color: kpi.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entity Cards */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "hsl(var(--foreground))" }}>
          Cayman Entities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caymanEntities.length === 0 ? (
            <p className="text-sm col-span-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              Loading entities…
            </p>
          ) : (
            caymanEntities.map((entity: any) => (
              <Card key={entity.short_code} className="border" style={{ borderColor: "hsl(var(--border))" }}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {entity.name}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: entity.entity_type === "cayman_gp" ? "#7048E8" : "#3B5BDB",
                        color:       entity.entity_type === "cayman_gp" ? "#7048E8" : "#3B5BDB",
                      }}
                    >
                      {entity.entity_type === "cayman_gp" ? "GP" : "Fund LP"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <div>
                      <span className="font-medium">Short code</span>
                      <p className="font-mono mt-0.5">{entity.short_code}</p>
                    </div>
                    <div>
                      <span className="font-medium">Currency</span>
                      <p className="mt-0.5">{entity.reporting_currency}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Jurisdiction</span>
                      <p className="mt-0.5">🇰🇾 {entity.jurisdiction}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Fund Structure Overview */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Fund Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { label: "General Partner",   value: "FC Strat. Opps. Fund I GP Limited", note: "Cayman Islands Exempted Company · Incorporated 9 Oct 2025" },
              { label: "Limited Partner",   value: "Founders Capital Strat. Opps. Fund I LP", note: "Reg. No. 134092 · Registered 10 Oct 2025" },
              { label: "AIFM",             value: "Paxiot Limited (UK)", note: "FCA Authorised · Co. No. 07455644 · Management delegation" },
              { label: "Sole Director",     value: "Richard Hadler", note: "Appointed to GP entity" },
              { label: "Registered Agent",  value: "Walkers Corporate Ltd", note: "190 Elgin Ave, George Town, Grand Cayman KY1-9008" },
              { label: "Regulator",         value: "CIMA", note: "Cayman Islands Monetary Authority · Exempted LP Register" },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-4">
                <span className="w-36 flex-shrink-0 font-medium text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
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
