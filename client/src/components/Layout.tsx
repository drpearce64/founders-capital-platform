import { Link, useLocation } from "wouter";
import { LayoutDashboard, Building2, Users, UserPlus, Phone, TrendingUp, Shield, Receipt, BarChart3, FolderOpen, UserCog, Layers } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, section: "overview" },
  { href: "/spvs", label: "SPVs", icon: Building2, section: "overview" },
  { href: "/lp-onboarding", label: "Onboard LP", icon: UserPlus, section: "lps" },
  { href: "/lp-register", label: "LP Register", icon: Users, section: "lps" },
  { href: "/lp-portfolio", label: "LP Portfolio", icon: Layers, section: "lps" },
  { href: "/capital-calls", label: "Capital Calls", icon: Phone, section: "finance" },
  { href: "/series-expenses", label: "Series Expenses", icon: Receipt, section: "finance" },
  { href: "/waterfall", label: "Waterfall", icon: TrendingUp, section: "finance" },
  { href: "/nav-marks", label: "NAV / Fair Value", icon: BarChart3, section: "finance" },
  { href: "/documents", label: "Documents", icon: FolderOpen, section: "admin" },
  { href: "/audit-log", label: "Audit Log", icon: Shield, section: "admin" },
  { href: "/settings", label: "Users & Roles", icon: UserCog, section: "admin" },
];

const sections: Record<string, string> = {
  overview: "Overview",
  lps: "Investors",
  finance: "Finance",
  admin: "Administration",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(var(--background))" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-60 flex-shrink-0 border-r"
        style={{
          background: "hsl(var(--sidebar-bg))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Founders Capital">
            <rect width="28" height="28" rx="6" fill="hsl(213 94% 62%)"/>
            <path d="M7 8h14M7 14h9M7 20h12" stroke="hsl(222 47% 8%)" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          <div>
            <div className="text-sm font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
              Founders Capital
            </div>
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Platform LLC
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {Object.entries(sections).map(([sectionKey, sectionLabel]) => {
            const items = nav.filter(n => n.section === sectionKey);
            return (
              <div key={sectionKey} className="mb-4">
                <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground) / 0.6)" }}>
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
                            background: active ? "hsl(213 94% 62% / 0.12)" : "transparent",
                            color: active ? "hsl(213 94% 62%)" : "hsl(var(--muted-foreground))",
                          }}
                          onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "hsl(var(--secondary))"; (e.currentTarget as HTMLElement).style.color = "hsl(var(--foreground))"; } }}
                          onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "hsl(var(--muted-foreground))"; } }}
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
        <div className="px-5 py-4 border-t text-xs" style={{ borderColor: "hsl(var(--sidebar-border))", color: "hsl(var(--muted-foreground))" }}>
          Delaware Series LLC
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
