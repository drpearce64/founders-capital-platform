import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Clock, AlertTriangle, Circle, CalendarDays,
  ChevronRight, ExternalLink, RotateCcw, CheckCheck, Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────
type Jurisdiction = "delaware" | "cayman" | "both";
type Frequency    = "annual" | "semi-annual" | "quarterly" | "monthly" | "ad-hoc";
type RawStatus    = "overdue" | "due-soon" | "upcoming" | "complete";

interface ReportItem {
  id: string;
  jurisdiction: Jurisdiction;
  category: string;
  title: string;
  description: string;
  frequency: Frequency;
  deadline: string;
  month?: number;           // 1-12 fixed-month items
  dayOfMonth?: number;      // day within month for precise date
  rollingDaysAfterQuarter?: number;  // e.g. 45 for "45 days after quarter end"
  portalLink?: string;      // internal route
  recipient: string;
  notes?: string;
  flagged?: boolean;        // pre-flagged as outstanding (like W-8 forms)
}

// ── All reporting obligations ─────────────────────────────────────────────────
const ITEMS: ReportItem[] = [
  // ═══ DELAWARE — Tax ══════════════════════════════════════════════════════════
  {
    id: "de-tax-1065",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Form 1065 — US Partnership Return",
    description: "Federal partnership return for FC Platform LP and each active Series SPV.",
    frequency: "annual",
    deadline: "15 March",
    month: 3, dayOfMonth: 15,
    recipient: "IRS",
    notes: "Extension to 15 September available on Form 7004.",
  },
  {
    id: "de-tax-k1",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Schedule K-1 — LP Partner Statements",
    description: "Issued to each LP showing income, gain, loss, deduction, and credit allocations.",
    frequency: "annual",
    deadline: "15 March",
    month: 3, dayOfMonth: 15,
    recipient: "All LPs",
    portalLink: "/statements",
    notes: "Issued alongside Form 1065. Extended deadline mirrors partnership return.",
  },
  {
    id: "de-tax-state",
    jurisdiction: "delaware",
    category: "Tax",
    title: "Delaware Franchise Tax & Annual Report",
    description: "Annual report and franchise tax for each Delaware entity (Platform LP, SPVs, Holdings LLC, GP).",
    frequency: "annual",
    deadline: "1 June",
    month: 6, dayOfMonth: 1,
    recipient: "Delaware Division of Corporations",
  },
  {
    id: "de-tax-fbar",
    jurisdiction: "delaware",
    category: "Tax",
    title: "FBAR — FinCEN Report 114",
    description: "Foreign Bank Account Report if any Delaware entity holds foreign accounts >$10,000.",
    frequency: "annual",
    deadline: "15 April",
    month: 4, dayOfMonth: 15,
    recipient: "FinCEN",
    notes: "Auto-extension to 15 October.",
  },
  {
    id: "de-tax-fatca-8966",
    jurisdiction: "delaware",
    category: "Tax",
    title: "FATCA — Form 8966",
    description: "FATCA reporting for US-source payments to foreign LPs (if applicable).",
    frequency: "annual",
    deadline: "31 March",
    month: 3, dayOfMonth: 31,
    recipient: "IRS",
  },

  // ═══ DELAWARE — LP Reporting ═════════════════════════════════════════════════
  {
    id: "de-lp-quarterly",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Quarterly LP Capital Account Statement",
    description: "NAV per unit, capital account movements, capital calls summary, and portfolio update.",
    frequency: "quarterly",
    deadline: "45 days after quarter end",
    rollingDaysAfterQuarter: 45,
    recipient: "All LPs",
    portalLink: "/statements",
  },
  {
    id: "de-lp-annual",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Annual LP Statement",
    description: "Full-year financial statements, MOIC, IRR, and portfolio company updates.",
    frequency: "annual",
    deadline: "31 March",
    month: 3, dayOfMonth: 31,
    recipient: "All LPs",
    portalLink: "/statements",
  },
  {
    id: "de-lp-nav",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Quarterly NAV / Fair Value Marks",
    description: "Quarterly fair value assessment of all portfolio positions per each active Series SPV.",
    frequency: "quarterly",
    deadline: "30 days after quarter end",
    rollingDaysAfterQuarter: 30,
    recipient: "Internal / LPs",
    portalLink: "/nav-marks",
  },
  {
    id: "de-lp-capital-call",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Capital Call Notices",
    description: "Formal notice to LPs with amount, due date, wire instructions, and purpose.",
    frequency: "ad-hoc",
    deadline: "10 business days notice (per LPA)",
    recipient: "All LPs",
    portalLink: "/capital-calls",
  },
  {
    id: "de-lp-distribution",
    jurisdiction: "delaware",
    category: "LP Reporting",
    title: "Distribution Notices",
    description: "Notice of distribution with waterfall breakdown and wire details.",
    frequency: "ad-hoc",
    deadline: "Prior to distribution",
    recipient: "All LPs",
    portalLink: "/waterfall",
  },

  // ═══ DELAWARE — Regulatory ═══════════════════════════════════════════════════
  {
    id: "de-reg-fincen-boi",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "FinCEN — Beneficial Ownership Information (BOI)",
    description: "CTA beneficial ownership report for each Delaware entity.",
    frequency: "annual",
    deadline: "1 January",
    month: 1, dayOfMonth: 1,
    recipient: "FinCEN",
    notes: "Updates required within 30 days of any change. New entities must file within 90 days of formation.",
  },
  {
    id: "de-reg-sec-form-d",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "SEC Form D — Regulation D Notice",
    description: "Filed within 15 days of first sale of securities for each Series SPV.",
    frequency: "ad-hoc",
    deadline: "15 days after first close",
    recipient: "SEC / EDGAR",
    notes: "Annual amendment required if offering remains open.",
  },
  {
    id: "de-reg-blue-sky",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "State Blue Sky Filings",
    description: "State-level notice filings for each LP investor jurisdiction.",
    frequency: "ad-hoc",
    deadline: "Per state (typically within 15 days)",
    recipient: "State Securities Regulators",
  },
  {
    id: "de-reg-registered-agent",
    jurisdiction: "delaware",
    category: "Regulatory",
    title: "Registered Agent — Annual Renewal",
    description: "Annual renewal for Resident Agents Inc. across all Delaware entities.",
    frequency: "annual",
    deadline: "Annual (per agent invoice)",
    recipient: "Resident Agents Inc.",
  },
  {
    id: "de-fin-waterfall",
    jurisdiction: "delaware",
    category: "Finance",
    title: "Carried Interest & Waterfall Calculation",
    description: "Annual carried interest and preferred return waterfall calculation per Series.",
    frequency: "annual",
    deadline: "31 March",
    month: 3, dayOfMonth: 31,
    recipient: "Internal / LPs",
    portalLink: "/waterfall",
  },

  // ═══ CAYMAN — Regulatory ══════════════════════════════════════════════════════
  {
    id: "ky-reg-cima-annual",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "CIMA — Annual Registration Renewal",
    description: "Annual renewal of Private Fund registration with the Cayman Islands Monetary Authority.",
    frequency: "annual",
    deadline: "15 January",
    month: 1, dayOfMonth: 15,
    recipient: "CIMA",
    notes: "Fee payable alongside renewal. Late filing attracts financial penalties.",
  },
  {
    id: "ky-reg-cima-arf",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "CIMA — Annual Return & Audited Financial Statements",
    description: "Audited financial statements and annual return to CIMA within 6 months of year end.",
    frequency: "annual",
    deadline: "30 June",
    month: 6, dayOfMonth: 30,
    recipient: "CIMA",
    notes: "Audit must be conducted by a CIMA-approved auditor. Auditor appointment to confirm with Paxiot.",
  },
  {
    id: "ky-reg-fatca",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "FATCA / CRS — Cayman Reporting",
    description: "Annual FATCA and CRS filing with the Cayman Tax Information Authority.",
    frequency: "annual",
    deadline: "31 July",
    month: 7, dayOfMonth: 31,
    recipient: "Cayman Tax Information Authority (TIA)",
    notes: "GIIN required. Fund must be registered on IRS FATCA portal.",
  },
  {
    id: "ky-reg-economic-substance",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "Economic Substance — Annual Notification",
    description: "Annual notification to Cayman Registrar on relevant activities.",
    frequency: "annual",
    deadline: "Within 12 months of financial year end (31 Dec)",
    month: 12, dayOfMonth: 31,
    recipient: "Cayman Registrar of Companies",
    notes: "Investment funds typically exempt but notification still required.",
  },
  {
    id: "ky-reg-aml",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "AML / KYC — Annual Review",
    description: "Annual review of LP KYC files and beneficial ownership records.",
    frequency: "annual",
    deadline: "Ongoing / Annual",
    recipient: "Paxiot Limited (AIFM) / Internal",
    notes: "AIFM (Paxiot) responsible for AML compliance. Records must be kept for 5 years.",
  },
  {
    id: "ky-reg-walkers",
    jurisdiction: "cayman",
    category: "Regulatory",
    title: "Registered Office — Annual Renewal",
    description: "Annual renewal of Walkers Corporate Ltd as registered office for GP and Fund.",
    frequency: "annual",
    deadline: "Annual (per Walkers invoice)",
    recipient: "Walkers Corporate Limited",
  },

  // ═══ CAYMAN — LP Reporting ════════════════════════════════════════════════════
  {
    id: "ky-lp-quarterly",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Quarterly Investor Report",
    description: "NAV per unit, portfolio summary, capital account statement, and fund activity.",
    frequency: "quarterly",
    deadline: "45 days after quarter end",
    rollingDaysAfterQuarter: 45,
    recipient: "Weeks8 Holdings (HK) Ltd",
    portalLink: "/statements",
  },
  {
    id: "ky-lp-annual",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Annual LP Financial Statement",
    description: "Audited annual accounts and LP capital account statement.",
    frequency: "annual",
    deadline: "30 June",
    month: 6, dayOfMonth: 30,
    recipient: "Weeks8 Holdings (HK) Ltd",
    portalLink: "/statements",
  },
  {
    id: "ky-lp-capital-call",
    jurisdiction: "cayman",
    category: "LP Reporting",
    title: "Capital Call Notices",
    description: "Formal capital call notice with amount, purpose, and wire instructions.",
    frequency: "ad-hoc",
    deadline: "10 business days notice (per LPA)",
    recipient: "Weeks8 Holdings (HK) Ltd",
    portalLink: "/cayman/capital-calls",
  },
  {
    id: "ky-fin-nav",
    jurisdiction: "cayman",
    category: "Finance",
    title: "Quarterly NAV / Fair Value Marks",
    description: "Quarterly fair value assessment of all fund investments per IPEV guidelines.",
    frequency: "quarterly",
    deadline: "30 days after quarter end",
    rollingDaysAfterQuarter: 30,
    recipient: "Internal / Weeks8 Holdings",
    portalLink: "/cayman/nav",
  },
  {
    id: "ky-fin-audit",
    jurisdiction: "cayman",
    category: "Finance",
    title: "Annual Audit",
    description: "Full audit of fund financial statements by a CIMA-approved auditor.",
    frequency: "annual",
    deadline: "30 June",
    month: 6, dayOfMonth: 30,
    recipient: "CIMA / LPs",
    notes: "Auditor appointment to be confirmed with Paxiot Limited.",
  },

  // ═══ CAYMAN — Tax (Outstanding) ═══════════════════════════════════════════════
  {
    id: "ky-tax-w8imy",
    jurisdiction: "cayman",
    category: "Tax",
    title: "IRS Form W-8IMY — FATCA Certification",
    description: "W-8IMY to HSBC confirming foreign flow-through entity status and FATCA classification.",
    frequency: "ad-hoc",
    deadline: "Outstanding — required for HSBC account",
    recipient: "HSBC",
    notes: "To be signed by GP authorised signatory.",
    flagged: true,
  },
  {
    id: "ky-tax-w8bene",
    jurisdiction: "cayman",
    category: "Tax",
    title: "IRS Form W-8BEN-E — LP Tax Certification",
    description: "W-8BEN-E for Weeks8 Holdings (HK) Ltd confirming non-US status as beneficial owner.",
    frequency: "ad-hoc",
    deadline: "Outstanding — required for HSBC account",
    recipient: "HSBC",
    notes: "To be signed by authorised director of Weeks8.",
    flagged: true,
  },
  {
    id: "ky-tax-withholding",
    jurisdiction: "cayman",
    category: "Tax",
    title: "Withholding Statement — LP Schedule",
    description: "LP schedule listing TINs/GIINs and income allocation percentages.",
    frequency: "annual",
    deadline: "Outstanding — required for HSBC account",
    recipient: "HSBC",
    notes: "Outstanding — flagged in KYC onboarding.",
    flagged: true,
  },
  {
    id: "ky-tax-giin",
    jurisdiction: "cayman",
    category: "Tax",
    title: "FATCA GIIN Registration",
    description: "Register on IRS FATCA portal to obtain a Global Intermediary Identification Number.",
    frequency: "ad-hoc",
    deadline: "Outstanding — required before first close",
    recipient: "IRS FATCA Portal",
    notes: "Required for CIMA and HSBC compliance.",
    flagged: true,
  },
];

