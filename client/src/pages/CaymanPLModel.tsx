import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";

// Cayman entity IDs
const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";  // LP
const CAYMAN_GP_ID   = "3540df09-f8bb-43ca-a4de-b89945b6b16b";  // GP

const USD = (n: number | null | undefined, dp = 0) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n);
};

const CAYMAN_SHEETS = [
  { label: "Cover",         desc: "Overview and navigation" },
  { label: "Assumptions",   desc: "Paxiot flat fee (£2,400/month), carry, FX rates — per executed legal docs" },
  { label: "Fund Summary",  desc: "NAV, IRR, TVPI, DPI — fund-level KPIs" },
  { label: "Portfolio",     desc: "YC portfolio investments — cost basis, fair value, MOIC" },
  { label: "Waterfall",     desc: "LP distribution model — return of capital → 80% LP / 20% FC Group Holding carry (no hurdle)" },
  { label: "Cap Accounts",  desc: "LP & GP capital account movements" },
  { label: "GP Economics",  desc: "Paxiot flat fee, FC Group Holding carry entitlement (no hurdle, no catch-up)" },
  { label: "Invoices",      desc: "Formation & running cost register (actuals)" },
];

const CATEGORY_LABELS: Record<string, string> = {
  formation:    "Formation costs",
  legal:        "Legal & professional fees",
  admin:        "Administration",
  audit:        "Audit & accounting",
  compliance:   "Compliance & regulatory",
  management:   "Management fees",
  other:        "Other expenses",
};

