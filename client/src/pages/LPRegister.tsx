import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtUSD } from "@/lib/utils";
import { Search, Users } from "lucide-react";

export default function LPRegister() {
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: commitments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/commitments", entityFilter],
    queryFn: () => {
      const q = entityFilter !== "all" ? `?entity_id=${entityFilter}` : "";
      return apiRequest("GET", `/api/commitments${q}`).then(r => r.json());
    },
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv" && e.short_code?.startsWith("FC-VECTOR"));

  const filtered = commitments.filter((c: any) => {
    // Delaware view: only show commitments to FC-VECTOR Series SPVs
    if (!c.entities?.short_code?.startsWith("FC-VECTOR")) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.investors?.full_name?.toLowerCase().includes(q) ||
      c.investors?.email?.toLowerCase().includes(q)
    );
  });

  // Use authoritative entity-level figures where available
  const selectedEntityData = entityFilter !== "all" ? spvs.find((e: any) => e.id === entityFilter) : null;
  const allVectorEntities = spvs; // already filtered to FC-VECTOR

  const totalCommitted = (() => {
    if (selectedEntityData) {
      const signed = parseFloat(selectedEntityData.vehicle_subscription_amount || 0);
      if (signed > 0) return signed;
    } else {
      const entitySum = allVectorEntities.reduce((s: number, e: any) => s + parseFloat(e.vehicle_subscription_amount || 0), 0);
      if (entitySum > 0) return entitySum;
    }
    return filtered.reduce((s: number, c: any) => s + Number(c.committed_amount), 0);
  })();

  const totalCalled = (() => {
    if (selectedEntityData) {
      const recv = parseFloat(selectedEntityData.funds_received || 0);
      if (recv > 0) return recv;
    } else {
      const entitySum = allVectorEntities.reduce((s: number, e: any) => s + parseFloat(e.funds_received || 0), 0);
      if (entitySum > 0) return entitySum;
    }
    return filtered.reduce((s: number, c: any) => s + Number(c.called_amount), 0);
  })();

  const outstanding = totalCommitted - totalCalled;

  const statusColor = (s: string) => {
    if (s === "active") return { bg: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" };
    if (s === "called") return { bg: "hsl(38 92% 52% / 0.15)", color: "hsl(38 92% 60%)" };
    return { bg: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" };
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>LP Register</h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {filtered.length} limited partners
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: selectedEntityData?.vehicle_subscription_amount ? "Vehicle Subscription (Signed)" : "Total Committed", value: fmtUSD(totalCommitted) },
          { label: "Funds Received", value: fmtUSD(totalCalled) },
          { label: "Outstanding", value: fmtUSD(outstanding) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border px-5 py-4"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
            <div className="text-lg font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }} />
          <input
            data-testid="input-search-lp"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          data-testid="select-spv-filter"
          className="px-3 py-2 rounded-lg text-sm border outline-none appearance-none"
          style={{ background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
        >
          <option value="all">All SPVs</option>
          {spvs.map((e: any) => {
            const inv = e.investments?.[0]?.company_name;
            return (
              <option key={e.id} value={e.id}>
                {e.short_code}{inv ? ` — ${inv}` : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                {["Name", "Email", "SPV", "Committed", "Called", "Outstanding", "Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                    style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: "hsl(var(--border))", width: "60%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No LPs found.
                  </td>
                </tr>
              ) : filtered.map((c: any, i: number) => {
                const sc = statusColor(c.status);
                const outstanding = Number(c.committed_amount) - Number(c.called_amount);
                return (
                  <tr key={c.id}
                    data-testid={`lp-row-${c.id}`}
                    style={{ borderBottom: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {c.investors?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs mono" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {c.investors?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{c.entities?.short_code ?? "—"}</span>
                        {(() => {
                          const spv = spvs.find((e: any) => e.id === c.entity_id);
                          const inv = spv?.investments?.[0]?.company_name;
                          return inv ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                              {inv}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right mono" style={{ color: "hsl(var(--foreground))" }}>
                      {fmtUSD(c.committed_amount)}
                    </td>
                    <td className="px-4 py-3 text-right mono" style={{ color: "hsl(var(--foreground))" }}>
                      {fmtUSD(c.called_amount)}
                    </td>
                    <td className="px-4 py-3 text-right mono"
                      style={{ color: outstanding > 0 ? "hsl(38 92% 60%)" : "hsl(var(--muted-foreground))" }}>
                      {outstanding > 0 ? fmtUSD(outstanding) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: sc.bg, color: sc.color }}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer tally */}
      {filtered.length > 0 && (
        <div className="mt-3 text-xs text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
          {filtered.length} LP{filtered.length !== 1 ? "s" : ""} · {fmtUSD(totalCommitted)} committed · {fmtUSD(outstanding)} outstanding
        </div>
      )}
    </div>
  );
}
