import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users, DollarSign, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Nationality lookup based on seeded investor IDs
const INVESTOR_JURISDICTION: Record<string, string> = {
  "a1000000-0000-0000-0000-000000000001": "Cayman Islands",
  "a1000000-0000-0000-0000-000000000002": "United Kingdom",
  "a1000000-0000-0000-0000-000000000003": "United States",
  "a1000000-0000-0000-0000-000000000004": "Germany",
};

const STATUS_COLORS: Record<string, string> = {
  active:       "#0CA678",
  pending:      "#F59F00",
  called:       "#3B5BDB",
  fully_drawn:  "#7048E8",
  exited:       "#868E96",
  transferred:  "#868E96",
};

export default function CaymanLPRegister() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", type: "individual", commitment_usd: "",
    subscription_date: new Date().toISOString().slice(0, 10),
    status: "pending", notes: "",
  });

  const { data: lps = [], isLoading } = useQuery({
    queryKey: ["/api/commitments", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/commitments?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/commitments", {
      entity_id: CAYMAN_FUND_ID,
      investor_id: data.investor_id,
      committed_amount: parseFloat(data.commitment_usd),
      subscription_date: data.subscription_date,
      status: data.status,
      notes: data.notes,
      fee_rate: 0.02, carry_rate: 0.20, carried_interest_pct: 20.0,
      management_fee_pct: 2.0, preferred_return_pct: 8.0,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commitments", CAYMAN_FUND_ID] });
      setOpen(false);
      setForm({ name: "", email: "", type: "individual", commitment_usd: "", subscription_date: new Date().toISOString().slice(0, 10), status: "pending", notes: "" });
      toast({ title: "LP added", description: "Cayman LP record created." });
    },
    onError: () => toast({ title: "Error", description: "Failed to add LP.", variant: "destructive" }),
  });

  const totalCommitment = (lps as any[]).reduce((s, lp) => s + (parseFloat(lp.committed_amount) || 0), 0);
  const totalCalled     = (lps as any[]).reduce((s, lp) => s + (parseFloat(lp.called_amount)    || 0), 0);
  const totalUncalled   = totalCommitment - totalCalled;
  const activeLPs       = (lps as any[]).filter((l: any) => l.status === "active").length;
  const kycPending      = (lps as any[]).filter((l: any) => l.status === "pending").length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🇰🇾</span>
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                LP Register
              </h1>
              <Badge variant="outline" className="text-xs">Cayman Islands</Badge>
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Founders Capital Strat. Opps. Fund I LP — Reg. No. 134092 · CIMA Registered
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-cayman-lp">
            <Plus size={14} className="mr-1.5" /> Add LP
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total LPs",          value: String((lps as any[]).length), sub: `${activeLPs} active · ${kycPending} KYC pending` },
          { label: "Total Commitments",  value: fmt(totalCommitment),           sub: "Fund size" },
          { label: "Called to Date",     value: fmt(totalCalled),               sub: `${totalCommitment > 0 ? ((totalCalled / totalCommitment) * 100).toFixed(0) : 0}% of committed` },
          { label: "Uncalled Capital",   value: fmt(totalUncalled),             sub: "Remaining dry powder" },
        ].map(kpi => (
          <Card key={kpi.label} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-3 px-5">
              <p className="text-xs font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.label}</p>
              <p className="text-lg font-semibold font-mono" style={{ color: "hsl(var(--foreground))" }}>{kpi.value}</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KYC warning banner */}
      {kycPending > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 mb-5 text-sm"
          style={{ background: "#F59F0015", border: "1px solid #F59F0040" }}
        >
          <AlertTriangle size={14} style={{ color: "#F59F00", flexShrink: 0 }} />
          <span style={{ color: "#F59F00" }}>
            {kycPending} LP{kycPending > 1 ? "s" : ""} with outstanding KYC — capital not yet callable until documentation is complete.
          </span>
        </div>
      )}

      {/* LP table */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Limited Partners
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</div>
          ) : (lps as any[]).length === 0 ? (
            <div className="p-12 text-center">
              <Users size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No Cayman LPs yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Add the first limited partner to the Cayman fund</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Limited Partner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Called</TableHead>
                  <TableHead className="text-right">Uncalled</TableHead>
                  <TableHead>% Called</TableHead>
                  <TableHead>Subscribed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lps as any[]).map((lp: any) => {
                  const committed  = parseFloat(lp.committed_amount || 0);
                  const called     = parseFloat(lp.called_amount    || 0);
                  const uncalled   = committed - called;
                  const callPct    = committed > 0 ? (called / committed) * 100 : 0;
                  const jurisdiction = INVESTOR_JURISDICTION[lp.investor_id] ?? "—";
                  const isKycPending = lp.status === "pending";

                  return (
                    <TableRow key={lp.id} data-testid={`row-lp-${lp.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm" style={{ color: "hsl(var(--foreground))" }}>
                            {lp.investors?.full_name ?? "—"}
                          </p>
                          {lp.notes && (
                            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {lp.notes}
                            </p>
                          )}
                          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {lp.investors?.email ?? ""}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm capitalize" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {lp.investors?.investor_type?.replace(/_/g, " ") ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {jurisdiction}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono font-medium" style={{ color: "hsl(var(--foreground))" }}>
                        {fmt(committed)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono" style={{ color: called > 0 ? "#0CA678" : "hsl(var(--muted-foreground))" }}>
                        {called > 0 ? fmt(called) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {fmt(uncalled)}
                      </TableCell>
                      <TableCell style={{ minWidth: 120 }}>
                        {isKycPending ? (
                          <span className="text-xs" style={{ color: "#F59F00" }}>KYC Pending</span>
                        ) : (
                          <div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden mb-1" style={{ background: "hsl(var(--border))" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(callPct, 100)}%`, background: "#3B5BDB" }}
                              />
                            </div>
                            <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {callPct.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {lp.subscription_date}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                          style={{
                            borderColor: STATUS_COLORS[lp.status] ?? "#868E96",
                            color:       STATUS_COLORS[lp.status] ?? "#868E96",
                          }}
                        >
                          {lp.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add LP Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cayman LP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name</Label>
                <Input data-testid="input-lp-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Investor name or entity" />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input data-testid="input-lp-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="investor@example.com" />
              </div>
              <div>
                <Label>Investor Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-lp-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="institutional">Institutional</SelectItem>
                    <SelectItem value="family_office">Family Office</SelectItem>
                    <SelectItem value="fund_of_funds">Fund of Funds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commitment (USD)</Label>
                <Input data-testid="input-lp-commitment" type="number" value={form.commitment_usd} onChange={e => setForm(f => ({ ...f, commitment_usd: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Subscription Date</Label>
                <Input data-testid="input-lp-date" type="date" value={form.subscription_date} onChange={e => setForm(f => ({ ...f, subscription_date: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-lp-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="called">Called</SelectItem>
                    <SelectItem value="fully_drawn">Fully Drawn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input data-testid="input-lp-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-lp"
              disabled={!form.name || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? "Saving…" : "Add LP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