// ── Date computation ──────────────────────────────────────────────────────────
const QUARTER_END_MONTHS = [3, 6, 9, 12]; // March, June, Sep, Dec

function getNextQuarterEnd(from: Date): Date {
  const m = from.getMonth() + 1;
  const y = from.getFullYear();
  for (const qm of QUARTER_END_MONTHS) {
    if (m <= qm) return new Date(y, qm - 1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][qm - 1]);
  }
  return new Date(y + 1, 2, 31); // March next year
}

function getLastQuarterEnd(from: Date): Date {
  const m = from.getMonth() + 1;
  const y = from.getFullYear();
  const prev = [...QUARTER_END_MONTHS].reverse().find(qm => m > qm);
  if (prev) return new Date(y, prev - 1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][prev - 1]);
  return new Date(y - 1, 11, 31);
}

function computeNextDeadline(item: ReportItem, today: Date): Date | null {
  const y = today.getFullYear();
  if (item.month && item.dayOfMonth) {
    const d = new Date(y, item.month - 1, item.dayOfMonth);
    return d < today ? new Date(y + 1, item.month - 1, item.dayOfMonth) : d;
  }
  if (item.rollingDaysAfterQuarter) {
    const lastQE = getLastQuarterEnd(today);
    const due = new Date(lastQE.getTime() + item.rollingDaysAfterQuarter * 86400000);
    if (due >= today) return due;
    const nextQE = getNextQuarterEnd(today);
    return new Date(nextQE.getTime() + item.rollingDaysAfterQuarter * 86400000);
  }
  return null;
}

