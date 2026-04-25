import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  ChevronRight,
  BarChart2,
  Layers,
  TrendingUp,
  DollarSign,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PLSnapshot {
  vectors: {
    name: string;
    short_code: string;
    investment: string | null;
    lp_count: number;
    total_committed: number;
    total_called: number;
    cost_basis: number;
    fair_value: number | null;
  }[];
  consolidated: {
    total_committed: number;
    total_called: number;
    total_uncalled: number;
    total_cost_basis: number;
    lp_count: number;
  };
  as_of_date: string;
}

const USD = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
};

const PCT = (n: number | null | undefined) => {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
};

const SHEETS = [
  { label: "Cover", desc: "Overview and navigation" },
  { label: "Assumptions", desc: "Carry, fees, discount rates, macro" },
  { label: "Vector III P&L", desc: "Reach Power, Inc. — series detail" },
  { label: "Vector IV P&L", desc: "Project Prometheus — series detail" },
  { label: "Consolidated", desc: "All series aggregated + multi-vector LP exposure" },
  { label: "GP Entity", desc: "Founders Capital Platform LLC GP economics" },
];

export default function PLModel() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Fetch a lightweight snapshot from Supabase-backed route
  const { data: snapshot, isLoading } = useQuery<PLSnapshot>({
    queryKey: ["/api/reports/pl-snapshot"],
    queryFn: async () => {
      // Build snapshot from existing entity/investment/commitment endpoints
      const [entitiesRes, investmentsRes, commitmentsRes] = await Promise.all([
        apiRequest("GET", "/api/entities"),
        apiRequest("GET", "/api/investments"),
        apiRequest("GET", "/api/investor-commitments"),
      ]);

      const entities: any[] = await entitiesRes.json();
      const investments: any[] = await investmentsRes.json();
      const commitments: any[] = await commitmentsRes.json();

      const seriesEntities = entities.filter((e) => e.entity_type === "series_spv");

      const vectors = seriesEntities.map((e) => {
        const inv = investments.find((i) => i.entity_id === e.id);
        const lpList = commitments.filter((c) => c.entity_id === e.id);
        return {
          name: e.name,
          short_code: e.short_code,
          investment: inv?.company_name ?? null,
          lp_count: lpList.length,
          total_committed: lpList.reduce((s: number, c: any) => s + (c.committed_amount || 0), 0),
          total_called: lpList.reduce((s: number, c: any) => s + (c.called_amount || 0), 0),
          cost_basis: inv?.cost_basis ?? 0,
          fair_value: inv?.current_fair_value ?? null,
        };
      });

      const consolidated = {
        total_committed: vectors.reduce((s, v) => s + v.total_committed, 0),
        total_called: vectors.reduce((s, v) => s + v.total_called, 0),
        total_uncalled: vectors.reduce(
          (s, v) => s + (v.total_committed - v.total_called),
          0
        ),
        total_cost_basis: vectors.reduce((s, v) => s + v.cost_basis, 0),
        lp_count: vectors.reduce((s, v) => s + v.lp_count, 0),
      };

      return {
        vectors,
        consolidated,
        as_of_date: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      };
    },
    staleTime: 60_000,
  });

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(
        window.location.origin.replace(/:\d+$/, ":5000") + "/api/reports/pl-model"
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "FC_PL_Model.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setDownloadError(e.message ?? "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "hsl(var(--foreground))" }}
          >
            P&amp;L Model
          </h1>
          <p
            className="text-sm mt-0.5"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Series &amp; Consolidated Profit &amp; Loss · Excel workbook
            {snapshot && (
              <span className="ml-2 opacity-60">
                · As of {snapshot.as_of_date}
              </span>
            )}
          </p>
        </div>

        <Button
          data-testid="button-download-pl"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 text-sm font-medium"
          style={{
            background: "hsl(var(--primary))",
            color: "white",
          }}
        >
          {downloading ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {downloading ? "Downloading…" : "Download FC_PL_Model.xlsx"}
        </Button>
      </div>

      {downloadError && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "hsl(0 80% 96%)",
            color: "hsl(0 70% 35%)",
            border: "1px solid hsl(0 70% 80%)",
          }}
        >
          {downloadError}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            icon: Layers,
            label: "Active Series",
            value: isLoading ? "…" : String(snapshot?.vectors.length ?? 0),
          },
          {
            icon: DollarSign,
            label: "Total Committed",
            value: isLoading ? "…" : USD(snapshot?.consolidated.total_committed),
          },
          {
            icon: TrendingUp,
            label: "Total Called",
            value: isLoading ? "…" : USD(snapshot?.consolidated.total_called),
          },
          {
            icon: Users,
            label: "Total LPs",
            value: isLoading ? "…" : String(snapshot?.consolidated.lp_count ?? 0),
          },
        ].map(({ icon: Icon, label, value }) => (
          <Card
            key={label}
            data-testid={`card-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color: "hsl(var(--primary))" }} />
                <span
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {label}
                </span>
              </div>
              <div
                className="text-xl font-bold"
                style={{ color: "hsl(var(--foreground))" }}
              >
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Series cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? [0, 1].map((i) => (
              <Card
                key={i}
                className="animate-pulse"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  height: 180,
                }}
              />
            ))
          : snapshot?.vectors.map((v) => {
              const unrealised =
                v.fair_value != null ? v.fair_value - v.cost_basis : null;
              const callPct =
                v.total_committed > 0
                  ? (v.total_called / v.total_committed) * 100
                  : 0;
              return (
                <Card
                  key={v.short_code}
                  data-testid={`card-series-${v.short_code.toLowerCase()}`}
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle
                          className="text-sm font-semibold"
                          style={{ color: "hsl(var(--foreground))" }}
                        >
                          {v.short_code}
                        </CardTitle>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          {v.investment ?? "No investment recorded"}
                        </p>
                      </div>
                      <Badge
                        style={{
                          background: "hsl(var(--primary) / 0.12)",
                          color: "hsl(var(--primary))",
                          border: "none",
                          fontSize: "0.7rem",
                        }}
                      >
                        {v.lp_count} LPs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {[
                        ["Committed", USD(v.total_committed)],
                        ["Called", USD(v.total_called)],
                        ["Cost Basis", USD(v.cost_basis)],
                        [
                          "Fair Value",
                          v.fair_value != null ? USD(v.fair_value) : "Not marked",
                        ],
                        [
                          "Unrealised G/(L)",
                          unrealised != null ? USD(unrealised) : "—",
                        ],
                        ["Call %", PCT(callPct / 100)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between">
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>
                            {lbl}
                          </span>
                          <span
                            className="font-medium tabular-nums"
                            style={{ color: "hsl(var(--foreground))" }}
                          >
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Call progress bar */}
                    <div
                      className="h-1 rounded-full mt-2"
                      style={{ background: "hsl(var(--border))" }}
                    >
                      <div
                        className="h-1 rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(callPct, 100)}%`,
                          background: "hsl(var(--primary))",
                        }}
                      />
                    </div>
                    <p
                      className="text-xs"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      {callPct.toFixed(1)}% of commitment called
                    </p>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* Workbook structure */}
      <Card
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle
            className="text-sm font-semibold flex items-center gap-2"
            style={{ color: "hsl(var(--foreground))" }}
          >
            <FileSpreadsheet size={15} style={{ color: "hsl(var(--primary))" }} />
            Workbook Structure · 6 Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {SHEETS.map((s, i) => (
              <div
                key={s.label}
                className="flex items-center gap-3 py-2.5"
                data-testid={`row-sheet-${i}`}
              >
                <span
                  className="text-xs font-mono w-5 text-center"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {i + 1}
                </span>
                <ChevronRight
                  size={12}
                  style={{ color: "hsl(var(--primary))" }}
                />
                <span
                  className="text-sm font-medium w-36"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  {s.label}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {s.desc}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Colour coding legend */}
      <Card
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle
            className="text-sm font-semibold flex items-center gap-2"
            style={{ color: "hsl(var(--foreground))" }}
          >
            <BarChart2 size={15} style={{ color: "hsl(var(--primary))" }} />
            Colour Coding Convention
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { color: "#0000FF", label: "Blue text — hardcoded inputs (change for scenarios)" },
              { color: "#000000", label: "Black text — formulas (do not edit)" },
              { color: "#008000", label: "Green text — cross-sheet links" },
              { color: "#C9A84C", label: "Gold rows — subtotals / net positions" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: color }}
                />
                <span style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p
        className="text-xs pb-4"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        Data sourced from Founders Capital Supabase database ·{" "}
        <a
          href="https://yoyrwrdzivygufbzckdv.supabase.co"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          yoyrwrdzivygufbzckdv.supabase.co
        </a>
      </p>
    </div>
  );
}
