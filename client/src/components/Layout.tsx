import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  LayoutDashboard, Building2, Users, UserPlus, Phone, TrendingUp, Shield,
  Receipt, BarChart3, FolderOpen, UserCog, Layers, FileText, RefreshCw,
  PieChart, FileSpreadsheet, BookOpen, FileCheck, Network, Globe, Landmark,
  ChevronRight, CalendarDays, Rocket, BarChart2, BookUser,
} from "lucide-react";

// ── Delaware nav ──────────────────────────────────────────────────────────────
const delawareNav = [
  { href: "/",                   label: "Dashboard",              icon: LayoutDashboard, section: "overview" },
  { href: "/spvs",               label: "SPVs",                   icon: Building2,       section: "overview" },
  { href: "/lp-onboarding",      label: "Onboard LP",             icon: UserPlus,        section: "investors" },
  { href: "/lp-register",        label: "LP Register",            icon: Users,           section: "investors" },
  { href: "/lp-portfolio",       label: "LP Portfolio",           icon: Layers,          section: "investors" },
  { href: "/capital-calls",      label: "Capital Calls",          icon: Phone,           section: "finance" },
  { href: "/series-expenses",    label: "Series Expenses",        icon: Receipt,         section: "finance" },
  { href: "/waterfall",          label: "Waterfall",              icon: TrendingUp,      section: "finance" },
  { href: "/nav-marks",          label: "NAV / Fair Value",       icon: BarChart3,       section: "finance" },
  { href: "/tax-accounts",       label: "Tax & Capital Accounts", icon: BookOpen,        section: "finance" },
  { href: "/accounts-payable",   label: "Accounts Payable",       icon: FileCheck,       section: "finance" },
  { href: "/group-structure",    label: "Group Structure",        icon: Network,         section: "group" },
  { href: "/investor-register",  label: "Investor Register",      icon: BookUser,        section: "group" },
  { href: "/statements",         label: "Statements",             icon: FileText,        section: "reporting" },
  { href: "/airtable-sync",      label: "Airtable Sync",          icon: RefreshCw,       section: "reporting" },
  { href: "/pl-model",           label: "P&L Model",              icon: FileSpreadsheet, section: "reporting" },
  { href: "/reporting-calendar", label: "Reporting Calendar",     icon: CalendarDays,    section: "reporting" },
  { href: "/documents",          label: "Documents",              icon: FolderOpen,      section: "admin" },
  { href: "/audit-log",          label: "Audit Log",              icon: Shield,          section: "admin" },
  { href: "/settings",           label: "Users & Roles",          icon: UserCog,         section: "admin" },
];

const delawareSections: Record<string, string> = {
  overview:  "Overview",
  investors: "Investors",
  finance:   "Finance",
  reporting: "Reporting",
  admin:     "Administration",
  group:     "Group",
};

// ── Cayman nav ────────────────────────────────────────────────────────────────
const caymanNav = [
  { href: "/cayman",                  label: "Dashboard",         icon: LayoutDashboard, section: "overview" },
  { href: "/cayman/fund-overview",    label: "Fund Overview",     icon: Landmark,        section: "overview" },
  { href: "/cayman/lp-register",      label: "LP Register",       icon: Users,           section: "investors" },
  { href: "/cayman/capital-calls",    label: "Capital Calls",     icon: Phone,           section: "investors" },
  { href: "/cayman/nav",              label: "NAV / Fair Value",  icon: BarChart3,       section: "finance" },
  { href: "/cayman/accounts-payable", label: "Accounts Payable",  icon: FileCheck,       section: "finance" },
  { href: "/group-structure",         label: "Group Structure",   icon: Network,         section: "group" },
  { href: "/investor-register",        label: "Investor Register", icon: BookUser,        section: "group" },
  { href: "/statements",              label: "Statements",        icon: FileText,        section: "reporting" },
  { href: "/reporting-calendar",      label: "Reporting Calendar",icon: CalendarDays,    section: "reporting" },
  { href: "/documents",               label: "Documents",         icon: FolderOpen,      section: "admin" },
  { href: "/audit-log",               label: "Audit Log",         icon: Shield,          section: "admin" },
];

const caymanSections: Record<string, string> = {
  overview:  "Overview",
  investors: "Investors",
  finance:   "Finance",
  group:     "Group",
  reporting: "Reporting",
  admin:     "Administration",
};

// ── YC nav ────────────────────────────────────────────────────────────────────
const ycNav = [
  { href: "/yc-portfolio", label: "Portfolio",        icon: LayoutDashboard, section: "overview" },
  { href: "/group-structure", label: "Group Structure", icon: Network,       section: "group" },
  { href: "/investor-register", label: "Investor Register", icon: BookUser, section: "group" },
  { href: "/documents",     label: "Documents",        icon: FolderOpen,     section: "admin" },
  { href: "/audit-log",     label: "Audit Log",        icon: Shield,         section: "admin" },
];

const ycSections: Record<string, string> = {
  overview: "Overview",
  group:    "Group",
  admin:    "Administration",
};

// ── Jurisdiction config ───────────────────────────────────────────────────────
type Jurisdiction = "delaware" | "cayman" | "yc";

