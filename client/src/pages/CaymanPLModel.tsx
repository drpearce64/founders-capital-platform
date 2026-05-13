import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  ChevronRight,
  BarChart2,
  DollarSign,
  TrendingUp,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const USD = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
};


const CAYMAN_SHEETS = [
  { label: "Cover",         desc: "Overview and navigation" },
  { label: "Assumptions",   desc: "Mgmt fee, carry, hurdle rate, FX rates" },
  { label: "Fund Summary",  desc: "NAV, IRR, TVPI, DPI — fund-level KPIs" },
  { label: "Portfolio",     desc: "YC portfolio investments — cost basis, fair value, MOIC" },
  { label: "Waterfall",     desc: "LP distribution model — return of capital, hurdle, carry" },
  { label: "Cap Accounts",  desc: "LP & GP capital account movements" },
  { label: "GP Economics",  desc: "Management fees, carry entitlement, catch-up" },
  { label: "Invoices",      desc: "Formation & running cost register (actuals)" },
];

const CAYMAN_STATIC = {
  running_costs_pa:  39_768,
  invoices_total:    34_279.40,
  inception_date:    "9 Oct 2025",
  fund_size_note:    "FC Group Holding Ltd 99% LP / GP 1%",
};

export default function CaymanPLModel() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await apiRequest("GET", "/api/reports/cayman-pl-model");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "FC_Cayman_PL_Model.xlsx";
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
            Fund-level Profit &amp; Loss · Founders Capital Strat. Opps. Fund I · Cayman Islands
          </p>
        </div>

        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 text-sm font-medium"
          style={{ background: "hsl(var(--primary))", color: "white" }}
        >
          {downloading ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {downloading ? "Downloading…" : "Download FC_Cayman_PL_Model.xlsx"}
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
          { icon: DollarSign, label: "Portfolio Cost Basis",     value: "Pending" },
          { icon: TrendingUp, label: "Live Market Value",         value: "Pending" },
          { icon: TrendingUp, label: "Running Costs p.a.",        value: USD(CAYMAN_STATIC.running_costs_pa) },
          { icon: Globe,      label: "Formation Costs (actual)",  value: USD(CAYMAN_STATIC.invoices_total) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color: "hsl(var(--primary))" }} />
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {label}
                </span>
              </div>
              <div className="text-xl font-bold" style={{ color: "hsl(var(--foreground))" }}>
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fund overview card */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Fund Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            {[
              ["Fund",              "Founders Capital Strat. Opps. Fund I LP"],
              ["GP",                "FC Strat. Opps. Fund I GP Limited"],
              ["Structure",         "Closed-ended LP · Cayman Islands"],
              ["LP",                CAYMAN_STATIC.fund_size_note],
              ["Inception",         CAYMAN_STATIC.inception_date],
              ["Mgmt Fee",          "2% of NAV p.a."],
              ["Carry",             "20% over 8% p.a. hurdle (compounded)"],
              ["Portfolio Cost",    "Pending — Airtable tables in build"],
              ["Investments",       "Pending — Airtable tables in build"],
              ["Formation Invoices","RW Blears £17,600 + Walkers $11,927.40"],
            ].map(([lbl, val]) => (
              <div key={lbl} className="flex flex-col gap-0.5">
                <span style={{ color: "hsl(var(--muted-foreground))" }}>{lbl}</span>
                <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{val}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workbook structure */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
            <FileSpreadsheet size={15} style={{ color: "hsl(var(--primary))" }} />
            Workbook Structure · {CAYMAN_SHEETS.length} Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {CAYMAN_SHEETS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3 py-2.5">
                <span className="text-xs font-mono w-5 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>{i + 1}</span>
                <ChevronRight size={12} style={{ color: "hsl(var(--primary))" }} />
                <span className="text-sm font-medium w-36" style={{ color: "hsl(var(--foreground))" }}>{s.label}</span>
                <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{s.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Colour coding legend */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
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
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs pb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Data sourced from Founders Capital Supabase database ·{" "}
        <a href="https://yoyrwrdzivygufbzckdv.supabase.co" target="_blank" rel="noreferrer" className="underline">
          yoyrwrdzivygufbzckdv.supabase.co
        </a>
      </p>
    </div>
  );
}
