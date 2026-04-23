import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtUSD, fmtDate } from "@/lib/utils";
import { Plus, X, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors";
const STYLE = { background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" };
const LABEL = "block text-xs font-medium mb-1.5";

const INITIAL_FORM = {
  entity_id: "", call_date: new Date().toISOString().split("T")[0],
  due_date: "", purpose: "", total_call_amount: "",
  bank_name: "HSBC Bank USA NA", account_name: "",
  account_no: "", routing_no: "", swift: "MRMDUS33", reference_note: "",
};

const STATUS_COLORS: Record<string, any> = {
  draft: { bg: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" },
  issued: { bg: "hsl(213 94% 62% / 0.15)", color: "hsl(213 94% 62%)" },
  partially_funded: { bg: "hsl(38 92% 52% / 0.15)", color: "hsl(38 92% 60%)" },
  fully_funded: { bg: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" },
  cancelled: { bg: "hsl(0 72% 55% / 0.15)", color: "hsl(0 72% 60%)" },
};

function CallRow({ call }: { call: any }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/capital-call-items", call.id],
    queryFn: () => apiRequest("GET", `/api/capital-call-items/${call.id}`).then(r => r.json()),
    enabled: open,
  });

  const issueMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/capital-calls/${call.id}`, { status: "issued", issued_at: new Date().toISOString() }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/capital-calls"] }); toast({ title: "Capital call issued" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sc = STATUS_COLORS[call.status] ?? STATUS_COLORS.draft;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer"
        style={{ background: "hsl(var(--card))" }}
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Call #{call.call_number} — {call.entities?.short_code ?? call.entity_id}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: sc.bg, color: sc.color }}>
              {call.status.replace("_", " ")}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            {call.purpose} · Due {fmtDate(call.due_date)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>
            {fmtUSD(call.total_call_amount)}
          </div>
          <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {fmtDate(call.call_date)}
          </div>
        </div>
        {call.status === "draft" && (
          <button
            data-testid={`button-issue-call-${call.id}`}
            onClick={e => { e.stopPropagation(); issueMutation.mutate(); }}
            disabled={issueMutation.isPending}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
          >
            Issue
          </button>
        )}
      </div>

      {/* Items */}
      {open && (
        <div className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
          {itemsLoading ? (
            <div className="px-5 py-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Loading LP items…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>No LP items linked to this call.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--muted))" }}>
                  {["LP", "Call Amount", "Funded", "Outstanding", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider"
                      style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={item.id}
                    style={{ borderTop: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                      {item.investors?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                      {fmtUSD(item.call_amount)}
                    </td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(142 71% 55%)" }}>
                      {fmtUSD(item.funded_amount)}
                    </td>
                    <td className="px-4 py-2.5 mono text-right"
                      style={{ color: item.call_amount - item.funded_amount > 0 ? "hsl(38 92% 60%)" : "hsl(var(--muted-foreground))" }}>
                      {item.call_amount - item.funded_amount > 0 ? fmtUSD(item.call_amount - item.funded_amount) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={item.status === "funded"
                          ? { background: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" }
                          : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function CapitalCalls() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const { data: calls = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/capital-calls"],
    queryFn: () => apiRequest("GET", "/api/capital-calls").then(r => r.json()),
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  // Pre-fill bank details when SPV is selected
  const onEntityChange = (id: string) => {
    const spv = spvs.find((e: any) => e.id === id);
    setForm(f => ({
      ...f,
      entity_id: id,
      account_name: spv?.bank_account_name ?? spv?.name ?? "",
      account_no: spv?.bank_account_no ?? "",
      swift: spv?.bank_swift ?? "MRMDUS33",
      bank_name: spv?.bank_name ?? "HSBC Bank USA NA",
    }));
  };

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/capital-calls", {
      ...form,
      total_call_amount: parseFloat(form.total_call_amount),
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capital-calls"] });
      toast({ title: "Capital call created" });
      setShowForm(false);
      setForm(INITIAL_FORM);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Capital Calls</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{calls.length} call{calls.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          data-testid="button-new-call"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          <Plus size={15} /> New Call
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-auto max-h-[90vh]"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
              style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>New Capital Call</h2>
              <button onClick={() => setShowForm(false)}>
                <X size={18} style={{ color: "hsl(var(--muted-foreground))" }} />
              </button>
            </div>
            <form className="p-6 grid grid-cols-2 gap-4" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
              <div className="col-span-2">
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>
                  Series SPV <span style={{ color: "hsl(var(--destructive))" }}>*</span>
                </label>
                <select required className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none" style={STYLE}
                  value={form.entity_id} onChange={e => onEntityChange(e.target.value)}>
                  <option value="">Select SPV…</option>
                  {spvs.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.short_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Call Date</label>
                <input type="date" required className={INPUT_CLASS} style={STYLE}
                  value={form.call_date} onChange={e => setForm(f => ({ ...f, call_date: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Due Date</label>
                <input type="date" required className={INPUT_CLASS} style={STYLE}
                  value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Purpose</label>
                <input required className={INPUT_CLASS} style={STYLE}
                  placeholder="Investment in Reach Power, Inc."
                  value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Total Amount (USD)</label>
                <input required type="number" min="0" className={INPUT_CLASS} style={STYLE}
                  value={form.total_call_amount} onChange={e => setForm(f => ({ ...f, total_call_amount: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Reference Note</label>
                <input className={INPUT_CLASS} style={STYLE} placeholder="RPW-0326-DEL"
                  value={form.reference_note} onChange={e => setForm(f => ({ ...f, reference_note: e.target.value }))} />
              </div>

              <div className="col-span-2 border-t pt-4" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Wire Instructions</p>
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Bank Name</label>
                <input className={INPUT_CLASS} style={STYLE} value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Account Name</label>
                <input className={INPUT_CLASS} style={STYLE} value={form.account_name}
                  onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Account Number</label>
                <input className={INPUT_CLASS} style={STYLE} value={form.account_no}
                  onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>SWIFT / BIC</label>
                <input className={INPUT_CLASS} style={STYLE} value={form.swift}
                  onChange={e => setForm(f => ({ ...f, swift: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Routing Number (ABA)</label>
                <input className={INPUT_CLASS} style={STYLE} placeholder="021001088"
                  value={form.routing_no} onChange={e => setForm(f => ({ ...f, routing_no: e.target.value }))} />
              </div>

              <div className="col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  Cancel
                </button>
                <button type="submit" disabled={mutation.isPending}
                  data-testid="button-submit-call"
                  className="px-5 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", opacity: mutation.isPending ? 0.7 : 1 }}>
                  {mutation.isPending ? "Creating…" : "Create Call"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Call list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "hsl(var(--card))" }} />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          No capital calls yet. Create your first call above.
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call: any) => <CallRow key={call.id} call={call} />)}
        </div>
      )}
    </div>
  );
}
