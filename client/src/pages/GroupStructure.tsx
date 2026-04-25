import { Network } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EntityCard {
  name: string;
  type: string;
  reg?: string;
  address?: string;
  notes?: string;
  highlight?: string; // coloured sub-line
}

// ── Colour palette by jurisdiction ────────────────────────────────────────────
const COLORS = {
  uk:     { header: "#1B2A4A", border: "#3B5BDB", badge: "#3B5BDB22", badgeText: "#7B9EF5" },
  us:     { header: "#1B2A4A", border: "#3B5BDB", badge: "#3B5BDB22", badgeText: "#7B9EF5" },
  cayman: { header: "#0D4A35", border: "#0CA678", badge: "#0CA67822", badgeText: "#3ECBA0" },
};

// ── Entity Card Component ──────────────────────────────────────────────────────
function EntityBox({
  entity,
  flag,
  jurisdiction,
  wide = false,
}: {
  entity: EntityCard;
  flag: string;
  jurisdiction: "uk" | "us" | "cayman";
  wide?: boolean;
}) {
  const c = COLORS[jurisdiction];
  return (
    <div
      className={`rounded-lg overflow-hidden border text-left ${wide ? "w-full" : "w-64"}`}
      style={{ borderColor: c.border, background: "hsl(var(--card))" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: c.header }}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-white leading-snug">
          {entity.name}
        </span>
        <span className="text-base ml-2 flex-shrink-0">{flag}</span>
      </div>
      {/* Body */}
      <div className="px-3 py-2.5 text-xs space-y-1" style={{ color: "hsl(var(--muted-foreground))" }}>
        <div style={{ color: "hsl(var(--foreground))" }}>{entity.type}</div>
        {entity.highlight && (
          <div className="font-semibold" style={{ color: c.badgeText }}>{entity.highlight}</div>
        )}
        {entity.reg && <div>{entity.reg}</div>}
        {entity.address && <div className="opacity-75">{entity.address}</div>}
        {entity.notes && (
          <div className="mt-1.5 pt-1.5 border-t text-xs leading-relaxed opacity-80"
            style={{ borderColor: "hsl(var(--border))" }}>
            {entity.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Connector arrows ──────────────────────────────────────────────────────────
function Arrow({ label, dashed = false }: { label?: string; dashed?: boolean }) {
  return (
    <div className="flex flex-col items-center py-1 select-none" style={{ minHeight: 32 }}>
      <div
        className="w-px flex-1"
        style={{
          minHeight: 20,
          background: dashed
            ? "repeating-linear-gradient(to bottom, hsl(var(--border)) 0, hsl(var(--border)) 4px, transparent 4px, transparent 8px)"
            : "hsl(var(--border))",
        }}
      />
      {label && (
        <span className="text-xs px-1.5 py-0.5 rounded my-0.5 font-medium"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
      )}
      {/* Arrowhead */}
      <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid hsl(var(--border))" }} />
    </div>
  );
}

function HorizArrow({ label, dashed = false }: { label?: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1 px-1 select-none self-center" style={{ minWidth: 60 }}>
      <div
        className="flex-1 h-px"
        style={{
          background: dashed
            ? "repeating-linear-gradient(to right, hsl(var(--border)) 0, hsl(var(--border)) 4px, transparent 4px, transparent 8px)"
            : "hsl(var(--border))",
        }}
      />
      {label && (
        <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
      )}
      <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "6px solid hsl(var(--border))" }} />
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function JurisdictionHeader({ flag, label }: { flag: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{flag}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "hsl(var(--border))" }} />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function GroupStructure() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
          <Network size={18} style={{ color: "hsl(var(--primary))" }} />
          Group Structure
        </h1>
        <p className="text-sm mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          Multi-jurisdictional legal entity overview · As at April 2026
        </p>
      </div>

      {/* ── TIER 1: UK Row ───────────────────────────────────────────────────── */}
      <JurisdictionHeader flag="🇬🇧" label="England & Wales" />

      <div className="flex flex-wrap items-start gap-6 mb-2">
        {/* FC Group Holding */}
        <EntityBox flag="🇬🇧" jurisdiction="uk" entity={{
          name: "FC Group Holding Ltd.",
          type: "Private Ltd — England & Wales",
          highlight: "Co. No. 14797242",
          address: "72 Blackfriars Rd, London SE1 8HA",
          notes: "Ultimate UK holding company. Sole shareholder of FC US Holdings LLC. Director & CEO: Richard Hadler. Incorporated 12 April 2023.",
        }} />

        <div className="flex items-center gap-1 self-center text-xs opacity-40 mx-2">delegates mgt.</div>

        {/* Paxiot */}
        <EntityBox flag="🇬🇧" jurisdiction="uk" entity={{
          name: "Paxiot Limited",
          type: "FCA-Authorised AIFM — England & Wales",
          highlight: "Co. No. 07455644",
          address: "6 Kinghorn St, London EC1A 7HT",
          notes: "Appointed AIFM for FC Strat. Opps. Fund I LP. FCA-regulated under AIFMD. Richard Hadler seconded from FC Group Holding Ltd. Incorporated 30 November 2010.",
        }} />

        <div className="flex items-center gap-1 self-center text-xs opacity-40 mx-2">owns</div>

        {/* Nominees */}
        <EntityBox flag="🇬🇧" jurisdiction="uk" entity={{
          name: "Founders Capital Nominees Ltd",
          type: "Nominee / Custody Vehicle",
          highlight: "Co. No. 15912342",
          address: "72 Blackfriars Rd, London SE1 8HA",
          notes: "Holds legal title to client investments under bare trust. CASS-compliant nominee structure. Directors: Richard Hadler, Hugo Croft Tilmouth. Incorporated 22 August 2024.",
        }} />

        {/* Syndicate */}
        <EntityBox flag="🇬🇧" jurisdiction="uk" entity={{
          name: "Founders Capital Syndicate Limited",
          type: "Syndicate / Non-Trading Company",
          highlight: "Co. No. 14959328",
          address: "Unit 105, 65–69 Shelton St, London WC2H 9HE",
          notes: "Non-trading syndicate vehicle. Previously controlled by Join Odin Ltd; control transferred to Odin (TT) Nominees Ltd (7 Oct 2024). Currently non-operational. Incorporated 24 June 2023.",
        }} />
      </div>

      {/* Connector: FC Group Holding → US Holdings */}
      <div className="flex items-start gap-6 mb-2">
        <div className="flex flex-col items-center" style={{ width: 256 }}>
          <Arrow />
        </div>
        {/* Paxiot AIFM dashed arrow to Cayman — shown in Cayman section */}
      </div>

      {/* ── TIER 2: US Row ───────────────────────────────────────────────────── */}
      <JurisdictionHeader flag="🇺🇸" label="Delaware, USA" />

      {/* US Holdings */}
      <div className="flex flex-col items-start mb-2" style={{ width: 256 }}>
        <EntityBox flag="🇺🇸" jurisdiction="us" entity={{
          name: "FC US Holdings LLC",
          type: "Delaware Limited Liability Company",
          highlight: "Intermediate US holding entity",
          notes: "100% owned by FC Group Holding Ltd. Sits between UK holdco and Delaware partnership structure. Facilitates HSBC US banking relationships.",
        }} />
        <Arrow />
        <EntityBox flag="🇺🇸" jurisdiction="us" entity={{
          name: "FC Platform GP, LP",
          type: "Delaware Limited Partnership",
          highlight: "GP of Founders Capital Platform LP",
          address: "Registered Agent: Delaware",
          notes: "General Partner of the Series LP master entity. Controlled via FC US Holdings LLC → FC Group Holding Ltd. Authorised to create and manage Protected Series.",
        }} />
        <Arrow />
        <EntityBox flag="🇺🇸" jurisdiction="us" entity={{
          name: "Founders Capital Platform LP",
          type: "Delaware Series Limited Partnership",
          highlight: "Filed: 11 July 2025",
          address: "c/o Resident Agents Inc., Dover DE 19901",
          notes: "Master entity for all Vector Series SPVs. Protected Series structure under §17-218(b) DRULPA. Each Series is ring-fenced with segregated assets and liabilities.",
        }} />
      </div>

      {/* Vector series grid */}
      <div className="mb-2 ml-0">
        <div className="flex items-end gap-0 mb-0" style={{ marginLeft: 120 }}>
          {/* horizontal connector line across 5 columns */}
        </div>
        <div className="flex flex-wrap gap-4 mt-1">
          {[
            { label: "Vector I Series",   ein: "EIN: Pending",     ref: "FC-VECTOR-I" },
            { label: "Vector II Series",  ein: "EIN: Pending",     ref: "FC-VECTOR-II" },
            { label: "Vector III Series · Reach Power",      ein: "EIN: 36-5168991",  ref: "FC-VECTOR-III" },
            { label: "Vector IV Series · Project Prometheus", ein: "EIN: 61-2311112",  ref: "FC-VECTOR-IV" },
            { label: "Vector V Series",   ein: "EIN: Confirmed",   ref: "FC-VECTOR-V" },
          ].map(v => (
            <div key={v.ref} className="rounded-lg overflow-hidden border" style={{ borderColor: COLORS.us.border, background: "hsl(var(--card))", width: 210 }}>
              <div className="flex items-center justify-between px-3 py-1.5" style={{ background: COLORS.us.header }}>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-white leading-tight">FC Platform LP</div>
                  <div className="text-xs text-blue-300 leading-tight">{v.label}</div>
                </div>
                <span className="text-base ml-1">🇺🇸</span>
              </div>
              <div className="px-3 py-2 text-xs space-y-0.5">
                <div style={{ color: "hsl(var(--foreground))" }}>Protected Series — Delaware LP</div>
                <div className="font-semibold" style={{ color: COLORS.us.badgeText }}>{v.ein}</div>
                <div className="opacity-60" style={{ color: "hsl(var(--muted-foreground))" }}>{v.ref}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TIER 3: Cayman Row ───────────────────────────────────────────────── */}
      <div className="mt-10">
        <JurisdictionHeader flag="🇰🇾" label="Cayman Islands" />

        {/* AIFM delegation note */}
        <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          <span className="opacity-60">Paxiot Limited (UK AIFM)</span>
          <div className="flex-shrink-0 flex items-center gap-1">
            <div className="w-8 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--border))" }} />
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--muted))" }}>AIFM delegation</span>
            <div className="w-8 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--border))" }} />
            <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: "5px solid hsl(var(--border))" }} />
          </div>
          <span className="opacity-60">FC Strat. Opps. Fund I LP</span>
        </div>

        <div className="flex flex-col items-start" style={{ width: 290 }}>
          <EntityBox flag="🇰🇾" jurisdiction="cayman" wide entity={{
            name: "FC Strat. Opps. Fund I GP Limited",
            type: "Cayman Islands Exempted Company",
            highlight: "General Partner of Cayman LP",
            address: "Walkers Corporate Ltd, Grand Cayman",
            notes: "Sole GP of Founders Capital Strat. Opps. Fund I LP. Sole director: Richard Hadler (UK). Management delegated to Paxiot Limited. Incorporated 9 October 2025.",
          }} />
          <Arrow />
          <EntityBox flag="🇰🇾" jurisdiction="cayman" wide entity={{
            name: "Founders Capital Strat. Opps. Fund I LP",
            type: "Cayman Islands Exempted Limited Partnership",
            highlight: "Reg. No. 134092 · CIMA Registered",
            address: "CIMA — Exempted LP Register",
            notes: "Investment fund targeting AI & Robotics — early and late stage. Target 15–20 portfolio positions. AIFM: Paxiot Limited (UK). Base currency: USD. Registered 10 October 2025.",
          }} />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-10 pt-6 border-t flex flex-wrap gap-6 text-xs" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-px" style={{ background: "hsl(var(--border))" }} />
          <span>Ownership / control</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--border))" }} />
          <span>Management / service delegation</span>
        </div>
        <div className="ml-auto opacity-60">All UK entities: Companies House, England & Wales · Source: April 2026</div>
      </div>
    </div>
  );
}
