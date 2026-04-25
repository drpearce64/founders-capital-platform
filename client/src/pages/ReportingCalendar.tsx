import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Status = "complete" | "due-soon" | "overdue" | "upcoming";
type Jurisdiction = "delaware" | "cayman" | "both";
type Frequency = "annual" | "semi-annual" | "quarterly" | "monthly" | "ad-hoc";

interface ReportItem {
  id: string;
  jurisdiction: Jurisdiction;
  category: string;
  title: string;
  description: string;
  frequency: Frequency;
  deadline: string;       // e.g. "31 March" or "15 days after close"
  month?: number;         // 1-12 for fixed-month items
  status: Status;
  recipient: string;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// Data — all reporting obligations
// ─────────────────────────────────────────────────────────────
const ITEMS: ReportItem[] = [
  // ── Delaware / US ─────────────────────────────────────────

  // Tax
  {
    id: "de-tax-1065",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Form 1065 — US Partnership Return",
    description: "Federal partnership return for Founders Capital Platform LP and each active Series SPV.",
    frequency: "annual",
    deadline: "15 March",
    month: 3,
    status: "upcoming",
    recipient: "IRS",
    notes: "Extension to 15 September available on Form 7004.",
  },
  {
    id: "de-tax-k1",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Schedule K-1 — LP Partner Statements",
    description: "Issued to each Limited Partner showing income, gain, loss, deduction, and credit allocations.",
    frequency: "annual",
    deadline: "15 March",
    month: 3,
    status: "upcoming",
    recipient: "All LPs",
    notes: "Issued alongside Form 1065. Extended deadline mirrors partnership return.",
  },
  {
    id: "de-tax-state",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Delaware State Tax — Annual Report & Franchise Tax",
    description: "Annual report and franchise tax filing for each Delaware entity (Platform LP, Series SPVs, Holdings LLC, GP).",
    frequency: "annual",
    deadline: "1 June",
    month: 6,
    status: "upcoming",
    recipient: "Delaware Division of Corporations",
  },
  {
    id: "de-tax-fbar",
    jurisdiction: "delaware",
    category: "Tax",
    title: "FBAR — FinCEN Report 114",
    description: "Foreign Bank Account Report if any Delaware entity holds foreign financial accounts >$10,000.",
    frequency: "annual",
    deadline: "15 April",
    month: 4,
    status: "upcoming",
    recipient: "FinCEN",
    notes: "Auto-extension to 15 October.",
  },
  {
    id: "de-tax-fatca-8966",
    jurisdiction: "delaware",
    category: "Tax",
    title: "FATCA — Form 8966 (if applicable)",
    description: "FATCA reporting for US-source payments to foreign LPs.",
    frequency: "annual",
    deadline: "31 March",
    month: 3,
    status: "upcoming",
    recipient: "IRS",
  },

  // LP Reporting
  {
    id: "de-lp-quarterly",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Quarterly LP Report",
    description: "Portfolio update, NAV per unit, capital account movements, and series activity summary.",
    frequency: "quarterly",
    deadline: "45 days after quarter end",
    status: "upcoming",
    recipient: "All LPs",
  },
  {
    id: "de-lp-annual",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Annual LP Statement",
    description: "Full-year audited or reviewed financial statements, MOIC, IRR, and portfolio company updates.",
    frequency: "annual",
    deadline: "90 days after year end (31 March)",
    month: 3,
    status: "upcoming",
    recipient: "All LPs",
  },
  {
    id: "de-lp-capital-call",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Capital Call Notices",
    description: "Formal capital call notice to LPs with amount, due date, wire instructions, and purpose.",
    frequency: "ad-hoc",
    deadline: "10 business days notice (per LPA)",
    status: "upcoming",
    recipient: "All LPs",
  },
  {
    id: "de-lp-distribution",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Distribution Notices",
    description: "Notice of distribution with calculation methodology, waterfall breakdown, and wire details.",
    frequency: "ad-hoc",
    deadline: "Prior to distribution",
    status: "upcoming",
    recipient: "All LPs",
  },

  // Regulatory
  {
    id: "de-reg-fincen-boi",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "FinCEN — Beneficial Ownership Information (BOI)",
    description: "CTA beneficial ownership report for each Delaware entity (Platform LP, Series SPVs, Holdings LLC, GP).",
    frequency: "annual",
    deadline: "1 January (updates within 30 days of change)",
    month: 1,
    status: "upcoming",
    recipient: "FinCEN",
    notes: "Also required within 90 days of formation for new entities.",
  },
  {
    id: "de-reg-sec-form-d",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "SEC Form D — Regulation D Notice",
    description: "Filed within 15 days of first sale of securities for each Series SPV under Rule 506(b) or 506(c).",
    frequency: "ad-hoc",
    deadline: "15 days after first close",
    status: "upcoming",
    recipient: "SEC / EDGAR",
    notes: "Annual amendment required if offering remains open.",
  },
  {
    id: "de-reg-blue-sky",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "State Blue Sky Filings",
    description: "State-level notice filings for each jurisdiction where LP investors are resident.",
    frequency: "ad-hoc",
    deadline: "Per state rules (typically within 15 days)",
    status: "upcoming",
    recipient: "State Securities Regulators",
  },
  {
    id: "de-reg-registered-agent",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "Registered Agent — Annual Renewal",
    description: "Annual renewal of Resident Agents Inc. as registered agent for all Delaware entities.",
    frequency: "annual",
    deadline: "Annual (per agent invoice)",
    status: "upcoming",
    recipient: "Resident Agents Inc.",
  },

  // Finance
  {
    id: "de-fin-nav",
    jurisdiction: "delaware",
    category: "Finance",
    title: "NAV / Fair Value Marks",
    description: "Quarterly fair value assessment of all portfolio positions per each active Series SPV.",
    frequency: "quarterly",
    deadline: "30 days after quarter end",
    status: "upcoming",
    recipient: "Internal / LPs",
  },
  {
    id: "de-fin-waterfall",
    jurisdiction: "delaware",
    category: "Finance",
    title: "Carried Interest & Waterfall Calculation",
    description: "Annual carried interest and preferred return waterfall calculation per Series.",
    frequency: "annual",
    deadline: "Q1 (alongside annual LP statement)",
    month: 3,
    status: "upcoming",
    recipient: "Internal / LPs",
  },

  // ── Cayman ────────────────────────────────────────────────

  // Regulatory
  {
    id: "ky-reg-cima-annual",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "CIMA — Annual Registration Renewal",
    description: "Annual renewal of registered Mutual Fund / Private Fund registration with the Cayman Islands Monetary Authority.",
    frequency: "annual",
    deadline: "15 January",
    month: 1,
    status: "upcoming",
    recipient: "CIMA",
    notes: "Fee payable alongside renewal. Late filing attracts penalties.",
  },
  {
    id: "ky-reg-cima-arf",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "CIMA — Annual Return & Financial Statements",
    description: "Audited financial statements and annual return to CIMA within 6 months of financial year end.",
    frequency: "annual",
    deadline: "30 June",
    month: 6,
    status: "upcoming",
    recipient: "CIMA",
    notes: "Audit must be conducted by a CIMA-approved auditor.",
  },
  {
    id: "ky-reg-fatca",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "FATCA / CRS — Cayman Reporting",
    description: "Annual FATCA and CRS (Common Reporting Standard) filing with the Cayman Tax Information Authority.",
    frequency: "annual",
    deadline: "31 July",
    month: 7,
    status: "upcoming",
    recipient: "Cayman Tax Information Authority (TIA)",
    notes: "GIIN required. Fund must register on IRS FATCA portal. W-8IMY to be provided to HSBC.",
  },
  {
    id: "ky-reg-economic-substance",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "Economic Substance — Annual Notification",
    description: "Annual notification to Cayman Registrar confirming whether the entity carries on a relevant activity.",
    frequency: "annual",
    deadline: "Within 12 months of financial year end",
    status: "upcoming",
    recipient: "Cayman Registrar of Companies",
    notes: "Investment funds typically exempt, but notification still required.",
  },
  {
    id: "ky-reg-aml",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "AML/KYC — Annual Review",
    description: "Annual review of LP KYC files and beneficial ownership records per Cayman AML Regulations.",
    frequency: "annual",
    deadline: "Ongoing / Annual",
    status: "upcoming",
    recipient: "Paxiot Limited (AIFM) / Internal",
    notes: "AIFM (Paxiot) responsible for AML compliance. Fund must maintain records for 5 years.",
  },
  {
    id: "ky-reg-walkers",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "Registered Office — Annual Renewal",
    description: "Annual renewal of Walkers Corporate Ltd as registered office for GP and Fund.",
    frequency: "annual",
    deadline: "Annual (per Walkers invoice)",
    status: "upcoming",
    recipient: "Walkers Corporate Limited",
  },

  // LP Reporting
  {
    id: "ky-lp-quarterly",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Quarterly Investor Report",
    description: "NAV per unit, portfolio summary, capital account statement, and fund activity.",
    frequency: "quarterly",
    deadline: "45 days after quarter end",
    status: "upcoming",
    recipient: "Weeks8 Holdings (HK) Ltd",
  },
  {
    id: "ky-lp-annual",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Annual LP Financial Statement",
    description: "Audited annual accounts and LP capital account statement.",
    frequency: "annual",
    deadline: "30 June (6 months after year end)",
    month: 6,
    status: "upcoming",
    recipient: "Weeks8 Holdings (HK) Ltd",
  },
  {
    id: "ky-lp-capital-call",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Capital Call Notices",
    description: "Formal capital call notice with amount, purpose, and wire instructions per LPA.",
    frequency: "ad-hoc",
    deadline: "10 business days notice (per LPA)",
    status: "upcoming",
    recipient: "Weeks8 Holdings (HK) Ltd",
  },

  // Tax
  {
    id: "ky-tax-w8imy",
    jurisdiction: "cayman",
    category: "Tax",
    title: "IRS Form W-8IMY — FATCA Certification",
    description: "W-8IMY to be provided to HSBC confirming foreign flow-through entity status and FATCA classification.",
    frequency: "ad-hoc",
    deadline: "On account opening / every 3 years",
    status: "due-soon",
    recipient: "HSBC",
    notes: "Outstanding — flagged in KYC onboarding. To be signed by GP authorised signatory.",
  },
  {
    id: "ky-tax-w8bene",
    jurisdiction: "cayman",
    category: "Tax",
    title: "IRS Form W-8BEN-E — LP Tax Certification",
    description: "W-8BEN-E for Weeks8 Holdings (HK) Ltd confirming non-US status as beneficial owner.",
    frequency: "ad-hoc",
    deadline: "On account opening / every 3 years",
    status: "due-soon",
    recipient: "HSBC",
    notes: "Outstanding — flagged in KYC onboarding. To be signed by authorised director of Weeks8.",
  },
  {
    id: "ky-tax-withholding",
    jurisdiction: "cayman",
    category: "Tax",
    title: "Withholding Statement — LP Schedule",
    description: "Excel withholding statement listing all LPs, TINs/GIINs, and income allocation percentages.",
    frequency: "annual",
    deadline: "On account opening / annually",
    status: "due-soon",
    recipient: "HSBC",
    notes: "Outstanding — flagged in KYC onboarding.",
  },
  {
    id: "ky-tax-giin",
    jurisdiction: "cayman",
    category: "Tax",
    title: "FATCA GIIN Registration",
    description: "Register the fund on the IRS FATCA portal to obtain a Global Intermediary Identification Number.",
    frequency: "ad-hoc",
    deadline: "ASAP — outstanding",
    status: "due-soon",
    recipient: "IRS FATCA Portal",
    notes: "Outstanding — required before first close and for CIMA/HSBC compliance.",
  },

  // Finance
  {
    id: "ky-fin-nav",
    jurisdiction: "cayman",
    category: "Finance",
    title: "NAV / Fair Value Marks",
    description: "Quarterly fair value assessment of all fund investments per IPEV guidelines.",
    frequency: "quarterly",
    deadline: "30 days after quarter end",
    status: "upcoming",
    recipient: "Internal / Weeks8 Holdings",
  },
  {
    id: "ky-fin-audit",
    jurisdiction: "cayman",
    category: "Finance",
    title: "Annual Audit",
    description: "Full audit of fund financial statements by a CIMA-approved auditor.",
    frequency: "annual",
    deadline: "30 June (6 months after 31 Dec year end)",
    month: 6,
    status: "upcoming",
    recipient: "CIMA / LPs",
    notes: "Auditor appointment to be confirmed with Paxiot Limited.",
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const FREQ_LABEL: Record<Frequency, string> = {
  "annual":       "Annual",
  "semi-annual":  "Semi-annual",
  "quarterly":    "Quarterly",
  "monthly":      "Monthly",
  "ad-hoc":       "Ad hoc",
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: any }> = {
  "complete":   { label: "Complete",   color: "#0CA678", icon: CheckCircle2 },
  "due-soon":   { label: "Due Soon",   color: "#F59F00", icon: AlertTriangle },
  "overdue":    { label: "Overdue",    color: "#E03131", icon: AlertTriangle },
  "upcoming":   { label: "Upcoming",   color: "#868E96", icon: Circle },
};

const CATEGORIES = ["All", "Tax", "LP Reporting", "Regulatory", "Finance"];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: cfg.color + "18", color: cfg.color }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function FreqBadge({ freq }: { freq: Frequency }) {
  return (
    <span
      className="inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
    >
      {FREQ_LABEL[freq]}
    </span>
  );
}

function JurisdictionPip({ j }: { j: Jurisdiction }) {
  if (j === "delaware") return <span title="Delaware">🇺🇸</span>;
  if (j === "cayman")   return <span title="Cayman Islands">🇰🇾</span>;
  return <span>🌐</span>;
}

function ItemRow({ item }: { item: ReportItem }) {
  return (
    <div
      className="flex items-start gap-4 px-5 py-4 border-b last:border-b-0"
      style={{ borderColor: "hsl(var(--border))" }}
      data-testid={`row-report-${item.id}`}
    >
      <div className="pt-0.5 text-base w-5 text-center flex-shrink-0">
        <JurisdictionPip j={item.jurisdiction} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
            {item.title}
          </span>
          <StatusBadge status={item.status} />
          <FreqBadge freq={item.frequency} />
        </div>
        <p className="text-xs mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {item.description}
        </p>
        {item.notes && (
          <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.75 }}>
            {item.notes}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 text-right" style={{ minWidth: 160 }}>
        <p className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
          {item.deadline}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          → {item.recipient}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Monthly timeline view
// ─────────────────────────────────────────────────────────────
function MonthlyView({ items }: { items: ReportItem[] }) {
  const byMonth: Record<number, ReportItem[]> = {};
  const adHoc: ReportItem[] = [];

  items.forEach(item => {
    if (item.month) {
      if (!byMonth[item.month]) byMonth[item.month] = [];
      byMonth[item.month].push(item);
    } else {
      adHoc.push(item);
    }
  });

  return (
    <div className="space-y-4">
      {MONTHS.map((month, idx) => {
        const monthItems = byMonth[idx + 1] ?? [];
        if (monthItems.length === 0) return null;
        return (
          <Card key={month} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardHeader className="py-3 px-5">
              <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {month}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {monthItems.map(item => <ItemRow key={item.id} item={item} />)}
            </CardContent>
          </Card>
        );
      })}
      {adHoc.length > 0 && (
        <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
          <CardHeader className="py-3 px-5">
            <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Ad hoc / Ongoing
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {adHoc.map(item => <ItemRow key={item.id} item={item} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Category view
// ─────────────────────────────────────────────────────────────
function CategoryView({ items }: { items: ReportItem[] }) {
  const categories = Array.from(new Set(items.map(i => i.category))).sort();
  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const catItems = items.filter(i => i.category === cat);
        return (
          <Card key={cat} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardHeader className="py-3 px-5">
              <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {cat}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {catItems.map(item => <ItemRow key={item.id} item={item} />)}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function ReportingCalendar() {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<"all" | "delaware" | "cayman">("all");
  const [categoryFilter, setCategoryFilter]         = useState("All");
  const [view, setView]                             = useState<"monthly" | "category">("category");

  const filtered = ITEMS.filter(item => {
    const jMatch = jurisdictionFilter === "all" || item.jurisdiction === jurisdictionFilter || item.jurisdiction === "both";
    const cMatch = categoryFilter === "All" || item.category === categoryFilter;
    return jMatch && cMatch;
  });

  const dueSoonCount = ITEMS.filter(i => i.status === "due-soon").length;
  const overdueCount = ITEMS.filter(i => i.status === "overdue").length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
          Reporting Calendar
        </h1>
        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          All regulatory, tax, LP, and financial reporting obligations — Delaware Series LP and Cayman Fund.
        </p>
      </div>

      {/* Alert strip */}
      {(dueSoonCount > 0 || overdueCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "#E0313118", border: "1px solid #E0313140" }}>
              <AlertTriangle size={14} style={{ color: "#E03131" }} />
              <span style={{ color: "#E03131" }}><strong>{overdueCount}</strong> overdue item{overdueCount > 1 ? "s" : ""}</span>
            </div>
          )}
          {dueSoonCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "#F59F0018", border: "1px solid #F59F0040" }}>
              <Clock size={14} style={{ color: "#F59F00" }} />
              <span style={{ color: "#F59F00" }}><strong>{dueSoonCount}</strong> item{dueSoonCount > 1 ? "s" : ""} due soon</span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["complete","due-soon","overdue","upcoming"] as Status[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const count = ITEMS.filter(i => i.status === s).length;
          return (
            <Card key={s} className="border" style={{ borderColor: "hsl(var(--border))" }}>
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>{cfg.label}</p>
                  <Icon size={13} style={{ color: cfg.color }} />
                </div>
                <p className="text-xl font-semibold font-mono" style={{ color: cfg.color }}>{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={jurisdictionFilter} onValueChange={(v: any) => setJurisdictionFilter(v)}>
          <SelectTrigger className="w-44" data-testid="select-jurisdiction-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jurisdictions</SelectItem>
            <SelectItem value="delaware">🇺🇸 Delaware</SelectItem>
            <SelectItem value="cayman">🇰🇾 Cayman Islands</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44" data-testid="select-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex rounded-lg overflow-hidden border" style={{ borderColor: "hsl(var(--border))" }}>
          {(["category","monthly"] as const).map(v => (
            <button
              key={v}
              data-testid={`view-${v}`}
              onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: view === v ? "hsl(231 70% 54% / 0.18)" : "transparent",
                color:      view === v ? "hsl(231 70% 72%)"         : "hsl(var(--muted-foreground))",
                borderRight: v === "category" ? "1px solid hsl(var(--border))" : "none",
              }}
            >
              {v === "category" ? "By Category" : "By Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="text-xs mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
        Showing {filtered.length} of {ITEMS.length} obligations
      </div>

      {view === "category"
        ? <CategoryView items={filtered} />
        : <MonthlyView  items={filtered} />
      }
    </div>
  );
}
