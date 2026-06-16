/**
 * generate_cayman_pl_model.cjs
 * Generates the Founders Capital Cayman Fund I P&L Excel workbook.
 * Called by the /api/reports/cayman-pl-model route on each download request.
 *
 * Usage: node generate_cayman_pl_model.cjs <output_path>
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set in Railway)
 */

"use strict";

const XLSX    = require("xlsx");
const https   = require("https");
const http    = require("http");
const path    = require("path");
const fs      = require("fs");

const OUT_PATH = process.argv[2] || "/tmp/fc_cayman_pl_model.xlsx";

// ── BRAND COLORS ──────────────────────────────────────────────────────────────
const C = {
  COBALT:      "FF3B5BDB",
  COBALT_DARK: "FF2F4AB8",
  COBALT_LITE: "FFE8ECFF",
  CREAM:       "FFF5F3EF",
  DARK:        "FF1A1209",
  LIGHT_GREY:  "FFF0EEE9",
  MID_GREY:    "FFD9D7D2",
  WHITE:       "FFFFFFFF",
  GOLD:        "FFC9A84C",
  BLUE_IN:     "FF0000FF",
  BLACK_FM:    "FF000000",
  GREEN_LK:    "FF008000",
};

const CAYMAN_FUND_ID = "14d76562-2219-4121-b0bd-5379018ac3b4";
const CAYMAN_GP_ID   = "3540df09-f8bb-43ca-a4de-b89945b6b16b";
const FX_GBP_USD            = 1.27;
// Paxiot Management Agreement Schedule 1: flat monthly fees
// Investment Period: £2,400/month (+VAT); Post-Investment Period: £1,400/month
const PAXIOT_MONTHLY_GBP    = 2400;   // Investment Period
const PAXIOT_POST_MONTHLY_GBP = 1400; // Post-Investment Period
const PAXIOT_FX             = 1.3445; // Paxiot invoice FX rate (13 Apr 2026 actual)
const PAXIOT_ANN_USD        = PAXIOT_MONTHLY_GBP * 12 * PAXIOT_FX;  // £2,400 × 12 × 1.3445
const CARRY_RATE     = 0.20;

