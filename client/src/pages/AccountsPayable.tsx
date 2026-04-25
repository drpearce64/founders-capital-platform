import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  Filter,
  RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  invoice_number?: string;
  vendor: string;
  description?: string;
  invoice_date?: string;
  due_date?: string;
  amount: number;
  currency: string;
  series_tag?: string;
  status: "unpaid" | "paid" | "overdue" | "void" | "draft";
  paid_date?: string;
  payment_reference?: string;
  gmail_subject?: string;
  has_attachment?: boolean;
  notes?: string;
  created_at: string;
}

interface APSummary {
  series_tag: string;
  entity_name: string;
  total_invoices: number;
  total_amount: number;
  unpaid_amount: number;
  paid_amount: number;
  overdue_amount: number;
  unpaid_count: number;
  paid_count: number;
  overdue_count: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    unpaid:  { label: "Unpaid",  className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    paid:    { label: "Paid",    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    draft:   { label: "Draft",   className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    void:    { label: "Void",    className: "bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-500" },
  };
  const s = map[status] || map.draft;
  return <Badge className={`${s.className} border-0 font-medium text-xs`}>{s.label}</Badge>;
};

const seriesLabel = (tag?: string) => {
  const map: Record<string, string> = {
    "VECTOR-III": "Vector III (Reach Power)",
    "VECTOR-IV":  "Vector IV (Project Prometheus)",
    "VECTOR-I":   "Vector I (Shield AI)",
    "PLATFORM":   "FC Platform",
  };
  return tag ? (map[tag] || tag) : "—";
};

// ── Mark Paid Dialog ──────────────────────────────────────────────────────────
function MarkPaidDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/invoices/${invoice.id}`, {
        status: "paid",
        paid_date: paidDate,
        payment_reference: reference || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap/summary"] });
      toast({ title: "Invoice marked as paid" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        Marking <strong>{invoice.vendor}</strong> — {fmt(invoice.amount, invoice.currency)} as paid.
      </p>
      <div className="space-y-2">
        <Label>Payment date</Label>
        <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} data-testid="input-paid-date" />
      </div>
      <div className="space-y-2">
        <Label>Payment reference (optional)</Label>
        <Input placeholder="e.g. Wire ref, cheque no." value={reference} onChange={e => setReference(e.target.value)} data-testid="input-payment-reference" />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1" data-testid="button-confirm-paid">
          {mutation.isPending ? "Saving…" : "Confirm Paid"}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

// ── Add Invoice Dialog ────────────────────────────────────────────────────────
function AddInvoiceDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    vendor: "",
    description: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    amount: "",
    currency: "USD",
    series_tag: "PLATFORM",
    notes: "",
  });
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/invoices", {
        ...form,
        amount: parseFloat(form.amount) || 0,
        status: "unpaid",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ap/summary"] });
      toast({ title: "Invoice added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Vendor *</Label>
          <Input placeholder="e.g. Stripe, Inc." value={form.vendor} onChange={e => set("vendor", e.target.value)} data-testid="input-vendor" />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Description</Label>
          <Input placeholder="Brief description" value={form.description} onChange={e => set("description", e.target.value)} data-testid="input-description" />
        </div>
        <div className="space-y-2">
          <Label>Invoice number</Label>
          <Input placeholder="INV-001" value={form.invoice_number} onChange={e => set("invoice_number", e.target.value)} data-testid="input-invoice-number" />
        </div>
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input type="number" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} data-testid="input-amount" />
        </div>
        <div className="space-y-2">
          <Label>Invoice date</Label>
          <Input type="date" value={form.invoice_date} onChange={e => set("invoice_date", e.target.value)} data-testid="input-invoice-date" />
        </div>
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} data-testid="input-due-date" />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={v => set("currency", v)}>
            <SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Series / Entity</Label>
          <Select value={form.series_tag} onValueChange={v => set("series_tag", v)}>
            <SelectTrigger data-testid="select-series"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PLATFORM">FC Platform</SelectItem>
              <SelectItem value="VECTOR-I">Vector I (Shield AI)</SelectItem>
              <SelectItem value="VECTOR-III">Vector III (Reach Power)</SelectItem>
              <SelectItem value="VECTOR-IV">Vector IV (Project Prometheus)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label>Notes</Label>
          <Input placeholder="Optional notes" value={form.notes} onChange={e => set("notes", e.target.value)} data-testid="input-notes" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.vendor || !form.amount}
          className="flex-1"
          data-testid="button-add-invoice"
        >
          {mutation.isPending ? "Saving…" : "Add Invoice"}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AccountsPayable() {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeries, setFilterSeries] = useState("all");
  const [search, setSearch] = useState("");
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: summary = [], isLoading: loadingSummary } = useQuery<APSummary[]>({
    queryKey: ["/api/ap/summary"],
  });

  // KPI totals
  const totalUnpaid   = invoices.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amount, 0);
  const totalOverdue  = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const totalPaid     = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const countUnpaid   = invoices.filter(i => i.status === "unpaid").length;
  const countOverdue  = invoices.filter(i => i.status === "overdue").length;

  // Filtered invoice list
  const filtered = invoices.filter(inv => {
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    if (filterSeries !== "all" && inv.series_tag !== filterSeries) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !inv.vendor.toLowerCase().includes(s) &&
        !(inv.description || "").toLowerCase().includes(s) &&
        !(inv.invoice_number || "").toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Accounts Payable
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Invoice tracking across all Delaware Series entities
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-invoice-open">
              <Plus className="h-4 w-4" /> Add Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Invoice</DialogTitle></DialogHeader>
            <AddInvoiceDialog onClose={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="kpi-unpaid">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Unpaid</p>
                {loadingInvoices ? (
                  <Skeleton className="h-7 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold mt-1">{fmt(totalUnpaid)}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{countUnpaid} invoice{countUnpaid !== 1 ? "s" : ""}</p>
              </div>
              <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-overdue">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Overdue</p>
                {loadingInvoices ? (
                  <Skeleton className="h-7 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{fmt(totalOverdue)}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{countOverdue} invoice{countOverdue !== 1 ? "s" : ""}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-paid">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Paid (All Time)</p>
                {loadingInvoices ? (
                  <Skeleton className="h-7 w-28 mt-1" />
                ) : (
                  <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{fmt(totalPaid)}</p>
                )}
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary by Series */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            AP Summary by Series
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : summary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Series / Entity</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Unpaid</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map(row => (
                  <TableRow key={row.series_tag || "unknown"} data-testid={`summary-row-${row.series_tag}`}>
                    <TableCell className="font-medium text-sm">{seriesLabel(row.series_tag)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(row.total_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-amber-600">{fmt(row.unpaid_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-red-600">{fmt(row.overdue_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-green-600">{fmt(row.paid_amount || 0)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{row.total_invoices}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              All Invoices
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Search vendor, description…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 w-48 text-sm"
                data-testid="input-search"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-32 text-sm" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSeries} onValueChange={setFilterSeries}>
                <SelectTrigger className="h-8 w-40 text-sm" data-testid="select-filter-series">
                  <SelectValue placeholder="Series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Series</SelectItem>
                  <SelectItem value="PLATFORM">FC Platform</SelectItem>
                  <SelectItem value="VECTOR-I">Vector I</SelectItem>
                  <SelectItem value="VECTOR-III">Vector III</SelectItem>
                  <SelectItem value="VECTOR-IV">Vector IV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No invoices match your filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Series</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(inv => (
                  <TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                    <TableCell className="font-medium text-sm">{inv.vendor}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                      {inv.description || inv.gmail_subject || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {seriesLabel(inv.series_tag)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmt(inv.amount, inv.currency)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{fmtDate(inv.invoice_date)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className={inv.status === "overdue" ? "text-red-600 font-medium" : ""}>
                        {fmtDate(inv.due_date)}
                      </span>
                    </TableCell>
                    <TableCell>{statusBadge(inv.status)}</TableCell>
                    <TableCell className="text-right">
                      {(inv.status === "unpaid" || inv.status === "overdue" || inv.status === "draft") && (
                        <Dialog
                          open={markPaidInvoice?.id === inv.id}
                          onOpenChange={open => setMarkPaidInvoice(open ? inv : null)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              data-testid={`button-mark-paid-${inv.id}`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Mark Paid
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Mark Invoice as Paid</DialogTitle></DialogHeader>
                            <MarkPaidDialog invoice={inv} onClose={() => setMarkPaidInvoice(null)} />
                          </DialogContent>
                        </Dialog>
                      )}
                      {inv.status === "paid" && (
                        <span className="text-xs text-green-600 flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {fmtDate(inv.paid_date)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mark Paid Dialog (standalone, outside table) */}
      {/* Note: handled inline above per row */}
    </div>
  );
}
