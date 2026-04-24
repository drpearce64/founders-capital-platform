import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Shield, CheckCircle2, DollarSign, AlertTriangle, Mail, Trash2, Edit3 } from "lucide-react";

const ACTION_STYLES: Record<string, any> = {
  create:        { bg: "hsl(142 71% 42% / 0.12)", color: "hsl(142 71% 55%)", icon: CheckCircle2 },
  update:        { bg: "hsl(213 94% 62% / 0.12)", color: "hsl(213 94% 62%)", icon: Edit3 },
  issue:         { bg: "hsl(213 94% 62% / 0.12)", color: "hsl(213 94% 62%)", icon: CheckCircle2 },
  mark_received: { bg: "hsl(142 71% 42% / 0.12)", color: "hsl(142 71% 55%)", icon: DollarSign },
  chase_sent:    { bg: "hsl(38 92% 52% / 0.12)",  color: "hsl(38 92% 60%)",  icon: Mail },
  delete:        { bg: "hsl(0 72% 55% / 0.12)",   color: "hsl(0 72% 60%)",   icon: Trash2 },
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const TABLE_LABELS: Record<string, string> = {
  entities: "SPV",
  investors: "LP",
  investor_commitments: "Commitment",
  capital_calls: "Capital Call",
  capital_call_items: "Call Item",
  investments: "Investment",
  distributions: "Distribution",
};

export default function AuditLog() {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-log"],
    queryFn: () => apiRequest("GET", "/api/audit-log?limit=100").then(r => r.json()),
    refetchInterval: 30000, // refresh every 30s
  });

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} style={{ color: "hsl(var(--primary))" }} />
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Audit Log</h1>
        </div>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Immutable record of all platform actions. Last 100 entries.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "hsl(var(--card))" }} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          No audit entries yet. Actions you take in the portal will appear here.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
          {logs.map((log: any, i: number) => {
            const style = ACTION_STYLES[log.action] ?? ACTION_STYLES.update;
            const Icon = style.icon;
            const tableLabel = TABLE_LABELS[log.table_name] ?? log.table_name;

            return (
              <div key={log.id}
                className="flex items-start gap-4 px-5 py-4"
                style={{
                  background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))",
                  borderBottom: i < logs.length - 1 ? "1px solid hsl(var(--border))" : "none",
                }}>
                {/* Icon */}
                <div className="mt-0.5 p-1.5 rounded-md shrink-0"
                  style={{ background: style.bg }}>
                  <Icon size={13} style={{ color: style.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: style.bg, color: style.color }}>
                      {log.action.replace("_", " ")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                      {tableLabel}
                    </span>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
                      {log.description}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {fmtTime(log.created_at)} · {log.actor}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
