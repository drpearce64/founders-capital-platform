import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileCheck, DollarSign, Clock, CheckCircle2, AlertTriangle, TrendingDown, Filter, Upload, FileText, X, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CURRENCIES = ["USD", "GBP", "EUR", "KYD"];

const CAYMAN_ENTITIES = [
  { value: "14d76562-2219-4121-b0bd-5379018ac3b4", label: "Founders Capital Strat. Opps. Fund I LP" },
  { value: "3540df09-f8bb-43ca-a4de-b89945b6b16b", label: "FC Strat. Opps. Fund I GP Limited" },
];

// ── Invoice Upload Panel ───────────────────────────────────────────────
function InvoiceUploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ entity_id: CAYMAN_ENTITIES[0].value, vendor: "", currency: "USD", notes: "", category: "other" });
  const { toast } = useToast();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); setError(null); }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_id", meta.entity_id);
      if (meta.vendor) form.append("vendor", meta.vendor);
      if (meta.currency) form.append("currency", meta.currency);
      if (meta.notes) form.append("notes", meta.notes);
      form.append("category", meta.category || "other");
      const res = await fetch("/api/entity-costs/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult({ imported: data.imported });
      toast({ title: `${data.imported} invoice(s) imported as draft` });
      setFile(null);
      onUploaded();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Upload Invoices
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("cayman-invoice-file-input")?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors
              ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
          >
            <input
              id="cayman-invoice-file-input"
              type="file"
              accept=".pdf,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setError(null); } }}
            />
            {file ? (
              <>
                <FileText className="h-7 w-7 text-primary" />
                <p className="text-sm font-medium text-center">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                <button onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">Drop a PDF or CSV here<br /><span className="text-xs">or click to browse</span></p>
              </>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Entity</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={meta.entity_id}
                onChange={e => setMeta(m => ({ ...m, entity_id: e.target.value }))}
              >
                {CAYMAN_ENTITIES.map(e => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor (PDF only — overrides auto-detect)</Label>
              <Input placeholder="e.g. Maples Group" value={meta.vendor}
                onChange={e => setMeta(m => ({ ...m, vendor: e.target.value }))} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={meta.currency}
                  onChange={e => setMeta(m => ({ ...m, currency: e.target.value }))}
                >
                  <option>USD</option><option>GBP</option><option>EUR</option><option>KYD</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={meta.category}
                  onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
                >
                  <option value="legal">Legal</option>
                  <option value="fund_admin">Fund Admin</option>
                  <option value="audit">Audit</option>
                  <option value="tax">Tax</option>
                  <option value="management">Management</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Optional" value={meta.notes}
                onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))} className="text-sm" />
            </div>
            <Button
              className="w-full gap-2"
              disabled={!file || uploading}
              onClick={handleUpload}
              data-testid="button-upload-invoice"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Import Invoices</>}
            </Button>
            {result && <p className="text-xs text-green-600 font-medium">✓ {result.imported} invoice(s) imported as draft — review below</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          PDF: creates one draft invoice (amount auto-detected). CSV: each row becomes a draft invoice. All imports land in <strong>Draft</strong> status for review.
        </p>
      </CardContent>
    </Card>
  );
}

const CAYMAN_ENTITY_IDS = CAYMAN_ENTITIES.map(e => e.value);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    accrued: { label: "Accrued",  cls: "bg-amber-100 text-amber-800" },
    paid:    { label: "Paid",     cls: "bg-green-100 text-green-800" },
    void:    { label: "Void",     cls: "bg-gray-100 text-gray-400" },
  };
  const s = map[status] ?? map.accrued;
  return <Badge className={`${s.cls} border-0 font-medium text-xs`}>{s.label}</Badge>;
}

