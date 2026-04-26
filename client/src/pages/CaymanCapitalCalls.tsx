import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, DollarSign, CheckCircle2, Clock, TrendingDown, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── formatters ──────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtM(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return "$" + n.toFixed(0);
}
function fmtPct(n: number, total: number) {
  if (!total) return "—";
  return ((n / total) * 100).toFixed(1) + "%";
}

const STATUS_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  draft:              { border: "#868E96", text: "#868E96", bg: "#f8f9fa" },
  issued:             { border: "#F59F00", text: "#F59F00", bg: "#fffbeb" },
  partially_funded:   { border: "#3B5BDB", text: "#3B5BDB", bg: "#eef2ff" },
  fully_funded:       { border: "#0CA678", text: "#0CA678", bg: "#f0fdf9" },
  cancelled:          { border: "#FA5252", text: "#FA5252", bg: "#fff5f5" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  const label = status.replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className="text-xs capitalize"
      style={{ borderColor: c.border, color: c.text, background: c.bg }}
    >
      {label}
    </Badge>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, total, color = "bg-[#3B5BDB]" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = "blue", progress }: {
  label: string; value: string; sub?: string;
  icon: any; color?: "blue" | "emerald" | "amber" | "slate";
  progress?: { value: number; total: number };
}) {
  const bg: Record<string, string> = {
    blue:    "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber:   "bg-amber-50 text-amber-600",
    slate:   "bg-slate-100 text-slate-500",
  };
  const barColor: Record<string, string> = {
    blue:    "bg-[#3B5BDB]",
    emerald: "bg-emerald-500",
    amber:   "bg-amber-400",
    slate:   "bg-slate-400",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-semibold font-mono" style={{ color: "hsl(var(--foreground))" }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {progress && (
        <div className="mt-2">
          <ProgressBar value={progress.value} total={progress.total} color={barColor[color]} />
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CaymanCapitalCalls() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    call_number: "",
    call_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    amount_usd: "",
    purpose: "",
    status: "draft",
    notes: "",
  });

  const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

  // New unified endpoint
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/cayman/capital-calls"],
    queryFn: () => apiRequest("GET", "/api/cayman/capital-calls").then(r => r.json()),
  });

  const calls       = data?.calls       ?? [];
  const commitments = data?.commitments ?? [];
  const summary     = data?.summary     ?? {};

  const createMutation = useMutation({
    mutationFn: (d: any) =>
      apiRequest("POST", "/api/capital-calls", {
        entity_id: CAYMAN_FUND_ID,
        call_number: parseInt(d.call_number) || calls.length + 1,
        call_date: d.call_date,
        due_date: d.due_date || null,
        purpose: d.purpose,
        total_call_amount: parseFloat(d.amount_usd),
        currency: "USD",
        status: d.status,
        bank_name: "HSBC Grand Cayman",
        reference_note: d.notes || null,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cayman/capital-calls"] });
      // Also invalidate old query key used in CaymanCapitalCalls legacy
      queryClient.invalidateQueries({ queryKey: ["/api/capital-calls", CAYMAN_FUND_ID] });
      setOpen(false);
      setForm({ call_number: "", call_date: new Date().toISOString().slice(0, 10), due_date: "", amount_usd: "", purpose: "", status: "draft", notes: "" });
      toast({ title: "Capital call created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create capital call.", variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-2xl">🇰🇾</span>
            <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Capital Calls
            </h1>
            <Badge variant="outline" className="text-xs">Cayman Islands · USD</Badge>
          </div>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Founders Capital Strat. Opps. Fund I LP
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} data-testid="button-new-capital-call">
          <Plus size={14} className="mr-1.5" /> New Call
        </Button>
      </div>

      {/* ── LP Commitment panel ───────────────────────────────────────── */}
      {commitments.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">LP Commitment</h2>
          </div>
          <div className="p-6">
            {commitments.map((c: any) => {
              const committed  = Number(c.committed_amount) || 0;
              const called     = Number(summary.total_called) || 0;
              const uncalled   = committed - called;
              const callPct    = committed > 0 ? (called / committed) * 100 : 0;
              return (
                <div key={c.id} className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{c.investor_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.investor_type} · {c.country} · Subscribed {c.subscription_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Management Fee</p>
                      <p className="font-mono text-sm text-gray-700">
                        {((Number(c.fee_rate) || 0) * 100).toFixed(1)}% p.a.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Carry</p>
                      <p className="font-mono text-sm text-gray-700">
                        {((Number(c.carry_rate) || 0) * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">LP Interest</p>
                      <p className="font-mono text-sm text-gray-700">100%</p>
                    </div>
                  </div>

                  {/* Commitment bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Capital called: {fmt(called)}</span>
                      <span>Commitment: {committed > 0 ? fmt(committed) : "TBD"}</span>
                    </div>
                    {committed > 0 && (
                      <>
                        <ProgressBar value={called} total={committed} color="bg-[#3B5BDB]" />
                        <div className="flex justify-between text-xs">
                          <span className="text-[#3B5BDB]">Called {callPct.toFixed(1)}%</span>
                          <span className="text-gray-400">Uncalled {fmt(uncalled)}</span>
                        </div>
                      </>
                    )}
                    {committed === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Committed amount not yet set — update investor commitment to track drawdown.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Calls"
          value={calls.length.toString()}
          sub={calls.length === 0 ? "No calls issued yet" : `${calls.filter((c: any) => c.status === "fully_funded").length} settled`}
          icon={Phone}
          color="blue"
        />
        <KpiCard
          label="Total Called (USD)"
          value={fmtM(summary.total_called)}
          sub="Excluding cancelled"
          icon={DollarSign}
          color="blue"
          progress={summary.total_committed > 0 ? { value: summary.total_called, total: summary.total_committed } : undefined}
        />
        <KpiCard
          label="Settled (USD)"
          value={fmtM(summary.total_settled)}
          sub="Fully funded calls"
          icon={CheckCircle2}
          color="emerald"
        />
        <KpiCard
          label="Outstanding (USD)"
          value={fmtM(summary.total_outstanding)}
          sub="Called but not settled"
          icon={summary.total_outstanding > 0 ? Clock : CheckCircle2}
          color={summary.total_outstanding > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* ── Call log table ─────────────────────────────────────────────── */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Capital Call Log</h2>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</div>
          ) : calls.length === 0 ? (
            <div className="p-14 text-center">
              <Phone size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                No capital calls issued yet
              </p>
              <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                Create the first capital call to Weeks8 Holdings (HK) Ltd
              </p>
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <Plus size={13} className="mr-1.5" /> New Call
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Call #</TableHead>
                  <TableHead>Call Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Amount (USD)</TableHead>
                  <TableHead className="text-right">% of Commitment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">
                      CC-{String(c.call_number).padStart(3, "0")}
                    </TableCell>
                    <TableCell className="text-sm">{c.call_date}</TableCell>
                    <TableCell className="text-sm">{c.due_date ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.purpose ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {fmt(parseFloat(c.total_call_amount || 0))}
                    </TableCell>
                    <TableCell className="text-right text-sm text-gray-500">
                      {fmtPct(parseFloat(c.total_call_amount || 0), summary.total_committed || 0)}
                    </TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs text-gray-400">{c.bank_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {/* Totals row */}
              {calls.length > 1 && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {fmt(summary.total_called)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── New Call dialog ───────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Capital Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Call Number</Label>
                <Input
                  data-testid="input-call-number"
                  value={form.call_number}
                  onChange={e => setForm(f => ({ ...f, call_number: e.target.value }))}
                  placeholder={`e.g. ${calls.length + 1}`}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-call-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="partially_funded">Partially Funded</SelectItem>
                    <SelectItem value="fully_funded">Fully Funded</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Call Date</Label>
                <Input
                  data-testid="input-call-date"
                  type="date"
                  value={form.call_date}
                  onChange={e => setForm(f => ({ ...f, call_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  data-testid="input-call-due-date"
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <Label>Amount (USD)</Label>
                <Input
                  data-testid="input-call-amount"
                  type="number"
                  value={form.amount_usd}
                  onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="col-span-2">
                <Label>Purpose</Label>
                <Input
                  data-testid="input-call-purpose"
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="e.g. Portfolio investment — Company Name"
                />
              </div>
              <div className="col-span-2">
                <Label>Reference Notes</Label>
                <Textarea
                  data-testid="input-call-notes"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional wire instructions or notes"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-call"
              disabled={!form.amount_usd || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? "Saving…" : "Create Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
