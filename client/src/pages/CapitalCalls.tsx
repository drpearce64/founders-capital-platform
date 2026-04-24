import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtUSD, fmtDate } from "@/lib/utils";
import { Plus, X, ChevronDown, ChevronRight, CheckCircle2, Mail, DollarSign, AlertTriangle, Clock } from "lucide-react";

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
  draft:            { bg: "hsl(var(--secondary))",          color: "hsl(var(--muted-foreground))" },
  issued:           { bg: "hsl(213 94% 62% / 0.15)",        color: "hsl(213 94% 62%)" },
  partially_funded: { bg: "hsl(38 92% 52% / 0.15)",         color: "hsl(38 92% 60%)" },
  fully_funded:     { bg: "hsl(142 71% 42% / 0.15)",        color: "hsl(142 71% 55%)" },
  cancelled:        { bg: "hsl(0 72% 55% / 0.15)",          color: "hsl(0 72% 60%)" },
};

const AGE_COLORS: Record<string, any> = {
  "current":    { bg: "hsl(142 71% 42% / 0.12)", color: "hsl(142 71% 55%)" },
  "0–15 days":  { bg: "hsl(38 92% 52% / 0.12)",  color: "hsl(38 92% 60%)" },
  "15–30 days": { bg: "hsl(25 95% 55% / 0.12)",  color: "hsl(25 95% 55%)" },
  "30+ days":   { bg: "hsl(0 72% 55% / 0.12)",   color: "hsl(0 72% 60%)" },
};

