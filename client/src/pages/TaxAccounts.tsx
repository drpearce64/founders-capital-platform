import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, RefreshCw, Download, Plus, Filter,
  TrendingUp, TrendingDown, DollarSign, Users, FileText, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CapitalAccountBalance {
  entity_id: string;
  investor_id: string;
  entity_name: string;
  entity_short_code: string;
  investor_name: string;
  investor_email: string;
  tax_year: number;
  contributions: number;
  fees: number;
  gain_allocations: number;
  loss_allocations: number;
  carry_allocations: number;
  distributions: number;
  expense_allocations: number;
  adjustments: number;
  net_movement: number;
  opening_balance: number | null;
  closing_balance: number;
}

interface CapitalAccountEntry {
  id: string;
  entity_id: string;
  investor_id: string;
  entry_type: string;
  tax_year: number;
  period: string | null;
  entry_date: string;
  amount: number;
  description: string | null;
  reference_table: string | null;
  investors: { full_name: string; email: string } | null;
  entities: { name: string; short_code: string } | null;
}

interface K1Summary {
  tax_year: number;
  entries: CapitalAccountBalance[];
}

interface SyncResult {
  contributions: number;
  fees: number;
  gain_allocations: number;
  skipped: number;
  errors: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USD = (n: number | null | undefined) => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(abs);
  return n < 0 ? `(${fmt})` : fmt;
};

const ENTRY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  contribution:       { label: "Contribution",       color: "hsl(142 70% 35%)" },
  fee:                { label: "Fee",                 color: "hsl(0 70% 45%)" },
  gain_allocation:    { label: "Gain Allocation",     color: "hsl(142 70% 35%)" },
  loss_allocation:    { label: "Loss Allocation",     color: "hsl(0 70% 45%)" },
  carry_allocation:   { label: "Carry Allocation",    color: "hsl(231 70% 54%)" },
  distribution:       { label: "Distribution",        color: "hsl(280 60% 45%)" },
  expense_allocation: { label: "Expense Allocation",  color: "hsl(25 80% 45%)" },
  adjustment:         { label: "Adjustment",          color: "hsl(40 70% 45%)" },
};

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

function downloadCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntryTypeBadge({ type }: { type: string }) {
  const meta = ENTRY_TYPE_LABELS[type] ?? { label: type, color: "hsl(var(--muted-foreground))" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: meta.color + "1A", color: meta.color, border: `1px solid ${meta.color}33` }}
    >
      {meta.label}
    </span>
  );
}

