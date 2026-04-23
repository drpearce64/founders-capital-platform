import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, UserPlus } from "lucide-react";

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors";
const SELECT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none";
const STYLE = { background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" };
const LABEL = "block text-xs font-medium mb-1.5";

const INITIAL = {
  // Investor fields
  full_name: "", email: "", investor_type: "individual",
  country_of_residence: "", notes: "",
  // Commitment fields
  entity_id: "", committed_amount: "", called_amount: "",
  fee_rate: "0.06", carry_rate: "0.20", commitment_date: "2026-04-22",
  status: "active",
};

export default function LPOnboarding() {
  const { toast } = useToast();
  const [form, setForm] = useState(INITIAL);
  const [done, setDone] = useState<string | null>(null);

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const spvs = entities.filter((e: any) => e.entity_type === "series_spv");

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Create investor
      const inv = await apiRequest("POST", "/api/investors", {
        full_name: form.full_name,
        email: form.email || null,
        investor_type: form.investor_type,
        country_of_residence: form.country_of_residence || null,
        notes: form.notes || null,
        is_accredited: true,
        kyc_status: "pending",
        us_person: false,
      }).then(r => r.json());

      if (inv.error) throw new Error(inv.error);

      // 2. Create commitment
      const commitment = await apiRequest("POST", "/api/commitments", {
        entity_id: form.entity_id,
        investor_id: inv.id,
        committed_amount: parseFloat(form.committed_amount),
        called_amount: parseFloat(form.called_amount || "0"),
        fee_rate: parseFloat(form.fee_rate),
        carry_rate: parseFloat(form.carry_rate),
        carried_interest_pct: parseFloat(form.carry_rate) * 100,
        management_fee_pct: 0,
        commitment_date: form.commitment_date || null,
        status: form.status,
        subscription_date: form.commitment_date || new Date().toISOString().split("T")[0],
      }).then(r => r.json());

      if (commitment.error) throw new Error(commitment.error);

      return { investor: inv, commitment };
    },
    onSuccess: ({ investor }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commitments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDone(investor.full_name);
      setForm(INITIAL);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Onboard LP</h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Add a new limited partner to a Series SPV — no SQL required.
        </p>
      </div>

      {done && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: "hsl(142 71% 42% / 0.12)", color: "hsl(142 71% 55%)", border: "1px solid hsl(142 71% 42% / 0.25)" }}>
          <CheckCircle2 size={16} />
          <span><strong>{done}</strong> has been onboarded successfully.</span>
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(); }}
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        {/* Section: LP Details */}
        <div className="px-6 py-5 border-b" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-5">
            <UserPlus size={15} style={{ color: "hsl(var(--primary))" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
              LP Details
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>
                Full Name <span style={{ color: "hsl(var(--destructive))" }}>*</span>
              </label>
              <input data-testid="input-full-name" required className={INPUT_CLASS} style={STYLE}
                value={form.full_name} onChange={set("full_name")} placeholder="Atul Bhardwaj" />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Email</label>
              <input data-testid="input-email" type="email" className={INPUT_CLASS} style={STYLE}
                value={form.email} onChange={set("email")} placeholder="lp@example.com" />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Investor Type</label>
              <select data-testid="select-investor-type" className={SELECT_CLASS} style={STYLE}
                value={form.investor_type} onChange={set("investor_type")}>
                <option value="individual">Individual</option>
                <option value="entity">Entity / Company</option>
                <option value="trust">Trust</option>
                <option value="family_office">Family Office</option>
                <option value="institutional">Institutional</option>
              </select>
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Country of Residence</label>
              <input data-testid="input-country" className={INPUT_CLASS} style={STYLE}
                value={form.country_of_residence} onChange={set("country_of_residence")} placeholder="United Kingdom" />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Notes</label>
              <input data-testid="input-notes" className={INPUT_CLASS} style={STYLE}
                value={form.notes} onChange={set("notes")} placeholder="Optional notes" />
            </div>
          </div>
        </div>

        {/* Section: Commitment */}
        <div className="px-6 py-5" style={{ background: "hsl(var(--card))" }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Commitment
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>
                Series SPV <span style={{ color: "hsl(var(--destructive))" }}>*</span>
              </label>
              <select data-testid="select-entity" required className={SELECT_CLASS} style={STYLE}
                value={form.entity_id} onChange={set("entity_id")}>
                <option value="">Select a Series SPV…</option>
                {spvs.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.short_code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>
                Committed Amount (USD) <span style={{ color: "hsl(var(--destructive))" }}>*</span>
              </label>
              <input data-testid="input-committed-amount" required type="number" min="0" className={INPUT_CLASS} style={STYLE}
                value={form.committed_amount} onChange={set("committed_amount")} placeholder="25000" />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Called Amount (USD)</label>
              <input data-testid="input-called-amount" type="number" min="0" className={INPUT_CLASS} style={STYLE}
                value={form.called_amount} onChange={set("called_amount")} placeholder="25000 if funds received" />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Fee Rate</label>
              <select data-testid="select-fee-rate" className={SELECT_CLASS} style={STYLE}
                value={form.fee_rate} onChange={set("fee_rate")}>
                <option value="0.06">6% (standard)</option>
                <option value="0.05">5%</option>
                <option value="0.04">4%</option>
                <option value="0.00">0%</option>
              </select>
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Carry Rate</label>
              <select data-testid="select-carry-rate" className={SELECT_CLASS} style={STYLE}
                value={form.carry_rate} onChange={set("carry_rate")}>
                <option value="0.20">20% (standard)</option>
                <option value="0.15">15%</option>
                <option value="0.10">10%</option>
                <option value="0.00">0%</option>
              </select>
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Commitment Date</label>
              <input data-testid="input-commitment-date" type="date" className={INPUT_CLASS} style={STYLE}
                value={form.commitment_date} onChange={set("commitment_date")} />
            </div>
            <div>
              <label className={LABEL} style={{ color: "hsl(var(--muted-foreground))" }}>Status</label>
              <select data-testid="select-status" className={SELECT_CLASS} style={STYLE}
                value={form.status} onChange={set("status")}>
                <option value="active">Active (funds received)</option>
                <option value="called">Called (funds pending)</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="px-6 py-4 border-t flex justify-end gap-3"
          style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}>
          <button type="button" onClick={() => setForm(INITIAL)}
            className="px-4 py-2 rounded-lg text-sm border transition-colors"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            Reset
          </button>
          <button type="submit" disabled={mutation.isPending}
            data-testid="button-onboard-lp"
            className="px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", opacity: mutation.isPending ? 0.7 : 1 }}>
            {mutation.isPending ? "Onboarding…" : "Onboard LP"}
          </button>
        </div>
      </form>
    </div>
  );
}
