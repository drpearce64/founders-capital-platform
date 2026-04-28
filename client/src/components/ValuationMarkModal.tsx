/**
 * ValuationMarkModal
 * ------------------
 * A Sheet-based panel that shows:
 *   1. Full audit-trail history of all past marks (reverse-chron)
 *   2. A form to add a new valuation mark
 *
 * Usage:
 *   <ValuationMarkModal
 *     investment={inv}          // must have id, company_name, cost_basis, current_fair_value
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSaved={() => queryClient.invalidateQueries(...)}
 *   />
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";

// ── Types ────────────────────────────────────────────────────────────────────

interface Investment {
  id: string;
  company_name: string;
  cost_basis: number | string;
  current_fair_value?: number | string | null;
  fair_value_date?: string | null;
  valuation_basis?: string | null;
  entities?: { short_code?: string; name?: string };
}

interface ValuationMark {
  id: string;
  investment_id: string;
  mark_date: string;
  fair_value: number;
  valuation_basis: string;
  source_url?: string | null;
  source_description?: string | null;
  implied_valuation?: number | null;
  marked_by?: string | null;
  notes?: string | null;
  created_at: string;
}

interface Props {
  investment: Investment | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALUATION_BASES = [
  "Last Round Price",
  "Secondary Transaction",
  "409A / Independent Appraisal",
  "Public Comps",
  "Revenue Multiple",
  "DCF",
  "Mark-to-Market",
  "Write-down",
  "Write-off",
  "Cost",
  "Other",
];

const BASIS_COLORS: Record<string, string> = {
  "Last Round Price": "#3B5BDB",
  "Secondary Transaction": "#7950F2",
  "409A / Independent Appraisal": "#0CA678",
  "Public Comps": "#F59F00",
  "Revenue Multiple": "#1C7ED6",
  "DCF": "#E67700",
  "Mark-to-Market": "#2F9E44",
  "Write-down": "#FA5252",
  "Write-off": "#C92A2A",
  "Cost": "#868E96",
  "Other": "#868E96",
};

function fmtUsd(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ValuationMarkModal({ investment, open, onClose, onSaved }: Props) {
  const qc = useQueryClient();

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [markDate, setMarkDate] = useState(today);
  const [fairValue, setFairValue] = useState("");
  const [basis, setBasis] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDesc, setSourceDesc] = useState("");
  const [impliedVal, setImpliedVal] = useState("");
  const [markedBy, setMarkedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch history when open
  const { data: history = [], isLoading: histLoading, refetch } = useQuery<ValuationMark[]>({
    queryKey: ["/api/valuation-marks", investment?.id],
    queryFn: () =>
      apiRequest("GET", `/api/valuation-marks?investment_id=${investment!.id}`).then(r => r.json()),
    enabled: open && !!investment?.id,
  });

  function resetForm() {
    setMarkDate(today);
    setFairValue("");
    setBasis("");
    setSourceUrl("");
    setSourceDesc("");
    setImpliedVal("");
    setMarkedBy("");
    setNotes("");
    setError(null);
  }

  async function handleSave() {
    if (!investment) return;
    if (!fairValue || !basis || !markDate) {
      setError("Mark date, fair value and basis are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/valuation-marks", {
        investment_id: investment.id,
        mark_date: markDate,
        fair_value: parseFloat(fairValue.replace(/[,$]/g, "")),
        valuation_basis: basis,
        source_url: sourceUrl || null,
        source_description: sourceDesc || null,
        implied_valuation: impliedVal ? parseFloat(impliedVal.replace(/[,$]/g, "")) : null,
        marked_by: markedBy || null,
        notes: notes || null,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      resetForm();
      setShowForm(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["/api/investments"] });
      onSaved?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!investment) return null;

  const cost = parseFloat(String(investment.cost_basis || 0));
  const currentFV = parseFloat(String(investment.current_fair_value || cost));
  const moic = cost > 0 ? currentFV / cost : 1;
  const gain = currentFV - cost;
  const shortCode = investment.entities?.short_code?.replace("FC-", "") ?? "";

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) { onClose(); setShowForm(false); resetForm(); } }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden"
        style={{ background: "#F5F3EF", borderLeft: "1px solid hsl(var(--border))" }}
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold leading-tight" style={{ color: "#1A1209" }}>
                {investment.company_name}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {shortCode && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                    {shortCode}
                  </span>
                )}
                <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Cost: {fmtUsd(cost)}
                </span>
                <span className="text-xs font-mono font-medium" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                  FV: {fmtUsd(currentFV)} · {moic.toFixed(2)}x
                </span>
              </div>
            </div>
            {!investment._noInvestmentRecord && (
            <Button
              size="sm"
              onClick={() => { setShowForm(v => !v); setError(null); }}
              style={{ background: "#3B5BDB", color: "#fff", flexShrink: 0 }}
            >
              {showForm ? "Cancel" : "+ New Mark"}
            </Button>
            )}
            {investment._noInvestmentRecord && (
              <span className="text-[10px] px-2 py-1 rounded" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                No investment record
              </span>
            )}
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── New Mark Form ── */}
          {showForm && (
            <div className="px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))", background: "#fff" }}>
              <p className="text-sm font-semibold mb-3" style={{ color: "#1A1209" }}>Add Valuation Mark</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Mark Date *</Label>
                  <Input type="date" value={markDate} onChange={e => setMarkDate(e.target.value)}
                    className="h-8 text-sm font-mono" />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Fair Value (USD) *</Label>
                  <Input type="text" placeholder="e.g. 1250000" value={fairValue}
                    onChange={e => setFairValue(e.target.value)}
                    className="h-8 text-sm font-mono" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Valuation Basis *</Label>
                  <Select value={basis} onValueChange={setBasis}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select basis…" />
                    </SelectTrigger>
                    <SelectContent>
                      {VALUATION_BASES.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Implied Company Valuation (USD)</Label>
                  <Input type="text" placeholder="e.g. 2500000000" value={impliedVal}
                    onChange={e => setImpliedVal(e.target.value)}
                    className="h-8 text-sm font-mono" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Source URL</Label>
                  <Input type="url" placeholder="https://…" value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Source Description</Label>
                  <Input type="text" placeholder="e.g. Series C at $2.4bn led by a16z" value={sourceDesc}
                    onChange={e => setSourceDesc(e.target.value)}
                    className="h-8 text-sm" />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Marked By</Label>
                  <Input type="text" placeholder="e.g. David" value={markedBy}
                    onChange={e => setMarkedBy(e.target.value)}
                    className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "hsl(var(--muted-foreground))" }}>Notes</Label>
                  <Textarea placeholder="Any additional context…" value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="text-sm min-h-[60px] resize-none" />
                </div>
              </div>
              {error && (
                <p className="text-xs mt-2" style={{ color: "#FA5252" }}>{error}</p>
              )}
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleSave} disabled={saving}
                  style={{ background: "#3B5BDB", color: "#fff" }}>
                  {saving ? "Saving…" : "Save Mark"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── History ── */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3"
              style={{ color: "hsl(var(--muted-foreground))" }}>
              Valuation History
            </p>

            {histLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "hsl(var(--muted))" }} />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No valuation marks yet.</p>
                <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Click "+ New Mark" to record the first valuation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((mark, idx) => {
                  const prevFV = idx < history.length - 1 ? history[idx + 1].fair_value : cost;
                  const delta = mark.fair_value - prevFV;
                  const pct = prevFV > 0 ? (delta / prevFV) * 100 : 0;
                  const moicMark = cost > 0 ? mark.fair_value / cost : 1;
                  const color = BASIS_COLORS[mark.valuation_basis] ?? "#868E96";
                  const isLatest = idx === 0;

                  return (
                    <div key={mark.id}
                      className="rounded-lg p-3 border"
                      style={{
                        background: isLatest ? "#fff" : "transparent",
                        borderColor: isLatest ? color : "hsl(var(--border))",
                        borderLeftWidth: isLatest ? 3 : 1,
                      }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-medium" style={{ color: "#1A1209" }}>
                              {fmtDate(mark.mark_date)}
                            </span>
                            {isLatest && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: color + "20", color }}>
                                Latest
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: color + "15", color }}>
                              {mark.valuation_basis}
                            </span>
                          </div>
                          {mark.source_description && (
                            <p className="text-xs mt-1 leading-snug" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {mark.source_description}
                            </p>
                          )}
                          {mark.source_url && (
                            <a href={mark.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs underline mt-0.5 inline-block"
                              style={{ color: "#3B5BDB" }}>
                              Source ↗
                            </a>
                          )}
                          {mark.notes && (
                            <p className="text-xs mt-1 italic" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {mark.notes}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {mark.implied_valuation && (
                              <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                                Co. val: {fmtUsd(mark.implied_valuation)}
                              </span>
                            )}
                            {mark.marked_by && (
                              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                                by {mark.marked_by}
                              </span>
                            )}
                            <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                              logged {fmtDate(mark.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-mono font-semibold" style={{ color: "#1A1209" }}>
                            {fmtUsd(mark.fair_value)}
                          </p>
                          <p className="text-xs font-mono" style={{ color: gain >= 0 ? "#0CA678" : "#FA5252" }}>
                            {moicMark.toFixed(2)}x
                          </p>
                          {idx < history.length - 1 && (
                            <p className="text-[10px] font-mono mt-0.5"
                              style={{ color: delta >= 0 ? "#0CA678" : "#FA5252" }}>
                              {delta >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Cost basis anchor */}
                <div className="rounded-lg p-3 border" style={{ borderColor: "hsl(var(--border))", opacity: 0.6 }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Cost Basis (entry)
                      </span>
                    </div>
                    <p className="text-sm font-mono font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {fmtUsd(cost)} · 1.00x
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