const JURISDICTIONS: Record<Jurisdiction, { flag: string; label: string; sub: string; homeRoute: string }> = {
  delaware: { flag: "🇺🇸", label: "Delaware",       sub: "Series LP",    homeRoute: "/" },
  cayman:   { flag: "🇰🇾", label: "Cayman Islands", sub: "Exempted LP",  homeRoute: "/cayman" },
  yc:       { flag: "🅈🄲", label: "YC",             sub: "Portfolio",    homeRoute: "/yc-portfolio" },
};

function detectJurisdiction(path: string): Jurisdiction {
  if (path.startsWith("/cayman"))         return "cayman";
  if (path.startsWith("/yc-portfolio"))   return "yc";
  // investor-register is accessible from all jurisdictions — keep current jurisdiction
  // if accessed directly, default to delaware
  return "delaware";
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  const jurisdiction = detectJurisdiction(location);

  function switchJurisdiction(j: Jurisdiction) {
    if (j !== jurisdiction) navigate(JURISDICTIONS[j].homeRoute);
  }

  const nav      = jurisdiction === "delaware" ? delawareNav : jurisdiction === "cayman" ? caymanNav : ycNav;
  const sections = jurisdiction === "delaware" ? delawareSections : jurisdiction === "cayman" ? caymanSections : ycSections;
  const jInfo    = JURISDICTIONS[jurisdiction];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(var(--background))" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-60 flex-shrink-0 border-r"
        style={{
          background:  "hsl(var(--sidebar-bg))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 border-b"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Founders Capital" role="img">
            <rect x="1"  y="1"  width="9" height="9" rx="1.5" fill="white"/>
            <rect x="12" y="1"  width="9" height="9" rx="1.5" fill="white"/>
            <rect x="23" y="1"  width="8" height="9" rx="1.5" fill="white"/>
            <rect x="1"  y="12" width="9" height="9" rx="1.5" fill="white"/>
            <rect x="23" y="12" width="8" height="9" rx="1.5" fill="white"/>
            <rect x="1"  y="23" width="9" height="8" rx="1.5" fill="white"/>
            <rect x="12" y="23" width="9" height="8" rx="1.5" fill="white"/>
          </svg>
          <div>
            <div className="text-sm font-semibold leading-tight tracking-tight" style={{ color: "hsl(0 0% 96%)" }}>
              Founders Capital
            </div>
            <div className="text-xs" style={{ color: "hsl(0 0% 45%)" }}>
              Partner Portal
            </div>
          </div>
        </div>

        {/* Jurisdiction Switcher — 3 columns */}
        <div className="px-3 pt-3 pb-2">
          <p
            className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "hsl(0 0% 40%)" }}
          >
            View
          </p>
          <div
            className="flex rounded-lg overflow-hidden border"
            style={{ borderColor: "hsl(var(--sidebar-border))" }}
          >
            {(["delaware", "cayman", "yc"] as Jurisdiction[]).map((key, idx, arr) => {
              const info   = JURISDICTIONS[key];
              const active = jurisdiction === key;
              const isLast = idx === arr.length - 1;
              return (
                <button
                  key={key}
                  data-testid={`jurisdiction-${key}`}
                  onClick={() => switchJurisdiction(key)}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-xs font-medium transition-colors"
                  style={{
                    background:  active ? "hsl(231 70% 54% / 0.22)" : "hsl(0 0% 100% / 0.04)",
                    color:       active ? "hsl(231 70% 76%)"         : "hsl(0 0% 50%)",
                    borderRight: !isLast ? "1px solid hsl(var(--sidebar-border))" : "none",
                  }}
                >
                  {key === "yc" ? (
                    /* US flag + YC label */
                    <span className="text-base leading-none">🇺🇸</span>
                  ) : (
                    <span className="text-base leading-none">{info.flag}</span>
                  )}
                  <span className="leading-tight truncate w-full text-center" style={{ fontSize: "10px" }}>
                    {key === "delaware" ? "Delaware" : key === "cayman" ? "Cayman" : "YC"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {Object.entries(sections).map(([sectionKey, sectionLabel]) => {
            const items = nav.filter(n => n.section === sectionKey);
            if (items.length === 0) return null;
            return (
              <div key={sectionKey} className="mb-4">
                <p
                  className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "hsl(0 0% 40%)" }}
                >
                  {sectionLabel}
                </p>
                <div className="space-y-0.5">
                  {items.map(({ href, label, icon: Icon }) => {
                    const active = location === href;
                    return (
                      <Link key={href} href={href}>
                        <a
                          data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                          style={{
                            background: active ? "hsl(231 70% 54% / 0.18)" : "transparent",
                            color:      active ? "hsl(231 70% 72%)"         : "hsl(0 0% 60%)",
                          }}
                          onMouseEnter={e => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = "hsl(0 0% 100% / 0.06)";
                              (e.currentTarget as HTMLElement).style.color      = "hsl(0 0% 88%)";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = "transparent";
                              (e.currentTarget as HTMLElement).style.color      = "hsl(0 0% 60%)";
                            }
                          }}
                        >
                          <Icon size={15} />
                          {label}
                        </a>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-5 py-3.5 border-t text-xs"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}
        >
          <div className="font-medium" style={{ color: "hsl(0 0% 55%)" }}>founders-capital.com</div>
          <div className="mt-0.5" style={{ color: "hsl(0 0% 30%)" }}>© {new Date().getFullYear()} Founders Capital</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
