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
import { Plus, FileCheck, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CURRENCIES = ["USD", "GBP", "EUR", "KYD"];
const STATUS_COLORS: Record<string, string> = {
  accrued: "#F59F00",
  paid:    "#0CA678",
  void:    "#868E96",
};

const CAYMAN_ENTITIES = [
  { value: "14d76562-2219-4121-b0bd-5379018ac3b4", label: "Founders Capital Strat. Opps. Fund I LP" },
  { value: "3540df09-f8bb-43ca-a4de-b89945b6b16b", label: "FC Strat. Opps. Fund I GP Limited" },
];

export default function CaymanAccountsPayable() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entity_id: "14d76562-2219-4121-b0bd-5379018ac3b4", vendor: "", description: "", invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "", amount: "", currency: "USD", fx_rate_to_usd: "1", status: "accrued",
  });

  const CAYMAN_ENTITY_IDS = ["14d76562-2219-4121-b0bd-5379018ac3b4", "3540df09-f8bb-43ca-a4de-b89945b6b16b"];

  const { data: rawCosts = [], isLoading } = useQuery({
    queryKey: ["/api/entity-costs", "cayman"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_ENTITY_IDS[0]}`).then(r => r.json()),
        apiRequest("GET", `/api/entity-costs?entity_id=${CAYMAN_ENTITY_IDS[1]}`).then(r => r.json()),
      ]);
      return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    },
  });
  const invoices = rawCosts;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/entity-costs", {
      entity_id: data.entity_id,
      cost_date: data.invoice_date,
      description: `${data.vendor} — ${data.description}`,
      category: "other",
      amount: parseFloat(data.amount),
      currency: data.currency,
      fx_rate_to_usd: parseFloat(data.fx_rate_to_usd),
      status: data.status,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] });
      setOpen(false);
      setForm({ entity_id: "FC-CAYMAN-FUND", vendor: "", description: "", invoice_date: new Date().toISOString().slice(0, 10), due_date: "", amount: "", currency: "USD", fx_rate_to_usd: "1", status: "accrued" });
      toast({ title: "Invoice added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add invoice.", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/entity-costs/${id}`, { status }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/entity-costs", "cayman"] }),
  });

  const totalUSD    = invoices.filter((i: any) => i.status !== "void").reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);
  const outstanding = invoices.filter((i: any) => i.status === "accrued").reduce((s: number, i: any) => s + (parseFloat(i.amount_usd) || 0), 0);

  const isNonUSD = form.currency !== "USD";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🇰🇾</span>
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Accounts Payable
              </h1>
              <Badge variant="outline" className="text-xs">Cayman Islands</Badge>
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Invoices and expenses for Cayman entities — reported in USD
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-invoice">
            <Plus size={14} className="mr-1.5" /> Add Invoice
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Invoices", value: invoices.length.toString() },
          { label: "Total (USD)",    value: `$${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: "Outstanding",   value: `$${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ].map(kpi => (
          <Card key={kpi.label} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-3 px-5">
              <p className="text-xs font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.label}</p>
              <p className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No invoices yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Add the first Cayman expense or invoice</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => {
                  const entityLabel = CAYMAN_ENTITIES.find(e => e.value === inv.entity_id)?.label
                    ?.replace("Founders Capital Strat. Opps. Fund I LP", "Cayman Fund LP")
                    ?.replace("FC Strat. Opps. Fund I GP Limited", "GP Ltd") ?? inv.entity_id;
                  return (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs">{entityLabel}</TableCell>
                    <TableCell className="text-sm font-medium">{inv.description}</TableCell>
                    <TableCell className="text-sm">{inv.category}</TableCell>
                    <TableCell className="text-sm">{inv.cost_date}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {inv.currency !== "USD" ? (
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {parseFloat(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {inv.currency}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${parseFloat(inv.amount_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={inv.status}
                        onValueChange={v => patchMutation.mutate({ id: inv.id, status: v })}
                      >
                        <SelectTrigger
                          className="h-7 text-xs w-28"
                          style={{
                            borderColor: STATUS_COLORS[inv.status] ?? "#868E96",
                            color:       STATUS_COLORS[inv.status] ?? "#868E96",
                          }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="accrued">Accrued</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="void">Void</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                  );
                })}
                
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
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
              <div>
                <Label>Vendor</Label>
                <Input data-testid="input-vendor" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input data-testid="input-invoice-date" type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input data-testid="input-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Service description" />
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
                <Label>Amount</Label>
                <Input data-testid="input-amount" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              {isNonUSD && (
                <div className="col-span-2">
                  <Label>FX Rate to USD ({form.currency} → USD)</Label>
                  <Input data-testid="input-fx-rate" type="number" step="0.0001" value={form.fx_rate_to_usd} onChange={e => setForm(f => ({ ...f, fx_rate_to_usd: e.target.value }))} placeholder="e.g. 1.27" />
                  {form.amount && form.fx_rate_to_usd && (
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
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
              onClick={() => createMutation.mutate({
                ...form,
                amount:         parseFloat(form.amount),
                fx_rate_to_usd: parseFloat(form.fx_rate_to_usd),
              })}
            >
              {createMutation.isPending ? "Saving…" : "Add Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
