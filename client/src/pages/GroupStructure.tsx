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
  Network,
  Plus,
  ChevronRight,
  ChevronDown,
  Building2,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Entity {
  id: string;
  name: string;
  short_code: string;
  entity_type: string;
  status: string;
  jurisdiction?: string;
  reporting_currency: string;
  parent_entity_id?: string;
}

interface EntityCost {
  id: string;
  entity_id: string;
  cost_date: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  fx_rate_to_usd: number;
  amount_usd: number;
  status: string;
  paid_date?: string;
  payment_reference?: string;
  is_recharged?: boolean;
  recharged_to_entity_id?: string;
  notes?: string;
}

interface CostSummary {
  entity_id: string;
  entity_name: string;
  short_code: string;
  entity_type: string;
  category: string;
  transaction_count: number;
  total_usd: number;
  accrued_usd: number;
  paid_usd: number;
  foreign_currencies: string[] | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);

const fmtSrc = (amount: number, currency: string) => {
  if (currency === "USD") return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const ENTITY_TYPE_META: Record<string, { label: string; color: string }> = {
  holding_uk:    { label: "UK Holdco",     color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  management_co: { label: "Management Co", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  holding_us:    { label: "US Holdco",     color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  gp_entity:     { label: "GP Entity",     color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  fund:          { label: "Fund",          color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  master:        { label: "Master LLC",    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  series_spv:    { label: "Series SPV",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
};

const CATEGORIES = ["legal", "formation", "advisory", "platform", "staffing", "travel", "other"];

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    accrued: { label: "Accrued", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    paid:    { label: "Paid",    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    void:    { label: "Void",    cls: "bg-gray-100 text-gray-400" },
  };
  const s = map[status] || map.accrued;
  return <Badge className={`${s.cls} border-0 font-medium text-xs`}>{s.label}</Badge>;
};

// ── Add Cost Dialog ────────────────────────────────────────────────────────────
function AddCostDialog({ entities, onClose }: { entities: Entity[]; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    entity_id: "",
    cost_date: new Date().toISOString().slice(0, 10),
    description: "",
    category: "legal",
    amount: "",
    currency: "USD",
    fx_rate_to_usd: "1.0",
    status: "accrued",
    notes: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Auto-set FX rate when currency changes
  const handleCurrencyChange = (v: string) => {
    set("currency", v);
    if (v === "USD") set("fx_rate_to_usd", "1.0");
  };

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/entity-costs", {
      ...form,
      amount: parseFloat(form.amount) || 0,
      fx_rate_to_usd: parseFloat(form.fx_rate_to_usd) || 1.0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs/summary"] });
      toast({ title: "Cost entry added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // US-reporting entities only (exclude UK holdco)
  const usEntities = entities.filter(e => e.reporting_currency === "USD" || e.short_code !== "FC-GROUP-HOLDING");

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Entity *</Label>
          <Select value={form.entity_id} onValueChange={v => set("entity_id", v)}>
            <SelectTrigger data-testid="select-entity"><SelectValue placeholder="Select entity…" /></SelectTrigger>
            <SelectContent>
              {usEntities.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} <span className="text-muted-foreground text-xs ml-1">({e.short_code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 col-span-2">
          <Label>Description *</Label>
          <Input placeholder="e.g. Delaware formation filing fee" value={form.description} onChange={e => set("description", e.target.value)} data-testid="input-cost-description" />
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={v => set("category", v)}>
            <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={form.cost_date} onChange={e => set("cost_date", e.target.value)} data-testid="input-cost-date" />
        </div>

        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input type="number" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} data-testid="input-cost-amount" />
        </div>

        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={handleCurrencyChange}>
            <SelectTrigger data-testid="select-cost-currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.currency !== "USD" && (
          <div className="space-y-2 col-span-2">
            <Label>FX Rate to USD <span className="text-muted-foreground text-xs">(1 {form.currency} = ? USD)</span></Label>
            <Input type="number" step="0.0001" placeholder="e.g. 1.27" value={form.fx_rate_to_usd} onChange={e => set("fx_rate_to_usd", e.target.value)} data-testid="input-fx-rate" />
            {form.amount && form.fx_rate_to_usd && (
              <p className="text-xs text-muted-foreground">
                USD equivalent: {fmt(parseFloat(form.amount) * parseFloat(form.fx_rate_to_usd))}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger data-testid="select-cost-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accrued">Accrued</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 col-span-2">
          <Label>Notes</Label>
          <Input placeholder="Optional notes" value={form.notes} onChange={e => set("notes", e.target.value)} data-testid="input-cost-notes" />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.entity_id || !form.description || !form.amount}
          className="flex-1"
          data-testid="button-save-cost"
        >
          {mutation.isPending ? "Saving…" : "Add Cost"}
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}

// ── Entity Tree Node ──────────────────────────────────────────────────────────
function EntityNode({
  entity,
  allEntities,
  costsByEntity,
  depth,
  selectedId,
  onSelect,
}: {
  entity: Entity;
  allEntities: Entity[];
  costsByEntity: Record<string, CostSummary[]>;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = allEntities.filter(e => e.parent_entity_id === entity.id);
  const costs = costsByEntity[entity.id] || [];
  const totalUsd = costs.reduce((s, c) => s + (c.total_usd || 0), 0);
  const accruedUsd = costs.reduce((s, c) => s + (c.accrued_usd || 0), 0);
  const meta = ENTITY_TYPE_META[entity.entity_type] || { label: entity.entity_type, color: "bg-gray-100 text-gray-600" };
  const isSelected = selectedId === entity.id;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => onSelect(entity.id)}
        data-testid={`entity-node-${entity.short_code}`}
      >
        <button
          onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
          className="text-muted-foreground w-4 flex-shrink-0"
        >
          {children.length > 0
            ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
            : <span className="h-3.5 w-3.5 block" />}
        </button>
        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{entity.name}</span>
            <Badge className={`${meta.color} border-0 text-xs font-medium flex-shrink-0`}>{meta.label}</Badge>
            {entity.jurisdiction && (
              <span className="text-xs text-muted-foreground flex-shrink-0">{entity.jurisdiction}</span>
            )}
          </div>
        </div>
        {totalUsd > 0 && (
          <div className="text-right flex-shrink-0 ml-2">
            <div className="text-xs font-semibold text-foreground">{fmt(totalUsd)}</div>
            {accruedUsd > 0 && <div className="text-xs text-amber-600">{fmt(accruedUsd)} accrued</div>}
          </div>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div>
          {children.map(child => (
            <EntityNode
              key={child.id}
              entity={child}
              allEntities={allEntities}
              costsByEntity={costsByEntity}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function GroupStructure() {
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const { toast } = useToast();

  const { data: entities = [], isLoading: loadingEntities } = useQuery<Entity[]>({
    queryKey: ["/api/entities-full"],
  });

  const { data: costs = [], isLoading: loadingCosts } = useQuery<EntityCost[]>({
    queryKey: ["/api/entity-costs"],
  });

  const { data: summary = [] } = useQuery<CostSummary[]>({
    queryKey: ["/api/entity-costs/summary"],
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, paidDate }: { id: string; paidDate: string }) =>
      apiRequest("PATCH", `/api/entity-costs/${id}`, { status: "paid", paid_date: paidDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entity-costs/summary"] });
      toast({ title: "Cost marked as paid" });
    },
  });

  // Group summary by entity_id
  const costsByEntity: Record<string, CostSummary[]> = {};
  for (const row of summary) {
    if (!costsByEntity[row.entity_id]) costsByEntity[row.entity_id] = [];
    costsByEntity[row.entity_id].push(row);
  }

  // Root entities (no parent, or parent is UK holdco which we don't drill into)
  const rootEntities = entities.filter(e =>
    !e.parent_entity_id ||
    entities.find(p => p.id === e.parent_entity_id)?.entity_type === "holding_uk"
  ).filter(e => e.entity_type !== "holding_uk");

  // Selected entity detail
  const selectedEntity = entities.find(e => e.id === selectedEntityId);
  const entityCosts = costs.filter(c =>
    c.entity_id === selectedEntityId &&
    (filterCategory === "all" || c.category === filterCategory)
  );

  // KPIs across all US entities
  const allUsEntities = entities.filter(e => e.entity_type !== "holding_uk");
  const totalUsdYtd = summary
    .filter(s => allUsEntities.some(e => e.id === s.entity_id))
    .reduce((s, r) => s + (r.total_usd || 0), 0);
  const totalAccrued = summary
    .filter(s => allUsEntities.some(e => e.id === s.entity_id))
    .reduce((s, r) => s + (r.accrued_usd || 0), 0);
  const totalPaid = summary
    .filter(s => allUsEntities.some(e => e.id === s.entity_id))
    .reduce((s, r) => s + (r.paid_usd || 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Group Structure
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            US entity hierarchy — costs &amp; P&amp;L by entity, reported in USD
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-cost-open">
              <Plus className="h-4 w-4" /> Add Cost
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Cost Entry</DialogTitle></DialogHeader>
            <AddCostDialog entities={entities} onClose={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Costs (USD)</p>
                <p className="text-2xl font-bold mt-1">{fmt(totalUsdYtd)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">All US entities</p>
              </div>
              <DollarSign className="h-5 w-5 text-primary mt-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Accrued</p>
                <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{fmt(totalAccrued)}</p>
              </div>
              <Clock className="h-5 w-5 text-amber-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Paid</p>
                <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{fmt(totalPaid)}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-panel layout: tree + detail */}
      <div className="grid grid-cols-5 gap-4">
        {/* Entity Tree */}
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Entity Hierarchy</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingEntities ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : rootEntities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No entities found</p>
            ) : (
              <div className="space-y-0.5">
                {rootEntities.map(e => (
                  <EntityNode
                    key={e.id}
                    entity={e}
                    allEntities={entities}
                    costsByEntity={costsByEntity}
                    depth={0}
                    selectedId={selectedEntityId}
                    onSelect={setSelectedEntityId}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Detail */}
        <Card className="col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold">
                {selectedEntity ? (
                  <span>{selectedEntity.name} — Costs</span>
                ) : (
                  <span className="text-muted-foreground font-normal">Select an entity to view costs</span>
                )}
              </CardTitle>
              {selectedEntity && (
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-7 w-36 text-xs" data-testid="select-filter-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedEntity ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Network className="h-12 w-12 mb-3 opacity-15" />
                <p className="text-sm">Click an entity in the tree to see its costs</p>
              </div>
            ) : loadingCosts ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : entityCosts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-sm">No costs recorded for this entity yet</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add first cost
                </Button>
              </div>
            ) : (
              <>
                {/* Category summary */}
                {(() => {
                  const byCat: Record<string, number> = {};
                  entityCosts.forEach(c => { byCat[c.category] = (byCat[c.category] || 0) + c.amount_usd; });
                  return Object.keys(byCat).length > 1 ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(byCat).map(([cat, total]) => (
                        <span key={cat} className="text-xs bg-muted rounded-full px-2.5 py-1 font-medium">
                          {cat}: {fmt(total)}
                        </span>
                      ))}
                    </div>
                  ) : null;
                })()}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Source</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entityCosts.map(cost => (
                      <TableRow key={cost.id} data-testid={`cost-row-${cost.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(cost.cost_date)}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{cost.description}</TableCell>
                        <TableCell>
                          <span className="text-xs capitalize text-muted-foreground">{cost.category}</span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {cost.currency !== "USD" ? (
                            <span className="text-muted-foreground text-xs">
                              {fmtSrc(cost.amount, cost.currency)}
                              <span className="block text-xs opacity-60">@ {cost.fx_rate_to_usd}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">{fmt(cost.amount_usd)}</TableCell>
                        <TableCell>
                          {cost.status === "accrued" ? (
                            <button
                              className="text-xs text-amber-600 hover:underline"
                              onClick={() => markPaidMutation.mutate({
                                id: cost.id,
                                paidDate: new Date().toISOString().slice(0, 10),
                              })}
                              data-testid={`mark-paid-cost-${cost.id}`}
                            >
                              Mark paid
                            </button>
                          ) : statusBadge(cost.status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Entity total */}
                <div className="mt-3 pt-3 border-t flex justify-between text-sm font-semibold">
                  <span>Total ({filterCategory === "all" ? "all categories" : filterCategory})</span>
                  <span>{fmt(entityCosts.reduce((s, c) => s + c.amount_usd, 0))}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cross-entity cost summary table */}
      {summary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cost Summary by Entity &amp; Category (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-right">Accrued</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>FX Currencies</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary
                  .filter(r => entities.find(e => e.id === r.entity_id)?.entity_type !== "holding_uk")
                  .map((row, idx) => {
                    const meta = ENTITY_TYPE_META[row.entity_type] || { label: row.entity_type, color: "bg-gray-100 text-gray-600" };
                    return (
                      <TableRow key={idx} data-testid={`summary-row-${row.entity_id}-${row.category}`}>
                        <TableCell className="text-sm font-medium">{row.entity_name}</TableCell>
                        <TableCell><Badge className={`${meta.color} border-0 text-xs`}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">{row.category}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{fmt(row.total_usd)}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600">{fmt(row.accrued_usd)}</TableCell>
                        <TableCell className="text-right text-sm text-green-600">{fmt(row.paid_usd)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.foreign_currencies?.length ? row.foreign_currencies.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{row.transaction_count}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
