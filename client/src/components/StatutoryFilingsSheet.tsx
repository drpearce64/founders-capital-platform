import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardList, CheckCheck, Clock, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface StatutoryFiling {
  id: string;
  seq_no: number | null;
  filing_name: string;
  authority: string | null;
  frequency: string | null;
  applies_to: string | null;
  statutory_due: string | null;
  internal_target: string | null;
  status: string;
  date_completed: string | null;
  owner: string | null;
  adviser: string | null;
  reference_no: string | null;
  evidence_link: string | null;
  notes: string | null;
  days_to_due: number | null;
  alert: string | null;
}

interface StatutoryFilingsSummary {
  total: number;
  overdue: number;
  due_in_90d: number;
  outstanding: number;
  next_due: string | null;
}

export function StatutoryFilingsSheet({
  entityId,
  entityName,
  onClose,
}: {
  entityId: string | null;
  entityName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ summary: StatutoryFilingsSummary; filings: StatutoryFiling[] }>({
    queryKey: ["statutory-filings", entityId],
    queryFn: () => apiRequest("GET", `/api/statutory-filings/${entityId}`).then(r => r.json()),
    enabled: !!entityId,
  });

  const summary = data?.summary;
  const filings = data?.filings ?? [];

  function alertStyle(alert: string | null, status: string) {
    if (status === "Filed / Complete") return { color: "hsl(142 70% 45%)", bg: "hsl(142 70% 45% / 0.1)" };
    if (status === "Not Applicable")   return { color: "hsl(var(--muted-foreground))", bg: "transparent" };
    if (alert === "OVERDUE")           return { color: "hsl(0 72% 51%)", bg: "hsl(0 72% 51% / 0.1)" };
    if (alert === "Due in 30d")        return { color: "hsl(38 92% 50%)", bg: "hsl(38 92% 50% / 0.1)" };
    if (alert === "Due in 90d")        return { color: "hsl(45 93% 47%)", bg: "hsl(45 93% 47% / 0.1)" };
    return { color: "hsl(var(--muted-foreground))", bg: "transparent" };
  }

  function statusLabel(status: string) {
    if (status === "Filed / Complete") return "✓ Filed";
    if (status === "Not Applicable")   return "N/A";
    if (status === "In Progress")      return "In Progress";
    return "Not Started";
  }

  return (
    <Sheet open={!!entityId} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[680px] sm:max-w-[680px] overflow-y-auto">
        <SheetHeader className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList size={16} style={{ color: "hsl(231 70% 60%)" }} />
            <span className="text-xs font-medium" style={{ color: "hsl(231 70% 60%)" }}>STATUTORY FILINGS</span>
          </div>
          <SheetTitle className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            {entityName}
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-8 rounded" style={{ background: "hsl(var(--muted))" }} />)}
          </div>
        )}

        {!isLoading && summary && (
          <>
            {/* Summary KPI row */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {([
                { label: "Total",       value: summary.total,       icon: <ClipboardList size={13} />, color: "hsl(var(--muted-foreground))" },
                { label: "Overdue",     value: summary.overdue,     icon: <AlertTriangle size={13} />, color: summary.overdue > 0 ? "hsl(0 72% 51%)" : "hsl(var(--muted-foreground))" },
                { label: "Due 90d",     value: summary.due_in_90d,  icon: <Clock size={13} />,         color: summary.due_in_90d > 0 ? "hsl(38 92% 50%)" : "hsl(var(--muted-foreground))" },
                { label: "Outstanding", value: summary.outstanding, icon: <CheckCheck size={13} />,    color: summary.outstanding > 0 ? "hsl(231 70% 60%)" : "hsl(142 70% 45%)" },
              ] as const).map(k => (
                <div key={k.label} className="rounded-lg p-3 text-center" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                  <div className="flex items-center justify-center gap-1 mb-1" style={{ color: k.color }}>
                    {k.icon}
                    <span className="text-xs font-medium">{k.label}</span>
                  </div>
                  <div className="text-xl font-bold" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            {summary.next_due && (
              <div className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                Next due: <span style={{ color: "hsl(var(--foreground))" }}>
                  {new Date(summary.next_due).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            )}

            {/* Filings table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    {["#", "Filing / Obligation", "Authority", "Due Date", "Status"].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-medium" style={{ color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filings.map((f, idx) => {
                    const { color, bg } = alertStyle(f.alert, f.status);
                    return (
                      <tr
                        key={f.id}
                        style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)", background: idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.2)" }}
                      >
                        <td className="px-2 py-2 font-mono" style={{ color: "hsl(var(--muted-foreground))", minWidth: 24 }}>{f.seq_no}</td>
                        <td className="px-2 py-2" style={{ color: "hsl(var(--foreground))", maxWidth: 240 }}>
                          <div>{f.filing_name}</div>
                          {f.notes && (
                            <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>{f.notes}</div>
                          )}
                        </td>
                        <td className="px-2 py-2" style={{ color: "hsl(var(--muted-foreground))", maxWidth: 160 }}>{f.authority}</td>
                        <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ color: f.statutory_due ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                          {f.statutory_due
                            ? new Date(f.statutory_due).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                          {f.alert && f.status !== "Filed / Complete" && f.status !== "Not Applicable" && (
                            <div className="mt-0.5 text-xs px-1.5 py-0.5 rounded inline-block" style={{ background: bg, color }}>
                              {f.alert === "OVERDUE" ? `${Math.abs(f.days_to_due!)}d overdue` : f.alert}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: bg, color }}>
                            {statusLabel(f.status)}
                          </span>
                          {f.date_completed && (
                            <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {new Date(f.date_completed).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 px-3 py-2 rounded text-xs" style={{ background: "hsl(var(--muted) / 0.4)", color: "hsl(var(--muted-foreground))" }}>
              ⚠ Pre-populated list is a draft — verify all items with your registered agent, counsel, auditor and US tax adviser.
            </div>
          </>
        )}

        {!isLoading && filings.length === 0 && (
          <p className="text-xs mt-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>
            No filings found for this entity.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
