import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Plus, CheckCircle2, Clock, AlertTriangle, DollarSign, Filter, Upload, FileText, Loader2, Trash2 } from "lucide-react";

const DE_ENTITIES = [
  { value: "a1000000-0000-0000-0000-000000000005", label: "Founders Capital Platform LP",       short: "Platform LP"  },
  { value: "a1000000-0000-0000-0000-000000000004", label: "Founders Capital Platform GP, LP",  short: "Platform GP"  },
  { value: "a1000000-0000-0000-0000-000000000006", label: "FC Platform LP — Series Vector I",  short: "Vector I"     },
  { value: "9f05cfb3-8f46-4175-92b2-c31afac38550", label: "FC Platform LP — Series Vector II", short: "Vector II"    },
  { value: "4b9c14d2-f183-40e4-9268-cde01b565455", label: "FC Platform LP — Series Vector III",short: "Vector III"   },
  { value: "c677bafd-be0b-4ddd-911f-a14746165f77", label: "FC Platform LP — Series Vector IV", short: "Vector IV"    },
  { value: "2184a8e9-30fd-4b45-b415-908571bbeae3", label: "FC Platform LP — Series Vector V",  short: "Vector V"     },
  { value: "a1000000-0000-0000-0000-000000000003", label: "Founders Capital US Holdings LLC",  short: "US Holdings"  },
];

const CATEGORY_OPTIONS = [
  { value: "formation",  label: "Formation costs"        },
  { value: "legal",      label: "Legal & professional"   },
  { value: "admin",      label: "Administration"         },
  { value: "audit",      label: "Audit & accounting"     },
  { value: "compliance", label: "Compliance & regulatory"},
  { value: "management", label: "Management fees"        },
  { value: "other",      label: "Other"                  },
];

const CURRENCIES = ["USD", "GBP", "EUR"];

const fmt  = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    accrued: { label: "Accrued", cls: "bg-amber-100 text-amber-800" },
    paid:    { label: "Paid",    cls: "bg-green-100 text-green-800" },
    void:    { label: "Void",    cls: "bg-gray-100 text-gray-400"  },
  };
  const s = map[status] ?? map.accrued;
  return <Badge className={s.cls + " text-[10px] px-1.5 py-0 font-medium border-0"}>{s.label}</Badge>;
}