function AddEntryDialog({ entities, investors, onSuccess }: {
  entities: any[]; investors: any[]; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entity_id: "", investor_id: "", entry_type: "contribution",
    tax_year: String(CURRENT_YEAR), period: "Q1",
    entry_date: new Date().toISOString().slice(0, 10),
    amount: "", description: "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/capital-accounts/entries", data),
    onSuccess: () => {
      toast({ title: "Entry added", description: "Capital account entry recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-accounts/balances"] });
      setOpen(false);
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ ...form, tax_year: parseInt(form.tax_year), amount: parseFloat(form.amount) });
  };

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-entry" size="sm" className="flex items-center gap-2"
          style={{ background: "hsl(var(--primary))", color: "white" }}>
          <Plus size={14} /> Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "hsl(var(--foreground))" }}>New Capital Account Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Series</Label>
              <Select value={form.entity_id} onValueChange={set("entity_id")}>
                <SelectTrigger data-testid="select-entity" style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
                  <SelectValue placeholder="Select series…" />
                </SelectTrigger>
                <SelectContent>
                  {entities.filter(e => e.entity_type === "series_spv").map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.short_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>LP</Label>
              <Select value={form.investor_id} onValueChange={set("investor_id")}>
                <SelectTrigger data-testid="select-investor" style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
                  <SelectValue placeholder="Select LP…" />
                </SelectTrigger>
                <SelectContent>
                  {investors.map((inv: any) => (
                    <SelectItem key={inv.id} value={inv.id}>{inv.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Entry Type</Label>
              <Select value={form.entry_type} onValueChange={set("entry_type")}>
                <SelectTrigger data-testid="select-entry-type" style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENTRY_TYPE_LABELS).map(([v, { label }]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Amount ($)</Label>
              <Input data-testid="input-amount" type="number" step="0.01" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Tax Year</Label>
              <Select value={form.tax_year} onValueChange={set("tax_year")}>
                <SelectTrigger data-testid="select-tax-year" style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Period</Label>
              <Select value={form.period} onValueChange={set("period")}>
                <SelectTrigger data-testid="select-period" style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Q1","Q2","Q3","Q4","Annual"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Date</Label>
              <Input data-testid="input-date" type="date" value={form.entry_date}
                onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
            </div>
          </div>

          <div className="space-y-1">
            <Label style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem" }}>Description (optional)</Label>
            <Input data-testid="input-description" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Year-end gain allocation adjustment"
              style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
          </div>

          <Button data-testid="button-submit-entry" type="submit" disabled={mutation.isPending}
            className="w-full" style={{ background: "hsl(var(--primary))", color: "white" }}>
            {mutation.isPending ? "Saving…" : "Save Entry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TaxAccounts() {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [tab, setTab] = useState("balances");

  // Entities + investors for filter dropdowns and Add Entry dialog
  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: investors = [] } = useQuery<any[]>({
    queryKey: ["/api/investors"],
    queryFn: () => apiRequest("GET", "/api/investors").then(r => r.json()),
  });

  // Capital account balances (from the view)
  const { data: balances = [], isLoading: balancesLoading } = useQuery<CapitalAccountBalance[]>({
    queryKey: ["/api/capital-accounts/balances", selectedYear, selectedEntity],
    queryFn: () => {
      const params = new URLSearchParams({ tax_year: String(selectedYear) });
      if (selectedEntity !== "all") params.set("entity_id", selectedEntity);
      return apiRequest("GET", `/api/capital-accounts/balances?${params}`).then(r => r.json());
    },
  });

  // K-1 summary
  const { data: k1Data, isLoading: k1Loading } = useQuery<K1Summary>({
    queryKey: ["/api/capital-accounts/k1-summary", selectedYear, selectedEntity],
    queryFn: () => {
      const params = new URLSearchParams({ tax_year: String(selectedYear) });
      if (selectedEntity !== "all") params.set("entity_id", selectedEntity);
      return apiRequest("GET", `/api/capital-accounts/k1-summary?${params}`).then(r => r.json());
    },
  });

  // Entry log
  const { data: entries = [], isLoading: entriesLoading } = useQuery<CapitalAccountEntry[]>({
    queryKey: ["/api/capital-accounts", selectedYear, selectedEntity],
    queryFn: () => {
      const params = new URLSearchParams({ tax_year: String(selectedYear), limit: "200" });
      if (selectedEntity !== "all") params.set("entity_id", selectedEntity);
      return apiRequest("GET", `/api/capital-accounts?${params}`).then(r => r.json());
    },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/capital-accounts/sync"),
    onSuccess: async (res) => {
      const data: SyncResult = await res.json();
      toast({
        title: "Sync complete",
        description: `${data.contributions} contributions · ${data.fees} fees · ${data.gain_allocations} gain allocations · ${data.skipped} skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-accounts/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-accounts/k1-summary"] });
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  // Aggregate stats
  const totalContributions  = balances.reduce((s, b) => s + Number(b.contributions || 0), 0);
  const totalGainAlloc      = balances.reduce((s, b) => s + Number(b.gain_allocations || 0), 0);
  const totalFees           = balances.reduce((s, b) => s + Math.abs(Number(b.fees || 0)), 0);
  const totalClosing        = balances.reduce((s, b) => s + Number(b.closing_balance || 0), 0);

  const seriesEntities = entities.filter((e: any) => e.entity_type === "series_spv");

  return (
    <div className="min-h-screen p-6 space-y-5" style={{ background: "hsl(var(--background))" }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            Tax &amp; Capital Accounts
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            LP capital account ledger · K-1 preparation · Tax year {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year filter */}
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
            <SelectTrigger data-testid="select-filter-year" className="w-28 text-sm"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Series filter */}
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger data-testid="select-filter-entity" className="w-36 text-sm"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
              <SelectValue placeholder="All series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All series</SelectItem>
              {seriesEntities.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.short_code.replace("FC-", "")}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sync button */}
          <Button data-testid="button-sync" size="sm" variant="outline"
            onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            className="flex items-center gap-2 text-sm"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
            <RefreshCw size={13} className={syncMutation.isPending ? "animate-spin" : ""} />
            {syncMutation.isPending ? "Syncing…" : "Sync from Data"}
          </Button>

          <AddEntryDialog entities={entities} investors={investors}
            onSuccess={() => {}} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: "Total Contributions",  value: USD(totalContributions),  color: "hsl(142 60% 40%)" },
          { icon: TrendingUp, label: "Gain Allocations",     value: USD(totalGainAlloc),       color: "hsl(231 70% 54%)" },
          { icon: TrendingDown, label: "Fees (LP debit)",    value: USD(totalFees),            color: "hsl(0 65% 48%)" },
          { icon: BookOpen,   label: "Aggregate Closing Bal",value: USD(totalClosing),         color: "hsl(var(--foreground))" },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} data-testid={`card-kpi-${label.toLowerCase().replace(/\s+/g,"-")}`}
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color: "hsl(var(--primary))" }} />
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {label}
                </span>
              </div>
              <div className="text-xl font-bold tabular-nums" style={{ color }}>
                {balancesLoading ? <Skeleton className="h-6 w-24" /> : value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <TabsTrigger value="balances" data-testid="tab-balances">LP Balances</TabsTrigger>
          <TabsTrigger value="k1" data-testid="tab-k1">K-1 Summary</TabsTrigger>
          <TabsTrigger value="log" data-testid="tab-log">Entry Log</TabsTrigger>
        </TabsList>

        {/* ── LP BALANCES TAB ───────────────────────────────────────────────── */}
        <TabsContent value="balances" className="mt-4">
          <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardHeader className="px-5 pt-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "hsl(var(--foreground))" }}>
                <Users size={14} style={{ color: "hsl(var(--primary))" }} />
                LP Capital Account Balances — Tax Year {selectedYear}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => downloadCSV(balances, `capital_accounts_${selectedYear}.csv`)}
                className="flex items-center gap-1.5 text-xs"
                style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                <Download size={12} /> CSV
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {balancesLoading ? (
                <div className="p-5 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : balances.length === 0 ? (
                <div className="p-10 text-center">
                  <BookOpen size={32} className="mx-auto mb-3 opacity-30" style={{ color: "hsl(var(--muted-foreground))" }} />
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No capital account entries for {selectedYear}.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Click "Sync from Data" to auto-populate from capital calls and NAV marks.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
                        {["LP", "Series", "Opening Bal", "Contributions", "Fees", "Gain Alloc", "Distributions", "Adjustments", "Closing Bal"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold"
                            style={{ color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((b, i) => (
                        <tr key={`${b.investor_id}-${b.entity_id}-${b.tax_year}`}
                          data-testid={`row-balance-${i}`}
                          style={{
                            borderBottom: "1px solid hsl(var(--border))",
                            background: i % 2 === 0 ? "transparent" : "hsl(var(--muted)/0.15)",
                          }}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{b.investor_name}</div>
                            <div className="text-xs opacity-60" style={{ color: "hsl(var(--muted-foreground))" }}>{b.investor_email}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))", border: "none", fontSize: "0.65rem" }}>
                              {b.entity_short_code.replace("FC-", "")}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {USD(b.opening_balance ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right" style={{ color: "hsl(142 60% 40%)" }}>
                            {USD(b.contributions)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right" style={{ color: "hsl(0 65% 48%)" }}>
                            {USD(b.fees)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right"
                            style={{ color: Number(b.gain_allocations) >= 0 ? "hsl(142 60% 40%)" : "hsl(0 65% 48%)" }}>
                            {USD(b.gain_allocations)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right" style={{ color: "hsl(280 60% 45%)" }}>
                            {USD(b.distributions)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {USD(b.adjustments)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-right font-semibold"
                            style={{ color: Number(b.closing_balance) >= 0 ? "hsl(var(--foreground))" : "hsl(0 65% 48%)" }}>
                            {USD(b.closing_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── K-1 SUMMARY TAB ──────────────────────────────────────────────── */}
        <TabsContent value="k1" className="mt-4">
          <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardHeader className="px-5 pt-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "hsl(var(--foreground))" }}>
                <FileText size={14} style={{ color: "hsl(var(--primary))" }} />
                Schedule K-1 Summary — Tax Year {selectedYear}
              </CardTitle>
              <Button size="sm" variant="outline"
                onClick={() => downloadCSV(k1Data?.entries ?? [], `k1_summary_${selectedYear}.csv`)}
                className="flex items-center gap-1.5 text-xs"
                style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                <Download size={12} /> Export K-1 CSV
              </Button>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {/* K-1 explanation banner */}
              <div className="rounded-md px-4 py-3 mb-4 text-xs"
                style={{ background: "hsl(var(--primary)/0.07)", border: "1px solid hsl(var(--primary)/0.2)", color: "hsl(var(--muted-foreground))" }}>
                <strong style={{ color: "hsl(var(--foreground))" }}>Schedule K-1 (Form 1065)</strong> — Each LP's allocable share of income, gain, loss and deduction for the tax year.
                This data supports US partnership returns. UK LPs use this to self-assess HMRC obligations on US-sourced income.
                Pass to your tax preparer at year-end.
              </div>

              {k1Loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !k1Data?.entries?.length ? (
                <div className="py-8 text-center">
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No K-1 data for {selectedYear}. Run "Sync from Data" to populate.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "2px solid hsl(var(--border))" }}>
                        {[
                          "LP Name", "Series", "Opening Capital",
                          "Contributions (Box 1)", "Gain Allocation (Box 9)", "Loss Allocation (Box 10)",
                          "Carry (Box 11)", "Distributions (Box 19)", "Closing Capital",
                        ].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
                            style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {k1Data.entries.map((e, i) => (
                        <tr key={`${e.investor_id}-${e.entity_id}`}
                          data-testid={`row-k1-${i}`}
                          style={{
                            borderBottom: "1px solid hsl(var(--border))",
                            background: i % 2 === 0 ? "transparent" : "hsl(var(--muted)/0.15)",
                          }}>
                          <td className="px-3 py-2.5 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                            {e.investor_name}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))", border: "none", fontSize: "0.65rem" }}>
                              {e.entity_short_code.replace("FC-", "")}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {USD(e.opening_balance ?? 0)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(142 60% 40%)" }}>
                            {USD(e.contributions)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(142 60% 40%)" }}>
                            {USD(e.gain_allocations)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(0 65% 48%)" }}>
                            {USD(e.loss_allocations)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(231 70% 54%)" }}>
                            {USD(e.carry_allocations)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right" style={{ color: "hsl(280 60% 45%)" }}>
                            {USD(e.distributions)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-right font-semibold"
                            style={{ color: "hsl(var(--foreground))" }}>
                            {USD(e.closing_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ENTRY LOG TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="log" className="mt-4">
          <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardHeader className="px-5 pt-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "hsl(var(--foreground))" }}>
                <BookOpen size={14} style={{ color: "hsl(var(--primary))" }} />
                Full Entry Log — {entries.length} entries for {selectedYear}
              </CardTitle>
              <Button size="sm" variant="outline"
                onClick={() => downloadCSV(entries.map(e => ({
                  date: e.entry_date, lp: e.investors?.full_name, series: e.entities?.short_code,
                  type: e.entry_type, period: e.period, amount: e.amount, description: e.description,
                })), `entry_log_${selectedYear}.csv`)}
                className="flex items-center gap-1.5 text-xs"
                style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                <Download size={12} /> CSV
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {entriesLoading ? (
                <div className="p-5 space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : entries.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No entries recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.3)" }}>
                        {["Date", "LP", "Series", "Type", "Period", "Amount", "Description", "Source"].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold"
                            style={{ color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={e.id} data-testid={`row-entry-${i}`}
                          style={{
                            borderBottom: "1px solid hsl(var(--border))",
                            background: i % 2 === 0 ? "transparent" : "hsl(var(--muted)/0.15)",
                          }}>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {new Date(e.entry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-2 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                            {e.investors?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-2">
                            <Badge style={{ background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))", border: "none", fontSize: "0.65rem" }}>
                              {e.entities?.short_code?.replace("FC-", "") ?? "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2"><EntryTypeBadge type={e.entry_type} /></td>
                          <td className="px-4 py-2" style={{ color: "hsl(var(--muted-foreground))" }}>{e.period ?? "—"}</td>
                          <td className="px-4 py-2 tabular-nums text-right font-medium"
                            style={{ color: Number(e.amount) >= 0 ? "hsl(142 60% 40%)" : "hsl(0 65% 48%)" }}>
                            {USD(e.amount)}
                          </td>
                          <td className="px-4 py-2 max-w-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {e.description ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-xs italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {e.reference_table ?? "manual"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs pb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Capital account data sourced from Founders Capital Supabase database.
        Consult a qualified tax advisor before filing K-1s or other tax returns.
      </p>
    </div>
  );
}
