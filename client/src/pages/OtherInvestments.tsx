import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, DollarSign, Briefcase, BarChart3, Search, ExternalLink, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

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

// ── component ─────────────────────────────────────────────────────────────────
export default function OtherInvestments() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cost" | "fv" | "name">("fv");

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

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Cost Deployed",  value: fmt(totalCost, true),      sub: `${investments.length} positions`,               icon: Briefcase,  accent: "#3B5BDB" },
          { label: "Portfolio FV",   value: fmt(totalFV, true),        sub: `MOIC ${moic.toFixed(2)}x`,                      icon: BarChart3,  accent: "#0CA678" },
          { label: "Unrealised G/L", value: fmt(unrealised, true),     sub: `${unrealised >= 0 ? "+" : ""}${((unrealised / (totalCost || 1)) * 100).toFixed(1)}% on cost`, icon: TrendingUp, accent: unrealised >= 0 ? "#0CA678" : "#FA5252" },
          { label: "Positions",      value: String(investments.length), sub: "active investments",                            icon: DollarSign, accent: "#F59F00" },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="rounded-xl border p-4" style={{ background: card, borderColor: border }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>{label}</span>
              <span className="rounded-lg p-1.5" style={{ background: `${accent}22` }}>
                <Icon size={14} style={{ color: accent }} />
              </span>
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
