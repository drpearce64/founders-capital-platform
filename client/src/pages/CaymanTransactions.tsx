import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Receipt,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EntityFilter = "all" | "fund" | "gp";

interface Transaction {
  id: string;
  entity_id: string;
  bank_account_ref: string;
  transaction_date: string;
  value_date: string | null;
  description: string;
  reference: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  balance: number | null;
  currency: string;
  reconciled: boolean;
  raw_data: {
    airtable_id: string;
    sub_account: string;
    origin: string;
    label: string | null;
    type: string | null;
    status: string | null;
    amount: number;
    direction: string;
  } | null;
}

interface TxResponse {
  transactions: Transaction[];
  summary: {
    count: number;
    total_credits_usd: number;
    total_debits_usd: number;
    net_usd: number;
  };
  pagination: { limit: number; offset: number; total: number };
}

const USD = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
};

export default function CaymanTransactions() {
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");

  const queryKey = `/api/cayman/transactions?entity=${entityFilter}&limit=200`;

  const { data, isLoading, error, refetch, isFetching } = useQuery<TxResponse>({
    queryKey: [queryKey],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cayman/transactions?entity=${entityFilter}&limit=200`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  const txns = data?.transactions ?? [];
  const summary = data?.summary;

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            Transactions
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Founders Capital Strat. Opps. Fund I · Synced from Airtable via HSBC
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Entity filter tabs */}
      <div
        className="flex gap-1 p-1 rounded-lg w-fit"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        {(["all", "fund", "gp"] as EntityFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setEntityFilter(f)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              background: entityFilter === f ? "hsl(var(--primary))" : "transparent",
              color: entityFilter === f ? "white" : "hsl(var(--muted-foreground))",
            }}
          >
            {f === "all" ? "All Accounts" : f === "fund" ? "Fund LP" : "GP Entity"}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Receipt,      label: "Transactions",   value: isLoading ? "…" : String(summary?.count ?? 0) },
          { icon: TrendingUp,   label: "Total Credits",  value: isLoading ? "…" : USD(summary?.total_credits_usd) },
          { icon: TrendingDown, label: "Total Debits",   value: isLoading ? "…" : USD(summary?.total_debits_usd) },
          { icon: DollarSign,   label: "Net Position",   value: isLoading ? "…" : USD(summary?.net_usd) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} style={{ color: "hsl(var(--primary))" }} />
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {label}
                </span>
              </div>
              <div className="text-xl font-bold tabular-nums" style={{ color: "hsl(var(--foreground))" }}>
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ background: "hsl(0 80% 96%)", color: "hsl(0 70% 35%)", border: "1px solid hsl(0 70% 80%)" }}>
          {(error as Error).message}
        </div>
      )}

      {/* Transactions table */}
      <Card style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Transaction Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-4">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="h-10 rounded animate-pulse" style={{ background: "hsl(var(--border))" }} />
              ))}
            </div>
          ) : txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Info size={32} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.4 }} />
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                No transactions yet. Add records to the Airtable Transactions table with Sub Account set to one of the Cayman accounts, then run a sync.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    {["Date", "Description", "Sub Account", "Origin", "Credit", "Debit", "Currency", "Status"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wide"
                          style={{ color: "hsl(var(--muted-foreground))" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.map((tx, i) => {
                    const isInflow = (tx.credit_amount ?? 0) > 0;
                    return (
                      <tr
                        key={tx.id}
                        style={{
                          borderBottom: "1px solid hsl(var(--border))",
                          background: i % 2 === 0 ? "transparent" : "hsl(var(--muted)/0.2)",
                        }}
                      >
                        <td className="px-4 py-2.5 tabular-nums text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {fmtDate(tx.transaction_date)}
                        </td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <div className="font-medium text-sm truncate" style={{ color: "hsl(var(--foreground))" }}>
                            {tx.description}
                          </div>
                          {tx.reference && (
                            <div className="text-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                              Ref: {tx.reference}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-[160px] truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {tx.raw_data?.sub_account ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))", border: "none", fontSize: "0.65rem" }}>
                            {tx.raw_data?.origin ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-sm font-medium" style={{ color: "hsl(142 60% 40%)" }}>
                          {tx.credit_amount != null ? USD(tx.credit_amount) : "—"}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-sm font-medium" style={{ color: "hsl(0 60% 45%)" }}>
                          {tx.debit_amount != null ? USD(tx.debit_amount) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {tx.currency}
                        </td>
                        <td className="px-4 py-2.5">
                          {tx.reconciled ? (
                            <Badge style={{ background: "hsl(142 60% 92%)", color: "hsl(142 60% 30%)", border: "none", fontSize: "0.65rem" }}>
                              Reconciled
                            </Badge>
                          ) : (
                            <Badge style={{ background: "hsl(45 90% 92%)", color: "hsl(30 70% 35%)", border: "none", fontSize: "0.65rem" }}>
                              Pending
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs pb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Data sourced from Airtable Transactions table (Origin: HSBC) · Synced nightly at 21:00 BST
      </p>
    </div>
  );
}