function InvoiceUploadPanel({ entityId, onDone }: { entityId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("1");
  const [vendor, setVendor] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_id",      entityId);
      fd.append("currency",       currency);
      fd.append("fx_rate_to_usd", fxRate);
      fd.append("vendor",         vendor);
      fd.append("invoice_ref",    invoiceRef);
      fd.append("due_date",       dueDate);
      fd.append("category",       category);
      fd.append("notes",          notes);
      const res  = await apiRequest("POST", "/api/entity-costs/upload", fd);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast({ title: `${json.imported} invoice(s) imported` });
      onDone();
    } catch (e: any) {
      toast({ title: "Upload error", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Vendor / Supplier</Label>
          <Input className="h-8 text-sm mt-1" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Vcorp Services" /></div>
        <div><Label className="text-xs">Invoice Ref</Label>
          <Input className="h-8 text-sm mt-1" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="e.g. INV-001" /></div>
        <div><Label className="text-xs">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label className="text-xs">FX Rate to USD</Label>
          <Input className="h-8 text-sm mt-1" type="number" step="0.0001" value={fxRate} onChange={e => setFxRate(e.target.value)} /></div>
        <div><Label className="text-xs">Due Date</Label>
          <Input className="h-8 text-sm mt-1" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        <div><Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div><Label className="text-xs">Notes</Label>
        <Input className="h-8 text-sm mt-1" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pdf,.csv"; inp.onchange = (ev: any) => { if (ev.target.files?.[0]) handleFile(ev.target.files[0]); }; inp.click(); }}>
        {uploading
          ? <div className="flex items-center justify-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Uploading…</div>
          : <><FileText className="mx-auto h-8 w-8 mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">Drop PDF or CSV here, or click to browse</p></>}
      </div>
    </div>
  );
}

export default function AccountsPayable() {
  const { toast } = useToast();
  const [activeEntity, setActiveEntity] = useState(DE_ENTITIES[0].value);
  const [filterStatus, setFilterStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: rawCosts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/entity-costs", activeEntity],
    queryFn: () => apiRequest("GET", `/api/entity-costs?entity_id=${activeEntity}`).then(r => r.json()),
  });

  const { data: allDeCosts = [] } = useQuery<any[]>({
    queryKey: ["/api/entity-costs", "delaware-all"],
    queryFn: async () => {
      const results = await Promise.all(DE_ENTITIES.map(e =>
        apiRequest("GET", `/api/entity-costs?entity_id=${e.value}`).then(r => r.json())));
      return (results as any[][]).flat();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", activeEntity] });
    queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "delaware-all"] });
  };

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/entity-costs/${id}`, { status }).then(r => r.json()),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/entity-costs/${id}`).then(r => r.json()),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null); toast({ title: "Invoice voided" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeCosts = rawCosts.filter((c: any) => c.status !== "void");
  const totalBilled  = activeCosts.reduce((s: number, c: any) => s + parseFloat(c.amount_usd || 0), 0);
  const outstanding  = activeCosts.filter((c: any) => c.status === "accrued").reduce((s: number, c: any) => s + parseFloat(c.amount_usd || 0), 0);
  const overdue      = activeCosts.filter((c: any) => c.status === "accrued" && c.due_date && new Date(c.due_date) < new Date()).reduce((s: number, c: any) => s + parseFloat(c.amount_usd || 0), 0);

  const summaryByEntity = DE_ENTITIES.map(ent => {
    const costs = (allDeCosts as any[]).filter(c => c.entity_id === ent.value && c.status !== "void");
    return {
      label:       ent.short,
      total:       costs.reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0),
      outstanding: costs.filter((c: any) => c.status === "accrued").reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0),
      paid:        costs.filter((c: any) => c.status === "paid").reduce((s, c) => s + parseFloat(c.amount_usd || 0), 0),
      count:       costs.length,
    };
  });

  const filtered = rawCosts.filter((c: any) => {
    if (filterStatus === "active" && c.status === "void") return false;
    if (filterStatus !== "all" && filterStatus !== "active" && c.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!([c.description, c.vendor, c.invoice_ref].filter(Boolean).join(" ").toLowerCase()).includes(s)) return false;
    }
    return true;
  });

  const currentEntityLabel = DE_ENTITIES.find(e => e.value === activeEntity)?.label ?? "";

  return (
    <div className="min-h-screen p-6 space-y-5" style={{ background: "hsl(var(--background))" }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>Accounts Payable</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>🇺🇸 Delaware — all entities · amounts in USD</p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="flex items-center gap-2 text-sm" style={{ background: "hsl(var(--primary))", color: "white" }}>
          <Upload size={15} /> Upload Invoice
        </Button>
      </div>

      <Tabs value={activeEntity} onValueChange={v => { setActiveEntity(v); setSearch(""); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex h-auto gap-1 bg-transparent p-0 w-max">
            {DE_ENTITIES.map(e => (
              <TabsTrigger key={e.value} value={e.value}
                className="text-xs px-3 py-1.5 rounded-md border whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-white"
                style={{ borderColor: "hsl(var(--border))" }}>{e.short}</TabsTrigger>
            ))}
            <TabsTrigger value="summary"
              className="text-xs px-3 py-1.5 rounded-md border whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-white"
              style={{ borderColor: "hsl(var(--border))" }}>Summary</TabsTrigger>
          </TabsList>
        </div>

        {DE_ENTITIES.map(ent => (
          <TabsContent key={ent.value} value={ent.value} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: FileCheck,     label: "Open Invoices", value: isLoading ? "…" : String(activeCosts.filter((c: any) => c.status === "accrued").length) },
                { icon: DollarSign,    label: "Total Billed",  value: isLoading ? "…" : fmt(totalBilled) },
                { icon: Clock,         label: "Outstanding",   value: isLoading ? "…" : fmt(outstanding) },
                { icon: AlertTriangle, label: "Overdue",       value: isLoading ? "…" : fmt(overdue), red: overdue > 0 },
              ].map(({ icon: Icon, label, value, red }: any) => (
                <Card key={label} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} style={{ color: red ? "hsl(0 70% 50%)" : "hsl(var(--primary))" }} />
                      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
                    </div>
                    <div className={`text-lg font-bold ${red ? "text-red-600" : ""}`} style={red ? {} : { color: "hsl(var(--foreground))" }}>{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{ent.label}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input placeholder="Search…" className="h-7 w-40 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-7 w-32 text-xs"><Filter size={11} className="mr-1" /><SelectValue /></SelectTrigger>
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
              <CardContent className="px-4 pb-3 overflow-x-auto">
                {isLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No invoices for this entity.{" "}
                    <button className="underline" onClick={() => setShowUpload(true)}>Upload one?</button>
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Invoice Ref","Vendor / Supplier","Description","Date","Due Date","Ccy","Amount","USD","Status",""].map(h =>
                          <TableHead key={h} className="text-xs py-2 px-2">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv: any) => (
                        <TableRow key={inv.id} className={inv.status === "void" ? "opacity-40" : ""}>
                          <TableCell className="text-xs py-2 px-2 font-mono">{inv.invoice_ref || "—"}</TableCell>
                          <TableCell className="text-xs py-2 px-2 font-medium">{inv.vendor || "—"}</TableCell>
                          <TableCell className="text-xs py-2 px-2 max-w-xs truncate" title={inv.description}>{inv.description || "—"}</TableCell>
                          <TableCell className="text-xs py-2 px-2 whitespace-nowrap">{fmtDate(inv.cost_date)}</TableCell>
                          <TableCell className="text-xs py-2 px-2 whitespace-nowrap">{fmtDate(inv.due_date)}</TableCell>
                          <TableCell className="text-xs py-2 px-2">{inv.currency || "USD"}</TableCell>
                          <TableCell className="text-xs py-2 px-2 text-right font-medium">
                            {inv.currency !== "USD" ? new Intl.NumberFormat("en-US",{minimumFractionDigits:2}).format(parseFloat(inv.amount||0)) : "—"}
                          </TableCell>
                          <TableCell className="text-xs py-2 px-2 text-right font-medium">{fmt2(parseFloat(inv.amount_usd||0))}</TableCell>
                          <TableCell className="py-2 px-2">{statusBadge(inv.status)}</TableCell>
                          <TableCell className="py-2 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {inv.status === "accrued" && (
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                                  onClick={() => patchMutation.mutate({ id: inv.id, status: "paid" })}
                                  disabled={patchMutation.isPending}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />Paid
                                </Button>
                              )}
                              {inv.status === "paid" && (
                                <span className="text-[10px] text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />Paid
                                </span>
                              )}
                              {inv.status !== "void" && (
                                <Button size="sm" variant="ghost"
                                  className="h-6 px-1.5 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setConfirmDeleteId(inv.id)}
                                  disabled={deleteMutation.isPending}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="summary" className="mt-4">
          <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Delaware Group — AP Summary</CardTitle>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>All entities · non-voided · USD</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Entity","Open Invoices","Total Billed (USD)","Outstanding (USD)","Paid (USD)"].map(h =>
                      <TableHead key={h} className="text-xs py-2">{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryByEntity.map(row => (
                    <TableRow key={row.label}>
                      <TableCell className="text-sm py-2 font-medium">{row.label}</TableCell>
                      <TableCell className="text-sm py-2 text-center">{row.count}</TableCell>
                      <TableCell className="text-sm py-2 text-right">{fmt2(row.total)}</TableCell>
                      <TableCell className="text-sm py-2 text-right">{fmt2(row.outstanding)}</TableCell>
                      <TableCell className="text-sm py-2 text-right">{fmt2(row.paid)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2" style={{ borderColor: "hsl(var(--border))" }}>
                    <TableCell className="py-2">Total</TableCell>
                    <TableCell className="py-2 text-center">{summaryByEntity.reduce((s,r) => s+r.count,0)}</TableCell>
                    <TableCell className="py-2 text-right">{fmt2(summaryByEntity.reduce((s,r)=>s+r.total,0))}</TableCell>
                    <TableCell className="py-2 text-right">{fmt2(summaryByEntity.reduce((s,r)=>s+r.outstanding,0))}</TableCell>
                    <TableCell className="py-2 text-right">{fmt2(summaryByEntity.reduce((s,r)=>s+r.paid,0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">Upload Invoice — {currentEntityLabel}</DialogTitle></DialogHeader>
          <InvoiceUploadPanel entityId={activeEntity} onDone={() => {
            setShowUpload(false); invalidate();
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteId} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Void Invoice?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marks the invoice as <strong>void</strong> and removes it from all totals. The record is kept for audit.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}>
              {deleteMutation.isPending ? "Voiding…" : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
