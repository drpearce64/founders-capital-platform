import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Mismatch {
  group: string;
  record_key: string;
  field: string;
  label: string;
  airtable_val: string | number | null;
  supabase_val: string | number | null;
  pct_diff: number | null;
  severity: "critical" | "warning";
}

interface GroupSummary {
  name: string;
  records_checked: number;
  fields_checked: number;
  mismatches: number;
}

interface IntegrityReport {
  run_at: string;
  duration_ms: number;
  mismatches: Mismatch[];
  group_summaries: GroupSummary[];
  summary: {
    total_records_checked: number;
    total_fields_checked: number;
    mismatch_count: number;
    ok_count: number;
    critical_count: number;
    warning_count: number;
  };
}

interface StatusRecord {
  action: "ok" | "mismatch" | "no_check_yet";
  description: string;
  created_at?: string;
  new_values?: {
    mismatch_count: number;
    critical_count: number;
    warning_count: number;
    total_records: number;
    mismatches?: Mismatch[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVal(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return String(v) || "—";
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent?: "green" | "amber" | "red" | "blue" }) {
  const colours = {
    green: { bg: "#f0fdf4", border: "#bbf7d0", value: "#15803d" },
    amber: { bg: "#fffbeb", border: "#fde68a", value: "#b45309" },
    red:   { bg: "#fef2f2", border: "#fecaca", value: "#b91c1c" },
    blue:  { bg: "#eff6ff", border: "#bfdbfe", value: "#1d4ed8" },
  };
  const c = colours[accent ?? "blue"];
  return (
    <div
      className="rounded-lg px-5 py-4 border"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono" style={{ color: c.value }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DataIntegrity() {
  const queryClient = useQueryClient();
  const [liveReport, setLiveReport] = useState<IntegrityReport | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Last persisted status (fast — reads audit_log only)
  const { data: status, isLoading: statusLoading } = useQuery<StatusRecord>({
    queryKey: ["/api/integrity/status"],
    queryFn: () => apiRequest("GET", "/api/integrity/status").then(r => r.json()),
    refetchInterval: 60_000,
  });

  // Trigger a fresh run (~30s)
  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/integrity/run").then(r => r.json()),
    onSuccess: (data: IntegrityReport) => {
      setLiveReport(data);
      setActiveGroup(null);
      queryClient.invalidateQueries({ queryKey: ["/api/integrity/status"] });
    },
  });

  const report = liveReport;
  const hasReport = !!report;

  // Use status for the last-run summary when no live report yet
  const lastRunAt = report?.run_at ?? status?.created_at;
  const mismatchCount = report?.summary.mismatch_count ?? status?.new_values?.mismatch_count ?? null;
  const criticalCount = report?.summary.critical_count ?? status?.new_values?.critical_count ?? null;
  const warningCount  = report?.summary.warning_count  ?? status?.new_values?.warning_count  ?? null;
  const totalRecords  = report?.summary.total_records_checked ?? status?.new_values?.total_records ?? null;

  const overallOk =
    status?.action === "no_check_yet" ? null :
    (mismatchCount !== null && mismatchCount === 0) ? true : false;

  // Filtered mismatches for active group
  const displayedMismatches = report
    ? (activeGroup
        ? report.mismatches.filter(m => m.group === activeGroup)
        : report.mismatches)
    : (status?.new_values?.mismatches ?? []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Integrity</h1>
            <p className="text-sm text-gray-500">
              Airtable ↔ Supabase field-level reconciliation across all portal data paths
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRunAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Last run: {fmtDate(lastRunAt)}
              {report && ` (${fmtDuration(report.duration_ms)})`}
            </div>
          )}
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
            {runMutation.isPending ? "Checking…" : "Run check now"}
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {runMutation.isPending && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
          <div>
            <p className="font-medium text-indigo-800">Integrity check running…</p>
            <p className="text-xs text-indigo-600">
              Fetching from Airtable and comparing against Supabase. This takes ~30–60 seconds.
            </p>
          </div>
        </div>
      )}

      {!runMutation.isPending && overallOk === true && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800">All checks passed</p>
            <p className="text-xs text-green-600">
              {totalRecords?.toLocaleString()} records checked — no mismatches detected across all data paths.
            </p>
          </div>
        </div>
      )}

      {!runMutation.isPending && overallOk === false && mismatchCount !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">
              {mismatchCount} mismatch{mismatchCount !== 1 ? "es" : ""} detected
            </p>
            <p className="text-xs text-red-600">
              {criticalCount} critical · {warningCount} warning.{" "}
              Review the table below and re-run the Airtable sync if needed.
            </p>
          </div>
        </div>
      )}

      {!runMutation.isPending && overallOk === null && !statusLoading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 flex items-center gap-3">
          <Info className="h-5 w-5 text-gray-500" />
          <p className="text-sm text-gray-600">
            No check has run yet. Click <strong>Run check now</strong> to perform the first integrity check.
            Checks also run automatically daily at 08:00 BST.
          </p>
        </div>
      )}

      {/* KPIs */}
      {(hasReport || status?.new_values) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Records checked"
            value={(totalRecords ?? 0).toLocaleString()}
            accent="blue"
          />
          <KpiCard
            label="Fields OK"
            value={(report?.summary.ok_count ?? 0).toLocaleString()}
            accent="green"
          />
          <KpiCard
            label="Critical"
            value={criticalCount ?? 0}
            sub="exact-match failures"
            accent={criticalCount ? "red" : "green"}
          />
          <KpiCard
            label="Warnings"
            value={warningCount ?? 0}
            sub=">1% numeric drift"
            accent={warningCount ? "amber" : "green"}
          />
        </div>
      )}

      {/* Group summary (only from live report) */}
      {report && report.group_summaries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Check groups</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Fields</TableHead>
                  <TableHead className="text-right">Mismatches</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.group_summaries.map(g => (
                  <TableRow
                    key={g.name}
                    className={`cursor-pointer ${activeGroup === g.name ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                    onClick={() => setActiveGroup(activeGroup === g.name ? null : g.name)}
                  >
                    <TableCell className="font-medium text-sm">{g.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{g.records_checked.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{g.fields_checked.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {g.mismatches > 0 ? (
                        <span className="text-red-600 font-semibold">{g.mismatches}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {g.mismatches === 0 ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" /> {g.mismatches} issue{g.mismatches !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {activeGroup && (
              <p className="px-4 py-2 text-xs text-indigo-600 bg-indigo-50 border-t">
                Showing mismatches for <strong>{activeGroup}</strong> only — click the row again to clear filter
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mismatch detail table */}
      {displayedMismatches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Mismatches
              {activeGroup && (
                <span className="text-sm font-normal text-gray-500">— {activeGroup}</span>
              )}
              <Badge variant="outline" className="ml-auto text-xs">
                {displayedMismatches.length} item{displayedMismatches.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Group</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead className="text-right">Airtable</TableHead>
                    <TableHead className="text-right">Supabase</TableHead>
                    <TableHead className="text-right">Δ%</TableHead>
                    <TableHead className="text-center">Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedMismatches.map((m, i) => (
                    <TableRow key={i} className={m.severity === "critical" ? "bg-red-50/40" : "bg-amber-50/30"}>
                      <TableCell className="text-xs text-gray-500 max-w-[120px] truncate">{m.group}</TableCell>
                      <TableCell className="font-mono text-xs font-medium">{m.record_key}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{m.label}</div>
                        <div className="text-gray-400 font-mono">{m.field}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-indigo-700">
                        {fmtVal(m.airtable_val)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-600">
                        {fmtVal(m.supabase_val)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {m.pct_diff == null ? "—"
                          : !isFinite(m.pct_diff) ? "∞"
                          : `${m.pct_diff.toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="text-center">
                        {m.severity === "critical" ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            Critical
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Warning
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coverage note */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-5 py-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 mb-1">Coverage</p>
        <p>✓ <strong>Deals → entities</strong> — fund size, allocation, funds received, USD value, carry rate, fee rate</p>
        <p>✓ <strong>Deals → investments</strong> — cost basis, fair value, company name, investment date</p>
        <p>✓ <strong>Members → investors</strong> — full name, location</p>
        <p>✓ <strong>Commitments → investor_commitments</strong> — committed amount, funded amount</p>
        <p>✓ <strong>YC Deals → yc_deals</strong> — FC investment, USD value, total committed, live market value, status, closing date</p>
        <p className="pt-1 text-gray-400">
          FC Investments page reads Airtable directly on every request — no sync drift possible, excluded from checks.
          Runs automatically daily at 08:00 BST (after the 06:00 UTC nightly sync).
        </p>
      </div>
    </div>
  );
}