export default function CaymanPLModel() {
  const [downloading, setDownloading]       = useState(false);
  const [downloadError, setDownloadError]   = useState<string | null>(null);

  // Live entity costs — fund LP
  const { data: fundCosts = [], isLoading: loadingFund } = useQuery<any[]>({
    queryKey: ["/api/entity-costs", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  // Live entity costs — GP entity
  const { data: gpCosts = [], isLoading: loadingGP } = useQuery<any[]>({
    queryKey: ["/api/entity-costs", CAYMAN_GP_ID],
    queryFn: () =>
      apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_GP_ID}`).then(r => r.json()),
  });

  const isLoading = loadingFund || loadingGP;

  // Combine — exclude voided
  const allCosts: any[] = [...fundCosts, ...gpCosts].filter(c => c.status !== "void");

  // Totals
  const totalExpenses = allCosts.reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0);
  const accrued       = allCosts.filter(c => c.status === "accrued").reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0);
  const paid          = allCosts.filter(c => c.status === "paid").reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0);

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const c of allCosts) {
    const cat = c.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + parseFloat(c.amount_usd || 0);
  }
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  // Formation costs KPI (formation + legal categories, or fall back to all)
  const formationCosts = allCosts
    .filter(c => c.category === "formation" || c.category === "legal")
    .reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0) || totalExpenses;

  // Individual invoice rows for the P&L detail table
  const invoiceRows = [...allCosts].sort(
    (a, b) => new Date(b.cost_date).getTime() - new Date(a.cost_date).getTime()
  );

  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  function statusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      accrued: { label: "Accrued", cls: "bg-amber-100 text-amber-800" },
      paid:    { label: "Paid",    cls: "bg-green-100 text-green-800" },
      void:    { label: "Void",    cls: "bg-gray-100 text-gray-400" },
    };
    const s = map[status] ?? map.accrued;
    return <Badge className={`${s.cls} text-[10px] px-1.5 py-0 font-medium border-0`}>{s.label}</Badge>;
  }

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
    <div className="min-h-screen p-6 space-y-6" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            P&amp;L Model
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Fund-level Profit &amp; Loss · Founders Capital Strat. Opps. Fund I · Cayman Islands
          </p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 text-sm font-medium"
          style={{ background: "hsl(var(--primary))", color: "white" }}
        >
          {downloading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
          {downloading ? "Downloading…" : "Download FC_Cayman_PL_Model.xlsx"}
        </Button>
      </div>

      {downloadError && (
        <div className="rounded-md px-4 py-3 text-sm"
          style={{ background: "hsl(0 80% 96%)", color: "hsl(0 70% 35%)", border: "1px solid hsl(0 70% 80%)" }}>
          {downloadError}
        </div>
      )}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: "Total Expenses",           value: isLoading ? "…" : USD(totalExpenses) },
          { icon: TrendingUp, label: "Accrued (unpaid)",         value: isLoading ? "…" : USD(accrued) },
          { icon: Globe,      label: "Paid",                     value: isLoading ? "…" : USD(paid) },
          { icon: Globe,      label: "No. of Cost Entries",      value: isLoading ? "…" : String(allCosts.length) },
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

      {/* ── P&L Statement ────────────────────────────────────────────────── */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Income &amp; Expenditure Statement
          </CardTitle>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Inception to date · amounts in USD · excludes voided entries
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-4">

          {/* Income */}
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Income
            </div>
            <div className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <span style={{ color: "hsl(var(--foreground))" }}>Investment income / management fee income</span>
              <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>—</span>
            </div>
            <div className="flex justify-between text-sm font-semibold py-1.5" style={{ color: "hsl(var(--foreground))" }}>
              <span>Total Income</span>
              <span>$—</span>
            </div>
          </div>

          {/* Expenditure */}
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1 mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              Expenditure
            </div>
            {isLoading ? (
              <p className="text-sm py-2" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
            ) : categoryRows.length === 0 ? (
              <p className="text-sm py-2" style={{ color: "hsl(var(--muted-foreground))" }}>No expense entries recorded.</p>
            ) : (
              categoryRows.map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <span style={{ color: "hsl(var(--foreground))" }}>{CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{USD(amt, 2)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between text-sm font-semibold py-1.5 mt-1" style={{ color: "hsl(var(--foreground))" }}>
              <span>Total Expenditure</span>
              <span>{isLoading ? "…" : USD(totalExpenses, 2)}</span>
            </div>
          </div>

          {/* Net */}
          <div className="flex justify-between text-sm font-bold py-2 rounded-md px-2 mt-1"
            style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
            <span>Net Result (Deficit)</span>
            <span className="text-red-600">{isLoading ? "…" : `(${USD(totalExpenses, 2)})`}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice detail table ─────────────────────────────────────────── */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Cost Register — Line Items
          </CardTitle>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            All non-voided entries across fund LP and GP entity
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-4 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm py-2" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
          ) : invoiceRows.length === 0 ? (
            <p className="text-sm py-2" style={{ color: "hsl(var(--muted-foreground))" }}>No cost entries yet.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  {["Date", "Description", "Category", "Currency", "Amount", "Amount (USD)", "Status"].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-semibold uppercase tracking-wide"
                      style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map(inv => (
                  <tr key={inv.id} className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: "hsl(var(--foreground))" }}>
                      {fmtDate(inv.cost_date)}
                    </td>
                    <td className="py-2 pr-4 max-w-xs" style={{ color: "hsl(var(--foreground))" }}>
                      {inv.description || "—"}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {CATEGORY_LABELS[inv.category] ?? inv.category ?? "—"}
                    </td>
                    <td className="py-2 pr-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {inv.currency || "USD"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {inv.currency !== "USD"
                        ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(inv.amount || 0))
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {USD(parseFloat(inv.amount_usd || 0), 2)}
                    </td>
                    <td className="py-2">{statusBadge(inv.status)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="font-bold border-t-2" style={{ borderColor: "hsl(var(--border))" }}>
                  <td colSpan={5} className="py-2 pr-4" style={{ color: "hsl(var(--foreground))" }}>Total</td>
                  <td className="py-2 pr-4 text-right" style={{ color: "hsl(var(--foreground))" }}>{USD(totalExpenses, 2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ── Fund Overview ────────────────────────────────────────────────── */}
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
              ["LP",                "FC Group Holding Ltd 99% LP / GP 1%"],
              ["Inception",         "9 Oct 2025"],
              ["Mgmt Fee",          "£2,400/month flat (Paxiot · Investment Period) — NOT % of NAV"],
              ["Carry",             "20% · FC Group Holding Ltd · No hurdle / catch-up / HWM (LPA Cl.11.1)"],
              ["Portfolio Cost",    "Pending — Airtable tables in build"],
              ["Investments",       "Pending — Airtable tables in build"],
              ["Formation Costs",   isLoading ? "Loading…" : USD(totalExpenses, 2)],
            ].map(([lbl, val]) => (
              <div key={lbl} className="flex flex-col gap-0.5">
                <span style={{ color: "hsl(var(--muted-foreground))" }}>{lbl}</span>
                <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{val}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Workbook structure ───────────────────────────────────────────── */}
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

      {/* ── Colour coding ────────────────────────────────────────────────── */}
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
        Data sourced live from Founders Capital Supabase ·{" "}
        <a href="https://yoyrwrdzivygufbzckdv.supabase.co" target="_blank" rel="noreferrer" className="underline">
          yoyrwrdzivygufbzckdv.supabase.co
        </a>
        {" "}· Voided invoices excluded
      </p>
    </div>
  );
}
