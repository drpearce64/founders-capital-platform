import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, AlertTriangle, Clock, Database, Users, Building2, TrendingUp } from "lucide-react";

interface SyncStatus {
  synced_at?: string;
  detail?: string;
  status?: string;
}

interface SyncLogEntry {
  id: string;
  synced_at: string;
  table_name: string;
  airtable_record_id: string | null;
  action: string;
  status: string;
  detail: string | null;
}

interface SyncSummary {
  elapsed_seconds: number;
  investors:   { upserted: number; skipped: number; errors: number };
  entities:    { upserted: number; skipped: number; errors: number };
  investments: { upserted: number; errors: number };
  commitments: { upserted: number; skipped: number; errors: number };
}

function parseDetail(detail: string | null | undefined): SyncSummary | null {
  if (!detail) return null;
  try { return JSON.parse(detail); } catch { return null; }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium", timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const isOk  = status === "ok";
  const isWarn = status === "warning";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        background: isOk ? "hsl(103 56% 31% / 0.12)" : isWarn ? "hsl(38 92% 52% / 0.12)" : "hsl(0 72% 51% / 0.12)",
        color:      isOk ? "hsl(103 56% 25%)"         : isWarn ? "hsl(38 80% 35%)"         : "hsl(0 72% 40%)",
      }}
    >
      {isOk ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
      {status}
    </span>
  );
}

export default function AirtableSync() {
  const queryClient = useQueryClient();
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  // Last sync summary
  const { data: lastSync, isLoading: statusLoading } = useQuery<SyncStatus>({
    queryKey: ["/api/sync/airtable/status"],
    refetchInterval: 30_000,
  });

  // Recent log entries (errors + warnings only for the table)
  const { data: log = [], isLoading: logLoading } = useQuery<SyncLogEntry[]>({
    queryKey: ["/api/sync/airtable/log"],
    select: (rows) => rows.filter(r => r.status !== "ok" || r.action === "sync_complete"),
    refetchInterval: 30_000,
  });

  // Manual trigger
  const trigger = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sync/airtable"),
    onSuccess: () => {
      setTriggerMsg("Sync started — this takes about 30–60 seconds. Refresh the status below.");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/sync/airtable/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/sync/airtable/log"] });
      }, 75_000);
    },
    onError: (err: any) => setTriggerMsg(`Error: ${err.message}`),
  });

  const summary = parseDetail(lastSync?.detail);

  const statCards = summary ? [
    { label: "Investors synced",   value: summary.investors.upserted,   icon: Users,      errors: summary.investors.errors },
    { label: "SPV entities",       value: summary.entities.upserted,    icon: Building2,  errors: summary.entities.errors },
    { label: "Investments",        value: summary.investments.upserted, icon: TrendingUp, errors: summary.investments.errors },
    { label: "Commitments synced", value: summary.commitments.upserted, icon: Database,   errors: summary.commitments.errors },
  ] : [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Airtable Sync
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Nightly sync from Airtable → Supabase. Runs automatically at midnight BST.
          </p>
        </div>
        <button
          data-testid="button-trigger-sync"
          onClick={() => { setTriggerMsg(null); trigger.mutate(); }}
          disabled={trigger.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity"
          style={{ background: "hsl(var(--primary))", opacity: trigger.isPending ? 0.6 : 1 }}
        >
          <RefreshCw size={14} className={trigger.isPending ? "animate-spin" : ""} />
          {trigger.isPending ? "Starting…" : "Run now"}
        </button>
      </div>

      {triggerMsg && (
        <div
          className="text-sm px-4 py-3 rounded-md"
          style={{ background: "hsl(231 70% 54% / 0.08)", color: "hsl(231 70% 40%)", border: "1px solid hsl(231 70% 54% / 0.2)" }}
        >
          {triggerMsg}
        </div>
      )}

      {/* Last sync status */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
          <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>Last sync</span>
        </div>

        {statusLoading ? (
          <div className="h-4 w-40 rounded animate-pulse" style={{ background: "hsl(var(--muted))" }} />
        ) : lastSync?.synced_at ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {formatDate(lastSync.synced_at)}
              </span>
              {summary && (
                <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  · completed in {summary.elapsed_seconds}s
                </span>
              )}
            </div>

            {/* Stat cards */}
            {statCards.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map(({ label, value, icon: Icon, errors }) => (
                  <div
                    key={label}
                    className="rounded-md p-3"
                    style={{ background: "hsl(var(--muted))" }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} style={{ color: "hsl(var(--muted-foreground))" }} />
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
                    </div>
                    <div className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {value}
                    </div>
                    {errors > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: "hsl(0 72% 45%)" }}>
                        {errors} error{errors !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            No sync has run yet. Click <strong>Run now</strong> to trigger the first sync, or wait for tonight's automatic run at midnight BST.
          </p>
        )}
      </div>

      {/* What gets synced */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "hsl(var(--foreground))" }}>
          What gets synced
        </h2>
        <div className="space-y-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {[
            { from: "Members",     to: "investors",             note: "Full name, email, phone, KYC status. Rejected members are skipped." },
            { from: "Deals",       to: "entities + investments", note: "Each FC deal becomes an SPV entity + investment. Carries valuation, fee & carry rates." },
            { from: "Commitments", to: "investor_commitments",  note: "Maps each commitment to the right investor and SPV. Reflects funded/called/committed status." },
          ].map(({ from, to, note }) => (
            <div key={from} className="flex gap-3 py-2 border-b last:border-0" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="w-28 shrink-0">
                <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{from}</span>
                <span className="text-xs block" style={{ color: "hsl(var(--muted-foreground))" }}>Airtable</span>
              </div>
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>→</div>
              <div className="flex-1">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                  {to}
                </span>
                <p className="mt-1 text-xs">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent issues log */}
      <div
        className="rounded-lg border p-4"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "hsl(var(--foreground))" }}>
          Recent issues
        </h2>
        {logLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-4 rounded animate-pulse" style={{ background: "hsl(var(--muted))" }} />)}
          </div>
        ) : log.filter(r => r.status !== "ok").length === 0 ? (
          <p className="text-sm flex items-center gap-2" style={{ color: "hsl(var(--muted-foreground))" }}>
            <CheckCircle size={14} style={{ color: "hsl(103 56% 31%)" }} />
            No errors or warnings from recent syncs.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "hsl(var(--muted-foreground))" }}>
                  <th className="text-left pb-2 font-medium">Time</th>
                  <th className="text-left pb-2 font-medium">Table</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-left pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.filter(r => r.status !== "ok").map(entry => (
                  <tr key={entry.id} className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
                    <td className="py-1.5 pr-4 whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {formatDate(entry.synced_at)}
                    </td>
                    <td className="py-1.5 pr-4 font-mono" style={{ color: "hsl(var(--foreground))" }}>
                      {entry.table_name}
                    </td>
                    <td className="py-1.5 pr-4">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="py-1.5" style={{ color: "hsl(var(--muted-foreground))", maxWidth: "300px" }}>
                      <span className="truncate block">{entry.detail ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