// ── Receive Modal ─────────────────────────────────────────────────────────────
function ReceiveModal({ item, callDueDate, onClose }: { item: any; callDueDate: string; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    received_amount: String(Number(item.call_amount) - Number(item.funded_amount || 0)),
    received_date: new Date().toISOString().split("T")[0],
    bank_reference: "",
  });

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/capital-call-items/${item.id}/receive`, {
      received_amount: parseFloat(form.received_amount),
      received_date: form.received_date,
      bank_reference: form.bank_reference,
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capital-call-items", item.capital_call_id] });
      queryClient.invalidateQueries({ queryKey: ["/api/capital-calls"] });
      toast({ title: "Receipt recorded" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-2xl border shadow-2xl" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Mark Receipt — {item.investors?.full_name}</h2>
          <button onClick={onClose}><X size={16} style={{ color: "hsl(var(--muted-foreground))" }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
            <div><span style={{ color: "hsl(var(--muted-foreground))" }}>Called</span><div className="font-semibold mono mt-0.5">{fmtUSD(item.call_amount)}</div></div>
            <div><span style={{ color: "hsl(var(--muted-foreground))" }}>Already received</span><div className="font-semibold mono mt-0.5">{fmtUSD(item.funded_amount || 0)}</div></div>
            <div><span style={{ color: "hsl(var(--muted-foreground))" }}>Fee</span><div className="font-semibold mono mt-0.5">{fmtUSD(item.fee_amount || 0)}</div></div>
            <div><span style={{ color: "hsl(var(--muted-foreground))" }}>Due date</span><div className="font-semibold mt-0.5">{fmtDate(callDueDate)}</div></div>
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Amount Received (USD) *</label>
            <input type="number" required className={INPUT_CLASS} style={STYLE}
              value={form.received_amount} onChange={e => setForm(f => ({ ...f, received_amount: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Receipt Date *</label>
            <input type="date" required className={INPUT_CLASS} style={STYLE}
              value={form.received_date} onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Bank Reference / Wire Ref</label>
            <input className={INPUT_CLASS} style={STYLE} placeholder="e.g. FCP-2026-001"
              value={form.bank_reference} onChange={e => setForm(f => ({ ...f, bank_reference: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>Cancel</button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", opacity: mutation.isPending ? 0.7 : 1 }}>
              {mutation.isPending ? "Saving…" : "Record Receipt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chase Modal ───────────────────────────────────────────────────────────────
function ChaseModal({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editedDraft, setEditedDraft] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/capital-calls", callId, "overdue"],
    queryFn: () => apiRequest("GET", `/api/capital-calls/${callId}/overdue`).then(r => r.json()),
  });

  const chaseMutation = useMutation({
    mutationFn: (itemId: string) => apiRequest("POST", `/api/capital-call-items/${itemId}/chase`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capital-call-items", callId] });
      toast({ title: "Chase logged", description: "Email draft ready to copy and send." });
      setSelectedItem(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectItem = (item: any) => {
    setSelectedItem(item);
    setEditedDraft(item.email_draft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-auto max-h-[90vh]"
        style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
          <h2 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Chase Overdue LPs
          </h2>
          <button onClick={onClose}><X size={18} style={{ color: "hsl(var(--muted-foreground))" }} /></button>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading overdue items…</div>
        ) : !data?.overdue?.length ? (
          <div className="p-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: "hsl(142 71% 55%)" }} />
            No overdue LPs on this call.
          </div>
        ) : selectedItem ? (
          <div className="p-6 space-y-4">
            <button onClick={() => setSelectedItem(null)} className="text-xs flex items-center gap-1"
              style={{ color: "hsl(var(--primary))" }}>← Back to list</button>
            <div className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Draft email to {selectedItem.investor_name}
            </div>
            <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              Outstanding: <span className="font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(selectedItem.outstanding)}</span>
              {selectedItem.days_overdue !== null && selectedItem.days_overdue > 0 &&
                <span className="ml-3">{selectedItem.days_overdue} days overdue</span>}
            </div>
            <textarea
              className="w-full rounded-lg p-3 text-xs font-mono border outline-none"
              style={{ ...STYLE, minHeight: "280px", lineHeight: 1.6 }}
              value={editedDraft}
              onChange={e => setEditedDraft(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => { navigator.clipboard.writeText(editedDraft); toast({ title: "Copied to clipboard" }); }}
                className="flex-1 px-4 py-2 rounded-lg text-sm border"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                Copy Email
              </button>
              <button onClick={() => chaseMutation.mutate(selectedItem.item_id)} disabled={chaseMutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                <Mail size={14} /> Log Chase Sent
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {data.overdue.map((item: any) => {
              const ageStyle = AGE_COLORS[item.age_bucket] ?? AGE_COLORS["current"];
              return (
                <div key={item.item_id}
                  className="flex items-center justify-between rounded-xl p-4 border cursor-pointer"
                  style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}
                  onClick={() => selectItem(item)}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{item.investor_name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{item.investor_email}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(item.outstanding)}</div>
                      <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>outstanding</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: ageStyle.bg, color: ageStyle.color }}>
                      {item.age_bucket}
                    </span>
                    {item.chase_count > 0 && (
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>×{item.chase_count}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Call Row ──────────────────────────────────────────────────────────────────
function CallRow({ call, spvs }: { call: any; spvs: any[] }) {
  const [open, setOpen] = useState(false);
  const [receiveItem, setReceiveItem] = useState<any>(null);
  const [showChase, setShowChase] = useState(false);
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

  const genFeesMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/capital-calls/${call.id}/generate-fees`, {}).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/capital-call-items", call.id] });
      toast({ title: `Generated ${data.length} LP items with fees` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sc = STATUS_COLORS[call.status] ?? STATUS_COLORS.draft;

  const totalCalled = items.reduce((s: number, i: any) => s + Number(i.call_amount), 0);
  const totalFunded = items.reduce((s: number, i: any) => s + Number(i.funded_amount || 0), 0);
  const totalFees = items.reduce((s: number, i: any) => s + Number(i.fee_amount || 0), 0);
  const overdueCount = items.filter((i: any) => Number(i.funded_amount || 0) < Number(i.call_amount)).length;

  return (
    <>
      {receiveItem && <ReceiveModal item={receiveItem} callDueDate={call.due_date} onClose={() => setReceiveItem(null)} />}
      {showChase && <ChaseModal callId={call.id} onClose={() => setShowChase(false)} />}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--border))" }}>
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4 cursor-pointer"
          style={{ background: "hsl(var(--card))" }}
          onClick={() => setOpen(o => !o)}>
          <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Call #{call.call_number} — {call.entities?.short_code ?? call.entity_id}
              </span>
              {call.entities?.investments?.[0]?.company_name && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                  {call.entities.investments[0].company_name}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: sc.bg, color: sc.color }}>
                {call.status.replace("_", " ")}
              </span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              {call.purpose} · Due {fmtDate(call.due_date)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Funding progress */}
            {items.length > 0 && (
              <div className="text-right hidden sm:block">
                <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Received
                </div>
                <div className="text-sm font-semibold mono" style={{ color: "hsl(142 71% 55%)" }}>
                  {fmtUSD(totalFunded)} / {fmtUSD(totalCalled)}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-semibold mono" style={{ color: "hsl(var(--foreground))" }}>
                {fmtUSD(call.total_call_amount)}
              </div>
              <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                {fmtDate(call.call_date)}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {call.status === "draft" && (
                <>
                  <button
                    data-testid={`button-gen-fees-${call.id}`}
                    onClick={() => genFeesMutation.mutate()}
                    disabled={genFeesMutation.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                    {genFeesMutation.isPending ? "…" : "Generate LP Items"}
                  </button>
                  <button
                    data-testid={`button-issue-call-${call.id}`}
                    onClick={() => issueMutation.mutate()}
                    disabled={issueMutation.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                    Issue
                  </button>
                </>
              )}
              {(call.status === "issued" || call.status === "partially_funded") && overdueCount > 0 && (
                <button
                  onClick={() => setShowChase(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
                  style={{ background: "hsl(38 92% 52% / 0.15)", color: "hsl(38 92% 60%)" }}>
                  <AlertTriangle size={12} /> Chase ({overdueCount})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        {open && (
          <div className="border-t" style={{ borderColor: "hsl(var(--border))" }}>
            {itemsLoading ? (
              <div className="px-5 py-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Loading LP items…</div>
            ) : items.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                No LP items yet. Click "Generate LP Items" to auto-create from commitments.
              </div>
            ) : (
              <>
                {/* Summary bar */}
                {totalFees > 0 && (
                  <div className="flex items-center gap-6 px-5 py-2.5 text-xs border-b"
                    style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>Capital called: <span className="mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(totalCalled)}</span></span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>Fees: <span className="mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(totalFees)}</span></span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>Total LP notices: <span className="mono font-semibold" style={{ color: "hsl(var(--foreground))" }}>{fmtUSD(totalCalled + totalFees)}</span></span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>Received: <span className="mono font-semibold" style={{ color: "hsl(142 71% 55%)" }}>{fmtUSD(totalFunded)}</span></span>
                    <span style={{ color: "hsl(38 92% 60%)" }}>Outstanding: <span className="mono font-semibold">{fmtUSD(Math.max(0, totalCalled - totalFunded))}</span></span>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "hsl(var(--muted))" }}>
                      {["LP", "Called", "Fee (6%)", "Notice Total", "Funded", "Outstanding", "Age", "Status", ""].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider"
                          style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, i: number) => {
                      const outstanding = Math.max(0, Number(item.call_amount) - Number(item.funded_amount || 0));
                      const feeAmt = Number(item.fee_amount || 0);
                      const noticeTotal = Number(item.call_amount) + feeAmt;
                      const today = new Date();
                      const due = call.due_date ? new Date(call.due_date) : null;
                      const daysOverdue = due && item.status !== "funded" ? Math.floor((today.getTime() - due.getTime()) / 86400000) : null;
                      const ageBucket = daysOverdue === null || item.status === "funded" ? null
                        : daysOverdue <= 0 ? "current"
                        : daysOverdue <= 15 ? "0–15 days"
                        : daysOverdue <= 30 ? "15–30 days" : "30+ days";
                      const ageStyle = ageBucket ? (AGE_COLORS[ageBucket] ?? {}) : {};

                      return (
                        <tr key={item.id} data-testid={`lp-item-${item.id}`}
                          style={{ borderTop: "1px solid hsl(var(--border))", background: i % 2 === 0 ? "hsl(var(--card))" : "hsl(var(--muted))" }}>
                          <td className="px-4 py-2.5 font-medium" style={{ color: "hsl(var(--foreground))" }}>
                            {item.investors?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--foreground))" }}>
                            {fmtUSD(item.call_amount)}
                          </td>
                          <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {feeAmt > 0 ? fmtUSD(feeAmt) : "—"}
                          </td>
                          <td className="px-4 py-2.5 mono text-right font-medium" style={{ color: "hsl(var(--foreground))" }}>
                            {noticeTotal > 0 ? fmtUSD(noticeTotal) : "—"}
                          </td>
                          <td className="px-4 py-2.5 mono text-right" style={{ color: "hsl(142 71% 55%)" }}>
                            {fmtUSD(item.funded_amount || 0)}
                          </td>
                          <td className="px-4 py-2.5 mono text-right"
                            style={{ color: outstanding > 0 ? "hsl(38 92% 60%)" : "hsl(var(--muted-foreground))" }}>
                            {outstanding > 0 ? fmtUSD(outstanding) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {ageBucket && ageBucket !== "current" && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: ageStyle.bg, color: ageStyle.color }}>
                                {ageBucket}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={item.status === "funded"
                                ? { background: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" }
                                : item.status === "partially_funded"
                                ? { background: "hsl(38 92% 52% / 0.15)", color: "hsl(38 92% 60%)" }
                                : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                              {item.status}
                            </span>
                            {(item.chase_count || 0) > 0 && (
                              <span className="ml-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                                <Clock size={10} className="inline mr-0.5" />×{item.chase_count}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {item.status !== "funded" && (
                              <button
                                data-testid={`button-receive-${item.id}`}
                                onClick={() => setReceiveItem(item)}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
                                style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                                <DollarSign size={11} /> Receive
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
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
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Capital Calls</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{calls.length} call{calls.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          data-testid="button-new-call"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
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
                  {spvs.map((e: any) => {
                    const inv = e.investments?.[0]?.company_name;
                    return <option key={e.id} value={e.id}>{e.name} ({e.short_code}){inv ? ` — ${inv}` : ""}</option>;
                  })}
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
                <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Total Capital Amount (USD)</label>
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
          {calls.map((call: any) => <CallRow key={call.id} call={call} spvs={spvs} />)}
        </div>
      )}
    </div>
  );
}
