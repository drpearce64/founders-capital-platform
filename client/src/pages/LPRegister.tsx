import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtUSD } from "@/lib/utils";
import { Search, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Layers } from "lucide-react";

type SortKey = "name" | "committed" | "called" | "outstanding";
const PAGE_SIZE = 50;

export default function LPRegister() {
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBySeries, setGroupBySeries] = useState(false);
  const [page, setPage] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const filtered = useMemo(() => commitments.filter((c: any) => {
    // Delaware view: only show commitments to FC-VECTOR Series SPVs
    if (!c.entities?.short_code?.startsWith("FC-VECTOR")) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.investors?.full_name?.toLowerCase().includes(q) ||
      c.investors?.email?.toLowerCase().includes(q)
    );
  }), [commitments, search]);

  const outstandingOf = (c: any) => Number(c.committed_amount) - Number(c.called_amount);

  // Sorted view. sortKey === null keeps the original (default) order.
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (c: any) =>
      sortKey === "name" ? (c.investors?.full_name ?? "").toLowerCase()
      : sortKey === "committed" ? Number(c.committed_amount)
      : sortKey === "called" ? Number(c.called_amount)
      : outstandingOf(c);
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // Reset to first page whenever the inputs that change the list change.
  useEffect(() => { setPage(1); }, [search, entityFilter, sortKey, sortDir, groupBySeries]);

  // Use authoritative entity-level figures where available (unchanged logic)
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

  const normaliseStatus = (s: string) => (s === "fully_drawn" ? "active" : s);
  const statusColor = (s: string) => {
    const n = normaliseStatus(s);
    if (n === "active") return { bg: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" };
    if (n === "called") return { bg: "hsl(38 92% 52% / 0.15)", color: "hsl(38 92% 60%)" };
    return { bg: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" };
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  // Group rows by series (sorted respected within each group).
  const groups = useMemo(() => {
    if (!groupBySeries) return [];
    const m = new Map<string, any[]>();
    for (const c of sorted) {
      const k = c.entities?.short_code ?? "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([series, rows]) => ({
        series,
        rows,
        committed: rows.reduce((s: number, c: any) => s + Number(c.committed_amount), 0),
        called: rows.reduce((s: number, c: any) => s + Number(c.called_amount), 0),
      }));
  }, [sorted, groupBySeries]);

  // Pagination (flat view only; grouped view collapses to manage length).
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const COLS = 7;

  const SortTh = ({ label, k, right }: { label: string; k: SortKey; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none ${right ? "text-right" : "text-left"}`}
      style={{ color: "hsl(var(--muted-foreground))" }}
      data-testid={`sort-${k}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "justify-end" : ""}`}>
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  const lpRow = (c: any, i: number) => {
    const sc = statusColor(c.status);
    const out = outstandingOf(c);
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
          style={{ color: out > 0 ? "hsl(38 92% 60%)" : "hsl(var(--muted-foreground))" }}>
          {out > 0 ? fmtUSD(out) : "—"}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: sc.bg, color: sc.color }}>
            {normaliseStatus(c.status)}
          </span>
        </td>
      </tr>
    );
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
          { label: "Vehicle Subscription (Signed)", value: fmtUSD(totalCommitted) },
          { label: "Funds Received",                 value: fmtUSD(totalCalled) },
          { label: "Uncalled / Outstanding",         value: fmtUSD(outstanding) },
        ].map(s => (
          <div key={s.label} className="rounded-xl border px-5 py-4"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
            <div className="text-lg font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
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
        <button
          onClick={() => setGroupBySeries(g => !g)}
          data-testid="toggle-group-series"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border outline-none"
          style={{
            background: groupBySeries ? "hsl(var(--primary) / 0.12)" : "hsl(var(--input))",
            borderColor: groupBySeries ? "hsl(var(--primary))" : "hsl(var(--border))",
            color: groupBySeries ? "hsl(var(--primary))" : "hsl(var(--foreground))",
          }}
        >
          <Layers size={14} />
          Group by series
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                <SortTh label="Name" k="name" />
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>SPV</th>
                <SortTh label="Subscription" k="committed" right />
                <SortTh label="Funds Received" k="called" right />
                <SortTh label="Outstanding" k="outstanding" right />
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                    {[...Array(COLS)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: "hsl(var(--border))", width: "60%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="px-4 py-12 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                    No LPs found.
                  </td>
                </tr>
              ) : groupBySeries ? (
                groups.map(g => {
                  const isCollapsed = collapsed[g.series];
                  const gOut = g.committed - g.called;
                  return (
                    <Fragment key={`grp-${g.series}`}>
                      <tr
                        onClick={() => setCollapsed(prev => ({ ...prev, [g.series]: !prev[g.series] }))}
                        data-testid={`group-${g.series}`}
                        className="cursor-pointer select-none"
                        style={{ background: "hsl(var(--secondary))", borderBottom: "1px solid hsl(var(--border))" }}>
                        <td className="px-4 py-2.5 font-semibold" colSpan={3} style={{ color: "hsl(var(--foreground))" }}>
                          <span className="inline-flex items-center gap-1.5">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            {g.series}
                            <span className="text-xs font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>
                              · {g.rows.length} LP{g.rows.length !== 1 ? "s" : ""}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(g.committed)}</td>
                        <td className="px-4 py-2.5 text-right mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(g.called)}</td>
                        <td className="px-4 py-2.5 text-right mono font-semibold" style={{ color: gOut > 0 ? "hsl(38 92% 60%)" : "hsl(var(--muted-foreground))" }}>{gOut > 0 ? fmtUSD(gOut) : "—"}</td>
                        <td />
                      </tr>
                      {!isCollapsed && g.rows.map((c: any, i: number) => lpRow(c, i))}
                    </Fragment>
                  );
                })
              ) : (
                pageRows.map((c, i) => lpRow(c, i))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination (flat view) */}
      {!groupBySeries && !isLoading && sorted.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-end gap-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            data-testid="page-prev"
            className="px-3 py-1.5 rounded-md border disabled:opacity-40"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >Prev</button>
          <span>Page {safePage} of {totalPages} · {sorted.length} LPs</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            data-testid="page-next"
            className="px-3 py-1.5 rounded-md border disabled:opacity-40"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >Next</button>
        </div>
      )}

      {/* Footer tally */}
      {filtered.length > 0 && (
        <div className="mt-3 text-xs text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
          {filtered.length} LP{filtered.length !== 1 ? "s" : ""} · {fmtUSD(totalCommitted)} committed · {fmtUSD(outstanding)} outstanding
        </div>
      )}
    </div>
  );
}
