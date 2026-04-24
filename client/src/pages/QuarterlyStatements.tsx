import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Layers, ChevronRight, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const PERIODS = [
  "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026",
  "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025",
];

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtFull(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function vectorLabel(code: string) {
  return code?.replace("FC-", "") || code;
}

export default function QuarterlyStatements() {
  const { toast } = useToast();
  const [selectedLP, setSelectedLP] = useState<string>("");
  const [period, setPeriod] = useState("Q1 2026");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);

  const { data: investors = [], isLoading: loadingInvestors } = useQuery<any[]>({
    queryKey: ["/api/investors"],
    queryFn: () => apiRequest("GET", "/api/investors").then(r => r.json()),
  });

  // Preview for selected LP
  const { data: preview, isLoading: loadingPreview, error: previewError } = useQuery<any>({
    queryKey: ["/api/reports/quarterly-statement", selectedLP, "preview", period],
    queryFn: () => selectedLP
      ? apiRequest("GET", `/api/reports/quarterly-statement/${selectedLP}/preview?period=${encodeURIComponent(period)}`).then(r => r.json())
      : Promise.resolve(null),
    enabled: !!selectedLP,
  });

  // All commitments to find multi-Vector LPs for batch
  const { data: allCommitments = [] } = useQuery<any[]>({
    queryKey: ["/api/commitments"],
    queryFn: () => apiRequest("GET", "/api/commitments").then(r => r.json()),
  });

  const multiVectorIds = (() => {
    const counts: Record<string, number> = {};
    allCommitments.forEach((c: any) => {
      counts[c.investor_id] = (counts[c.investor_id] || 0) + 1;
    });
    return Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id);
  })();

  async function downloadStatement(investorId: string, lpName: string) {
    setDownloading(investorId);
    try {
      const res = await fetch(
        `/api/reports/quarterly-statement/${investorId}?period=${encodeURIComponent(period)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FC_Statement_${lpName.replace(/[^a-z0-9]/gi, "_")}_${period.replace(/\s/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Statement downloaded for ${lpName}` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  async function downloadAllMultiVector() {
    setBatchDownloading(true);
    let count = 0;
    for (const id of multiVectorIds) {
      const lp = investors.find((i: any) => i.id === id);
      if (!lp) continue;
      await downloadStatement(id, lp.full_name);
      count++;
      await new Promise(r => setTimeout(r, 500)); // stagger
    }
    setBatchDownloading(false);
    toast({ title: `${count} consolidated statements downloaded` });
  }

  const selectedLPData = investors.find((i: any) => i.id === selectedLP);
  const isMultiVector = preview?.totals?.position_count > 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Quarterly Statements</h1>
            <p className="text-sm text-gray-500">
              Generate capital account statements — consolidated for multi-Vector LPs
            </p>
          </div>
        </div>

        {multiVectorIds.length > 0 && (
          <button
            onClick={downloadAllMultiVector}
            disabled={batchDownloading}
            className="flex items-center gap-2 bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {batchDownloading ? "Generating…" : `All Multi-Vector (${multiVectorIds.length})`}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Generate Statement</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">LP / Investor</label>
            <select
              value={selectedLP}
              onChange={e => setSelectedLP(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Select LP…</option>
              {investors.map((inv: any) => {
                const isMulti = multiVectorIds.includes(inv.id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.full_name}{isMulti ? " ★" : ""}
                  </option>
                );
              })}
            </select>
            {multiVectorIds.length > 0 && (
              <p className="text-xs text-teal-600 mt-1">
                ★ = multi-Vector LP ({multiVectorIds.length} investors)
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => selectedLP && downloadStatement(selectedLP, selectedLPData?.full_name || "LP")}
              disabled={!selectedLP || !!downloading}
              className="w-full flex items-center justify-center gap-2 bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {downloading === selectedLP ? "Generating PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      {selectedLP && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Statement Preview</h2>
              <p className="text-xs text-gray-500 mt-0.5">{period}</p>
            </div>
            {isMultiVector && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs font-semibold">
                <Layers className="w-3.5 h-3.5" />
                Consolidated — {preview?.totals?.position_count} Vectors
              </span>
            )}
          </div>

          {loadingPreview ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading preview…</div>
          ) : previewError || !preview ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Could not load preview</p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* LP Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">LP Name</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{preview.investor.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm text-gray-700 mt-0.5">{preview.investor.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Investor Type</p>
                  <p className="text-sm text-gray-700 mt-0.5 capitalize">{preview.investor.investor_type?.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vectors</p>
                  <p className="text-sm font-semibold text-teal-700 mt-0.5">{preview.totals.position_count}</p>
                </div>
              </div>

              {/* Consolidated KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Committed", value: fmt(preview.totals.total_committed) },
                  { label: "Total Called", value: fmt(preview.totals.total_called) },
                  { label: "Outstanding", value: fmt(preview.totals.total_outstanding), warn: preview.totals.total_outstanding > 0 },
                  { label: "6% Fee", value: fmt(preview.totals.total_fee) },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-500">{kpi.label}</p>
                    <p className={`text-lg font-bold mt-0.5 font-mono ${kpi.warn ? "text-amber-600" : "text-gray-900"}`}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Per-Vector breakdown */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {isMultiVector ? "Positions — Included in Consolidated Statement" : "Position"}
                </p>
                <div className={`grid gap-3 ${isMultiVector ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                  {preview.positions.map((pos: any) => {
                    const committed = Number(pos.committed_amount);
                    const called = Number(pos.called_amount || 0);
                    const outstanding = committed - called;
                    const pct = committed > 0 ? (called / committed * 100) : 0;
                    const vLabel = vectorLabel(pos.short_code);

                    return (
                      <div key={pos.short_code} className="border border-gray-200 rounded-xl p-4 flex items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-xs font-bold rounded">
                              {vLabel}
                            </span>
                            {pos.company_name && (
                              <span className="text-xs text-blue-600 font-medium">{pos.company_name}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                            <div>
                              <p className="text-gray-500">Committed</p>
                              <p className="font-mono font-medium text-gray-900">{fmtFull(committed)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Called</p>
                              <p className="font-mono text-gray-700">{fmtFull(called)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Outstanding</p>
                              <p className={`font-mono ${outstanding > 0 ? "text-amber-600" : "text-gray-400"}`}>
                                {fmtFull(outstanding)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-600 rounded-full"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(0)}% called</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {isMultiVector && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
                  <Layers className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-teal-800">Consolidated statement</p>
                    <p className="text-xs text-teal-700 mt-0.5">
                      The downloaded PDF will include a consolidated capital account summary across all {preview.totals.position_count} Vectors,
                      followed by a detailed per-Vector section for each position. Series expenses and NAV marks are included where recorded.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Multi-Vector LP list */}
      {!selectedLP && multiVectorIds.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Multi-Vector LPs</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              These {multiVectorIds.length} investors hold positions in more than one Vector — their PDF will include a consolidated section
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">LP Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Vectors</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {multiVectorIds.map(id => {
                const lp = investors.find((i: any) => i.id === id);
                if (!lp) return null;
                const lpCommitments = allCommitments.filter((c: any) => c.investor_id === id);
                return (
                  <tr key={id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{lp.full_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lp.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {lpCommitments.map((c: any) => (
                          <span key={c.id} className="px-1.5 py-0.5 bg-teal-100 text-teal-800 text-xs font-medium rounded">
                            {vectorLabel(c.entities?.short_code)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => downloadStatement(id, lp.full_name)}
                        disabled={!!downloading}
                        className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-medium disabled:opacity-40"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloading === id ? "Generating…" : "Download"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
