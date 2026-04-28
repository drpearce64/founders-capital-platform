import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search } from "lucide-react";
import {
  TrendingUp, DollarSign, Building2, ExternalLink, Layers, Zap, ArrowUpRight,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ValuationMarkModal } from "@/components/ValuationMarkModal";

// ── Types ─────────────────────────────────────────────────────────────────────
interface YCDeal {
  id: string;
  name: string;
  status: string;
  stage: string;
  batch: string;
  instrument: string;
  currency: string;
  fc_investment: number;
  usd_investment_value: number;
  total_funds_committed: number;
  moic: number;
  live_market_value_usd: number | null;
  portfolio_appreciation: number | null;
  closing_date: string;
  quarter: string;
  year: string;
  description: string;
  url: string;
  deal_code: string;
  business_type: string;
  location: string;
  has_followon: boolean;
  followon_round: string | null;
  followon_amount_usd: number | null;
  followon_date: string | null;
  followon_lead_investor: string | null;
  followon_post_money_valuation: number | null;
  followon_source: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return "$" + fmt(n, decimals);
}

function fmtMoic(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toFixed(2) + "x";
}

const BATCH_ORDER = ["W25", "S25", "X25", "F25", "W26", "S26"];

function sortBatch(a: string, b: string): number {
  const ai = BATCH_ORDER.indexOf(a);
  const bi = BATCH_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

// Full cohort label
const BATCH_LABELS: Record<string, { season: string; year: string }> = {
  W25: { season: "Winter", year: "2025" },
  S25: { season: "Summer", year: "2025" },
  X25: { season: "Fall",   year: "2025" },
  F25: { season: "Fall",   year: "2025" },
  W26: { season: "Winter", year: "2026" },
  S26: { season: "Summer", year: "2026" },
};

function batchLabel(b: string): string {
  const info = BATCH_LABELS[b];
  return info ? `${info.season} ${info.year}` : b;
}

// Batch colour
const BATCH_COLOURS: Record<string, { pill: string; card: string; cardActive: string }> = {
  W25: { pill: "bg-blue-100 text-blue-800",   card: "border-blue-200",   cardActive: "bg-blue-600 text-white border-blue-600" },
  S25: { pill: "bg-green-100 text-green-800", card: "border-green-200",  cardActive: "bg-green-600 text-white border-green-600" },
  X25: { pill: "bg-orange-100 text-orange-800", card: "border-orange-200", cardActive: "bg-orange-600 text-white border-orange-600" },
  F25: { pill: "bg-orange-100 text-orange-800", card: "border-orange-200", cardActive: "bg-orange-600 text-white border-orange-600" },
  W26: { pill: "bg-purple-100 text-purple-800", card: "border-purple-200", cardActive: "bg-purple-600 text-white border-purple-600" },
  S26: { pill: "bg-teal-100 text-teal-800",   card: "border-teal-200",   cardActive: "bg-teal-600 text-white border-teal-600" },
};

function BatchPill({ batch }: { batch: string }) {
  const cls = BATCH_COLOURS[batch]?.pill ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${cls}`}>
      {batch}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    Closed: "bg-emerald-100 text-emerald-800",
    Open:   "bg-amber-100 text-amber-800",
    Exited: "bg-red-100 text-red-800",
  };
  const cls = colours[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, onClick }: { icon: any; label: string; value: string; sub?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl border p-5 flex flex-col gap-2 transition-all duration-150"
      style={{
        background: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = "hsl(231 70% 54% / 0.5)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(var(--border))"; }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {onClick && <ArrowUpRight size={11} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }} />}
          <Icon size={16} style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
      </div>
      <div className="text-xl font-semibold font-mono" style={{ color: "hsl(var(--foreground))" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Drill-down drawer ─────────────────────────────────────────────────────────
type YCDrillKey = "companies" | "fc_deployed" | "spv_size" | "moic" | "followon";

function YCDrillContent({ drillKey, deals }: { drillKey: YCDrillKey; deals: YCDeal[] }) {
  const TH = "text-xs font-medium uppercase tracking-wider pb-2 text-left whitespace-nowrap";
  const TD = "py-2.5 text-xs";
  const thStyle = { color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))" };

  if (drillKey === "companies") {
    const sorted = [...deals].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={thStyle}>Cohort</th>
              <th className={TH} style={thStyle}>Stage</th>
              <th className={TH} style={thStyle}>Location</th>
              <th className={TH} style={{ ...thStyle, textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map(d => (
              <tr key={d.id}>
                <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                  <div className="font-medium">{d.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}</div>
                  {d.description && <div className="text-xs mt-0.5 max-w-[200px] truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{d.description}</div>}
                </td>
                <td className={TD}><BatchPill batch={d.batch} /></td>
                <td className={TD} style={{ color: "hsl(var(--muted-foreground))" }}>{d.stage || "—"}</td>
                <td className={TD} style={{ color: "hsl(var(--muted-foreground))" }}>{d.location || "—"}</td>
                <td className={TD + " text-center"}><StatusBadge status={d.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={5} style={{ color: "hsl(var(--foreground))" }}>
                {sorted.length} companies
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "fc_deployed") {
    const sorted = [...deals].sort((a, b) => (b.fc_investment ?? 0) - (a.fc_investment ?? 0));
    const total = sorted.reduce((s, d) => s + (d.fc_investment ?? 0), 0);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={thStyle}>Cohort</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>FC Invested</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>% of Total</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Currency</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map(d => (
              <tr key={d.id}>
                <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                  <span className="font-medium">{d.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}</span>
                </td>
                <td className={TD}><BatchPill batch={d.batch} /></td>
                <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>
                  {d.fc_investment > 0 ? fmtUsd(d.fc_investment) : "—"}
                </td>
                <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>
                  {total > 0 && d.fc_investment > 0 ? ((d.fc_investment / total) * 100).toFixed(1) + "%" : "—"}
                </td>
                <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>
                  {d.currency || "USD"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "spv_size") {
    const sorted = [...deals].sort((a, b) => (b.usd_investment_value ?? 0) - (a.usd_investment_value ?? 0));
    const totalSpv = sorted.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0);
    const totalFc  = sorted.reduce((s, d) => s + (d.fc_investment ?? 0), 0);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={thStyle}>Cohort</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>SPV Total</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>FC Capital</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>FC %</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map(d => {
              const fcPct = d.usd_investment_value > 0 ? (d.fc_investment / d.usd_investment_value) * 100 : 0;
              return (
                <tr key={d.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <span className="font-medium">{d.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}</span>
                  </td>
                  <td className={TD}><BatchPill batch={d.batch} /></td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(d.usd_investment_value)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--muted-foreground))" }}>{d.fc_investment > 0 ? fmtUsd(d.fc_investment) : "—"}</td>
                  <td className={TD + " text-right"}>
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(fcPct, 100)}%`, background: "#3B5BDB" }} />
                      </div>
                      <span className="font-mono text-xs w-9 text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fcPct > 0 ? fcPct.toFixed(1) + "%" : "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(totalSpv)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtUsd(totalFc)}</td>
              <td className="py-2.5 text-sm font-mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                {totalSpv > 0 ? ((totalFc / totalSpv) * 100).toFixed(1) + "% avg" : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "moic") {
    const sorted = [...deals].sort((a, b) => (b.moic ?? 0) - (a.moic ?? 0));
    const totalCost = sorted.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0);
    const totalLive = sorted.reduce((s, d) => s + (d.live_market_value_usd ?? d.usd_investment_value ?? 0), 0);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={thStyle}>Cohort</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>SPV Cost</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Live Value</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>MOIC</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Gain / Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {sorted.map(d => {
              const cost = d.usd_investment_value ?? 0;
              const live = d.live_market_value_usd ?? cost;
              const gain = live - cost;
              const moic = d.moic ?? (cost > 0 ? live / cost : 1);
              return (
                <tr key={d.id}>
                  <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                    <span className="font-medium">{d.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}</span>
                  </td>
                  <td className={TD}><BatchPill batch={d.batch} /></td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(cost)}</td>
                  <td className={TD + " font-mono text-right"} style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(live)}</td>
                  <td className={TD + " font-mono text-right font-semibold"} style={{ color: moic >= 2 ? "#0CA678" : moic < 1 ? "#FA5252" : "hsl(var(--foreground))" }}>
                    {fmtMoic(moic)}
                  </td>
                  <td className={TD + " font-mono text-right"} style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                    {gain >= 0 ? "+" : ""}{fmtUsd(gain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>Total</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(totalCost)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "hsl(var(--foreground))" }}>{fmtUsd(totalLive)}</td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalLive >= totalCost ? "#0CA678" : "#FA5252" }}>
                {totalCost > 0 ? (totalLive / totalCost).toFixed(2) + "x" : "—"}
              </td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: totalLive >= totalCost ? "#0CA678" : "#FA5252" }}>
                {totalLive - totalCost >= 0 ? "+" : ""}{fmtUsd(totalLive - totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  if (drillKey === "followon") {
    const followons = [...deals].filter(d => d.has_followon).sort((a, b) => {
      // Sort by date desc, then amount desc
      if (a.followon_date && b.followon_date) return b.followon_date.localeCompare(a.followon_date);
      if (a.followon_date) return -1;
      if (b.followon_date) return 1;
      return (b.followon_amount_usd ?? 0) - (a.followon_amount_usd ?? 0);
    });
    const totalRaised = followons.reduce((s, d) => s + (d.followon_amount_usd ?? 0), 0);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH} style={thStyle}>Company</th>
              <th className={TH} style={thStyle}>Cohort</th>
              <th className={TH} style={thStyle}>Round</th>
              <th className={TH} style={{ ...thStyle, textAlign: "right" }}>Amount</th>
              <th className={TH} style={thStyle}>Lead Investor</th>
              <th className={TH} style={thStyle}>Date</th>
              <th className={TH} style={{ ...thStyle, textAlign: "center" }}>Source</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {followons.map(d => (
              <tr key={d.id}>
                <td className={TD} style={{ color: "hsl(var(--foreground))" }}>
                  <span className="font-medium">{d.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}</span>
                </td>
                <td className={TD}><BatchPill batch={d.batch} /></td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                    style={{ background: "hsl(231 70% 54% / 0.15)", color: "hsl(231 70% 72%)" }}>
                    <Zap size={9} />
                    {d.followon_round ?? "Round"}
                  </span>
                </td>
                <td className={TD + " font-mono text-right font-semibold"} style={{ color: "#0CA678" }}>
                  {d.followon_amount_usd ? `$${(d.followon_amount_usd / 1e6).toFixed(1)}M` : "—"}
                </td>
                <td className={TD} style={{ color: "hsl(var(--muted-foreground))" }}>
                  {d.followon_lead_investor ? d.followon_lead_investor.split(",")[0].trim() : "—"}
                </td>
                <td className={TD + " font-mono"} style={{ color: "hsl(var(--muted-foreground))" }}>
                  {d.followon_date ?? "—"}
                </td>
                <td className={TD + " text-center"}>
                  {d.followon_source ? (
                    <a href={d.followon_source} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs hover:opacity-70"
                      style={{ color: "hsl(var(--primary))" }}>
                      <ExternalLink size={11} />
                    </a>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid hsl(var(--border))" }}>
              <td className="py-2.5 text-sm font-semibold" colSpan={3} style={{ color: "hsl(var(--foreground))" }}>
                {followons.length} follow-on{followons.length !== 1 ? "s" : ""}
              </td>
              <td className="py-2.5 text-sm font-mono font-semibold text-right" style={{ color: "#0CA678" }}>
                {totalRaised > 0 ? `$${(totalRaised / 1e6).toFixed(1)}M` : "—"}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return null;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function YCDashboard() {
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [followonOnly, setFollowonOnly] = useState(false);
  const [sortField, setSortField] = useState<keyof YCDeal>("batch");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activeDrill, setActiveDrill] = useState<YCDrillKey | null>(null);
  const [valuationInv, setValuationInv] = useState<any | null>(null);

  // Load all investments for YC name-matching
  const { data: allInvestments = [] } = useQuery<any[]>({
    queryKey: ["/api/investments", "yc-lookup"],
    queryFn: () => apiRequest("GET", "/api/investments").then(r => r.json()),
  });

  function openValuationForDeal(deal: YCDeal) {
    // Find matching investments row by name (YC deals share name with investments.company_name)
    const match = allInvestments.find(
      (i: any) => i.company_name?.toLowerCase() === deal.name?.toLowerCase()
    );
    if (match) {
      setValuationInv(match);
    } else {
      // Fallback: synthetic object so modal still opens with deal context
      setValuationInv({
        id: null,
        company_name: deal.name,
        cost_basis: deal.fc_investment ?? deal.usd_investment_value ?? 0,
        current_fair_value: deal.live_market_value_usd ?? deal.usd_investment_value ?? deal.fc_investment ?? 0,
        _noInvestmentRecord: true,
      });
    }
  }

  const DRILL_TITLES: Record<YCDrillKey, { title: string; subtitle: string }> = {
    companies:   { title: "Portfolio Companies",  subtitle: "All YC deals" },
    fc_deployed: { title: "FC Deployed",          subtitle: "Founders Capital's own capital invested" },
    spv_size:    { title: "Total SPV Size",        subtitle: "All investor capital across YC SPVs" },
    moic:        { title: "Portfolio MOIC",        subtitle: "Live value vs cost — sorted by MOIC" },
    followon:    { title: "Follow-on Rounds",      subtitle: "Portfolio companies with subsequent funding" },
  };

  const { data, isLoading, error } = useQuery<{ deals: YCDeal[]; total: number }>({
    queryKey: ["/api/yc-deals"],
    queryFn: () => apiRequest("GET", "/api/yc-deals").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Dedup by name — keep highest fc_investment row to eliminate ghost duplicates
  const deals = useMemo(() => {
    const raw: YCDeal[] = data?.deals ?? [];
    const seen = new Map<string, YCDeal>();
    for (const d of raw) {
      const key = (d.name ?? "").toLowerCase();
      const existing = seen.get(key);
      if (!existing || (d.fc_investment ?? 0) > (existing.fc_investment ?? 0)) {
        seen.set(key, d);
      }
    }
    return Array.from(seen.values());
  }, [data]);

  // Unique batches sorted
  const batches = useMemo(() => {
    const b = [...new Set(deals.map((d) => d.batch).filter(Boolean))];
    return b.sort(sortBatch);
  }, [deals]);

  // Filtered + sorted deals
  const filtered = useMemo(() => {
    let d = batchFilter === "all" ? deals : deals.filter((x) => x.batch === batchFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter((x) => (x.name ?? "").toLowerCase().includes(q) || (x.batch ?? "").toLowerCase().includes(q));
    }
    if (followonOnly) d = d.filter((x) => x.has_followon);
    return [...d].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [deals, batchFilter, sortField, sortDir]);

  // KPIs — always computed from filtered set
  const kpis = useMemo(() => {
    const src = filtered;
    const totalFCDeployed  = src.reduce((s, d) => s + (d.fc_investment ?? 0), 0);
    const totalSPVSize     = src.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0);
    const totalLiveValue   = src.reduce((s, d) => s + (d.live_market_value_usd ?? d.usd_investment_value ?? 0), 0);
    const portfolioMoic    = totalSPVSize > 0 ? totalLiveValue / totalSPVSize : 1;
    const followonCount    = src.filter(d => d.has_followon).length;
    const followonTotalUSD = src.filter(d => d.has_followon).reduce((s, d) => s + (d.followon_amount_usd ?? 0), 0);
    return { totalFCDeployed, totalSPVSize, portfolioMoic, companies: src.length, followonCount, followonTotalUSD };
  }, [filtered]);

  // Per-batch counts for the filter bar
  const batchCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of deals) map[d.batch] = (map[d.batch] ?? 0) + 1;
    return map;
  }, [deals]);

  function toggleSort(field: keyof YCDeal) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: keyof YCDeal }) {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const activeBatchInfo = batchFilter !== "all" ? BATCH_LABELS[batchFilter] : null;

  return (
    <>
      {isLoading ? (
        <div className="p-8 flex items-center justify-center h-full">
          <div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Loading YC portfolio from Airtable…
          </div>
        </div>
      ) : error ? (
        <div className="p-8">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load YC deals: {String(error)}
          </div>
        </div>
      ) : (
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div
          className="px-8 py-5 border-b flex-shrink-0"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <h1 className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            YC Portfolio
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            {deals.length} investments across {batches.length} cohorts · Live data from Airtable
          </p>
        </div>

        {/* ── Cohort filter bar ─────────────────────────────────────────── */}
        <div
          className="px-8 py-3 border-b flex-shrink-0 flex items-center gap-2 overflow-x-auto"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted) / 0.4)" }}
        >
          <span className="text-xs font-medium mr-1 whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
            Cohort
          </span>

          {/* All */}
          <button
            onClick={() => setBatchFilter("all")}
            data-testid="filter-cohort-all"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-all"
            style={
              batchFilter === "all"
                ? { background: "hsl(var(--primary))", color: "white", borderColor: "hsl(var(--primary))" }
                : { background: "hsl(var(--card))", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }
            }
          >
            All cohorts
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={
                batchFilter === "all"
                  ? { background: "rgba(255,255,255,0.25)", color: "white" }
                  : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {deals.length}
            </span>
          </button>

          {/* Divider */}
          <div className="h-5 w-px mx-1 flex-shrink-0" style={{ background: "hsl(var(--border))" }} />

          {/* Per-batch buttons */}
          {batches.map((b) => {
            const info = BATCH_LABELS[b];
            const isActive = batchFilter === b;
            const colours = BATCH_COLOURS[b];
            return (
              <button
                key={b}
                onClick={() => setBatchFilter(b)}
                data-testid={`filter-cohort-${b}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-all"
                style={
                  isActive
                    ? { background: "hsl(var(--primary))", color: "white", borderColor: "hsl(var(--primary))" }
                    : { background: "hsl(var(--card))", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }
                }
              >
                {/* Batch code pill */}
                <span
                  className="font-mono font-semibold text-xs px-1.5 py-0.5 rounded"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.25)", color: "white" }
                      : undefined
                  }
                >
                  {!isActive ? (
                    <span className={`inline-block px-1.5 py-0.5 rounded font-mono font-semibold text-xs ${colours?.pill ?? "bg-gray-100 text-gray-700"}`}>
                      {b}
                    </span>
                  ) : (
                    <span>{b}</span>
                  )}
                </span>
                {/* Season label */}
                {info && (
                  <span className={isActive ? "text-white/90" : ""} style={!isActive ? { color: "hsl(var(--muted-foreground))" } : {}}>
                    {info.season} {info.year}
                  </span>
                )}
                {/* Count */}
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={
                    isActive
                      ? { background: "rgba(255,255,255,0.25)", color: "white" }
                      : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {batchCounts[b] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* Search bar */}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
            <input
              type="text"
              placeholder="Search companies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-1.5 rounded-lg text-sm outline-none"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
              data-testid="input-search-portfolio"
            />
          </div>

          {/* Active cohort label */}
          {activeBatchInfo && (
            <div className="flex items-center gap-3">
              <BatchPill batch={batchFilter} />
              <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                {activeBatchInfo.season} {activeBatchInfo.year} cohort
              </span>
              <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                — {filtered.length} companies
              </span>
              <button
                onClick={() => setBatchFilter("all")}
                className="text-xs underline ml-auto"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Clear filter
              </button>
            </div>
          )}

          {/* KPI Drill Sheet */}
          <Sheet open={activeDrill !== null} onOpenChange={open => { if (!open) setActiveDrill(null); }}>
            <SheetContent side="right" className="w-[640px] sm:max-w-[640px] overflow-y-auto">
              {activeDrill && (
                <>
                  <SheetHeader className="mb-6">
                    <SheetTitle className="text-base">{DRILL_TITLES[activeDrill].title}</SheetTitle>
                    <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {DRILL_TITLES[activeDrill].subtitle}
                      {batchFilter !== "all" && (
                        <span className="ml-2 px-2 py-0.5 rounded text-xs"
                          style={{ background: "hsl(231 70% 54% / 0.12)", color: "hsl(231 70% 65%)" }}>
                          {batchLabel(batchFilter)}
                        </span>
                      )}
                    </p>
                  </SheetHeader>
                  <YCDrillContent drillKey={activeDrill} deals={filtered} />
                </>
              )}
            </SheetContent>
          </Sheet>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              icon={Building2}
              label="Companies"
              value={String(kpis.companies)}
              sub={batchFilter === "all" ? `${batches.length} cohorts` : batchLabel(batchFilter)}
              onClick={() => setActiveDrill("companies")}
            />
            <KpiCard
              icon={DollarSign}
              label="FC Deployed"
              value={fmtUsd(kpis.totalFCDeployed)}
              sub="FC's own capital"
              onClick={() => setActiveDrill("fc_deployed")}
            />
            <KpiCard
              icon={Layers}
              label="Total SPV Size"
              value={fmtUsd(kpis.totalSPVSize)}
              sub="All investor capital"
              onClick={() => setActiveDrill("spv_size")}
            />
            <KpiCard
              icon={TrendingUp}
              label="Portfolio MOIC"
              value={fmtMoic(kpis.portfolioMoic)}
              sub="Live / cost"
              onClick={() => setActiveDrill("moic")}
            />
            <div
              onClick={() => setActiveDrill("followon")}
              className="rounded-xl border p-5 flex flex-col gap-2 cursor-pointer transition-all"
              style={{
                background: followonOnly ? "hsl(231 70% 54% / 0.18)" : "hsl(var(--card))",
                borderColor: followonOnly ? "hsl(231 70% 54% / 0.5)" : "hsl(var(--border))",
              }}
              data-testid="toggle-followon"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: followonOnly ? "hsl(231 70% 72%)" : "hsl(var(--muted-foreground))" }}>
                  Follow-on Rounds
                </span>
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight size={11} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }} />
                  <Zap size={16} style={{ color: followonOnly ? "hsl(231 70% 72%)" : "hsl(var(--muted-foreground))" }} />
                </div>
              </div>
              <div className="text-xl font-semibold font-mono" style={{ color: followonOnly ? "hsl(231 70% 80%)" : "hsl(var(--foreground))" }}>
                {kpis.followonCount}
              </div>
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {kpis.followonTotalUSD > 0 ? `$${(kpis.followonTotalUSD / 1e6).toFixed(1)}M raised · ` : ""}click to drill down
              </div>
            </div>
          </div>

          {/* Portfolio Table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
            <div
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                Portfolio Companies
              </span>
              <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                {filtered.length} of {deals.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-xs"
                    style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                  >
                    {(
                      [
                        { label: "Company",      field: "name"                as keyof YCDeal, align: "left"  },
                        { label: "Cohort",        field: "batch"               as keyof YCDeal, align: "left"  },
                        { label: "Stage",         field: "stage"               as keyof YCDeal, align: "left"  },
                        { label: "Instrument",    field: "instrument"          as keyof YCDeal, align: "left"  },
                        { label: "FC Investment", field: "fc_investment"        as keyof YCDeal, align: "right" },
                        { label: "SPV Total",     field: "usd_investment_value" as keyof YCDeal, align: "right" },
                        { label: "MOIC",          field: "moic"                as keyof YCDeal, align: "right" },
                        { label: "Status",        field: "status"              as keyof YCDeal, align: "left"  },
                        { label: "Closed",        field: "closing_date"        as keyof YCDeal, align: "left"  },
                      ] as const
                    ).map(({ label, field, align }) => (
                      <th
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={`px-4 py-3 font-medium cursor-pointer hover:opacity-70 select-none text-${align}`}
                      >
                        {label}
                        <SortIcon field={field} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium">Follow-on</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                    <th className="px-4 py-3 text-left font-medium">Link</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((deal, i) => (
                    <tr
                      key={deal.id}
                      data-testid={`row-deal-${deal.id}`}
                      className="border-b hover:opacity-80 transition-opacity"
                      style={{
                        borderColor: "hsl(var(--border))",
                        background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted) / 0.3)",
                      }}
                    >
                      {/* Company */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-xs" style={{ color: "hsl(var(--foreground))" }}>
                          {deal.name.replace(/\s*\(YC [A-Z][0-9]+\)\s*/g, "").trim()}
                        </div>
                        {deal.description && (
                          <div
                            className="text-xs mt-0.5 max-w-xs truncate"
                            style={{ color: "hsl(var(--muted-foreground))" }}
                            title={deal.description}
                          >
                            {deal.description}
                          </div>
                        )}
                      </td>

                      {/* Cohort */}
                      <td className="px-4 py-3">
                        {deal.batch ? (
                          <div className="flex flex-col gap-0.5">
                            <BatchPill batch={deal.batch} />
                            <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {batchLabel(deal.batch)}
                            </span>
                          </div>
                        ) : "—"}
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.stage || "—"}
                      </td>

                      {/* Instrument */}
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.instrument || "—"}
                      </td>

                      {/* FC Investment */}
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "hsl(var(--foreground))" }}>
                        {deal.fc_investment > 0 ? fmtUsd(deal.fc_investment) : "—"}
                      </td>

                      {/* SPV Total */}
                      <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmtUsd(deal.usd_investment_value)}
                      </td>

                      {/* MOIC */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        <span
                          style={{
                            color: (deal.moic ?? 1) > 1.5
                              ? "rgb(5 150 105)"
                              : (deal.moic ?? 1) < 1
                              ? "rgb(220 38 38)"
                              : "hsl(var(--foreground))",
                          }}
                        >
                          {fmtMoic(deal.moic)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={deal.status} />
                      </td>

                      {/* Closing date */}
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {deal.closing_date ? deal.closing_date.slice(0, 10) : deal.quarter || "—"}
                      </td>

                      {/* Follow-on */}
                      <td className="px-4 py-3">
                        {deal.has_followon ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                              style={{ background: "hsl(231 70% 54% / 0.18)", color: "hsl(231 70% 76%)" }}
                              title={deal.followon_lead_investor ? `Lead: ${deal.followon_lead_investor}` : undefined}
                            >
                              <Zap size={10} />
                              {deal.followon_round ?? "Round"}
                              {deal.followon_amount_usd ? ` · $${(deal.followon_amount_usd / 1e6).toFixed(1)}M` : ""}
                            </span>
                            {deal.followon_date && (
                              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                                {deal.followon_date}
                                {deal.followon_lead_investor ? ` · ${deal.followon_lead_investor.split(',')[0].trim()}` : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                        )}
                      </td>

                      {/* Valuation Mark */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openValuationForDeal(deal)}
                          className="text-[10px] px-2 py-0.5 rounded border whitespace-nowrap"
                          style={{ borderColor: "#3B5BDB", color: "#3B5BDB", background: "transparent" }}
                        >Mark</button>
                      </td>

                      {/* Link */}
                      <td className="px-4 py-3">
                        {deal.url ? (
                          <a
                            href={deal.url}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`link-deal-${deal.id}`}
                            className="inline-flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                            style={{ color: "hsl(var(--primary))" }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        No deals found for this cohort.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Footer totals */}
                {filtered.length > 0 && (
                  <tfoot>
                    <tr
                      className="border-t font-semibold text-xs"
                      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}
                    >
                      <td className="px-4 py-3" colSpan={2} style={{ color: "hsl(var(--foreground))" }}>
                        Total — {filtered.length} {filtered.length === 1 ? "company" : "companies"}
                      </td>
                      <td colSpan={2} />
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "hsl(var(--foreground))" }}>
                        {fmtUsd(filtered.reduce((s, d) => s + (d.fc_investment ?? 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmtUsd(filtered.reduce((s, d) => s + (d.usd_investment_value ?? 0), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

    {/* Valuation Mark Modal */}
    <ValuationMarkModal
      investment={valuationInv}
      open={!!valuationInv}
      onClose={() => setValuationInv(null)}
    />
    </>
  );
}