function computeStatus(item: ReportItem, completedIds: Set<string>, period: string): RawStatus {
  if (completedIds.has(`${item.id}::${period}`)) return "complete";
  if (item.flagged) return "due-soon";
  const today = new Date();
  const next = computeNextDeadline(item, today);
  if (!next) return "upcoming";
  const diffDays = (next.getTime() - today.getTime()) / 86400000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "due-soon";
  return "upcoming";
}

function daysUntil(item: ReportItem): number | null {
  const next = computeNextDeadline(item, new Date());
  if (!next) return null;
  return Math.ceil((next.getTime() - Date.now()) / 86400000);
}

function formatNextDate(item: ReportItem): string {
  const next = computeNextDeadline(item, new Date());
  if (!next) return item.deadline;
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FREQ_LABEL: Record<Frequency, string> = {
  "annual": "Annual", "semi-annual": "Semi-annual",
  "quarterly": "Quarterly", "monthly": "Monthly", "ad-hoc": "Ad hoc",
};

const STATUS_CFG: Record<RawStatus, { label: string; color: string; bg: string; icon: any }> = {
  complete:  { label: "Complete",  color: "#0CA678", bg: "#0CA67812", icon: CheckCircle2 },
  "due-soon":{ label: "Due Soon",  color: "#F59F00", bg: "#F59F0012", icon: Clock },
  overdue:   { label: "Overdue",   color: "#E03131", bg: "#E0313112", icon: AlertTriangle },
  upcoming:  { label: "Upcoming",  color: "#868E96", bg: "#86809612", icon: Circle },
};

const CATEGORIES = ["All", "Tax", "LP Reporting", "Regulatory", "Finance"];

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function currentPeriod(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: RawStatus }) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function FreqPill({ freq }: { freq: Frequency }) {
  return (
    <span className="inline-flex text-xs px-2 py-0.5 rounded-full"
      style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
      {FREQ_LABEL[freq]}
    </span>
  );
}

