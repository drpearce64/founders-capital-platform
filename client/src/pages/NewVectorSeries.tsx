import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, ChevronRight, ChevronLeft, Check, Loader2,
  Building2, Banknote, Zap, AlertCircle, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LookupResult {
  airtable_record_id: string;
  deal_code: string;
  company_name: string;
  closing_date: string | null;
  status: string;
  currency: string;
  total_received: number | null;
  usd_investment_value: number | null;
  cap: number | null;
  carry_rate: number;
  management_fee_rate: number;
  description: string;
  url: string;
  suggested_short_code: string;
  suggested_name: string;
  next_vector_roman: string;
}

interface ProvisionResult {
  success: boolean;
  entity_id: string;
  short_code: string;
  name: string;
  action: "created" | "updated";
  spa: { status: string; filename?: string; error?: string } | null;
  next_steps: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, currency = "USD") =>
  n == null ? "—" : new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);

const CARD = {
  background: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
};
const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors focus:ring-2";
const inputStyle = {
  background: "hsl(var(--input))",
  borderColor: "hsl(var(--border))",
  color: "hsl(var(--foreground))",
};

function Field({
  label, name, value, onChange, placeholder, note, readOnly, type = "text",
}: {
  label: string; name: string; value: string;
  onChange?: (v: string) => void; placeholder?: string;
  note?: string; readOnly?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5"
        style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
        style={{
          ...inputStyle,
          opacity: readOnly ? 0.65 : 1,
          cursor: readOnly ? "default" : "text",
        }}
      />
      {note && (
        <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{note}</p>
      )}
    </div>
  );
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Deal Code", icon: Search },
  { label: "Review Config", icon: Building2 },
  { label: "Confirm", icon: Check },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                style={{
                  background: done
                    ? "hsl(142 71% 42%)"
                    : active
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                  color: done || active
                    ? "white"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                {done ? <Check size={13} /> : <Icon size={13} />}
              </div>
              <span
                className="text-sm font-medium"
                style={{
                  color: active
                    ? "hsl(var(--foreground))"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-px w-10 mx-3"
                style={{
                  background: done
                    ? "hsl(142 71% 42%)"
                    : "hsl(var(--border))",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NewVectorSeries() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [dealCode, setDealCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  // Config editable in step 2
  const [config, setConfig] = useState({
    short_code: "",
    name: "",
    bank_name: "HSBC Bank USA NA",
    bank_account_name: "",
    bank_account_no: "",
    bank_swift: "MRMDUS33",
    hsbc_account_ref: "",
    sync_spa: true,
  });

  const [provisionLoading, setProvisionLoading] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  // ── Step 1: Look up deal code ──────────────────────────────────────────────

  async function handleLookup() {
    const code = dealCode.trim().toUpperCase();
    if (!code) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await apiRequest("GET", `/api/vector/lookup?deal_code=${encodeURIComponent(code)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Lookup failed");
      }
      const data: LookupResult = await res.json();
      setLookup(data);
      // Pre-fill editable config
      setConfig({
        short_code: data.suggested_short_code,
        name: data.suggested_name,
        bank_name: "HSBC Bank USA NA",
        bank_account_name: data.suggested_name,
        bank_account_no: "",
        bank_swift: "MRMDUS33",
        hsbc_account_ref: "",
        sync_spa: true,
      });
      setStep(1);
    } catch (e: any) {
      setLookupError(e.message);
    } finally {
      setLookupLoading(false);
    }
  }

  // ── Step 3: Provision ─────────────────────────────────────────────────────

  async function handleProvision() {
    if (!lookup) return;
    setProvisionLoading(true);
    try {
      const res = await apiRequest("POST", "/api/vector/provision", {
        airtable_record_id: lookup.airtable_record_id,
        deal_code: lookup.deal_code,
        short_code: config.short_code,
        name: config.name,
        bank_name: config.bank_name,
        bank_account_name: config.bank_account_name,
        bank_account_no: config.bank_account_no || null,
        bank_swift: config.bank_swift,
        hsbc_account_ref: config.hsbc_account_ref || config.bank_account_no || null,
        sync_spa: config.sync_spa,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Provision failed");
      }
      const data: ProvisionResult = await res.json();
      setResult(data);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Provision failed", description: e.message, variant: "destructive" });
    } finally {
      setProvisionLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/spvs")}
          className="flex items-center gap-1.5 text-xs mb-4 transition-colors"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          <ChevronLeft size={14} /> Back to Series SPVs
        </button>
        <h1 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
          New Vector Series
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Register a new Delaware series SPV from an existing Airtable deal code
        </p>
      </div>

      <StepBar current={step} />

      {/* ── Step 0: Enter deal code ────────────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-2xl border p-6" style={CARD}>
          <h2 className="text-base font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
            Enter Airtable Deal Code
          </h2>
          <p className="text-sm mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Enter the deal code as it appears in Airtable — e.g. <span className="mono font-medium">ERB-0526-DEL</span>.
            The deal must already exist in the Airtable Deals table.
          </p>

          <div className="flex gap-3">
            <input
              autoFocus
              className={INPUT_CLASS + " flex-1 font-mono uppercase"}
              style={inputStyle}
              placeholder="e.g. ERB-0526-DEL"
              value={dealCode}
              onChange={e => { setDealCode(e.target.value.toUpperCase()); setLookupError(null); }}
              onKeyDown={e => e.key === "Enter" && !lookupLoading && handleLookup()}
            />
            <button
              onClick={handleLookup}
              disabled={lookupLoading || !dealCode.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                opacity: lookupLoading || !dealCode.trim() ? 0.65 : 1,
              }}
            >
              {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Look up
            </button>
          </div>

          {lookupError && (
            <div className="mt-4 flex items-start gap-2 text-sm rounded-lg px-3 py-2"
              style={{ background: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))" }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {lookupError}
            </div>
          )}

          <div className="mt-5 rounded-lg p-3 text-xs" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
            <div className="flex items-start gap-1.5">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>
                Deal codes for Delaware Vector series end in <span className="mono font-medium">-DEL</span>.
                The portal will auto-suggest the next available Vector number (currently <span className="font-semibold">FC-VECTOR-VI</span>).
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1: Review & edit config ──────────────────────────────────── */}
      {step === 1 && lookup && (
        <div className="space-y-4">
          {/* Deal summary card */}
          <div className="rounded-2xl border p-5" style={CARD}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="mono text-xs font-medium px-2 py-0.5 rounded"
                  style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                  {lookup.deal_code}
                </span>
                <h3 className="text-base font-semibold mt-2" style={{ color: "hsl(var(--foreground))" }}>
                  {lookup.company_name || "—"}
                </h3>
                {lookup.description && (
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {lookup.description}
                  </p>
                )}
              </div>
              {lookup.url && (
                <a href={lookup.url} target="_blank" rel="noreferrer"
                  className="text-xs px-2 py-1 rounded border transition-colors ml-4 shrink-0"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  Website ↗
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t text-xs" style={{ borderColor: "hsl(var(--border))" }}>
              <div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>Total Received</div>
                <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                  {fmt(lookup.total_received, lookup.currency)}
                </div>
              </div>
              <div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>USD Value</div>
                <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                  {fmt(lookup.usd_investment_value)}
                </div>
              </div>
              <div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>Carry / Fee</div>
                <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                  {((lookup.carry_rate ?? 0.20) * 100).toFixed(0)}% /{" "}
                  {((lookup.management_fee_rate ?? 0.06) * 100).toFixed(0)}%
                </div>
              </div>
              {lookup.closing_date && (
                <div>
                  <div style={{ color: "hsl(var(--muted-foreground))" }}>Closing Date</div>
                  <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                    {lookup.closing_date}
                  </div>
                </div>
              )}
              <div>
                <div style={{ color: "hsl(var(--muted-foreground))" }}>Airtable Status</div>
                <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                  {lookup.status || "—"}
                </div>
              </div>
              {lookup.cap != null && (
                <div>
                  <div style={{ color: "hsl(var(--muted-foreground))" }}>Cap</div>
                  <div className="font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>
                    {fmt(lookup.cap)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editable config */}
          <div className="rounded-2xl border p-5" style={CARD}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{ color: "hsl(var(--muted-foreground))" }}>
              Portal Configuration
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Short Code" name="short_code" value={config.short_code}
                onChange={v => setConfig(c => ({ ...c, short_code: v }))}
                note="Auto-generated — edit only if needed" />
              <div className="col-span-2">
                <Field label="Series Name" name="name" value={config.name}
                  onChange={v => setConfig(c => ({ ...c, name: v }))} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={CARD}>
            <div className="flex items-center gap-2 mb-4">
              <Banknote size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
              <p className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "hsl(var(--muted-foreground))" }}>
                Bank Details
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name" name="bank_name" value={config.bank_name}
                onChange={v => setConfig(c => ({ ...c, bank_name: v }))} />
              <Field label="Account Name" name="bank_account_name" value={config.bank_account_name}
                onChange={v => setConfig(c => ({ ...c, bank_account_name: v }))} />
              <Field label="Account Number" name="bank_account_no" value={config.bank_account_no}
                onChange={v => setConfig(c => ({ ...c, bank_account_no: v }))}
                placeholder="Leave blank if not yet received"
                note="Can be added later once HSBC confirm" />
              <Field label="SWIFT / BIC" name="bank_swift" value={config.bank_swift}
                onChange={v => setConfig(c => ({ ...c, bank_swift: v }))} />
              <div className="col-span-2">
                <Field label="HSBCnet Account Ref" name="hsbc_account_ref" value={config.hsbc_account_ref}
                  onChange={v => setConfig(c => ({ ...c, hsbc_account_ref: v }))}
                  placeholder="Defaults to account number if blank" />
              </div>
            </div>
          </div>

          {/* SPA sync toggle */}
          <div className="rounded-2xl border p-5" style={CARD}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                    Sync SPA document now
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Pull the executed investment agreement from Airtable into the portal document store
                  </div>
                </div>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, sync_spa: !c.sync_spa }))}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{
                  background: config.sync_spa ? "hsl(var(--primary))" : "hsl(var(--muted))",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: config.sync_spa ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </div>

          {/* Step nav */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => { setStep(0); setLookup(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-colors"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
            >
              <ChevronLeft size={14} /> Back
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              Review & Confirm <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Confirm summary (pre-provision) or result (post-provision) */}
      {step === 2 && lookup && !result && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-6" style={CARD}>
            <h2 className="text-base font-semibold mb-4" style={{ color: "hsl(var(--foreground))" }}>
              Confirm Vector Series
            </h2>
            <div className="space-y-2 text-sm">
              {[
                ["Deal code", lookup.deal_code],
                ["Company", lookup.company_name],
                ["Airtable record", lookup.airtable_record_id],
                ["Short code", config.short_code],
                ["Series name", config.name],
                ["Bank", config.bank_name],
                ["Account number", config.bank_account_no || "(not yet set)"],
                ["SWIFT / BIC", config.bank_swift],
                ["SPA sync", config.sync_spa ? "Yes — will attempt now" : "No — skip for now"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="w-36 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>{k}</span>
                  <span className="font-medium mono" style={{ color: "hsl(var(--foreground))" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-colors"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
            >
              <ChevronLeft size={14} /> Edit
            </button>
            <button
              onClick={handleProvision}
              disabled={provisionLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                opacity: provisionLoading ? 0.7 : 1,
              }}
            >
              {provisionLoading
                ? <><Loader2 size={14} className="animate-spin" /> Provisioning…</>
                : <><Check size={14} /> Provision Series</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Result screen (after provision) ──────────────────────────────── */}
      {step === 2 && result && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="rounded-2xl border p-6" style={{ ...CARD, borderColor: "hsl(142 71% 42% / 0.4)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "hsl(142 71% 42% / 0.15)" }}>
                <Check size={18} style={{ color: "hsl(142 71% 42%)" }} />
              </div>
              <div>
                <div className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {result.action === "created" ? "Series provisioned" : "Series updated"}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {result.short_code} · {result.name}
                </div>
              </div>
            </div>

            {/* SPA result */}
            {result.spa && (
              <div className="rounded-lg p-3 text-xs mt-3"
                style={{
                  background: result.spa.status === "synced"
                    ? "hsl(142 71% 42% / 0.1)"
                    : "hsl(var(--muted))",
                  color: result.spa.status === "synced"
                    ? "hsl(142 71% 42%)"
                    : "hsl(var(--muted-foreground))",
                }}>
                <span className="font-semibold">SPA sync: </span>
                {result.spa.status === "synced"
                  ? `✓ ${result.spa.filename}`
                  : result.spa.status === "no_spa_found"
                  ? "No SPA found in Airtable yet — re-run sync once uploaded"
                  : result.spa.status === "upload_failed"
                  ? `Upload failed: ${result.spa.error}`
                  : result.spa.status}
              </div>
            )}
          </div>

          {/* Next steps */}
          {result.next_steps.length > 0 && (
            <div className="rounded-2xl border p-5" style={CARD}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "hsl(var(--muted-foreground))" }}>
                Next Steps
              </p>
              <ul className="space-y-2">
                {result.next_steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm"
                    style={{ color: "hsl(var(--foreground))" }}>
                    <ChevronRight size={14} className="mt-0.5 shrink-0"
                      style={{ color: "hsl(var(--primary))" }} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate("/spvs")}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
            >
              View Series SPVs
            </button>
            <button
              onClick={() => {
                setStep(0); setDealCode(""); setLookup(null); setResult(null);
                setConfig({ short_code: "", name: "", bank_name: "HSBC Bank USA NA",
                  bank_account_name: "", bank_account_no: "", bank_swift: "MRMDUS33",
                  hsbc_account_ref: "", sync_spa: true });
              }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              Add Another Series
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