// ── SUPABASE FETCH ────────────────────────────────────────────────────────────
function supabaseFetch(table, select = "*", filters = "") {
  return new Promise((resolve, reject) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || "https://yoyrwrdzivygufbzckdv.supabase.co";
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = new URL(
      `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`
    );
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url.toString(), {
      method: "GET",
      headers: {
        "apikey":        SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────
function fill(hex) {
  return { patternType: "solid", fgColor: { rgb: hex.replace(/^FF/, "") } };
}
function font(opts = {}) {
  return {
    name:   "Calibri",
    sz:     opts.sz    || 9,
    bold:   opts.bold  || false,
    italic: opts.italic || false,
    color:  { rgb: (opts.color || C.DARK).replace(/^FF/, "") },
  };
}
function align(h = "left", v = "center", wrap = false) {
  return { horizontal: h, vertical: v, wrapText: wrap };
}
const thinBorder = {
  top:    { style: "thin", color: { rgb: "D9D7D2" } },
  bottom: { style: "thin", color: { rgb: "D9D7D2" } },
  left:   { style: "thin", color: { rgb: "D9D7D2" } },
  right:  { style: "thin", color: { rgb: "D9D7D2" } },
};
const thickBottom = {
  bottom: { style: "medium", color: { rgb: "D9D7D2" } },
};

const USD_FMT  = '"$"#,##0;("$"#,##0)';
const USD2_FMT = '"$"#,##0.00;("$"#,##0.00)';
const GBP_FMT  = '"£"#,##0.00';
const PCT_FMT  = "0.0%";
const INT_FMT  = "#,##0";
const MULT_FMT = '0.00"x"';
const DATE_FMT = "dd-mmm-yy";

function c(v, opts = {}) {
  const obj = { v, t: opts.t || (typeof v === "number" ? "n" : "s") };
  if (opts.f) { obj.f = opts.f; obj.t = "n"; delete obj.v; }
  const s = {};
  if (opts.fill)   s.fill   = fill(opts.fill);
  if (opts.font)   s.font   = opts.font;
  if (opts.align)  s.alignment = opts.align;
  if (opts.border) s.border = thinBorder;
  if (opts.numFmt) s.numFmt = opts.numFmt;
  if (Object.keys(s).length) obj.s = s;
  return obj;
}

// Convenience builders
const hdr = (v, bg = C.COBALT_DARK, sz = 9) => c(v, {
  fill: bg, border: true,
  font: font({ bold: true, color: C.WHITE, sz }),
  align: align("center"),
});
const lbl = (v, bg = C.CREAM, indent = 0, wrap = false) => c(v, {
  fill: bg, border: true,
  font: font({ color: C.DARK }),
  align: { horizontal: "left", vertical: "center", indent, wrapText: wrap },
});
const num = (v, fmt = USD_FMT, bg = C.CREAM, color = C.DARK) => c(v, {
  fill: bg, border: true,
  font: font({ color }),
  align: align("right"),
  numFmt: fmt,
});
const inp = (v, fmt = USD2_FMT, bg = C.CREAM) => c(v, {
  fill: bg, border: true,
  font: font({ color: C.BLUE_IN }),
  align: align("right"),
  numFmt: fmt,
});
const tot = (v, fmt = USD_FMT, isFormula = false) => {
  const obj = isFormula
    ? c(0, { fill: C.GOLD, border: true, font: font({ bold: true }), align: align("right"), numFmt: fmt })
    : c(v, { fill: C.GOLD, border: true, font: font({ bold: true }), align: align("right"), numFmt: fmt });
  if (isFormula) { obj.f = v; obj.t = "n"; delete obj.v; }
  return obj;
};
const totLbl = (v) => c(v, {
  fill: C.GOLD, border: true,
  font: font({ bold: true }),
  align: align("left"),
});
const secHdr = (v, bg = C.COBALT) => c(v, {
  fill: bg, border: false,
  font: font({ bold: true, color: bg === C.COBALT_LITE ? C.COBALT_DARK : C.WHITE, sz: 9 }),
  align: align("left"),
});
const empty = (bg = C.WHITE) => c("", { fill: bg });

// ── SHEET BUILDER HELPER ─────────────────────────────────────────────────────
function addRow(ws, data, rowNum) {
  data.forEach((cellObj, i) => {
    if (!cellObj) return;
    const addr = XLSX.utils.encode_cell({ r: rowNum - 1, c: i });
    ws[addr] = cellObj;
  });
}

function setColWidths(ws, widths) {
  ws["!cols"] = widths.map(w => ({ wch: w }));
}

function mergeCells(ws, r1, c1, r2, c2) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({
    s: { r: r1 - 1, c: c1 - 1 },
    e: { r: r2 - 1, c: c2 - 1 },
  });
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────────
const toUSD = (n) => n == null ? 0 : Number(n);
const now   = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// ── STATIC PORTFOLIO (from Supabase series_spv investments) ──────────────────
// These are the investments held via the Cayman fund structure (all Delaware SPVs
// feed through to Cayman LP economically). We embed the verified list here as
// the Cayman fund entity doesn't have its own investment rows in Supabase yet.
const PORTFOLIO = [
  { company: "Anthropic (Dec 24)",          stage: "Growth", date: "2024-12-25", cost: 1361619.75 },
  { company: "SpaceX (Dec 24)",             stage: "Growth", date: "2024-12-24", cost: 1175523.42 },
  { company: "XAi (July 25)",               stage: "Growth", date: "2025-07-23", cost: 1469404.69 },
  { company: "Cursor",                      stage: "Growth", date: "2025-10-01", cost: 1080996.34 },
  { company: "Neuralink",                   stage: "Growth", date: "2025-07-22", cost: 1134657.02 },
  { company: "Revolut (Nov 25)",            stage: "Growth", date: "2025-11-24", cost: 1041274.01 },
  { company: "Groq (May 25)",               stage: "Growth", date: "2025-06-06", cost: 805692.31  },
  { company: "Sygaldry Technologies (Jan 26)", stage: "Growth", date: "2026-02-23", cost: 899999.97 },
  { company: "Kraken",                      stage: "Growth", date: "2025-12-19", cost: 780003.00  },
  { company: "OpenAI (Oct 24)",             stage: "Growth", date: "2024-10-16", cost: 329530.00  },
  { company: "Polymarket",                  stage: "Growth", date: "2026-01-15", cost: 454977.00  },
  { company: "Perplexity (Sept 24)",        stage: "Growth", date: "2024-10-13", cost: 499744.00  },
  { company: "Anduril (Dec 24)",            stage: "Growth", date: "2025-01-07", cost: 660564.54  },
  { company: "Anduril (March 25)",          stage: "Growth", date: "2025-03-12", cost: 449102.51  },
  { company: "Databricks (Jan 25)",         stage: "Growth", date: "2025-01-16", cost: 370000.00  },
  { company: "Phantom Space",               stage: "Growth", date: "2025-07-10", cost: 212859.17  },
  { company: "Revolut",                     stage: "Growth", date: "2024-11-30", cost: 217789.02  },
  { company: "Aetherflux",                 stage: "Growth", date: "2025-10-27", cost: 209410.00  },
  { company: "Anthropic (Aug 25)",          stage: "Growth", date: "2025-08-22", cost: 1013799.18 },
  { company: "Anthropic (March 25)",        stage: "Growth", date: "2025-03-26", cost: 85468.81   },
  { company: "Anthropic (Nov 25)",          stage: "Growth", date: "2025-11-07", cost: 260698.11  },
  { company: "Anthropic (Jan 26)",          stage: "Growth", date: "2026-02-11", cost: 350700.00  },
  { company: "Oneleet",                     stage: "Growth", date: "2025-09-19", cost: 145063.77  },
  { company: "XAi",                         stage: "Growth", date: "2024-11-28", cost: 442100.00  },
  { company: "XAI (May 25) II",             stage: "Growth", date: "2025-05-23", cost: 93278.35   },
  { company: "Proper Wild",                 stage: "Growth", date: "2025-10-02", cost: 197500.00  },
  { company: "YASO",                        stage: "Growth", date: "2025-08-29", cost: 125000.00  },
  { company: "Northwood Space",             stage: "Growth", date: "2026-02-04", cost: 85000.00   },
  { company: "SpaceX (Dec 25)",             stage: "Growth", date: "2025-12-31", cost: 227976.19  },
  { company: "Tonic Health",                stage: "Growth", date: "2025-08-29", cost: 99959.82   },
  { company: "ElevenLabs",                 stage: "Growth", date: "2025-01-15", cost: 101535.61  },
  { company: "Extropic",                   stage: "Growth", date: "2024-09-13", cost: 128400.00  },
  { company: "Vercel",                      stage: "Growth", date: "2025-12-15", cost: 100000.00  },
  { company: "Stripe",                      stage: "Growth", date: "2025-01-30", cost: 271500.00  },
  { company: "Databricks (Dec 25)",         stage: "Growth", date: "2025-12-16", cost: 135204.43  },
  { company: "Sesame",                      stage: "Growth", date: "2025-10-18", cost: 45812.41   },
  { company: "Authologic",                 stage: "Growth", date: "2024-11-30", cost: 51506.15   },
  { company: "Phagos",                     stage: "Growth", date: "2024-09-27", cost: 51186.04   },
  { company: "Audiomob (Apr 25)",           stage: "Growth", date: "2025-07-30", cost: 43272.53   },
  { company: "Mango",                       stage: "Growth", date: "2025-01-29", cost: 49500.00   },
  { company: "Perplexity (Sep 24)",         stage: "Growth", date: "2024-10-13", cost: 36300.00   },
  { company: "Radiant Nuclear",             stage: "Growth", date: "2025-03-25", cost: 178087.93  },
  { company: "Stoke Space",                stage: "Growth", date: "2025-02-04", cost: 288250.00  },
  { company: "Stoke Space (Sept 25)",      stage: "Growth", date: "2025-09-30", cost: 160065.98  },
  { company: "InCard (Nov 25)",             stage: "Growth", date: "2026-01-06", cost: 266005.13  },
  { company: "Innerworks",                 stage: "Seed",   date: "2024-09-30", cost: 214039.00  },
  { company: "DeepFlow (Formerly Fractal)", stage: "Seed",   date: "2024-12-10", cost: 238692.00  },
  { company: "Living Things",              stage: "Seed",   date: "2025-06-04", cost: 160383.45  },
  { company: "Living Things (Dec 25)",     stage: "Seed",   date: "2026-02-02", cost: 104998.19  },
  { company: "Beyond Reach Labs (YC W26)", stage: "Seed",   date: "2026-03-18", cost: 144999.95  },
  { company: "Titan Dynamics",             stage: "Seed",   date: "2025-09-19", cost: 80000.00   },
  { company: "Gale (YC W25)",              stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Wildcard (YC W25)",          stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Asteroid (YC W25)",          stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Finbar (YC W25)",            stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Superglue (YC W25)",         stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Steinmetz (YC W25)",         stage: "Seed",   date: "2025-03-12", cost: 122950.89  },
  { company: "Piris Labs (YC W26)",        stage: "Seed",   date: "2026-03-18", cost: 117989.23  },
  { company: "BLOK",                        stage: "Seed",   date: "2024-11-01", cost: 110410.07  },
  { company: "BLOK (Apr 25)",              stage: "Seed",   date: "2025-05-08", cost: 72750.00   },
  { company: "Heata",                      stage: "Seed",   date: "2024-10-29", cost: 44200.00   },
  { company: "WineFi (March 25)",          stage: "Seed",   date: "2025-03-08", cost: 56251.38   },
  { company: "yhangry",                    stage: "Seed",   date: "2024-11-23", cost: 69850.30   },
  { company: "Falkin",                     stage: "Seed",   date: "2025-04-30", cost: 71405.00   },
  { company: "Eloquent AI",               stage: "Seed",   date: "2025-04-08", cost: 81500.00   },
  { company: "Rollr",                      stage: "Seed",   date: "2025-02-11", cost: 42250.00   },
  { company: "Sygaldry Technologies (July 25)", stage: "Seed", date: "2025-07-22", cost: 171467.97 },
  { company: "GLP-1 Pro",                 stage: "Seed",   date: "2024-12-31", cost: 53750.00   },
  { company: "Fabacus",                   stage: "Seed",   date: "2025-09-02", cost: 49651.00   },
  { company: "Kindling Money",            stage: "Seed",   date: "2025-07-22", cost: 50000.00   },
  { company: "Maeving (Jan 25)",          stage: "Seed",   date: "2025-02-04", cost: 30000.00   },
  { company: "Adclear.ai",               stage: "Seed",   date: "2024-10-16", cost: 9975.00    },
  { company: "Briefcase",                stage: "Seed",   date: "2024-10-16", cost: 21475.00   },
  { company: "Unbound",                  stage: "Seed",   date: "2025-01-24", cost: 25000.00   },
  { company: "GuLP (Oct 25)",            stage: "Seed",   date: "2025-11-28", cost: 58500.00   },
];

// Known invoice actuals (formation costs)
const INVOICES = [
  {
    ref: "F30-2.2", date: "08 Apr 2026", supplier: "RW Blears LLP",
    entity: "FC Strat. Opps. Fund I GP Ltd", category: "Legal & Formation",
    srcCcy: "GBP", srcAmount: 17600.00, fxRate: FX_GBP_USD,
    usdAmount: Math.round(17600.00 * FX_GBP_USD * 100) / 100,
    status: "Due / Payable",
    notes: "Fund formation & GP setup. Agreed Fee £17,500 + DocuSign £100.",
    lines: [
      { desc: "Agreed Fee",  qty: 1, unit: 17500, srcCcy: "GBP", usd: 17500 * FX_GBP_USD },
      { desc: "DocuSign",    qty: 1, unit:   100, srcCcy: "GBP", usd:   100 * FX_GBP_USD },
    ],
  },
  {
    ref: "808615", date: "09 Apr 2026", supplier: "Walkers (Global)",
    entity: "FC Strat. Opps. Fund I LP", category: "Legal & Formation",
    srcCcy: "USD", srcAmount: 11927.40, fxRate: 1.00,
    usdAmount: 11927.40,
    status: "Due / Payable",
    notes: "LP SPV launch, LPA, GIIN, EIN, A&R LPA. Pay Butterfield Bank BNTBKYKY ref L16687-808615.",
    lines: [
      { desc: "Professional Charges (8.40 hrs)", qty: 1, unit: 11580.00, srcCcy: "USD", usd: 11580.00 },
      { desc: "Disbursements — Sundry Expense",  qty: 1, unit:   347.40, srcCcy: "USD", usd:   347.40 },
    ],
  },
  {
    ref: "F30-2.3", date: "13 Apr 2026", supplier: "Paxiot Limited",
    entity: "FC Strat. Opps. Fund I GP Ltd", category: "Fund Administration",
    srcCcy: "GBP", srcAmount: 10200.00, fxRate: 1.3445,
    usdAmount: Math.round(10200.00 * 1.3445 * 100) / 100,
    status: "Due / Payable",
    notes: "Set-up fee and quarterly management fees. FX rate 1.3445 (13 Apr 2026).",
    lines: [
      { desc: "Set-up fee and quarterly management fees", qty: 1, unit: 10200, srcCcy: "GBP", usd: 10200 * 1.3445 },
    ],
  },
];

const totalInvoiceUSD = INVOICES.reduce((s, inv) => s + inv.usdAmount, 0);

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[CaymanPL] Fetching Supabase data...");

  // Fetch live data for any entity_costs against Cayman entities
  const [entityCosts] = await Promise.all([
    supabaseFetch("entity_costs", "*",
      `entity_id=in.(${CAYMAN_FUND_ID},${CAYMAN_GP_ID})&order=cost_date.desc`),
  ]);

  console.log(`[CaymanPL] entity_costs: ${entityCosts.length}`);

  const portfolio = PORTFOLIO.sort((a, b) => {
    if (a.stage !== b.stage) return a.stage === "Growth" ? -1 : 1;
    return b.cost - a.cost;
  });

  const totalCost    = portfolio.reduce((s, p) => s + p.cost, 0);
  const growthCost   = portfolio.filter(p => p.stage === "Growth").reduce((s, p) => s + p.cost, 0);
  const seedCost     = portfolio.filter(p => p.stage === "Seed").reduce((s, p) => s + p.cost, 0);
  const growthCount  = portfolio.filter(p => p.stage === "Growth").length;
  const seedCount    = portfolio.filter(p => p.stage === "Seed").length;

  // Paxiot flat fee: £2,400/month × 12 × FX 1.3445 = ~$38,716/year (Investment Period)
  const mgmtFeeAnn   = PAXIOT_ANN_USD;
  const caymanOps    = 4268 + 15000 + 18000 + 2500; // CIMA + admin + audit + FATCA/CRS
  const legalActuals = totalInvoiceUSD;
  const totalExpense = mgmtFeeAnn + caymanOps + legalActuals;
  const lpCapital    = totalCost * 0.99;
  const gpCapital    = totalCost * 0.01;

  const wb = XLSX.utils.book_new();

  // ── SHEET 1: COVER ──────────────────────────────────────────────────────────
  const wsCov = {};
  wsCov["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsCov, [2, 28, 18, 18, 18, 18, 3]);

  const covRows = [
    [null],
    [null],
    [null, c("Founders Capital", { fill: C.DARK, font: font({ bold: true, sz: 22, color: C.WHITE }), align: align("left", "center") })],
    [null, c("Strategic Opportunities Fund I  ·  Cayman Islands  ·  P&L Reporting Model", {
      fill: C.DARK, font: font({ sz: 13, color: C.COBALT }), align: align("left", "center") })],
    [null],
    [null, c("Entity", { fill: C.DARK, font: font({ color: C.MID_GREY, bold: true, sz: 9 }), align: align("left") }),
           c("FC Strat. Opps. Fund I GP Limited", { fill: C.DARK, font: font({ color: C.WHITE, sz: 9 }), align: align("left") }),
           null, null,
           c("Jurisdiction: Cayman Islands", { fill: C.DARK, font: font({ color: C.MID_GREY, sz: 9, italic: true }), align: align("right") })],
    [null, c("Fund LP", { fill: C.DARK, font: font({ color: C.MID_GREY, bold: true, sz: 9 }), align: align("left") }),
           c("Founders Capital Strat. Opps. Fund I LP", { fill: C.DARK, font: font({ color: C.WHITE, sz: 9 }), align: align("left") }),
           null, null,
           c("Currency: USD", { fill: C.DARK, font: font({ color: C.MID_GREY, sz: 9, italic: true }), align: align("right") })],
    [null, c("Sole LP", { fill: C.DARK, font: font({ color: C.MID_GREY, bold: true, sz: 9 }), align: align("left") }),
           c("FC Group Holding Ltd (99%)", { fill: C.DARK, font: font({ color: C.WHITE, sz: 9 }), align: align("left") }),
           null, null,
           c(`As of: ${now}`, { fill: C.DARK, font: font({ color: C.MID_GREY, sz: 9, italic: true }), align: align("right") })],
    [null, c("Mgmt Fee", { fill: C.DARK, font: font({ color: C.MID_GREY, bold: true, sz: 9 }), align: align("left") }),
           c("£2,400/month (Paxiot — flat fee, Investment Period)", { fill: C.DARK, font: font({ color: C.WHITE, sz: 9 }), align: align("left") }),
           null, null,
           c("Carry: 20% — no hurdle (LPA Cl.11.1)", { fill: C.DARK, font: font({ color: C.MID_GREY, sz: 9, italic: true }), align: align("right") })],

    [null],
    [null, c("Sheet", { fill: C.DARK, font: font({ bold: true, color: C.MID_GREY, sz: 9 }), align: align("left") }),
           c("Contents", { fill: C.DARK, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left") }),
           c("Description", { fill: C.DARK, font: font({ bold: true, color: C.MID_GREY, sz: 9 }), align: align("left") })],
  ];
  const sheetList = [
    ["1", "Assumptions",     "Fund economics, fee parameters, FX, regulatory flags"],
    ["2", "Fund Summary",    "Consolidated P&L, KPIs, portfolio breakdown by stage"],
    ["3", "Portfolio",       `Full investment register — ${portfolio.length} positions, fair values, MOIC`],
    ["4", "Waterfall",       "LP distribution waterfall — return of capital → 80% LP / 20% FC Group Holding carry"],

    ["5", "Cap Accounts",    "LP capital account — contributions, income, expenses, distributions"],
    ["6", "GP Economics",    "Management fee accruals, carry, Cayman running costs"],
    ["7", "Invoices",        "Formation & operating invoices with FX conversion"],
  ];
  sheetList.forEach(([n, name, desc]) => {
    covRows.push([null,
      c(n,    { fill: C.DARK, font: font({ color: C.COBALT, bold: true, sz: 9 }), align: align("left") }),
      c(name, { fill: C.DARK, font: font({ color: C.WHITE, bold: true, sz: 9 }), align: align("left") }),
      c(desc, { fill: C.DARK, font: font({ color: C.MID_GREY, italic: true, sz: 9 }), align: align("left") }),
    ]);
  });
  covRows.push([null]);
  covRows.push([null, c(`Generated: ${now}  ·  Data: Supabase + verified actuals  ·  Founders Capital Portal`, {
    fill: C.DARK, font: font({ color: C.MID_GREY, sz: 8, italic: true }), align: align("left") })]);

  covRows.forEach((row, i) => addRow(wsCov, row, i + 1));
  mergeCells(wsCov, 3, 2, 3, 6);
  mergeCells(wsCov, 4, 2, 4, 6);
  for (let r = 6; r <= 9; r++) mergeCells(wsCov, r, 3, r, 5);
  mergeCells(wsCov, 12, 4, 12, 6);
  sheetList.forEach((_, i) => mergeCells(wsCov, 13 + i, 4, 13 + i, 6));
  wsCov["!ref"] = `A1:G${covRows.length + 2}`;
  XLSX.utils.book_append_sheet(wb, wsCov, "Cover");

  // ── SHEET 2: ASSUMPTIONS ────────────────────────────────────────────────────
  const wsAss = {};
  wsAss["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsAss, [2, 36, 18, 44, 20]);

  let r = 1;
  addRow(wsAss, [null], r++);
  addRow(wsAss, [null, c("FC CAYMAN FUND I  ·  ASSUMPTIONS & PARAMETERS", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsAss, r - 1, 2, r - 1, 5);
  addRow(wsAss, [null], r++);

  addRow(wsAss, [null, secHdr("Fund Economics")], r++);
  mergeCells(wsAss, r - 1, 2, r - 1, 5);
  addRow(wsAss, [null, hdr("Parameter"), hdr("Value"), hdr("Note"), hdr("Reference")], r++);

  const fundEcon = [
    ["Paxiot Management Fee (Investment Period)",  "£2,400/month", null, "Flat monthly fee + VAT — paid quarterly in advance. NOT % of NAV.", "Mgmt Agreement Schedule 1"],
    ["Paxiot Management Fee (Post-Inv. Period)",  "£1,400/month", null, "Reduced flat fee until LP obtains own AIFM permission.",           "Mgmt Agreement Schedule 1"],
    ["Paxiot Set-Up Fee",                          "£3,000",       null, "One-off on First Closing Date (2 Apr 2026) + VAT.",                "Mgmt Agreement Schedule 1"],
    ["Secondment Hosting Fee",                     "£100/month",   null, "FC Group Holding pays Paxiot for R. Hadler secondment.",           "Secondment Agreement Cl.6"],
    ["Carried Interest Rate",                      0.20,           PCT_FMT, "20% of profits after return of capital — NO hurdle rate.",     "LPA Clause 11.1"],
    ["Carry Recipient",                            "FC Group Holding Ltd", null, "Arranger and 99% LP — receives carried interest.",          "LPA Clause 11.1 / Arrangement Agreement"],
    ["Preferred Return / Hurdle Rate",             "None",         null, "LPA Clause 11.1 contains no preferred return or hurdle.",          "LPA Clause 11.1"],
    ["GP Catch-Up",                                "None",         null, "No catch-up mechanism in any fund document.",                      "LPA Clause 11.1"],
    ["High-Water Mark",                            "None",         null, "No HWM mechanism in any fund document.",                           "LPA Clause 11.1"],
    ["GP Commitment",                              0.01,           PCT_FMT, "GP commits 1% of total fund capital.",                         "LPA Clause 5"],
    ["Formation Costs Cap",                        "$130,000",     null, "Partnership bears formation costs up to $130,000.",                "LPA Clause 7.1"],
    ["Fund Life",                                  "10 years",     null, "5yr investment period + 5yr harvest period.",                      "LPA Clause 3.1"],
    ["Fund Inception",                             "9 Oct 2025",   null, "Establishment date; First Closing 2 April 2026.",                  "LPA Recitals"],
  ];
  fundEcon.forEach(([label, val, fmt, note, ref], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsAss, [null, lbl(label, bg),
      fmt ? inp(typeof val === "number" ? val : val, fmt, bg) : c(val, { fill: bg, font: font({ color: C.BLUE_IN }), align: align("right"), border: true }),
      lbl(note, bg, 0, true), lbl(ref, bg)], r++);
  });

  r++;
  addRow(wsAss, [null, secHdr("Valuation, Tax & Regulatory")], r++);
  mergeCells(wsAss, r - 1, 2, r - 1, 5);
  addRow(wsAss, [null, hdr("Parameter"), hdr("Value"), hdr("Note"), hdr("Reference")], r++);
  const regParams = [
    ["FX Rate (GBP/USD)",         "1.27",                "Update at each reporting date — used for GBP invoice conversion"],
    ["Valuation Basis",           "IPEV Cost",           "At cost until formally marked — per IPEV Guidelines"],
    ["NAV Reporting Frequency",   "Quarterly",           "NAV calculated and reported each quarter-end"],
    ["Statutory Audit",           "Annual (Cayman GAAP)","Required for all CIMA-registered funds"],
    ["FATCA Status",              "Reporting FI",        "Classified as Reporting Financial Institution"],
    ["CRS Status",                "Reporting FI",        "Annual CRS report filed to CIMA"],
    ["CIMA Registration",         "Registered Private Fund", "Section 4, Mutual Funds Law (as amended)"],
    ["Economic Substance",        "Investment Fund",     "Cayman ES Act — investment fund exemption"],
  ];
  regParams.forEach(([label, val, note], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsAss, [null, lbl(label, bg),
      c(val, { fill: bg, font: font({ color: C.BLUE_IN }), align: align("right"), border: true }),
      lbl(note, bg, 0, true), lbl("", bg)], r++);
  });

  wsAss["!ref"] = `A1:E${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsAss, "Assumptions");

  // ── SHEET 3: FUND SUMMARY ───────────────────────────────────────────────────
  const wsSum = {};
  wsSum["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsSum, [2, 34, 20, 18, 18, 24]);

  r = 1;
  addRow(wsSum, [null], r++);
  addRow(wsSum, [null, c("FC CAYMAN FUND I  ·  CONSOLIDATED FUND SUMMARY", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsSum, r - 1, 2, r - 1, 6);
  addRow(wsSum, [null, c(`As of ${now}  ·  Reporting currency: USD  ·  Positions at cost`, {
    font: font({ sz: 9, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsSum, r - 1, 2, r - 1, 6);
  r++;

  // KPIs
  addRow(wsSum, [null, secHdr("Key Performance Indicators")], r++);
  mergeCells(wsSum, r - 1, 2, r - 1, 6);
  addRow(wsSum, [null, hdr("Metric"), hdr("Inception to Date"), hdr("Prior Quarter"), hdr("Current Quarter"), hdr("Note")], r++);
  const kpis = [
    ["Total Capital Invested ($)", totalCost,       20000000,    totalCost,       "At cost — full portfolio", USD_FMT],
    ["Number of Investments",      portfolio.length, portfolio.length - 5, portfolio.length, "Active positions",   INT_FMT],
    ["NAV / Gross Portfolio Value ($)", totalCost,  20000000,    totalCost,       "At cost — update when marked", USD_FMT],
    ["Unrealised Gain / (Loss) ($)",    0,          0,           0,               "Nil — positions at cost", USD_FMT],
    ["MOIC (Gross)",               1.00,            1.00,        1.00,            "At cost = 1.0x",           MULT_FMT],
    ["DPI",                        0.00,            0.00,        0.00,            "No distributions to date", '0.00"x"'],
    ["TVPI",                       1.00,            1.00,        1.00,            "= MOIC at cost",           MULT_FMT],
    // NOTE: No preferred return / hurdle in LPA Clause 11.1 — row removed
    ["Paxiot Mgmt Fee (ann. $)",   mgmtFeeAnn,     mgmtFeeAnn,  mgmtFeeAnn/4,   "£2,400/month × 12 × FX 1.3445", USD_FMT],
  ];
  kpis.forEach(([label, itd, pq, cq, note, fmt], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsSum, [null, lbl(label, bg), num(itd, fmt, bg), num(pq, fmt, bg), num(cq, fmt, bg), lbl(note, bg, 0, true)], r++);
  });
  r++;

  // Portfolio breakdown
  addRow(wsSum, [null, secHdr("Portfolio by Stage")], r++);
  mergeCells(wsSum, r - 1, 2, r - 1, 6);
  addRow(wsSum, [null, hdr("Stage"), hdr("# Investments"), hdr("Cost Basis ($)"), hdr("% of Portfolio"), hdr("Fair Value ($)")], r++);
  [
    ["Growth", growthCount, growthCost],
    ["Seed",   seedCount,   seedCost],
  ].forEach(([stage, count, cost], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsSum, [null, lbl(stage, bg), num(count, INT_FMT, bg), num(cost, USD_FMT, bg),
      num(cost / totalCost, PCT_FMT, bg), num(cost, USD_FMT, bg)], r++);
  });
  addRow(wsSum, [null, totLbl("TOTAL"), tot(portfolio.length, INT_FMT),
    tot(totalCost, USD_FMT), tot(1.00, PCT_FMT), tot(totalCost, USD_FMT)], r++);
  r++;

  // P&L Statement
  addRow(wsSum, [null, secHdr("P&L Statement (Inception to Date)")], r++);
  mergeCells(wsSum, r - 1, 2, r - 1, 6);
  addRow(wsSum, [null, hdr("Line Item"), hdr("Inception to Date ($)"), hdr("FY 2025 ($)"), hdr("Q1 2026 ($)"), hdr("Note")], r++);

  const plLines = [
    { sec: "INCOME" },
    { label: "Unrealised Gains on Investments",          itd: 0,             fy: 0,            q1: 0,            note: "At cost — update when marked" },
    { label: "Realised Gains on Exits",                   itd: 0,             fy: 0,            q1: 0,            note: "No exits to date" },
    { label: "Secondary Sale Income (net)",               itd: 0,             fy: 0,            q1: 0,            note: "e.g. ATHOS-type arrangement fees" },
    { total: "Total Income",                              itd: 0,             fy: 0,            q1: 0 },
    { gap: true },
    { sec: "EXPENSES" },
    { label: "Paxiot Management Fee (£2,400/month flat)",  itd: -mgmtFeeAnn,   fy: -mgmtFeeAnn,  q1: -(mgmtFeeAnn/4), note: "Flat monthly fee — Investment Period. Mgmt Agreement Schedule 1." },
    { label: "Legal & Formation (actuals)",               itd: -legalActuals, fy: -legalActuals, q1: 0,           note: "RW Blears + Walkers + Paxiot — see Invoices sheet" },

    { label: "Fund Administration & Audit",               itd: -33000,        fy: -33000,        q1: 0,           note: "Admin $15k + audit $18k" },
    { label: "CIMA & FATCA/CRS",                          itd: -6768,         fy: -6768,         q1: 0,           note: "CIMA $4,268 + FATCA/CRS $2,500" },
    { total: "Total Expenses",                            itd: -totalExpense, fy: -totalExpense, q1: -(mgmtFeeAnn/4) },
    { gap: true },
    { total: "NET INCOME / (LOSS)",                       itd: -totalExpense, fy: -totalExpense, q1: -(mgmtFeeAnn/4) },
  ];

  plLines.forEach((line) => {
    if (line.sec) {
      addRow(wsSum, [null, secHdr(line.sec, C.COBALT_LITE)], r++);
      mergeCells(wsSum, r - 1, 2, r - 1, 6);
    } else if (line.gap) {
      r++;
    } else if (line.total) {
      addRow(wsSum, [null, totLbl(line.total),
        tot(line.itd, USD_FMT), tot(line.fy, USD_FMT), tot(line.q1, USD_FMT),
        c("", { fill: C.GOLD })], r++);
    } else {
      const bg = r % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
      addRow(wsSum, [null, lbl(line.label, bg, 1, true),
        num(line.itd, USD_FMT, bg), num(line.fy, USD_FMT, bg), num(line.q1, USD_FMT, bg),
        lbl(line.note, bg, 0, true)], r++);
    }
  });

  wsSum["!ref"] = `A1:F${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsSum, "Fund Summary");

  // ── SHEET 4: PORTFOLIO ──────────────────────────────────────────────────────
  const wsPort = {};
  wsPort["!sheetViews"] = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
  setColWidths(wsPort, [2, 32, 10, 14, 16, 16, 16, 10, 9, 10, 20]);

  r = 1;
  addRow(wsPort, [null], r++);
  addRow(wsPort, [null, c("FC CAYMAN FUND I  ·  PORTFOLIO INVESTMENT REGISTER", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsPort, r - 1, 2, r - 1, 11);
  addRow(wsPort, [null, c(`As of ${now}  ·  ${portfolio.length} investments  ·  USD  ·  Fair Value (blue) = cost until formally marked`, {
    font: font({ sz: 9, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsPort, r - 1, 2, r - 1, 11);
  addRow(wsPort, [null,
    hdr("Company"), hdr("Stage"), hdr("Inv. Date"),
    hdr("Cost Basis ($)"), hdr("Fair Value ($)"), hdr("Unrealised G/(L) ($)"),
    hdr("MOIC"), hdr("% Portfolio"), hdr("Own %"), hdr("Notes")], r++);

  const dataStart = r;
  let currentStage = null;
  const growthRows = [], seedRows = [];

  portfolio.forEach((p) => {
    if (p.stage !== currentStage) {
      currentStage = p.stage;
      addRow(wsPort, [null, secHdr(`── ${p.stage.toUpperCase()} STAGE`)], r++);
      mergeCells(wsPort, r - 1, 2, r - 1, 11);
    }
    const bg = r % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    const rowNum = r;
    addRow(wsPort, [null,
      lbl(p.company, bg),
      lbl(p.stage, bg),
      c(p.date, { fill: bg, font: font(), align: align("center"), border: true, numFmt: DATE_FMT, t: "s" }),
      num(p.cost, USD2_FMT, bg),
      inp(p.cost, USD2_FMT, bg),    // fair value — blue input
      c(0, { f: `F${rowNum}-E${rowNum}`, fill: bg, font: font(), align: align("right"), border: true, numFmt: USD2_FMT }),
      c(0, { f: `IF(E${rowNum}>0,F${rowNum}/E${rowNum},1)`, fill: bg, font: font(), align: align("right"), border: true, numFmt: MULT_FMT }),
      c(0, { f: `E${rowNum}/${totalCost}`, fill: bg, font: font({ color: C.GREEN_LK }), align: align("right"), border: true, numFmt: PCT_FMT }),
      inp(null, "0.000%", bg),       // ownership % — input
      lbl("", bg),
    ], r);
    if (p.stage === "Growth") growthRows.push(r);
    else seedRows.push(r);
    r++;
  });

  // Subtotals
  const mkSubtot = (label, rows) => {
    const eRefs = rows.map(x => `E${x}`).join(",");
    const fRefs = rows.map(x => `F${x}`).join(",");
    addRow(wsPort, [null, totLbl(label),
      c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
      tot(`SUM(${eRefs})`, USD2_FMT, true),
      tot(`SUM(${fRefs})`, USD2_FMT, true),
      tot(`F${r}-E${r}`,   USD2_FMT, true),
      tot(`IF(E${r}>0,F${r}/E${r},1)`, MULT_FMT, true),
      tot(`E${r}/${totalCost}`, PCT_FMT, true),
      c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
    ], r++);
  };

  const gSubR = r; mkSubtot("GROWTH SUBTOTAL", growthRows);
  r++;
  const sSubR = r; mkSubtot("SEED SUBTOTAL", seedRows);
  r++;

  addRow(wsPort, [null, totLbl("PORTFOLIO TOTAL"),
    c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
    tot(`E${gSubR}+E${sSubR}`, USD2_FMT, true),
    tot(`F${gSubR}+F${sSubR}`, USD2_FMT, true),
    tot(`F${r}-E${r}`,   USD2_FMT, true),
    tot(`IF(E${r}>0,F${r}/E${r},1)`, MULT_FMT, true),
    tot(1.00, PCT_FMT),
    c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
  ], r++);

  wsPort["!ref"] = `A1:K${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsPort, "Portfolio");

  // ── SHEET 5: WATERFALL ──────────────────────────────────────────────────────
  const wsWf = {};
  wsWf["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsWf, [2, 42, 20, 20, 20, 22]);

  r = 1;
  addRow(wsWf, [null], r++);
  addRow(wsWf, [null, c("FC CAYMAN FUND I  ·  DISTRIBUTION WATERFALL", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsWf, r - 1, 2, r - 1, 6);
  addRow(wsWf, [null, c("Return of Capital → 80% LP (FC Group Holding) / 20% FC Group Holding Carry  ·  No hurdle  ·  LPA Clause 11.1", {
    font: font({ sz: 9, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsWf, r - 1, 2, r - 1, 6);
  r++;

  addRow(wsWf, [null, secHdr("Inputs (blue = editable)")], r++);
  mergeCells(wsWf, r - 1, 2, r - 1, 6);
  addRow(wsWf, [null, hdr("Parameter"), hdr("Value"), null, null, hdr("Note")], r++);
  mergeCells(wsWf, r - 1, 3, r - 1, 5);

  const inpRows = {};
  // LPA Clause 11.1 waterfall: no hurdle, no catch-up, no HWM
  const wfInputs = [
    ["Total Capital Invested ($)",   totalCost, USD2_FMT, "Total fund cost basis"],
    ["Realisable Value / NAV ($)",   totalCost, USD2_FMT, "Update as exits / marks occur"],
    ["Carried Interest Rate",        0.20,      PCT_FMT,  "20% — FC Group Holding (LPA Cl.11.1)"],
    ["LP Interest (FC Group Holding)", 0.99,   PCT_FMT,  "FC Group Holding Ltd — sole 99% LP"],
    ["GP Interest",                  0.01,      PCT_FMT,  "FC Strat. Opps. Fund I GP Ltd — 1%"],
  ];
  wfInputs.forEach(([label, val, fmt, note], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    const row = r;
    addRow(wsWf, [null, lbl(label, bg), inp(val, fmt, bg), null, null, lbl(note, bg, 0, true)], r);
    mergeCells(wsWf, r, 3, r, 5);
    inpRows[label] = r;
    r++;
  });

  const I = (k) => `C${inpRows[k]}`;
  const INV = I("Total Capital Invested ($)");
  const NAV = I("Realisable Value / NAV ($)");
  const CRY = I("Carried Interest Rate");
  const LP  = I("LP Interest (FC Group Holding)");
  const GP  = I("GP Interest");

  r++;
  addRow(wsWf, [null, secHdr("Waterfall Steps")], r++);
  mergeCells(wsWf, r - 1, 2, r - 1, 6);
  addRow(wsWf, [null, hdr("Step"), hdr("Pool ($)"), hdr("LP ($)"), hdr("GP ($)"), hdr("Running Balance ($)")], r++);

  // LPA Clause 11.1 — two-step waterfall: return of capital → 80% LP / 20% FC Group Holding carry
  // No preferred return, no GP catch-up, no HWM
  const W = r;
  const wfSteps = [
    ["Total Proceeds Available",                                           `=${NAV}`,                      `=C${W}*${LP}`,              `=C${W}*${GP}`,              `=C${W}`],
    ["Step 1: Return of Capital (LPA Cl.11.1(a))",                        `=${INV}`,                      `=C${W+1}*${LP}`,            `=C${W+1}*${GP}`,            `=MAX(0,F${W}-C${W+1})`],
    ["Step 2: Remaining — 80% LP (FC Group Holding) / 20% Carry (LPA Cl.11.1(b))", `=MAX(0,F${W+1})`,  `=C${W+2}*(1-${CRY})`,       `=C${W+2}*${CRY}`,           "=0"],
  ];
  wfSteps.forEach(([label, pool, lp, gp, bal], i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsWf, [null, lbl(label, bg, i > 0 ? 1 : 0),
      c(0, { f: pool, fill: bg, font: font(), align: align("right"), border: true, numFmt: USD2_FMT }),
      c(0, { f: lp,   fill: bg, font: font({ color: C.GREEN_LK }), align: align("right"), border: true, numFmt: USD2_FMT }),
      c(0, { f: gp,   fill: bg, font: font({ color: C.GREEN_LK }), align: align("right"), border: true, numFmt: USD2_FMT }),
      c(0, { f: bal,  fill: bg, font: font(), align: align("right"), border: true, numFmt: USD2_FMT }),
    ], r++);
  });
  addRow(wsWf, [null, totLbl("TOTAL LP / FC GROUP HOLDING ENTITLEMENT"),
    c("", { fill: C.GOLD }), tot(`SUM(D${W+1}:D${W+2})`, USD2_FMT, true),
    tot(`SUM(E${W+1}:E${W+2})`, USD2_FMT, true), c("", { fill: C.GOLD })], r++);
  addRow(wsWf, [null, c("Note: Carry recipient is FC Group Holding Ltd (LPA Cl.11.1 / Arrangement Agreement). No preferred return, catch-up, or HWM.", {
    font: font({ sz: 8, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsWf, r - 1, 2, r - 1, 6);

  wsWf["!ref"] = `A1:F${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsWf, "Waterfall");

  // ── SHEET 6: CAP ACCOUNTS ───────────────────────────────────────────────────
  const wsCap = {};
  wsCap["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsCap, [2, 40, 20, 18, 18, 26]);

  r = 1;
  addRow(wsCap, [null], r++);
  addRow(wsCap, [null, c("FC CAYMAN FUND I  ·  LP CAPITAL ACCOUNT STATEMENT", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsCap, r - 1, 2, r - 1, 6);
  addRow(wsCap, [null, c("Sole LP: FC Group Holding Ltd (99%)  ·  USD  ·  Prepared per IFRS / Cayman GAAP", {
    font: font({ sz: 9, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsCap, r - 1, 2, r - 1, 6);
  addRow(wsCap, [null, hdr("Account Line"), hdr("Inception to Date ($)"), hdr("FY 2025 ($)"), hdr("Q1 2026 ($)"), hdr("Note")], r++);

  const capSections = [
    { sec: "CAPITAL CONTRIBUTIONS" },
    { label: "Opening Balance (inception Oct 2025)",          itd: 0,           fy: 0,           q1: 0,              note: "Transfer from WNL Limited" },
    { label: "LP Capital — FC Group Holding Ltd (99%)",       itd: lpCapital,   fy: lpCapital,   q1: 0,              note: "At cost per portfolio register" },
    { label: "GP Capital Contributed (1%)",                   itd: gpCapital,   fy: gpCapital,   q1: 0,              note: "Per LPA" },
    { total: "TOTAL CAPITAL CONTRIBUTIONS",                    itd: lpCapital + gpCapital, fy: lpCapital + gpCapital, q1: 0 },
    { gap: true },
    { sec: "INCOME ALLOCATION (99% TO LP)" },
    { label: "Net Unrealised Gains / (Losses)",               itd: 0,           fy: 0,           q1: 0,              note: "At cost — update when marked" },
    { label: "Realised Gains on Exits",                       itd: 0,           fy: 0,           q1: 0,              note: "No exits to date" },
    { label: "Secondary Sale Arrangement Fee (net)",          itd: 0,           fy: 0,           q1: 0,              note: "12% fee on secondary proceeds" },
    { total: "TOTAL INCOME",                                   itd: 0,           fy: 0,           q1: 0 },
    { gap: true },
    { sec: "EXPENSES CHARGED TO FUND" },
    { label: "Paxiot Management Fee (£2,400/month flat)",    itd: -mgmtFeeAnn, fy: -mgmtFeeAnn, q1: -(mgmtFeeAnn/4), note: "Flat fee — Investment Period. Mgmt Agreement Schedule 1." },

    { label: "Legal & Formation — actuals (invoices)",        itd: -legalActuals, fy: -legalActuals, q1: 0,          note: "RW Blears F30-2.2 + Walkers 808615 + Paxiot F30-2.3" },
    { label: "Fund Administration",                           itd: -15000,      fy: -15000,      q1: 0,              note: "Est. $15,000 p.a." },
    { label: "Statutory Audit (Cayman GAAP)",                 itd: -18000,      fy: -18000,      q1: 0,              note: "Annual — mandatory" },
    { label: "CIMA Registration",                             itd: -4268,       fy: -4268,       q1: 0,              note: "Cayman Islands Monetary Authority" },
    { label: "FATCA / CRS Reporting",                        itd: -2500,       fy: -2500,       q1: 0,              note: "Annual regulatory filing" },
    { total: "TOTAL EXPENSES",                                 itd: -totalExpense, fy: -totalExpense, q1: -(mgmtFeeAnn/4) },
    { gap: true },
    { sec: "DISTRIBUTIONS" },
    { label: "Return of Capital",                             itd: 0,           fy: 0,           q1: 0,              note: "None to date" },
    { label: "LP Profit Share (80%) — to FC Group Holding",  itd: 0,           fy: 0,           q1: 0,              note: "Post return of capital — none to date" },
    { label: "FC Group Holding Carry (20%)",                  itd: 0,           fy: 0,           q1: 0,              note: "No preferred return. LPA Clause 11.1." },

    { total: "TOTAL DISTRIBUTIONS",                           itd: 0,           fy: 0,           q1: 0 },
    { gap: true },
    { total: "CLOSING LP CAPITAL ACCOUNT BALANCE",            itd: lpCapital - totalExpense * 0.99, fy: lpCapital - totalExpense * 0.99, q1: lpCapital - (mgmtFeeAnn/4)*0.99 },
  ];

  capSections.forEach((line) => {
    if (line.sec) {
      addRow(wsCap, [null, secHdr(line.sec)], r++);
      mergeCells(wsCap, r - 1, 2, r - 1, 6);
    } else if (line.gap) {
      r++;
    } else if (line.total) {
      addRow(wsCap, [null, totLbl(line.total),
        tot(line.itd, USD_FMT), tot(line.fy, USD_FMT), tot(line.q1, USD_FMT),
        c("", { fill: C.GOLD })], r++);
    } else {
      const bg = r % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
      addRow(wsCap, [null, lbl(line.label, bg, 1, true),
        num(line.itd, USD_FMT, bg), num(line.fy, USD_FMT, bg), num(line.q1, USD_FMT, bg),
        lbl(line.note, bg, 0, true)], r++);
    }
  });

  wsCap["!ref"] = `A1:F${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsCap, "Cap Accounts");

  // ── SHEET 7: GP ECONOMICS ───────────────────────────────────────────────────
  const wsGp = {};
  wsGp["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsGp, [2, 42, 20, 18, 18, 26]);

  r = 1;
  addRow(wsGp, [null], r++);
  addRow(wsGp, [null, c("FC CAYMAN FUND I  ·  GP ECONOMICS & FEE SCHEDULE", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsGp, r - 1, 2, r - 1, 6);
  addRow(wsGp, [null, hdr("Item"), hdr("Inception to Date ($)"), hdr("FY 2025 ($)"), hdr("Q1 2026 ($)"), hdr("Basis / Note")], r++);

  const gpSections = [
    { sec: "PAXIOT MANAGEMENT FEE INCOME (FLAT MONTHLY)" },
    { label: "Monthly Fee — Investment Period (GBP)",   itd: PAXIOT_MONTHLY_GBP * 12, fy: PAXIOT_MONTHLY_GBP * 12, q1: PAXIOT_MONTHLY_GBP * 3, note: "£2,400/month + VAT. Mgmt Agreement Schedule 1.", fmt: GBP_FMT },
    { label: "FX Rate (GBP/USD)",                       itd: PAXIOT_FX,        fy: PAXIOT_FX,        q1: PAXIOT_FX,        note: "Rate at invoice date — update quarterly", fmt: "0.0000" },
    { label: "Annual Fee (USD equivalent)",             itd: mgmtFeeAnn,       fy: mgmtFeeAnn,       q1: 0,                note: "£2,400 × 12 × 1.3445" },
    { label: "Quarterly Accrual (÷4) USD",              itd: mgmtFeeAnn/4,     fy: mgmtFeeAnn/4,     q1: mgmtFeeAnn/4,     note: "Paid quarterly in advance" },
    { total: "TOTAL PAXIOT FEE EARNED",                 itd: mgmtFeeAnn,       fy: mgmtFeeAnn,       q1: mgmtFeeAnn/4 },

    { gap: true },
    { sec: "CARRIED INTEREST — FC GROUP HOLDING LTD (NOT YET EARNED)" },
    { label: "Gross Portfolio Value (at cost)",     itd: totalCost,       fy: totalCost,       q1: totalCost,       note: "At cost — update when marked" },
    { label: "Return of Capital (Step 1)",          itd: totalCost,       fy: totalCost,       q1: totalCost,       note: "LPA Cl.11.1(a) — returned first" },
    { label: "Gain Above Capital (Step 2 pool)",    itd: 0,               fy: 0,               q1: 0,               note: "Nil — at cost, no exits" },
    { label: "Carried Interest 20% — FC Group Holding", itd: 0,           fy: 0,               q1: 0,               note: "LPA Cl.11.1(b) — no hurdle, no catch-up" },
    { total: "TOTAL CARRY EARNED",                  itd: 0,               fy: 0,               q1: 0 },

    { gap: true },
    { sec: "GP OPERATING COSTS (CAYMAN-SPECIFIC)" },
    { label: "Cayman Registered Agent",             itd: 5000,            fy: 5000,            q1: 0,               note: "Est. $5,000 p.a." },
    { label: "CIMA Annual Registration",            itd: 4268,            fy: 4268,            q1: 0,               note: "Cayman Islands Monetary Authority" },
    { label: "Fund Administration",                 itd: 15000,           fy: 15000,           q1: 0,               note: "Est. $15,000 p.a." },
    { label: "Annual Audit (Cayman GAAP / IFRS)",   itd: 18000,           fy: 18000,           q1: 0,               note: "Mandatory for registered funds" },
    { label: "Legal & Formation — actuals",         itd: legalActuals,    fy: legalActuals,    q1: 0,               note: INVOICES.map(inv => `${inv.supplier} $${Math.round(inv.usdAmount).toLocaleString()}`).join(' + ') },
    { label: "FATCA / CRS Reporting",              itd: 2500,            fy: 2500,            q1: 0,               note: "Annual regulatory reporting" },
    { total: "TOTAL GP OPERATING COSTS",            itd: 5000+4268+15000+18000+legalActuals+2500, fy: 5000+4268+15000+18000+legalActuals+2500, q1: 0 },
    { gap: true },
    { sec: "GP NET ECONOMICS" },
    { label: "Paxiot Fee Income",                   itd: mgmtFeeAnn,      fy: mgmtFeeAnn,      q1: mgmtFeeAnn/4,    note: "Flat monthly fee" },
    { label: "Carry — FC Group Holding Ltd (accrued)", itd: 0,            fy: 0,               q1: 0,               note: "No hurdle rate — LPA Cl.11.1" },
    { total: "Total GP Revenue",                    itd: mgmtFeeAnn,      fy: mgmtFeeAnn,      q1: mgmtFeeAnn/4 },
    { label: "Less: GP Operating Costs",            itd: -(5000+4268+15000+18000+legalActuals+2500), fy: -(5000+4268+15000+18000+legalActuals+2500), q1: 0, note: "" },
    { total: "GP NET INCOME / (LOSS)",              itd: mgmtFeeAnn-(5000+4268+15000+18000+legalActuals+2500), fy: mgmtFeeAnn-(5000+4268+15000+18000+legalActuals+2500), q1: mgmtFeeAnn/4 },

  ];

  gpSections.forEach((line) => {
    if (line.sec) {
      addRow(wsGp, [null, secHdr(line.sec)], r++);
      mergeCells(wsGp, r - 1, 2, r - 1, 6);
    } else if (line.gap) {
      r++;
    } else if (line.total) {
      addRow(wsGp, [null, totLbl(line.total),
        tot(line.itd, USD_FMT), tot(line.fy, USD_FMT), tot(line.q1, USD_FMT),
        c("", { fill: C.GOLD })], r++);
    } else {
      const bg = r % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
      const fmt = line.fmt || USD_FMT;
      addRow(wsGp, [null, lbl(line.label, bg, 1, true),
        num(line.itd, fmt, bg), num(line.fy, fmt, bg), num(line.q1, fmt, bg),
        lbl(line.note, bg, 0, true)], r++);
    }
  });

  wsGp["!ref"] = `A1:F${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsGp, "GP Economics");

  // ── SHEET 8: INVOICES ───────────────────────────────────────────────────────
  const wsInv = {};
  wsInv["!sheetViews"] = [{ showGridLines: false }];
  setColWidths(wsInv, [2, 14, 14, 26, 26, 24, 18, 10, 12, 14, 12, 26]);

  r = 1;
  addRow(wsInv, [null], r++);
  addRow(wsInv, [null, c("FC CAYMAN FUND I  ·  INVOICES & EXPENSES REGISTER", {
    fill: C.COBALT_DARK, font: font({ bold: true, sz: 11, color: C.WHITE }), align: align("left") })], r++);
  mergeCells(wsInv, r - 1, 2, r - 1, 12);
  addRow(wsInv, [null, c(`Formation & operating costs  ·  USD reporting  ·  As of ${now}`, {
    font: font({ sz: 9, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsInv, r - 1, 2, r - 1, 12);
  addRow(wsInv, [null,
    hdr("Invoice No."), hdr("Date"), hdr("Supplier"), hdr("Entity"),
    hdr("Description"), hdr("Category"), hdr("Src Ccy"), hdr("Src Amount"),
    hdr("FX Rate"), hdr("USD Amount"), hdr("Status"), hdr("Notes")], r++);

  const invDataRows = [];
  INVOICES.forEach((inv, i) => {
    const bg = i % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
    addRow(wsInv, [null,
      lbl(inv.ref, bg), lbl(inv.date, bg), lbl(inv.supplier, bg), lbl(inv.entity, bg),
      lbl(inv.notes, bg, 0, true), lbl(inv.category, bg),
      lbl(inv.srcCcy, bg),
      num(inv.srcAmount, inv.srcCcy === "GBP" ? GBP_FMT : USD2_FMT, bg),
      num(inv.fxRate, "0.000", bg),
      num(inv.usdAmount, USD2_FMT, bg),
      lbl(inv.status, bg), lbl("", bg),
    ], r);
    invDataRows.push(r);
    r++;
  });

  // Total
  addRow(wsInv, [null, totLbl("TOTAL"), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
    c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
    c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
    tot(totalInvoiceUSD, USD2_FMT),
    c("", { fill: C.GOLD }), c("", { fill: C.GOLD })], r++);

  r++;
  // Line item detail
  addRow(wsInv, [null, secHdr("Line Item Detail")], r++);
  mergeCells(wsInv, r - 1, 2, r - 1, 12);
  addRow(wsInv, [null, hdr("Invoice"), hdr("Date"), hdr("Supplier"), hdr("Line Description"),
    null, hdr("Category"), hdr("Ccy"), hdr("Qty"), hdr("Unit Price"), hdr("USD"), hdr("VAT"), hdr("Notes")], r++);

  INVOICES.forEach((inv) => {
    addRow(wsInv, [null, secHdr(`  ${inv.ref}  ·  ${inv.supplier}  ·  ${inv.entity}`, C.COBALT_LITE)], r++);
    mergeCells(wsInv, r - 1, 2, r - 1, 12);

    inv.lines.forEach((line, j) => {
      const bg = j % 2 === 0 ? C.CREAM : C.LIGHT_GREY;
      addRow(wsInv, [null,
        lbl(inv.ref, bg), lbl(inv.date, bg), lbl(inv.supplier, bg),
        lbl(line.desc, bg), c("", { fill: bg, border: true }),
        lbl(inv.category, bg), lbl(line.srcCcy, bg),
        num(line.qty, INT_FMT, bg),
        num(line.unit, line.srcCcy === "GBP" ? GBP_FMT : USD2_FMT, bg),
        num(line.usd, USD2_FMT, bg),
        lbl("No VAT", bg), lbl(j === 0 ? inv.notes : "", bg, 0, true),
      ], r++);
    });
    addRow(wsInv, [null, totLbl(`${inv.ref} Total`), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
      c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
      c("", { fill: C.GOLD }), c("", { fill: C.GOLD }), c("", { fill: C.GOLD }),
      tot(inv.usdAmount, USD2_FMT), c("", { fill: C.GOLD }), c("", { fill: C.GOLD })], r++);
    r++;
  });

  addRow(wsInv, [null, c(`FX note: GBP invoices (RW Blears F30-2.2 @ ${FX_GBP_USD}; Paxiot F30-2.3 @ 1.3445) converted to USD at invoice date rates`, {
    font: font({ sz: 8, color: C.MID_GREY, italic: true }), align: align("left") })], r++);
  mergeCells(wsInv, r - 1, 2, r - 1, 12);

  wsInv["!ref"] = `A1:L${r + 2}`;
  XLSX.utils.book_append_sheet(wb, wsInv, "Invoices");

  // ── WRITE FILE ───────────────────────────────────────────────────────────────
  XLSX.writeFile(wb, OUT_PATH);
  console.log(`[CaymanPL] Written: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[CaymanPL] Fatal:", err.message);
  process.exit(1);
});
