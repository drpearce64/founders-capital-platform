import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

interface Entity {
  id: string; name: string; short_code: string; entity_type: string;
  jurisdiction: string; bank_name: string | null; bank_account_no: string | null;
  bank_swift: string | null; hsbc_account_ref: string | null; status: string;
}

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors";
const inputStyle = { background: "hsl(var(--input))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" };

function Field({ label, name, type = "text", value, onChange, placeholder, required }: any) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}{required && <span style={{ color: "hsl(var(--destructive))" }}> *</span>}
      </label>
      <input
        data-testid={`input-${name}`}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={INPUT_CLASS}
        style={inputStyle}
      />
    </div>
  );
}

export default function SPVs() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", short_code: "", jurisdiction: "Delaware, USA",
    bank_name: "HSBC Bank USA NA", bank_account_name: "", bank_account_no: "",
    bank_swift: "", hsbc_account_ref: "", status: "active",
  });

  const { data: entities = [], isLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities"],
    queryFn: () => apiRequest("GET", "/api/entities").then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: async (body: typeof form) => {
      const master = entities.find((e: Entity) => e.entity_type === "master");
      return apiRequest("POST", "/api/entities", {
        ...body,
        entity_type: "series_spv",
        parent_entity_id: master?.id ?? null,
        base_currency: "USD",
        fiscal_year_end: "12-31",
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "SPV created", description: `${form.name} has been added.` });
      setShowForm(false);
      setForm({ name: "", short_code: "", jurisdiction: "Delaware, USA", bank_name: "HSBC Bank USA NA", bank_account_name: "", bank_account_no: "", bank_swift: "", hsbc_account_ref: "", status: "active" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const spvs = entities.filter((e: Entity) => e.entity_type === "series_spv");

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>Series SPVs</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{spvs.length} active series</p>
        </div>
        <button
          data-testid="button-add-spv"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          <Plus size={15} /> Add SPV
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <h2 className="text-base font-semibold" style={{ color: "hsl(var(--foreground))" }}>New Series SPV</h2>
              <button data-testid="button-close-form" onClick={() => setShowForm(false)}>
                <X size={18} style={{ color: "hsl(var(--muted-foreground))" }} />
              </button>
            </div>
            <form
              className="p-6 grid grid-cols-2 gap-4"
              onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}
            >
              <div className="col-span-2">
                <Field label="SPV Name" name="name" value={form.name} required
                  placeholder="FC Platform LP Vector I Series"
                  onChange={(e: any) => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <Field label="Short Code" name="short_code" value={form.short_code} required
                placeholder="FC-VECTOR-I"
                onChange={(e: any) => setForm(f => ({ ...f, short_code: e.target.value }))} />
              <Field label="Jurisdiction" name="jurisdiction" value={form.jurisdiction}
                onChange={(e: any) => setForm(f => ({ ...f, jurisdiction: e.target.value }))} />
              <div className="col-span-2 border-t pt-4 mt-1" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>Bank Details</p>
              </div>
              <Field label="Bank Name" name="bank_name" value={form.bank_name}
                onChange={(e: any) => setForm(f => ({ ...f, bank_name: e.target.value }))} />
              <Field label="Account Name" name="bank_account_name" value={form.bank_account_name}
                placeholder="FC Platform LP Vector I Series"
                onChange={(e: any) => setForm(f => ({ ...f, bank_account_name: e.target.value }))} />
              <Field label="Account Number" name="bank_account_no" value={form.bank_account_no}
                placeholder="511034432"
                onChange={(e: any) => setForm(f => ({ ...f, bank_account_no: e.target.value }))} />
              <Field label="SWIFT / BIC" name="bank_swift" value={form.bank_swift}
                placeholder="MRMDUS33"
                onChange={(e: any) => setForm(f => ({ ...f, bank_swift: e.target.value }))} />
              <div className="col-span-2">
                <Field label="HSBCnet Account Ref" name="hsbc_account_ref" value={form.hsbc_account_ref}
                  placeholder="Same as account number typically"
                  onChange={(e: any) => setForm(f => ({ ...f, hsbc_account_ref: e.target.value }))} />
              </div>
              <div className="col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  Cancel
                </button>
                <button type="submit" disabled={mutation.isPending}
                  data-testid="button-submit-spv"
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", opacity: mutation.isPending ? 0.7 : 1 }}>
                  {mutation.isPending ? "Creating…" : "Create SPV"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SPV list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: "hsl(var(--card))" }} />
          ))}
        </div>
      ) : spvs.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          No SPVs yet. Add your first Series SPV above.
        </div>
      ) : (
        <div className="space-y-3">
          {spvs.map((spv: Entity) => (
            <div key={spv.id} data-testid={`spv-row-${spv.id}`}
              className="rounded-xl border p-5"
              style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sm" style={{ color: "hsl(var(--foreground))" }}>{spv.name}</div>
                  <div className="text-xs mt-0.5 mono" style={{ color: "hsl(var(--muted-foreground))" }}>{spv.short_code} · {spv.jurisdiction}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "hsl(142 71% 42% / 0.15)", color: "hsl(142 71% 55%)" }}>
                  {spv.status}
                </span>
              </div>
              {(spv.bank_account_no || spv.bank_swift) && (
                <div className="mt-3 flex gap-6 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {spv.bank_name && <span>{spv.bank_name}</span>}
                  {spv.bank_account_no && <span className="mono">Acct: {spv.bank_account_no}</span>}
                  {spv.bank_swift && <span className="mono">BIC: {spv.bank_swift}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
