import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, DollarSign, Briefcase, BarChart3, Search, ExternalLink, Users, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, compact = false) {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
    if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const STAGE_COLORS: Record<string, string> = {
  "pre-seed": "#7048E8", seed: "#3B5BDB", "series-a": "#0CA678",
  "series-b": "#F59F00", "series-c": "#FA5252", growth: "#0CA678", other: "#868E96",
};

function initials(name: string) {
  // Strip date suffixes like "(Dec 24)", "(YC W25)" etc.
  const clean = name.replace(/\s*\(.*?\)/g, "").trim();
  return clean.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// Best-guess domain from company name for Clearbit logo lookup
const DOMAIN_OVERRIDES: Record<string, string> = {
  "anthropic":       "anthropic.com",
  "spacex":          "spacex.com",
  "neuralink":       "neuralink.com",
  "xai":             "x.ai",
  "openai":          "openai.com",
  "revolut":         "revolut.com",
  "groq":            "groq.com",
  "anduril":         "anduril.com",
  "cursor":          "cursor.sh",
  "databricks":      "databricks.com",
  "perplexity":      "perplexity.ai",
  "stripe":          "stripe.com",
  "kraken":          "kraken.com",
  "polymarket":      "polymarket.com",
  "elevenlabs":      "elevenlabs.io",
  "vercel":          "vercel.com",
  "apptronik":       "apptronik.com",
  "aetherflux":      "aetherflux.com",
  "stoke space":     "stokespace.com",
  "deepflow":        "deepflow.io",
  "reach power":     "reachpower.com",
  "radiant nuclear": "radiantnuclear.com",
  "living things":   "livingthings.eco",
  "innerworks":      "innerworks.app",
  "incard":          "incard.co",
  "maeving":         "maeving.com",
  "audiomob":        "audiomob.io",
  "oneleet":         "oneleet.com",
  "proper wild":     "properwild.com",
  "yhangry":         "yhangry.com",
  "heata":           "heata.co.uk",
  "winefi":          "winefi.com",
  "sygaldry":        "sygaldry.com",
  "blok":            "blok.com",
  "sesame":          "sesame.com",
};

function getDomain(name: string): string | null {
  const lower = name.toLowerCase().replace(/\s*\(.*?\)/g, "").trim();
  // Check overrides first
  for (const [key, domain] of Object.entries(DOMAIN_OVERRIDES)) {
    if (lower.includes(key)) return domain;
  }
  // Generic guess: first word + .com
  const first = lower.split(/\s+/)[0];
  if (first && first.length > 2) return `${first}.com`;
  return null;
}

function clearbitUrl(name: string): string | null {
  const domain = getDomain(name);
  return domain ? `https://logo.clearbit.com/${domain}` : null;
}

// ── Logo component ────────────────────────────────────────────────────────────
function CompanyLogo({ name, size = 36 }: { name: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = clearbitUrl(name);
  const stageColor = STAGE_COLORS["other"];
  const clean = name.replace(/\s*\(.*?\)/g, "").trim();
  const color = ["#3B5BDB", "#0CA678", "#F59F00", "#7048E8", "#FA5252"][
    clean.charCodeAt(0) % 5
  ];

  if (logoUrl && !imgFailed) {
    return (
      <div
        className="rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 bg-white"
        style={{ width: size, height: size, border: "1px solid hsl(var(--border))" }}
      >
        <img
          src={logoUrl}
          alt={name}
          style={{ width: size - 6, height: size - 6, objectFit: "contain" }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{ width: size, height: size, background: `${color}22`, color }}
    >
      {initials(name)}
    </div>
  );
}

// ── Drill content ─────────────────────────────────────────────────────────────
type OtherDrillKey = "cost" | "fv" | "unrealised" | "positions";

function OtherDrillContent({ drillKey, investments, investorCounts }: {
  drillKey: OtherDrillKey;
  investments: any[];
  investorCounts: Record<string, number>;
}) {
  const TH = "text-xs font-medium uppercase tracking-wider pb-2 text-left whitespace-nowrap";
  const TD = "py-2.5 text-xs";
  const thStyle = { color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))" };
  const fmtD = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const totalCost = investments.reduce((s, i) => s + parseFloat(i.cost_basis || 0), 0);
  const totalFV   = investments.reduce((s, i) => s + parseFloat(i.current_fair_value ?? i.cost_basis ?? 0), 0);

  if (drillKey === "cost") {
    const sorted = [...investments].sort((a, b) => parseFloat(b.cost_basis || 0) - parseFloat(a.cost_basis || 0));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TH} style={thStyle}>Company</th>
            <th className={TH} style={thStyle}>Series</th>
            <th className={TH} style={thStyle}>Stage</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Cost Basis</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% of Total</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const cost = parseFloat(inv.cost_basis || 0);
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      <CompanyLogo name={inv.company_name || ""} size={24} />
                      <span className="font-medium">{inv.company_name}</span>
                    </div>
                  </td>
                  <td className={TD + " font-mono"} style={{ color: "hsl(var(--muted-foreground))" }}>{inv.entities?.short_code ?? "—"}</td>
                  <td className={TD}>
                    {inv.stage ? (
                      <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: `${STAGE_COLORS[inv.stage] || "#868E96"}22`, color: STAGE_COLORS[inv.stage] || "#868E96" }}>{inv.stage}</span>
                    ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmtD(cost)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>
                    {totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
            <td className="py-2.5 text-sm font-semibold" colSpan={3} style={{ color: "hsl(var(--foreground))" }}>{sorted.length} positions</td>
            <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtD(totalCost)}</td>
            <td />
          </tr></tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "fv") {
    const sorted = [...investments].sort((a, b) =>
      parseFloat(b.current_fair_value ?? b.cost_basis ?? 0) - parseFloat(a.current_fair_value ?? a.cost_basis ?? 0)
    );
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TH} style={thStyle}>Company</th>
            <th className={TH} style={thStyle}>Stage</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Cost</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Fair Value</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>MOIC</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const cost = parseFloat(inv.cost_basis || 0);
              const fv   = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
              const moic = cost > 0 ? fv / cost : 1;
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      <CompanyLogo name={inv.company_name || ""} size={24} />
                      <span className="font-medium">{inv.company_name}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    {inv.stage ? (
                      <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: `${STAGE_COLORS[inv.stage] || "#868E96"}22`, color: STAGE_COLORS[inv.stage] || "#868E96" }}>{inv.stage}</span>
                    ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{fmtD(cost)}</td>
                  <td className={TD + " font-mono text-right font-semibold"} style={{ color: "hsl(var(--foreground))" }}>{fmtD(fv)}</td>
                  <td className={TD + " font-mono text-right font-semibold"} style={{ color: moic >= 1 ? "#0CA678" : "#FA5252" }}>{moic.toFixed(2)}x</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
            <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
            <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtD(totalCost)}</td>
            <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtD(totalFV)}</td>
            <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalFV >= totalCost ? "#0CA678" : "#FA5252" }}>
              {totalCost > 0 ? (totalFV / totalCost).toFixed(2) + "x" : "—"}
            </td>
          </tr></tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "unrealised") {
    const sorted = [...investments]
      .map(i => ({ ...i, _gain: parseFloat(i.current_fair_value ?? i.cost_basis ?? 0) - parseFloat(i.cost_basis || 0) }))
      .sort((a, b) => b._gain - a._gain);
    const totalGain = totalFV - totalCost;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TH} style={thStyle}>Company</th>
            <th className={TH} style={thStyle}>Stage</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Cost</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Fair Value</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Gain / Loss</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Return</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const cost = parseFloat(inv.cost_basis || 0);
              const fv   = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
              const gain = inv._gain;
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      <CompanyLogo name={inv.company_name || ""} size={24} />
                      <span className="font-medium">{inv.company_name}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    {inv.stage ? (
                      <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: `${STAGE_COLORS[inv.stage] || "#868E96"}22`, color: STAGE_COLORS[inv.stage] || "#868E96" }}>{inv.stage}</span>
                    ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{fmtD(cost)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmtD(fv)}</td>
                  <td className={TD + " font-mono text-right font-medium"} style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                    {gain >= 0 ? "+" : ""}{fmtD(gain)}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                    {cost > 0 ? `${gain >= 0 ? "+" : ""}${((gain / cost) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
            <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
            <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtD(totalCost)}</td>
            <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtD(totalFV)}</td>
            <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalGain >= 0 ? "#0CA678" : "#FA5252" }}>
              {totalGain >= 0 ? "+" : ""}{fmtD(totalGain)}
            </td>
            <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalGain >= 0 ? "#0CA678" : "#FA5252" }}>
              {totalCost > 0 ? `${totalGain >= 0 ? "+" : ""}${((totalGain / totalCost) * 100).toFixed(1)}%` : "—"}
            </td>
          </tr></tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "positions") {
    const sorted = [...investments].sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>
            <th className={TH} style={thStyle}>Company</th>
            <th className={TH} style={thStyle}>Series</th>
            <th className={TH} style={thStyle}>Stage</th>
            <th className={TH} style={thStyle}>Instrument</th>
            <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Investors</th>
            <th className={TH} style={{ ...thStyle, textAlign: "center" }}>Status</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map((inv: any) => {
              const count = investorCounts[inv.entity_id] ?? null;
              const domain = getDomain(inv.company_name || "");
              const website = inv.company_website || (domain ? `https://${domain}` : null);
              return (
                <tr key={inv.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <div className="flex items-center gap-2">
                      <CompanyLogo name={inv.company_name || ""} size={24} />
                      <div className="flex flex-col">
                        <span className="font-medium">{inv.company_name}</span>
                        {website && (
                          <a href={website} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs hover:underline"
                            style={{ color: "hsl(231 70% 62%)" }}
                            onClick={e => e.stopPropagation()}>
                            <ExternalLink size={9} />{domain}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={TD + " font-mono"} style={{ color: "hsl(var(--muted-foreground))" }}>{inv.entities?.short_code ?? "—"}</td>
                  <td className={TD}>
                    {inv.stage ? (
                      <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: `${STAGE_COLORS[inv.stage] || "#868E96"}22`, color: STAGE_COLORS[inv.stage] || "#868E96" }}>{inv.stage}</span>
                    ) : <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>}
                  </td>
                  <td className={TD} style={{ color: "hsl(var(--muted-foreground))" }}>{inv.instrument_type?.replace(/_/g, " ") || "—"}</td>
                  <td className={TD + " text-right font-mono"} style={{ color: "hsl(var(--foreground))" }}>
                    {count != null ? (
                      <div className="flex items-center justify-end gap-1">
                        <Users size={11} style={{ color: "hsl(var(--muted-foreground))" }} />
                        {count}
                      </div>
                    ) : "—"}
                  </td>
                  <td className={TD + " text-center"}>
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                      style={{ background: inv.status === "active" ? "#0CA67822" : "hsl(var(--muted))", color: inv.status === "active" ? "#0CA678" : "hsl(var(--muted-foreground))" }}>
                      {inv.status ?? "active"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
            <td className="py-2.5 text-sm font-semibold" colSpan={6} style={{ color: "hsl(var(--foreground))" }}>{sorted.length} positions</td>
          </tr></tfoot>
        </table>
      </div>
    );
  }

  return null;
}

// ── component ─────────────────────────────────────────────────────────────────
export default function OtherInvestments() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cost" | "fv" | "name">("fv");
  const [activeDrill, setActiveDrill] = useState<OtherDrillKey | null>(null);

  const { data: allInvestments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/investments", "other"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  // Investor counts per entity
  const { data: investorCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/investor-counts"],
    queryFn: () => apiRequest("GET", "/api/investor-counts").then(r => r.json()),
  });

  // Filter: exclude FC-VECTOR-*, FC-CAYMAN-*, and YC-tagged
  const investments = useMemo(() => {
    return (allInvestments as any[]).filter(i => {
      const sc = i.entities?.short_code ?? "";
      if (sc.startsWith("FC-VECTOR")) return false;
      if (sc.startsWith("FC-CAYMAN")) return false;
      if ((i.company_name || "").includes("(YC ")) return false;
      return true;
    });
  }, [allInvestments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return investments
      .filter(i => !q || i.company_name?.toLowerCase().includes(q) || i.entities?.short_code?.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === "name") return (a.company_name || "").localeCompare(b.company_name || "");
        if (sortBy === "cost") return parseFloat(b.cost_basis || 0) - parseFloat(a.cost_basis || 0);
        const fvA = parseFloat(a.current_fair_value ?? a.cost_basis ?? 0);
        const fvB = parseFloat(b.current_fair_value ?? b.cost_basis ?? 0);
        return fvB - fvA;
      });
  }, [investments, search, sortBy]);

  const totalCost = investments.reduce((s, i) => s + parseFloat(i.cost_basis || 0), 0);
  const totalFV   = investments.reduce((s, i) => s + parseFloat(i.current_fair_value ?? i.cost_basis ?? 0), 0);
  const unrealised = totalFV - totalCost;
  const moic = totalCost > 0 ? totalFV / totalCost : 0;

  const bg     = "hsl(var(--background))";
  const card   = "hsl(var(--card))";
  const border = "hsl(var(--border))";
  const muted  = "hsl(var(--muted-foreground))";
  const text   = "hsl(var(--foreground))";

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ background: bg }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌐</span>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: text }}>Other Investments</h1>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full ml-1"
              style={{ background: "hsl(231 70% 54% / 0.12)", color: "hsl(231 70% 65%)" }}
            >
              FC Portfolio
            </span>
          </div>
          <p className="text-sm" style={{ color: muted }}>
            All FC investments outside Delaware Series SPVs, Cayman, and YC programmes
          </p>
        </div>
      </div>

      {/* Drill-down Sheet */}
      <Sheet open={activeDrill !== null} onOpenChange={open => { if (!open) setActiveDrill(null); }}>
        <SheetContent side="right" className="w-[620px] sm:max-w-[620px] overflow-y-auto">
          {activeDrill && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-base">
                  {activeDrill === "cost"       && "Cost Deployed"}
                  {activeDrill === "fv"         && "Portfolio Fair Value"}
                  {activeDrill === "unrealised" && "Unrealised Gain / Loss"}
                  {activeDrill === "positions"  && "All Positions"}
                </SheetTitle>
                <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {activeDrill === "cost"       && "Cost basis across all Other investments, largest first"}
                  {activeDrill === "fv"         && "Fair value vs cost — sorted by fair value"}
                  {activeDrill === "unrealised" && "Unrealised gain or loss vs cost basis — best performers first"}
                  {activeDrill === "positions"  && "All active positions — A to Z"}
                </p>
              </SheetHeader>
              <OtherDrillContent drillKey={activeDrill} investments={investments} investorCounts={investorCounts} />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {([
          { label: "Cost Deployed",  value: fmt(totalCost, true),      sub: `${investments.length} positions`,               icon: Briefcase,  accent: "#3B5BDB", drill: "cost"       as OtherDrillKey },
          { label: "Portfolio FV",   value: fmt(totalFV, true),        sub: `MOIC ${moic.toFixed(2)}x`,                      icon: BarChart3,  accent: "#0CA678", drill: "fv"         as OtherDrillKey },
          { label: "Unrealised G/L", value: fmt(unrealised, true),     sub: `${unrealised >= 0 ? "+" : ""}${((unrealised / (totalCost || 1)) * 100).toFixed(1)}% on cost`, icon: TrendingUp, accent: unrealised >= 0 ? "#0CA678" : "#FA5252", drill: "unrealised" as OtherDrillKey },
          { label: "Positions",      value: String(investments.length), sub: "active investments",                            icon: DollarSign, accent: "#F59F00", drill: "positions"  as OtherDrillKey },
        ] as const).map(({ label, value, sub, icon: Icon, accent, drill }) => (
          <div
            key={label}
            onClick={() => setActiveDrill(drill)}
            className="rounded-xl border p-4 cursor-pointer transition-all duration-150"
            style={{ background: card, borderColor: border }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${accent}88`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border; }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{label}</span>
              <div className="flex items-center gap-1.5">
                <ArrowUpRight size={11} style={{ color: muted, opacity: 0.5 }} />
                <span className="rounded-lg p-1.5" style={{ background: `${accent}22` }}>
                  <Icon size={14} style={{ color: accent }} />
                </span>
              </div>
            </div>
            <div className="text-xl font-bold font-mono" style={{ color: text }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: muted }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: muted }} />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search investments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["fv", "cost", "name"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{
                background: sortBy === s ? "hsl(231 70% 54% / 0.15)" : "transparent",
                color:      sortBy === s ? "hsl(231 70% 72%)"         : muted,
                border:     `1px solid ${sortBy === s ? "hsl(231 70% 54% / 0.3)" : "transparent"}`,
              }}
            >
              {s === "fv" ? "Fair Value" : s === "cost" ? "Cost" : "A–Z"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: muted }}>{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: card, borderColor: border }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: muted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: muted }}>No investments found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${border}` }}>
                {["Company", "Series", "Stage", "Investors", "Cost Basis", "Fair Value", "MOIC"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv: any, idx) => {
                const cost   = parseFloat(inv.cost_basis || 0);
                const fv     = parseFloat(inv.current_fair_value ?? inv.cost_basis ?? 0);
                const moicI  = cost > 0 ? fv / cost : 1;
                const gain   = fv - cost;
                const stageColor = STAGE_COLORS[inv.stage] || "#868E96";
                const sc     = inv.entities?.short_code ?? "—";
                const domain = getDomain(inv.company_name || "");
                const website = inv.company_website || (domain ? `https://${domain}` : null);
                const investorCount = investorCounts[inv.entity_id] ?? null;

                return (
                  <tr
                    key={inv.id || idx}
                    style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${border}` : "none" }}
                  >
                    {/* Company — logo + name + website link */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CompanyLogo name={inv.company_name || ""} size={34} />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate" style={{ color: text }}>{inv.company_name}</span>
                          {website && (
                            <a
                              href={website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-xs truncate hover:underline"
                              style={{ color: "hsl(231 70% 62%)" }}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={10} />
                              {domain}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Series code */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "hsl(0 0% 100% / 0.06)", color: muted }}>
                        {sc}
                      </span>
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-3">
                      {inv.stage ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${stageColor}22`, color: stageColor }}>
                          {inv.stage}
                        </span>
                      ) : <span style={{ color: muted }}>—</span>}
                    </td>

                    {/* Investor count */}
                    <td className="px-4 py-3">
                      {investorCount != null ? (
                        <div className="flex items-center gap-1.5">
                          <Users size={12} style={{ color: muted }} />
                          <span className="text-sm font-mono" style={{ color: text }}>{investorCount}</span>
                        </div>
                      ) : (
                        <span style={{ color: muted }}>—</span>
                      )}
                    </td>

                    {/* Cost */}
                    <td className="px-4 py-3 font-mono text-sm" style={{ color: text }}>
                      {fmt(cost)}
                    </td>

                    {/* FV */}
                    <td className="px-4 py-3 font-mono text-sm">
                      <span style={{ color: text }}>{fmt(fv)}</span>
                      {gain !== 0 && (
                        <span className="ml-2 text-xs" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                          {gain >= 0 ? "+" : ""}{fmt(gain, true)}
                        </span>
                      )}
                    </td>

                    {/* MOIC */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold" style={{ color: moicI >= 1 ? "#0CA678" : "#FA5252" }}>
                        {moicI.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
