import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, DollarSign, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft:          "#868E96",
  issued:         "#F59F00",
  partially_funded: "#3B5BDB",
  fully_funded:   "#0CA678",
  cancelled:      "#FA5252",
};

export default function CaymanCapitalCalls() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    call_number: "", call_date: new Date().toISOString().slice(0, 10),
    due_date: "", amount_usd: "", purpose: "", status: "draft", notes: "",
  });

  const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["/api/capital-calls", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/capital-calls?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/capital-calls", {
        entity_id: CAYMAN_FUND_ID,
        call_number: parseInt(data.call_number) || calls.length + 1,
        call_date: data.call_date,
        due_date: data.due_date,
        purpose: data.purpose,
        total_call_amount: parseFloat(data.amount_usd),
        currency: "USD",
        status: data.status,
        bank_name: "HSBC Grand Cayman",
        reference_note: data.notes,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capital-calls", CAYMAN_FUND_ID] });
      setOpen(false);
      setForm({ call_number: "", call_date: new Date().toISOString().slice(0, 10), due_date: "", amount_usd: "", purpose: "", status: "draft", notes: "" });
      toast({ title: "Capital call created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create capital call.", variant: "destructive" }),
  });

  const totalIssued  = calls.filter((c: any) => c.status !== "cancelled").reduce((s: number, c: any) => s + (parseFloat(c.total_call_amount) || 0), 0);
  const totalSettled = calls.filter((c: any) => c.status === "fully_funded").reduce((s: number, c: any) => s + (parseFloat(c.total_call_amount) || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🇰🇾</span>
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Capital Calls
              </h1>
              <Badge variant="outline" className="text-xs">Cayman Islands</Badge>
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Founders Capital Strat. Opps. Fund I LP — USD denominated
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-new-capital-call">
            <Plus size={14} className="mr-1.5" /> New Call
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Calls", value: calls.length.toString(), icon: Phone },
          { label: "Total Called (USD)", value: `$${totalIssued.toLocaleString()}`, icon: DollarSign },
          { label: "Settled (USD)", value: `$${totalSettled.toLocaleString()}`, icon: CheckCircle },
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
          ) : calls.length === 0 ? (
            <div className="p-12 text-center">
              <Phone size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No capital calls yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Issue the first capital call to Cayman LPs</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call #</TableHead>
                  <TableHead>Call Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Amount (USD)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">CC-{String(c.call_number).padStart(3, "0")}</TableCell>
                    <TableCell className="text-sm">{c.call_date}</TableCell>
                    <TableCell className="text-sm">{c.due_date || "—"}</TableCell>
                    <TableCell className="text-sm">{c.purpose}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${parseFloat(c.total_call_amount || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                        style={{
                          borderColor: STATUS_COLORS[c.status] ?? "#868E96",
                          color:       STATUS_COLORS[c.status] ?? "#868E96",
                        }}
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Capital Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Call Number</Label>
                <Input data-testid="input-call-number" value={form.call_number} onChange={e => setForm(f => ({ ...f, call_number: e.target.value }))} placeholder="e.g. CC-001" />
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
                <Input data-testid="input-call-date" type="date" value={form.call_date} onChange={e => setForm(f => ({ ...f, call_date: e.target.value }))} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input data-testid="input-call-due-date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Amount (USD)</Label>
                <Input data-testid="input-call-amount" type="number" value={form.amount_usd} onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value }))} placeholder="0" />
              </div>
              <div className="col-span-2">
                <Label>Purpose</Label>
                <Input data-testid="input-call-purpose" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Portfolio investment — AI Co." />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea data-testid="input-call-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-call"
              disabled={!form.call_number || !form.amount_usd || createMutation.isPending}
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