function JFlag({ j }: { j: Jurisdiction }) {
  if (j === "delaware") return <span title="Delaware">🇺🇸</span>;
  if (j === "cayman")   return <span title="Cayman Islands">🇰🇾</span>;
  return <span>🌐</span>;
}

interface ItemRowProps {
  item: ReportItem;
  status: RawStatus;
  period: string;
  onToggle: (item: ReportItem) => void;
  onNavigate: (path: string) => void;
}

function ItemRow({ item, status, period, onToggle, onNavigate }: ItemRowProps) {
  const days = daysUntil(item);
  const nextDate = formatNextDate(item);
  const isComplete = status === "complete";

  return (
    <div
      className={`flex items-start gap-3 px-5 py-4 border-b last:border-b-0 transition-colors ${
        isComplete ? "opacity-60" : ""
      }`}
      style={{ borderColor: "hsl(var(--border))" }}
      data-testid={`row-report-${item.id}`}
    >
      {/* Complete toggle */}
      <button
        onClick={() => onToggle(item)}
        className="mt-0.5 flex-shrink-0 rounded-full transition-colors hover:opacity-80"
        title={isComplete ? "Mark incomplete" : "Mark complete"}
        data-testid={`toggle-${item.id}`}
      >
        {isComplete
          ? <CheckCircle2 size={18} style={{ color: STATUS_CFG.complete.color }} />
          : <Circle size={18} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }} />
        }
      </button>

      {/* Flag + content */}
      <div className="flex-shrink-0 pt-0.5"><JFlag j={item.jurisdiction} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className={`text-sm font-medium ${isComplete ? "line-through" : ""}`}
            style={{ color: "hsl(var(--foreground))" }}>
            {item.title}
          </span>
          <StatusPill status={status} />
          <FreqPill freq={item.frequency} />
          {item.flagged && !isComplete && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#E0313112", color: "#E03131" }}>
              ⚠ Outstanding
            </span>
          )}
        </div>
        <p className="text-xs mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {item.description}
        </p>
        {item.notes && (
          <p className="text-xs italic" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.7 }}>
            {item.notes}
          </p>
        )}
      </div>

      {/* Right: deadline + portal link */}
      <div className="flex-shrink-0 text-right" style={{ minWidth: 160 }}>
        <div className="flex items-center justify-end gap-1.5 mb-0.5">
          {days !== null && !isComplete && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{
                background: days < 0 ? "#E0313112" : days <= 30 ? "#F59F0012" : "hsl(var(--muted))",
                color:      days < 0 ? "#E03131"   : days <= 30 ? "#F59F00"   : "hsl(var(--muted-foreground))",
              }}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d`}
            </span>
          )}
          {item.portalLink && (
            <button
              onClick={() => onNavigate(item.portalLink!)}
              className="p-0.5 rounded hover:opacity-80 transition-opacity"
              title="Open in portal"
            >
              <ExternalLink size={12} style={{ color: "hsl(231 70% 62%)" }} />
            </button>
          )}
        </div>
        <p className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
          {nextDate}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          → {item.recipient}
        </p>
      </div>
    </div>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────
function CategoryView({ items, statuses, period, onToggle, onNavigate }: {
  items: ReportItem[]; statuses: Record<string, RawStatus>;
  period: string; onToggle: (i: ReportItem) => void; onNavigate: (p: string) => void;
}) {
  const cats = Array.from(new Set(items.map(i => i.category))).sort();
  return (
    <div className="space-y-3">
      {cats.map(cat => {
        const catItems = items.filter(i => i.category === cat);
        const doneCount = catItems.filter(i => statuses[i.id] === "complete").length;
        return (
          <div key={cat} className="bg-white border rounded-xl overflow-hidden"
            style={{ borderColor: "hsl(var(--border))" }}>
            <div className="px-5 py-3 border-b flex items-center justify-between"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {cat}
              </span>
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {doneCount}/{catItems.length} complete
              </span>
            </div>
            {catItems.map(item => (
              <ItemRow key={item.id} item={item} status={statuses[item.id]}
                period={period} onToggle={onToggle} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MonthlyView({ items, statuses, period, onToggle, onNavigate }: {
  items: ReportItem[]; statuses: Record<string, RawStatus>;
  period: string; onToggle: (i: ReportItem) => void; onNavigate: (p: string) => void;
}) {
  const byMonth: Record<number, ReportItem[]> = {};
  const adHoc: ReportItem[] = [];
  items.forEach(item => {
    if (item.month) {
      if (!byMonth[item.month]) byMonth[item.month] = [];
      byMonth[item.month].push(item);
    } else if (item.rollingDaysAfterQuarter) {
      // Show rolling items under their next due month
      const next = computeNextDeadline(item, new Date());
      if (next) {
        const m = next.getMonth() + 1;
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(item);
      } else adHoc.push(item);
    } else {
      adHoc.push(item);
    }
  });

  return (
    <div className="space-y-3">
      {MONTHS.map((month, idx) => {
        const mItems = byMonth[idx + 1] ?? [];
        if (mItems.length === 0) return null;
        const isCurrentMonth = new Date().getMonth() === idx;
        return (
          <div key={month} className="bg-white border rounded-xl overflow-hidden"
            style={{ borderColor: isCurrentMonth ? "hsl(231 70% 54%)" : "hsl(var(--border))" }}>
            <div className="px-5 py-3 border-b flex items-center gap-2"
              style={{ borderColor: "hsl(var(--border))", background: isCurrentMonth ? "hsl(231 70% 54% / 0.06)" : "hsl(var(--muted)/0.3)" }}>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                {month}
              </span>
              {isCurrentMonth && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "hsl(231 70% 54% / 0.15)", color: "hsl(231 70% 54%)" }}>
                  Current month
                </span>
              )}
              <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
                {mItems.length} item{mItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            {mItems.map(item => (
              <ItemRow key={item.id} item={item} status={statuses[item.id]}
                period={period} onToggle={onToggle} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
      {adHoc.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden"
          style={{ borderColor: "hsl(var(--border))" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Ad hoc / Outstanding
            </span>
          </div>
          {adHoc.map(item => (
            <ItemRow key={item.id} item={item} status={statuses[item.id]}
              period={period} onToggle={onToggle} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function UrgencyView({ items, statuses, period, onToggle, onNavigate }: {
  items: ReportItem[]; statuses: Record<string, RawStatus>;
  period: string; onToggle: (i: ReportItem) => void; onNavigate: (p: string) => void;
}) {
  const groups: { label: string; filter: (i: ReportItem) => boolean; accent: string }[] = [
    { label: "Overdue",     filter: i => statuses[i.id] === "overdue",   accent: "#E03131" },
    { label: "Due within 30 days", filter: i => { const d = daysUntil(i); return statuses[i.id] !== "complete" && statuses[i.id] !== "overdue" && d !== null && d <= 30; }, accent: "#F59F00" },
    { label: "Due within 90 days", filter: i => { const d = daysUntil(i); return statuses[i.id] !== "complete" && statuses[i.id] !== "overdue" && d !== null && d > 30 && d <= 90; }, accent: "#3B5BDB" },
    { label: "Outstanding (flagged)", filter: i => !!(i.flagged && statuses[i.id] !== "complete"), accent: "#E03131" },
  ];
  return (
    <div className="space-y-3">
      {groups.map(g => {
        const grpItems = items.filter(g.filter);
        if (grpItems.length === 0) return null;
        return (
          <div key={g.label} className="bg-white border rounded-xl overflow-hidden"
            style={{ borderColor: "hsl(var(--border))", borderLeft: `3px solid ${g.accent}` }}>
            <div className="px-5 py-3 border-b flex items-center gap-2"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
              <span className="text-sm font-semibold" style={{ color: g.accent }}>{g.label}</span>
              <span className="text-xs ml-auto" style={{ color: "hsl(var(--muted-foreground))" }}>
                {grpItems.length} item{grpItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            {grpItems.map(item => (
              <ItemRow key={item.id} item={item} status={statuses[item.id]}
                period={period} onToggle={onToggle} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
      {groups.every(g => items.filter(g.filter).length === 0) && (
        <div className="py-16 text-center">
          <CheckCheck size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
            Nothing urgent right now
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportingCalendar() {
  const [, navigate]          = useLocation();
  const qc                    = useQueryClient();
  const { toast }             = useToast();
  const [period, setPeriod]   = useState(currentPeriod);
  const [jFilter, setJFilter] = useState<"all" | "delaware" | "cayman">("all");
  const [catFilter, setCat]   = useState("All");
  const [view, setView]       = useState<"urgency" | "category" | "monthly">("urgency");
  const [confirmItem, setConfirmItem] = useState<ReportItem | null>(null);
  const [confirmNote, setConfirmNote] = useState("");

  // Load completions for current period
  const { data: completions = [] } = useQuery<any[]>({
    queryKey: ["/api/reporting-calendar/completions", period],
    queryFn: () =>
      apiRequest("GET", `/api/reporting-calendar/completions?period=${encodeURIComponent(period)}`)
        .then(r => r.json()),
  });

  const completedSet = useMemo(
    () => new Set(completions.map((c: any) => `${c.item_id}::${c.period}`)),
    [completions]
  );

  const markComplete = useMutation({
    mutationFn: ({ item_id, notes }: { item_id: string; notes: string }) =>
      apiRequest("POST", "/api/reporting-calendar/completions", { item_id, period, notes })
        .then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reporting-calendar/completions", period] });
      toast({ title: "Marked complete" });
      setConfirmItem(null);
      setConfirmNote("");
    },
  });

  const markIncomplete = useMutation({
    mutationFn: (item_id: string) =>
      apiRequest("DELETE", "/api/reporting-calendar/completions", { item_id, period })
        .then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/reporting-calendar/completions", period] });
      toast({ title: "Marked incomplete" });
    },
  });

  // Compute statuses
  const statuses = useMemo<Record<string, RawStatus>>(() => {
    const out: Record<string, RawStatus> = {};
    ITEMS.forEach(item => { out[item.id] = computeStatus(item, completedSet, period); });
    return out;
  }, [completedSet, period]);

  // Filter
  const filtered = ITEMS.filter(item => {
    const jOk  = jFilter === "all" || item.jurisdiction === jFilter || item.jurisdiction === "both";
    const catOk = catFilter === "All" || item.category === catFilter;
    return jOk && catOk;
  });

  function handleToggle(item: ReportItem) {
    const isComplete = statuses[item.id] === "complete";
    if (isComplete) {
      markIncomplete.mutate(item.id);
    } else {
      setConfirmItem(item);
    }
  }

  // Summary counts (all items, not filtered)
  const counts = useMemo(() => ({
    overdue:  ITEMS.filter(i => statuses[i.id] === "overdue").length,
    dueSoon:  ITEMS.filter(i => statuses[i.id] === "due-soon").length,
    complete: ITEMS.filter(i => statuses[i.id] === "complete").length,
    upcoming: ITEMS.filter(i => statuses[i.id] === "upcoming").length,
  }), [statuses]);

  const periods = ["Q1 2026","Q2 2026","Q3 2026","Q4 2026","Q1 2025","Q2 2025","Q3 2025","Q4 2025"];

  const VIEWS = [
    { id: "urgency",  label: "Urgent" },
    { id: "category", label: "By Category" },
    { id: "monthly",  label: "By Month" },
  ] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "hsl(231 70% 54% / 0.1)" }}>
            <CalendarDays size={20} style={{ color: "hsl(231 70% 54%)" }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Reporting Calendar
            </h1>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              All regulatory, tax, LP reporting, and finance obligations — Delaware &amp; Cayman
            </p>
          </div>
        </div>
        {/* Period picker */}
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32 text-sm" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Alert strip — overdue / flagged */}
      {(counts.overdue > 0 || counts.dueSoon > 0) && (
        <div className="flex flex-wrap gap-2">
          {counts.overdue > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: "#E0313112", border: "1px solid #E0313130" }}>
              <AlertTriangle size={13} style={{ color: "#E03131" }} />
              <span style={{ color: "#E03131" }}>
                <strong>{counts.overdue}</strong> overdue
              </span>
            </div>
          )}
          {counts.dueSoon > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: "#F59F0012", border: "1px solid #F59F0030" }}>
              <Clock size={13} style={{ color: "#F59F00" }} />
              <span style={{ color: "#F59F00" }}>
                <strong>{counts.dueSoon}</strong> due soon (incl. outstanding items)
              </span>
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {(["overdue","due-soon","upcoming","complete"] as RawStatus[]).map(s => {
          const cfg = STATUS_CFG[s];
          const Icon = cfg.icon;
          const n = s === "overdue" ? counts.overdue
                  : s === "due-soon" ? counts.dueSoon
                  : s === "upcoming" ? counts.upcoming
                  : counts.complete;
          return (
            <div key={s} className="bg-white border rounded-xl p-4"
              style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {cfg.label}
                </span>
                <Icon size={13} style={{ color: cfg.color }} />
              </div>
              <p className="text-2xl font-semibold font-mono" style={{ color: cfg.color }}>{n}</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                of {ITEMS.length} total
              </p>
            </div>
          );
        })}
      </div>

      {/* Filters + view tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={jFilter} onValueChange={(v: any) => setJFilter(v)}>
          <SelectTrigger className="w-44 text-sm" data-testid="select-jurisdiction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jurisdictions</SelectItem>
            <SelectItem value="delaware">🇺🇸 Delaware</SelectItem>
            <SelectItem value="cayman">🇰🇾 Cayman Islands</SelectItem>
          </SelectContent>
        </Select>

        <Select value={catFilter} onValueChange={setCat}>
          <SelectTrigger className="w-40 text-sm" data-testid="select-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex rounded-lg border overflow-hidden text-xs"
          style={{ borderColor: "hsl(var(--border))" }}>
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              data-testid={`view-${v.id}`}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{
                background: view === v.id ? "hsl(231 70% 54% / 0.15)" : "transparent",
                color: view === v.id ? "hsl(231 70% 60%)" : "hsl(var(--muted-foreground))",
                borderRight: i < VIEWS.length - 1 ? "1px solid hsl(var(--border))" : "none",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        Showing {filtered.length} of {ITEMS.length} obligations · Period: {period}
      </p>

      {/* Main view */}
      {view === "urgency"  && <UrgencyView  items={filtered} statuses={statuses} period={period} onToggle={handleToggle} onNavigate={navigate} />}
      {view === "category" && <CategoryView items={filtered} statuses={statuses} period={period} onToggle={handleToggle} onNavigate={navigate} />}
      {view === "monthly"  && <MonthlyView  items={filtered} statuses={statuses} period={period} onToggle={handleToggle} onNavigate={navigate} />}

      {/* Mark complete confirmation dialog */}
      <Dialog open={!!confirmItem} onOpenChange={() => { setConfirmItem(null); setConfirmNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as complete</DialogTitle>
          </DialogHeader>
          {confirmItem && (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                {confirmItem.title}
              </p>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Period: {period}
              </p>
              <div>
                <Label className="text-xs mb-1 block">Notes (optional)</Label>
                <Textarea
                  value={confirmNote}
                  onChange={e => setConfirmNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Filed via EDGAR — reference #12345, 14 Apr 2026"
                  data-testid="input-complete-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmItem(null); setConfirmNote(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmItem && markComplete.mutate({ item_id: confirmItem.id, notes: confirmNote })}
              disabled={markComplete.isPending}
              data-testid="button-confirm-complete"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              {markComplete.isPending ? "Saving…" : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