function entityLabel(id: string) {
  return CAYMAN_ENTITIES.find(e => e.value === id)?.label ?? id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CaymanAccountsPayable() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");
  const [filterStatus, setFilterStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    entity_id: CAYMAN_ENTITIES[0].value,
    vendor: "", description: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "", amount: "", currency: "USD", fx_rate_to_usd: "1", status: "accrued",
  });

  const { data: rawCosts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/entity-costs", "cayman"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_ENTITY_IDS[0]}`).then(r => r.json()),
        apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_ENTITY_IDS[1]}`).then(r => r.json()),
      ]);
      return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/entity-costs", {
      entity_id: data.entity_id,
      cost_date: data.invoice_date,
      description: data.description ? `${data.vendor} — ${data.description}` : data.vendor,
      category: "other",
      amount: parseFloat(data.amount),
      currency: data.currency,
      fx_rate_to_usd: parseFloat(data.fx_rate_to_usd),
      status: data.status,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] });
      setOpen(false);
      setForm({ entity_id: CAYMAN_ENTITIES[0].value, vendor: "", description: "", invoice_date: new Date().toISOString().slice(0, 10), due_date: "", amount: "", currency: "USD", fx_rate_to_usd: "1", status: "accrued" });
      toast({ title: "Invoice added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add invoice.", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/entity-costs/${id}`, { status }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/entity-costs/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] });
      setConfirmDeleteId(null);
      toast({ title: "Invoice voided", description: "The invoice has been marked as void." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // KPIs
  const active = rawCosts.filter((i: any) => i.status !== "void");
  const totalUSD    = active.reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);
  const outstanding = rawCosts.filter((i: any) => i.status === "accrued").reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);
  const paid        = rawCosts.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);
  const overdueItems = rawCosts.filter((i: any) => {
    if (i.status !== "accrued" || !i.cost_date) return false;
    const dueDate = i.due_date ?? i.cost_date;
    return new Date(dueDate) < new Date();
  });
  const overdueUSD = overdueItems.reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);

  // Filtered list
  const filtered = rawCosts.filter((i: any) => {
    if (filterStatus === "active" && i.status === "void") return false;
    if (filterStatus !== "all" && filterStatus !== "active" && i.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const desc = (i.description ?? "").toLowerCase();
      if (!desc.includes(s)) return false;
    }
    return true;
  });

  // Aging computation
  const agingRows = rawCosts
    .filter((i: any) => i.status === "accrued")
    .map((i: any) => {
      const dueDate = i.due_date ?? i.cost_date;
      const days = dueDate ? Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000) : 0;
      return { ...i, days_overdue: days };
    })
    .sort((a: any, b: any) => b.days_overdue - a.days_overdue);

  const isNonUSD = form.currency !== "USD";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <span className="text-2xl">🇰🇾</span>
            <span>Accounts Payable</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Founders Capital Strat. Opps. Fund I · Cayman Islands
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)} data-testid="button-add-invoice-open">
          <Plus className="h-4 w-4" /> Add Invoice
        </Button>
      </div>

      {/* Upload Panel */}
      <InvoiceUploadPanel onUploaded={() => {
        queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] });
      }} />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="kpi-total">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total (Active)</p>
                {isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : <p className="text-2xl font-bold mt-1">{fmt(totalUSD)}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{active.length} invoice{active.length !== 1 ? "s" : ""}</p>
              </div>
              <DollarSign className="h-5 w-5 text-primary mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-outstanding">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Outstanding</p>
                {isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : <p className="text-2xl font-bold mt-1 text-amber-600">{fmt(outstanding)}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">Accrued / unpaid</p>
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
                {isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : <p className="text-2xl font-bold mt-1 text-red-600">{fmt(overdueUSD)}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">{overdueItems.length} past due date</p>
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
                {isLoading ? <Skeleton className="h-7 w-28 mt-1" /> : <p className="text-2xl font-bold mt-1 text-green-600">{fmt(paid)}</p>}
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Invoices / Aging */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <TabsTrigger value="invoices">Invoice List</TabsTrigger>
          <TabsTrigger value="aging">AP Aging</TabsTrigger>
        </TabsList>

        {/* ── Invoice List ──────────────────────────────────────────────── */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  All Invoices
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Search description…"
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
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="all">All (inc. Void)</SelectItem>
                      <SelectItem value="accrued">Accrued</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="void">Void only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No invoices match your filters</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Source</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv: any) => {
                      const amtUSD = parseFloat(inv.amount_usd) || parseFloat(inv.amount) || 0;
                      return (
                        <TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                          <TableCell className="text-sm max-w-[260px] truncate">{inv.description ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {inv.entities?.short_code ?? entityLabel(inv.entity_id)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(inv.cost_date)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {inv.currency !== "USD" ? fmt(parseFloat(inv.amount), inv.currency) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(amtUSD)}</TableCell>
                          <TableCell>{statusBadge(inv.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {inv.status === "accrued" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  data-testid={`button-mark-paid-${inv.id}`}
                                  onClick={() => patchMutation.mutate({ id: inv.id, status: "paid" })}
                                  disabled={patchMutation.isPending}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
                                </Button>
                              )}
                              {inv.status === "paid" && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                                </span>
                              )}
                              {inv.status !== "void" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`button-delete-${inv.id}`}
                                  onClick={() => setConfirmDeleteId(inv.id)}
                                  disabled={deleteMutation.isPending}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AP Aging ───────────────────────────────────────────────────── */}
        <TabsContent value="aging">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" />
                AP Aging Report — Accrued Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : agingRows.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No outstanding items</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Days Overdue</TableHead>
                      <TableHead>Bucket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingRows.map((row: any) => {
                      const days = row.days_overdue;
                      const bucket = days <= 0 ? "Current"
                        : days <= 30 ? "1–30 days"
                        : days <= 60 ? "31–60 days"
                        : days <= 90 ? "61–90 days" : "90+ days";
                      const bucketColor = days <= 0
                        ? { bg: "hsl(142 71% 42% / 0.12)", color: "hsl(142 71% 55%)" }
                        : days <= 30 ? { bg: "hsl(38 92% 52% / 0.12)", color: "hsl(38 92% 60%)" }
                        : days <= 60 ? { bg: "hsl(25 95% 55% / 0.12)", color: "hsl(25 95% 55%)" }
                        : { bg: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 60%)" };
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm max-w-[260px] truncate">{row.description ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.entities?.short_code ?? entityLabel(row.entity_id)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {fmt(parseFloat(row.amount_usd) || parseFloat(row.amount) || 0)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(row.cost_date)}</TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {days > 0 ? <span className="text-red-600 font-medium">{days}</span> : <span className="text-green-600">0</span>}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: bucketColor.bg, color: bucketColor.color }}>
                              {bucket}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <tfoot className="border-t-2">
                    <tr>
                      <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Total Outstanding</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">
                        {fmt(agingRows.reduce((s: number, r: any) => s + (parseFloat(r.amount_usd) || parseFloat(r.amount) || 0), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Invoice Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cayman Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Entity</Label>
                <Select value={form.entity_id} onValueChange={v => setForm(f => ({ ...f, entity_id: v }))}>
                  <SelectTrigger data-testid="select-entity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAYMAN_ENTITIES.map(e => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Vendor / Payee *</Label>
                <Input data-testid="input-vendor" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Maples Group" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input data-testid="input-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Service description" />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input data-testid="input-invoice-date" type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input data-testid="input-due-date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v, fx_rate_to_usd: v === "USD" ? "1" : f.fx_rate_to_usd }))}>
                  <SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount *</Label>
                <Input data-testid="input-amount" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              {isNonUSD && (
                <div className="col-span-2">
                  <Label>FX Rate to USD ({form.currency} → USD)</Label>
                  <Input data-testid="input-fx-rate" type="number" step="0.0001" value={form.fx_rate_to_usd} onChange={e => setForm(f => ({ ...f, fx_rate_to_usd: e.target.value }))} placeholder="e.g. 1.27" />
                  {form.amount && form.fx_rate_to_usd && (
                    <p className="text-xs mt-1 text-muted-foreground">
                      ≈ ${(parseFloat(form.amount) * parseFloat(form.fx_rate_to_usd)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrued">Accrued</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-invoice"
              disabled={!form.vendor || !form.amount || createMutation.isPending}
              onClick={() => createMutation.mutate({ ...form, amount: parseFloat(form.amount), fx_rate_to_usd: parseFloat(form.fx_rate_to_usd) })}>
              {createMutation.isPending ? "Saving…" : "Add Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Void Invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark the invoice as <strong>void</strong> and remove it from all KPIs and P&amp;L totals.
            The record is retained for audit purposes and can be viewed using the &ldquo;Void only&rdquo; filter.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}>
              {deleteMutation.isPending ? "Voiding…" : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
