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
import { Plus, BarChart3, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STAGE_COLORS: Record<string, string> = {
  "early":    "#7048E8",
  "late":     "#3B5BDB",
  "growth":   "#0CA678",
  "exited":   "#868E96",
};

export default function CaymanNAV() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company: "", sector: "", stage: "early",
    cost_usd: "", fair_value_usd: "", valuation_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";

  // Use investments table for portfolio positions
  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["/api/investments", CAYMAN_FUND_ID],
    queryFn: () =>
      apiRequest("GET", `/api/investments?entity_id=${CAYMAN_FUND_ID}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/investments", {
        entity_id: CAYMAN_FUND_ID,
        company_name: data.company,
        sector: data.sector,
        stage: data.stage,
        instrument_type: "preferred_shares",
        investment_date: data.valuation_date,
        cost_basis: parseFloat(data.cost_usd),
        current_fair_value: parseFloat(data.fair_value_usd),
        fair_value_date: data.valuation_date,
        valuation_basis: "Manual entry",
        notes: data.notes,
        status: "active",
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments", CAYMAN_FUND_ID] });
      setOpen(false);
      setForm({ company: "", sector: "", stage: "early", cost_usd: "", fair_value_usd: "", valuation_date: new Date().toISOString().slice(0, 10), notes: "" });
      toast({ title: "Position added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add position.", variant: "destructive" }),
  });

  const totalCost  = positions.reduce((s: number, p: any) => s + (parseFloat(p.cost_basis) || 0), 0);
  const totalFV    = positions.reduce((s: number, p: any) => s + (parseFloat(p.current_fair_value) || 0), 0);
  const moic       = totalCost > 0 ? (totalFV / totalCost).toFixed(2) : "—";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🇰🇾</span>
              <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                NAV / Fair Value
              </h1>
              <Badge variant="outline" className="text-xs">Cayman Islands · USD</Badge>
            </div>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Portfolio positions — AI & Robotics · Target 15–20 companies
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-position">
            <Plus size={14} className="mr-1.5" /> Add Position
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Positions",      value: positions.length.toString() },
          { label: "Total Cost",     value: `$${totalCost.toLocaleString()}` },
          { label: "Fair Value",     value: `$${totalFV.toLocaleString()}` },
          { label: "MOIC",           value: moic === "—" ? "—" : `${moic}x` },
        ].map(kpi => (
          <Card key={kpi.label} className="border" style={{ borderColor: "hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-3 px-5">
              <p className="text-xs font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{kpi.label}</p>
              <p className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Target indicator */}
      <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        <TrendingUp size={12} />
        <span>Target portfolio: 15–20 positions</span>
        <span className="ml-1 font-medium" style={{ color: positions.length >= 15 ? "#0CA678" : "#F59F00" }}>
          ({positions.length} / 20 positions)
        </span>
      </div>

      {/* Table */}
      <Card className="border" style={{ borderColor: "hsl(var(--border))" }}>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</div>
          ) : positions.length === 0 ? (
            <div className="p-12 text-center">
              <BarChart3 size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>No positions yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Add portfolio companies to track NAV and fair value</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Cost (USD)</TableHead>
                  <TableHead className="text-right">Fair Value (USD)</TableHead>
                  <TableHead className="text-right">MOIC</TableHead>
                  <TableHead>Valuation Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p: any) => {
                  const cost = parseFloat(p.cost_basis) || 0;
                  const fv   = parseFloat(p.current_fair_value) || 0;
                  const m    = cost > 0 ? (fv / cost).toFixed(2) + "x" : "—";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm">{p.company_name}</TableCell>
                      <TableCell className="text-sm">{p.sector}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                          style={{
                            borderColor: STAGE_COLORS[p.stage] ?? "#868E96",
                            color:       STAGE_COLORS[p.stage] ?? "#868E96",
                          }}
                        >
                          {p.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">${cost.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${fv.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm"
                        style={{ color: fv >= cost ? "#0CA678" : "#FA5252" }}
                      >
                        {m}
                      </TableCell>
                      <TableCell className="text-sm">{p.fair_value_date ?? p.investment_date}</TableCell>
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
            <DialogTitle>Add Portfolio Position</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Company Name</Label>
                <Input data-testid="input-company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Portfolio company name" />
              </div>
              <div>
                <Label>Sector</Label>
                <Input data-testid="input-sector" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} placeholder="e.g. AI Infrastructure" />
              </div>
              <div>
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
                  <SelectTrigger data-testid="select-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="early">Early Stage</SelectItem>
                    <SelectItem value="late">Late Stage</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="exited">Exited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost Basis (USD)</Label>
                <Input data-testid="input-cost" type="number" value={form.cost_usd} onChange={e => setForm(f => ({ ...f, cost_usd: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Fair Value (USD)</Label>
                <Input data-testid="input-fair-value" type="number" value={form.fair_value_usd} onChange={e => setForm(f => ({ ...f, fair_value_usd: e.target.value }))} placeholder="0" />
              </div>
              <div className="col-span-2">
                <Label>Valuation Date</Label>
                <Input data-testid="input-valuation-date" type="date" value={form.valuation_date} onChange={e => setForm(f => ({ ...f, valuation_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input data-testid="input-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-submit-position"
              disabled={!form.company || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending ? "Saving…" : "Add Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
