import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  DollarSign,
  BarChart2,
  Briefcase,
  Search,
  ExternalLink,
  Grid3x3,
  List,
  SlidersHorizontal,
  ArrowUpRight,
  Award,
  Globe,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FCInvestment {
  id: string;
  name: string;
  deal_code: string;
  status: string;
  holding_status: string;
  stage: string;
  closing_date: string | null;
  quarter_closed: string;
  investment_currency: string;
  fc_invested_usd: number;
  fc_pv_usd: number;
  deal_size_usd: number;
  moic: number;
  investor_count: number;
  pre_money_valuation: number | null;
  business_type: string[];
  location: string;
  deal_type: string;
  direct_indirect: string;
  website: string | null;
  description: string;
  square_image: string | null;
  share_class: string;
  running_return: number;
  portfolio_appreciation: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

const fmtUsd = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${fmt(n, 0)}`;
};

const fmtMoic = (m: number) => `${m.toFixed(2)}x`;

const stageBadge: Record<string, string> = {
  Seed:   "bg-blue-100 text-blue-800 border-blue-200",
  Growth: "bg-teal-100 text-teal-800 border-teal-200",
  Late:   "bg-purple-100 text-purple-800 border-purple-200",
};

const holdingBadge: Record<string, string> = {
  "Portfolio company": "bg-green-100 text-green-800 border-green-200",
  Exited:             "bg-gray-100 text-gray-600 border-gray-200",
};

const moicColor = (m: number) => {
  if (m >= 3)  return "text-green-600 font-bold";
  if (m >= 2)  return "text-teal-600 font-semibold";
  if (m >= 1.5) return "text-blue-600 font-semibold";
  if (m >= 1)  return "text-[#1A1209]";
  return "text-red-500";
};

// Company initials fallback
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const hueFromName = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-[#3B5BDB]/30 bg-[#3B5BDB]/5" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
            <p className="text-2xl font-bold mt-1 font-mono text-[#1A1209]">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${highlight ? "bg-[#3B5BDB]/10" : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${highlight ? "text-[#3B5BDB]" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Company Logo / Avatar ────────────────────────────────────────────────────

function CompanyAvatar({ inv, size = "md" }: { inv: FCInvestment; size?: "sm" | "md" | "lg" }) {
  const [imgErr, setImgErr] = useState(false);
  const dim = size === "lg" ? "w-14 h-14 text-lg" : size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const hue = hueFromName(inv.name);
  const bg = `hsl(${hue},55%,92%)`;
  const fg = `hsl(${hue},55%,35%)`;

  if (inv.square_image && !imgErr) {
    return (
      <img
        src={inv.square_image}
        alt={inv.name}
        onError={() => setImgErr(true)}
        className={`${dim} rounded-lg object-cover flex-shrink-0 border border-gray-100`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-lg flex items-center justify-center flex-shrink-0 font-semibold border`}
      style={{ background: bg, color: fg, borderColor: `hsl(${hue},55%,82%)` }}
    >
      {initials(inv.name)}
    </div>
  );
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function InvestmentCard({ inv }: { inv: FCInvestment }) {
  const appreciation = inv.fc_pv_usd - inv.fc_invested_usd;
  const isPortfolio = inv.holding_status === "Portfolio company";

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 flex flex-col group">
      <CardContent className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          <CompanyAvatar inv={inv} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-sm text-[#1A1209] truncate max-w-[140px]">{inv.name}</h3>
              {inv.website && (
                <a
                  href={inv.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-[#3B5BDB] flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{inv.deal_code}</p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <Badge
              variant="outline"
              className={`text-xs px-1.5 py-0 ${stageBadge[inv.stage] ?? "bg-gray-100 text-gray-700"}`}
            >
              {inv.stage}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs px-1.5 py-0 ${holdingBadge[inv.holding_status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {isPortfolio ? "Portfolio" : inv.holding_status}
            </Badge>
          </div>
        </div>

        {/* Description */}
        {inv.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {inv.description}
          </p>
        )}

        {/* Tags */}
        {inv.business_type.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {inv.business_type.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {t}
              </span>
            ))}
            {inv.business_type.length > 3 && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                +{inv.business_type.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Financials */}
        <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-border/50">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">FC Invested</p>
            <p className="text-sm font-mono font-semibold text-[#1A1209]">{fmtUsd(inv.fc_invested_usd)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fair Value</p>
            <p className="text-sm font-mono font-semibold text-[#1A1209]">{fmtUsd(inv.fc_pv_usd)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">MOIC</p>
            <p className={`text-sm font-mono ${moicColor(inv.moic)}`}>{fmtMoic(inv.moic)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Unrealised P&L</p>
            <p className={`text-sm font-mono font-semibold ${appreciation >= 0 ? "text-green-600" : "text-red-500"}`}>
              {appreciation >= 0 ? "+" : ""}{fmtUsd(appreciation)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            <span>{inv.location || "—"}</span>
          </div>
          <span className="font-mono">{inv.quarter_closed}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FCInvestments() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "moic" | "invested" | "pv">("date");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/fc-investments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/fc-investments");
      const text = await res.text();
      // Guard against HTML error pages from Railway
      if (!res.ok || text.trim().startsWith("<")) {
        throw new Error(
          res.status === 500
            ? "Server error — AIRTABLE_PAT may not be set on Railway"
            : `Request failed (${res.status})`
        );
      }
      return JSON.parse(text) as { investments: FCInvestment[]; total: number };
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 1,
  });

  const investments = data?.investments ?? [];

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = investments.filter(i => i.holding_status === "Portfolio company");
    const totalInvested = active.reduce((s, i) => s + i.fc_invested_usd, 0);
    const totalPv = active.reduce((s, i) => s + i.fc_pv_usd, 0);
    const weightedMoic = totalInvested > 0 ? totalPv / totalInvested : 1;
    const exited = investments.filter(i => i.holding_status === "Exited").length;
    const appreciation = totalPv - totalInvested;
    return { totalInvested, totalPv, weightedMoic, count: active.length, exited, appreciation };
  }, [investments]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...investments];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        i =>
          i.name.toLowerCase().includes(q) ||
          i.deal_code.toLowerCase().includes(q) ||
          i.business_type.some(t => t.toLowerCase().includes(q)) ||
          i.location.toLowerCase().includes(q)
      );
    }
    if (filterStage !== "all") list = list.filter(i => i.stage === filterStage);
    if (filterStatus !== "all") list = list.filter(i => i.holding_status === filterStatus);
    if (filterType !== "all") list = list.filter(i => i.deal_type === filterType);

    list.sort((a, b) => {
      if (sortBy === "moic") return b.moic - a.moic;
      if (sortBy === "invested") return b.fc_invested_usd - a.fc_invested_usd;
      if (sortBy === "pv") return b.fc_pv_usd - a.fc_pv_usd;
      // date
      if (!a.closing_date) return 1;
      if (!b.closing_date) return -1;
      return new Date(b.closing_date).getTime() - new Date(a.closing_date).getTime();
    });

    return list;
  }, [investments, search, filterStage, filterStatus, filterType, sortBy]);

  // Unique filter options
  const stages   = [...new Set(investments.map(i => i.stage).filter(Boolean))].sort();
  const types    = [...new Set(investments.map(i => i.deal_type).filter(Boolean))].sort();

  if (error) {
    const errMsg = (error as Error).message ?? String(error);
    const needsPat = errMsg.includes("AIRTABLE_PAT") || errMsg.includes("500") || errMsg.includes("permission") || errMsg.includes("INVALID_PERMISSIONS");
    return (
      <div className="p-8 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#1A1209]">FC Own Investments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live from Airtable · Founders Capital proprietary portfolio</p>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-semibold text-amber-900">
              {needsPat ? "Airtable API key not configured on Railway" : "Failed to load investments"}
            </h3>
            {needsPat ? (
              <ol className="text-sm text-amber-800 space-y-1.5 list-decimal list-inside">
                <li>Go to <strong>airtable.com/create/tokens</strong> and open your existing token (or create a new one)</li>
                <li>Ensure the scope includes <code className="bg-amber-100 px-1 rounded">data.records:read</code></li>
                <li>Under <strong>Access</strong>, confirm <strong>Founders Capital 2.0</strong> is listed as an accessible base</li>
                <li>Copy the token and update <code className="bg-amber-100 px-1 rounded">AIRTABLE_PAT</code> in Railway → Variables</li>
                <li>Railway will redeploy automatically — this page will load once updated</li>
              </ol>
            ) : (
              <p className="text-sm text-amber-700">{errMsg}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* ── Page Header ── */}
        <div>
          <h1 className="text-xl font-bold text-[#1A1209]">FC Own Investments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live from Airtable · Founders Capital proprietary portfolio
          </p>
        </div>

        {/* ── KPI Row ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Active Positions"
              value={String(kpis.count)}
              sub={`${kpis.exited} exited`}
              icon={Briefcase}
            />
            <KpiCard
              label="FC Capital Deployed"
              value={fmtUsd(kpis.totalInvested)}
              sub="Active holdings"
              icon={DollarSign}
            />
            <KpiCard
              label="Portfolio Fair Value"
              value={fmtUsd(kpis.totalPv)}
              sub={`${kpis.appreciation >= 0 ? "+" : ""}${fmtUsd(kpis.appreciation)} unrealised`}
              icon={TrendingUp}
              highlight
            />
            <KpiCard
              label="Weighted MOIC"
              value={fmtMoic(kpis.weightedMoic)}
              sub="Across active positions"
              icon={BarChart2}
            />
          </div>
        )}

        {/* ── Filters & Controls ── */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search company, sector…"
              className="pl-8 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>

          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-32 h-9" data-testid="select-stage">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-9" data-testid="select-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Holdings</SelectItem>
              <SelectItem value="Portfolio company">Portfolio</SelectItem>
              <SelectItem value="Exited">Exited</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-9" data-testid="select-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 ml-auto">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-36 h-9" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Newest First</SelectItem>
                <SelectItem value="moic">Highest MOIC</SelectItem>
                <SelectItem value="pv">Highest FV</SelectItem>
                <SelectItem value="invested">Highest Invested</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex border rounded-md overflow-hidden ml-1">
              <Button
                variant={view === "grid" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-9 px-3"
                onClick={() => setView("grid")}
                data-testid="button-grid-view"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "table" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-9 px-3"
                onClick={() => setView("table")}
                data-testid="button-table-view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Results count */}
        {!isLoading && (
          <p className="text-xs text-muted-foreground -mt-2">
            {filtered.length} of {investments.length} investments
          </p>
        )}

        {/* ── Content ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-48 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No investments match your filters.</p>
            </CardContent>
          </Card>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(inv => <InvestmentCard key={inv.id} inv={inv} />)}
          </div>
        ) : (
          /* ── Table View ── */
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="pl-5 w-[220px]">Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">FC Invested</TableHead>
                      <TableHead className="text-right">Fair Value</TableHead>
                      <TableHead className="text-right">MOIC</TableHead>
                      <TableHead className="text-right">Unrealised P&L</TableHead>
                      <TableHead>Quarter</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(inv => {
                      const appreciation = inv.fc_pv_usd - inv.fc_invested_usd;
                      return (
                        <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-3">
                              <CompanyAvatar inv={inv} size="sm" />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-sm text-[#1A1209]">{inv.name}</span>
                                  {inv.website && (
                                    <a
                                      href={inv.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-[#3B5BDB]"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground">{inv.deal_code}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${stageBadge[inv.stage] ?? ""}`}>
                              {inv.stage}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{inv.deal_type || "—"}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtUsd(inv.fc_invested_usd)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {fmtUsd(inv.fc_pv_usd)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono text-sm ${moicColor(inv.moic)}`}>{fmtMoic(inv.moic)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono text-sm ${appreciation >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {appreciation >= 0 ? "+" : ""}{fmtUsd(appreciation)}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {inv.quarter_closed || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs px-1.5 py-0 ${holdingBadge[inv.holding_status] ?? "bg-gray-100 text-gray-600"}`}
                            >
                              {inv.holding_status === "Portfolio company" ? "Active" : inv.holding_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
