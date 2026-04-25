/**
 * generate_pl_model.js
 * Generates the Founders Capital P&L Excel workbook from live Supabase data.
 * Called by the /api/reports/pl-model route on each download request.
 *
 * Usage: node generate_pl_model.js <output_path>
 *   output_path defaults to /tmp/fc_pl_model.xlsx
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_ANON_KEY (set in Railway)
 */

"use strict";

const XLSX = require("xlsx");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

const OUT_PATH = process.argv[2] || "/tmp/fc_pl_model.xlsx";

// ─── BRAND COLORS (ARGB for xlsx) ────────────────────────────────────────────
const C = {
  COBALT:      "FF3B5BDB",
  COBALT_DARK: "FF2F4AB8",
  CREAM:       "FFF5F3EF",
  DARK_BROWN:  "FF1A1209",
  LIGHT_GREY:  "FFF0EEE9",
  MID_GREY:    "FFD9D7D2",
  WHITE:       "FFFFFFFF",
  GOLD:        "FFC9A84C",
  BLUE_INPUT:  "FF0000FF",   // hardcoded inputs
  BLACK_FORM:  "FF000000",   // formulas
  GREEN_LINK:  "FF008000",   // cross-sheet links
  GREEN_POS:   "FF2E7D32",
  RED_NEG:     "FFC62828",
};

// ─── SUPABASE FETCH ───────────────────────────────────────────────────────────
function supabaseFetch(table, select = "*", filters = "") {
  return new Promise((resolve, reject) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || "https://yoyrwrdzivygufbzckdv.supabase.co";
    const ANON_KEY     = process.env.SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";

    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`);
    const lib  = url.protocol === "https:" ? https : http;

    const req = lib.request(url.toString(), {
      method: "GET",
      headers: {
        "apikey":        ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type":  "application/json",
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message} — body: ${body.slice(0,200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
function fill(fgColor) {
  return { patternType: "solid", fgColor: { rgb: fgColor.replace("FF","") } };
}

function font(opts = {}) {
  return {
    name: "Calibri",
    sz: opts.sz || 10,
    bold: opts.bold || false,
    italic: opts.italic || false,
    color: { rgb: (opts.color || C.DARK_BROWN).replace("FF","") },
  };
}

function align(h = "left", v = "center", wrap = false) {
  return { horizontal: h, vertical: v, wrapText: wrap };
}

const border = {
  top:    { style: "thin", color: { rgb: "D9D7D2" } },
  bottom: { style: "thin", color: { rgb: "D9D7D2" } },
  left:   { style: "thin", color: { rgb: "D9D7D2" } },
  right:  { style: "thin", color: { rgb: "D9D7D2" } },
};

const USD_FMT  = '"$"#,##0;("$"#,##0);"-"';
const PCT_FMT  = "0.0%;(0.0%);-";
const INT_FMT  = "#,##0";
const MULT_FMT = '0.00"x"';
const DATE_FMT = "dd-mmm-yy";

// ─── CELL BUILDER ────────────────────────────────────────────────────────────
function cell(v, opts = {}) {
  const c = { v, t: opts.t || (typeof v === "number" ? "n" : "s") };
  if (opts.f) { c.f = opts.f; c.t = "n"; delete c.v; }
  const style = {};
  if (opts.fill)   style.fill = fill(opts.fill);
  if (opts.font)   style.font = opts.font;
  if (opts.align)  style.alignment = opts.align;
  if (opts.border) style.border = border;
  if (opts.numFmt) style.numFmt = opts.numFmt;
  if (Object.keys(style).length) c.s = style;
  return c;
}

function headerCell(v, bg = C.COBALT_DARK) {
  return cell(v, {
    fill:  bg,
    font:  font({ bold: true, color: C.WHITE, sz: 10 }),
    align: align("center"),
  });
}

function labelCell(v, bg = C.CREAM, indent = false) {
  return cell(v, {
    fill:  bg,
    font:  font({ color: C.DARK_BROWN }),
    align: align(indent ? "left" : "left"),
  });
}

function inputCell(v, fmt, bg = C.CREAM) {
  return cell(v, {
    fill:   bg,
    font:   font({ color: C.BLUE_INPUT }),
    align:  align("right"),
    numFmt: fmt,
  });
}

function formulaCell(f, fmt, bg = C.CREAM, color = C.BLACK_FORM) {
  return cell(undefined, {
    f,
    fill:   bg,
    font:   font({ color }),
    align:  align("right"),
    numFmt: fmt,
  });
}

function linkCell(f, fmt, bg = C.CREAM) {
  return formulaCell(f, fmt, bg, C.GREEN_LINK);
}

function sectionCell(v, bg = C.COBALT_DARK, span = 5) {
  return cell(v, {
    fill:  bg,
    font:  font({ bold: true, color: C.WHITE, sz: 10 }),
    align: align("left"),
  });
}

function totalCell(v, fmt, f) {
  const opts = {
    fill:   C.GOLD,
    font:   font({ bold: true, color: C.DARK_BROWN }),
    align:  align("right"),
    numFmt: fmt,
  };
  if (f) { opts.f = f; return cell(undefined, opts); }
  return cell(v, opts);
}

// ─── SHEET BUILDER UTIL ──────────────────────────────────────────────────────
function makeSheet(data2d, merges = [], colWidths = []) {
  const ws = XLSX.utils.aoa_to_sheet(data2d.map(row => row.map(c => {
    // plain values for aoa
    if (c && typeof c === "object" && "v" in c) return c.v;
    if (c && typeof c === "object" && "f" in c) return 0;   // placeholder
    return c;
  })));

  // Apply cell objects with styles + formulas
  data2d.forEach((row, ri) => {
    row.forEach((c, ci) => {
      if (c && typeof c === "object") {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        ws[addr] = c;
      }
    });
  });

  if (merges.length) ws["!merges"] = merges;
  if (colWidths.length) ws["!cols"] = colWidths.map(w => ({ wch: w }));
  return ws;
}

function merge(r1, c1, r2, c2) {
  return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } };
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────
const asOf = () => {
  const d = new Date();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const fmtUSD = (n) => n == null ? "—" :
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[PLGen] Fetching data from Supabase…");

  // Fetch all tables in parallel
  const [entities, investments, commitments, capitalCalls, navMarks, expenses, capAcctBalances] =
    await Promise.all([
      supabaseFetch("entities", "*", "archived_at=is.null&order=short_code"),
      supabaseFetch("investments", "*", "archived_at=is.null"),
      supabaseFetch("investor_commitments", "*", "archived_at=is.null"),
      supabaseFetch("capital_calls", "*"),
      supabaseFetch("nav_marks", "*", "order=mark_date.desc"),
      supabaseFetch("series_expenses", "*"),
      supabaseFetch("lp_capital_account_balances", "*", "order=entity_name,investor_name,tax_year"),
    ]);

  console.log(`[PLGen] Fetched: ${entities.length} entities, ${investments.length} investments, ${commitments.length} commitments, ${capAcctBalances.length} capital account rows`);

  // ── BUILD VECTOR DATA ──────────────────────────────────────────────────────
  const seriesEntities = entities.filter(e => e.entity_type === "series_spv");

  const vectors = seriesEntities.map(e => {
    const inv      = investments.find(i => i.entity_id === e.id);
    const lpList   = commitments.filter(c => c.entity_id === e.id);
    const latestNAV= navMarks.find(n => n.entity_id === e.id);
    const expList  = expenses.filter(x => x.entity_id === e.id);

    const committed    = lpList.reduce((s, c) => s + Number(c.committed_amount || 0), 0);
    const called       = lpList.reduce((s, c) => s + Number(c.called_amount || 0), 0);
    const fees         = lpList.reduce((s, c) => s + Number(c.committed_amount || 0) * Number(c.fee_rate || 0) / 100, 0);
    const totalExpenses= expList.reduce((s, x) => s + Number(x.amount || 0), 0);

    const costBasis  = Number(inv?.cost_basis || called || 0);
    const fairValue  = latestNAV ? Number(latestNAV.fair_value) : (inv?.current_fair_value ? Number(inv.current_fair_value) : null);
    const moic       = fairValue != null && costBasis > 0 ? fairValue / costBasis : (inv?.moic ? Number(inv.moic) : null);

    const gain       = fairValue != null ? Math.max(fairValue - costBasis, 0) : 0;
    const carry      = Math.round(gain * 0.20 * 100) / 100;
    const grossVal   = fairValue ?? costBasis;

    return {
      id:            e.id,
      name:          e.name,
      short_code:    e.short_code,
      hsbc_account:  e.hsbc_account_ref || "—",
      investment:    inv?.company_name || "—",
      stage:         inv?.stage || "—",
      lp_count:      lpList.length,
      committed,
      called,
      uncalled:      committed - called,
      fees,
      cost_basis:    costBasis,
      fair_value:    fairValue,
      moic,
      post_money:    inv ? Number(inv.post_money_valuation || 0) : 0,
      gain,
      carry,
      gross_val:     grossVal,
      lp_net:        grossVal - carry,
      total_expenses: totalExpenses,
      carry_rate:    0.20,
      fee_rate:      0.06,
      fv_marked:     fairValue != null,
    };
  });

  const now = asOf();

  const wb = XLSX.utils.book_new();

  // ── SHEET 1: COVER ──────────────────────────────────────────────────────────
  {
    const COLS = [3, 30, 18, 20, 18, 15];
    const rows = [];

    // Row 0 — dark banner
    const banner = v => cell(v, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }), align: align("left") });
    rows.push([banner(""), banner(""), banner(""), banner(""), banner(""), banner("")]);

    // Row 1 — logo
    rows.push([
      banner(""),
      cell("■ ■ ■  ■ ■ ■  ■ ■ ■", {
        fill: C.DARK_BROWN,
        font: font({ bold: true, sz: 13, color: C.COBALT }),
        align: align("left"),
      }),
      banner(""), banner(""), banner(""), banner(""),
    ]);

    // Row 2
    rows.push([banner(""), banner(""), banner(""), banner(""), banner(""), banner("")]);

    // Row 3 — main title
    rows.push([
      banner(""),
      cell("FOUNDERS CAPITAL PLATFORM", { fill: C.DARK_BROWN, font: font({ bold: true, sz: 18, color: C.WHITE }), align: align("left") }),
      banner(""), banner(""), banner(""), banner(""),
    ]);

    // Row 4 — subtitle
    rows.push([
      banner(""),
      cell("Series & Consolidated P&L Model", { fill: C.DARK_BROWN, font: font({ sz: 13, color: C.CREAM }), align: align("left") }),
      banner(""), banner(""), banner(""), banner(""),
    ]);

    // Row 5 — as of
    rows.push([
      banner(""),
      cell(`As of: ${now}`, { fill: C.DARK_BROWN, font: font({ sz: 10, color: "FFD9D7D2" }), align: align("left") }),
      banner(""), banner(""), banner(""), banner(""),
    ]);

    // Row 6 — confidential
    rows.push([
      banner(""),
      cell("CONFIDENTIAL — FOR INTERNAL USE ONLY", { fill: C.DARK_BROWN, font: font({ bold: true, sz: 9, color: C.GOLD }), align: align("left") }),
      banner(""), banner(""), banner(""), banner(""),
    ]);

    // Row 7 — spacer
    rows.push(["", "", "", "", "", ""]);

    // Row 8 — contents header
    rows.push([
      "",
      sectionCell("WORKBOOK CONTENTS"),
      sectionCell(""), sectionCell(""), sectionCell(""), sectionCell(""),
    ]);

    // Contents
    const contents = [
      ["Cover",             "This page — overview and navigation"],
      ["Assumptions",       "Carry rate, fee structure, discount rates, macro"],
      ["Vector III P&L",    "Reach Power, Inc. — individual series P&L"],
      ["Vector IV P&L",     "Project Prometheus — individual series P&L"],
      ["Consolidated",      "All series aggregated — total fund view"],
      ["GP Entity",         "Founders Capital Platform LLC — GP economics"],
      ["Capital Accounts",  "LP capital account ledger — contributions, fees, gain allocations (K-1 basis)"],
    ];
    contents.forEach(([tab, desc]) => {
      rows.push([
        "",
        cell(tab, { font: font({ bold: true, color: C.COBALT_DARK }), align: align("left") }),
        cell(desc, { font: font({ color: C.DARK_BROWN }), align: align("left") }),
        "", "", "",
      ]);
    });

    rows.push(["", "", "", "", "", ""]);

    // Fund snapshot header
    rows.push([
      "",
      sectionCell("FUND SNAPSHOT — LIVE DATA"),
      sectionCell(""), sectionCell(""), sectionCell(""), sectionCell(""),
    ]);

    const totalCommitted = vectors.reduce((s, v) => s + v.committed, 0);
    const totalCalled    = vectors.reduce((s, v) => s + v.called, 0);
    const totalUncalled  = vectors.reduce((s, v) => s + v.uncalled, 0);
    const totalCost      = vectors.reduce((s, v) => s + v.cost_basis, 0);

    const snapRows = [
      ["Active Series",           String(vectors.length)],
      ["Total LP Committed",      fmtUSD(totalCommitted)],
      ["Total Capital Called",    fmtUSD(totalCalled)],
      ["Total Uncalled",          fmtUSD(totalUncalled)],
      ["Total Cost Basis",        fmtUSD(totalCost)],
      ["Portfolio Companies",     String(vectors.length)],
      ["GP Carry Rate",           "20%"],
      ["Deal Fee Rate",           "6%"],
    ];
    snapRows.forEach(([lbl, val], i) => {
      const bg = i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;
      rows.push([
        "",
        cell(lbl, { fill: bg, font: font({ color: C.DARK_BROWN }), align: align("left") }),
        "",
        cell(val, { fill: bg, font: font({ bold: true, color: C.COBALT_DARK }), align: align("right") }),
        "", "",
      ]);
    });

    rows.push(["", "", "", "", "", ""]);
    rows.push([
      "",
      cell(`Source: Founders Capital Supabase DB · ${now} · https://yoyrwrdzivygufbzckdv.supabase.co`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "",
    ]);

    const ws = makeSheet(rows, [
      merge(3, 1, 3, 5), merge(4, 1, 4, 5), merge(5, 1, 5, 5),
      merge(6, 1, 6, 5), merge(8, 1, 8, 5),
    ], COLS);
    XLSX.utils.book_append_sheet(wb, ws, "Cover");
  }

  // ── SHEET 2: ASSUMPTIONS ───────────────────────────────────────────────────
  {
    const COLS = [3, 38, 16, 28, 3];
    const rows = [];

    const banner = v => cell(v, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }) });
    rows.push([banner(""), banner(""), banner(""), banner(""), banner("")]);
    rows.push([
      banner(""),
      cell("ASSUMPTIONS & MODEL PARAMETERS", { fill: C.DARK_BROWN, font: font({ bold: true, sz: 14, color: C.WHITE }), align: align("left") }),
      banner(""), banner(""), banner(""),
    ]);
    rows.push([banner(""), banner(""), banner(""), banner(""), banner("")]);

    rows.push(["", sectionCell("CARRY & FEE STRUCTURE"), sectionCell(""), sectionCell(""), ""]);

    rows.push(["", cell("Parameter", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
      cell("Value", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
      cell("Notes", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("left") }), ""]);

    const carryRows = [
      ["GP Carry Rate",                 0.20, PCT_FMT,  "Standard 20% carry across all series"],
      ["Deal Fee Rate (% of committed)", 0.06, PCT_FMT, "6% deal fee charged to LPs at commitment"],
      ["Management Fee Rate",           0.00, PCT_FMT,  "Currently 0% — may activate in future"],
      ["Carry Hurdle Rate",             0.00, PCT_FMT,  "No hurdle currently in place"],
      ["GP Co-invest",                  0.00, PCT_FMT,  "Set to 0 unless applicable"],
    ];
    carryRows.forEach(([lbl, val, fmt, note], i) => {
      const bg = i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;
      rows.push([
        "",
        labelCell(lbl, bg),
        inputCell(val, fmt, bg),
        cell(note, { fill: bg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left", "center", true) }),
        "",
      ]);
    });

    rows.push(["", "", "", "", ""]);
    rows.push(["", sectionCell("VALUATION PARAMETERS"), sectionCell(""), sectionCell(""), ""]);

    const valRows = [
      ["Discount Rate (IRR target)",        0.15,  PCT_FMT,        "15% hurdle used for IRR sensitivity"],
      ["Risk-Free Rate",                    0.043, PCT_FMT,        "US 10Y Treasury yield — update quarterly"],
      ["Market Risk Premium",               0.055, PCT_FMT,        "Damodaran ERP estimate"],
      ["Liquidity Discount",                0.25,  PCT_FMT,        "25% illiquidity discount applied to FMV"],
      ["FX Rate (GBP/USD) — indicative",   1.27,  "#,##0.0000",   "For LP reporting in GBP"],
    ];
    valRows.forEach(([lbl, val, fmt, note], i) => {
      const bg = i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;
      rows.push([
        "",
        labelCell(lbl, bg),
        inputCell(val, fmt, bg),
        cell(note, { fill: bg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left", "center", true) }),
        "",
      ]);
    });

    rows.push([
      "",
      cell(`Data auto-refreshed from Supabase on each download · ${now}`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "",
    ]);

    const ws = makeSheet(rows, [merge(1, 1, 1, 3), merge(2, 1, 2, 3)], COLS);
    XLSX.utils.book_append_sheet(wb, ws, "Assumptions");
  }

  // ── SHEETS 3 & 4: SERIES P&L ───────────────────────────────────────────────
  function buildSeriesSheet(v) {
    const COLS = [3, 36, 18, 18, 3, 28, 3];
    const rows = [];
    const bg   = (i) => i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;

    // Banner
    const banner = val => cell(val, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }) });
    rows.push([banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner("")]);
    rows.push([
      banner(""),
      cell(`${v.short_code}  ·  ${v.investment}`, { fill: C.DARK_BROWN, font: font({ bold: true, sz: 13, color: C.WHITE }), align: align("left") }),
      banner(""), banner(""), banner(""),
      cell(`HSBC: ${v.hsbc_account}  ·  ${v.stage}`, { fill: C.DARK_BROWN, font: font({ sz: 9, color: C.CREAM }), align: align("left") }),
      banner(""),
    ]);
    rows.push([banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner("")]);

    // Column headers
    rows.push([
      "",
      headerCell("Line Item"),
      headerCell("Amount ($)"),
      headerCell("Notes"),
      "", "", "",
    ]);

    let row = rows.length; // 0-indexed — track for formulas
    // Note: xlsx row refs are 1-based in formulas

    // ── A. LP CAPITAL ACCOUNT
    rows.push(["", sectionCell("A.  LP CAPITAL ACCOUNT"), sectionCell(""), sectionCell(""), "", "", ""]);

    const lpRows = [
      ["Total LP Commitments",     v.committed,   USD_FMT,  true,  "Total committed per LP register"],
      ["Capital Called (to date)", v.called,      USD_FMT,  true,  "Sum of all capital calls issued"],
      ["Uncalled Commitments",     v.uncalled,    USD_FMT,  false, "Committed - Called"],
      ["Deal Fees Collected",      v.fees,        USD_FMT,  true,  `${(v.fee_rate*100).toFixed(0)}% × committed`],
      ["Number of LPs",            v.lp_count,    INT_FMT,  true,  "Per LP register"],
    ];
    lpRows.forEach(([lbl, val, fmt, isInput, note], i) => {
      const rowBg = bg(i);
      rows.push([
        "",
        labelCell(lbl, rowBg),
        isInput ? inputCell(val, fmt, rowBg) : cell(val, { fill: rowBg, font: font({ color: C.BLACK_FORM }), align: align("right"), numFmt: fmt }),
        cell(note, { fill: rowBg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left", "center", true) }),
        "", "", "",
      ]);
    });

    rows.push(["", "", "", "", "", "", ""]);

    // ── B. INVESTMENT DETAIL
    rows.push(["", sectionCell("B.  PORTFOLIO INVESTMENT"), sectionCell(""), sectionCell(""), "", "", ""]);

    const unrealised = v.fair_value != null ? v.fair_value - v.cost_basis : null;
    const invRows = [
      ["Company",              v.investment, null,     true,  "Portfolio company"],
      ["Investment Stage",     v.stage,      null,     true,  "Round at investment"],
      ["Post-Money Valuation", v.post_money, USD_FMT,  true,  "Per term sheet"],
      ["Cost Basis (LP $$)",   v.cost_basis, USD_FMT,  true,  "Total LP capital deployed"],
      ["Current Fair Value",   v.fv_marked ? v.fair_value : null, USD_FMT, false, v.fv_marked ? "Latest NAV mark" : "Not yet marked"],
      ["Unrealised G/(L)",     unrealised ?? 0, USD_FMT, false, "Fair Value - Cost Basis"],
      ["MOIC",                 v.moic ?? 1.0, MULT_FMT, v.moic == null, "Current multiple on invested capital"],
    ];
    invRows.forEach(([lbl, val, fmt, isInput, note], i) => {
      const rowBg = bg(i);
      let valueCell2;
      if (fmt === null) {
        // text value
        valueCell2 = cell(val ?? "Not yet marked", { fill: rowBg, font: font({ color: val ? C.BLUE_INPUT : C.MID_GREY, italic: !val }), align: align("left") });
      } else if (!v.fv_marked && lbl === "Current Fair Value") {
        valueCell2 = cell("Not yet marked", { fill: rowBg, font: font({ italic: true, color: C.MID_GREY }), align: align("right") });
      } else {
        valueCell2 = isInput
          ? inputCell(val, fmt, rowBg)
          : cell(val, { fill: rowBg, font: font({ color: lbl === "Unrealised G/(L)" ? (val >= 0 ? C.GREEN_POS : C.RED_NEG) : C.BLACK_FORM }), align: align("right"), numFmt: fmt });
      }
      rows.push(["", labelCell(lbl, rowBg), valueCell2,
        cell(note, { fill: rowBg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left", "center", true) }),
        "", "", ""]);
    });

    rows.push(["", "", "", "", "", "", ""]);

    // ── C. P&L WATERFALL
    rows.push(["", sectionCell("C.  P&L WATERFALL  (Carry: 20%  |  Hurdle: None)"), sectionCell(""), sectionCell(""), "", "", ""]);

    const waterfallRows = [
      ["Gross Portfolio Value (Fair Value)", v.gross_val,        USD_FMT, "Latest fair value or cost basis if not marked"],
      ["Return of LP Cost Basis",            Math.min(v.gross_val, v.cost_basis), USD_FMT, "First return tranche"],
      ["Gain Above Cost (Pre-Carry)",        v.gain,             USD_FMT, "Max(Fair Value - Cost, 0)"],
      ["GP Carry @ 20%",                     v.carry,            USD_FMT, "20% × Gain Above Cost"],
      ["LP Net Proceeds (after Carry)",      v.lp_net,           USD_FMT, "Gross Value - Carry"],
    ];
    waterfallRows.forEach(([lbl, val, fmt, note], i) => {
      const isTotal = lbl === "LP Net Proceeds (after Carry)";
      const rowBg = isTotal ? C.GOLD : bg(i);
      const fontColor = isTotal ? C.DARK_BROWN : C.BLACK_FORM;
      rows.push([
        "",
        cell(lbl, { fill: rowBg, font: font({ bold: isTotal, color: fontColor }), align: align("left") }),
        cell(val, { fill: rowBg, font: font({ bold: isTotal, color: fontColor }), align: align("right"), numFmt: fmt }),
        cell(note, { fill: rowBg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left", "center", true) }),
        "", "", "",
      ]);
    });

    rows.push(["", "", "", "", "", "", ""]);

    // ── D. EXPENSES
    rows.push(["", sectionCell("D.  DIRECT SERIES EXPENSES"), sectionCell(""), sectionCell(""), "", "", ""]);

    const expenseLines = [
      ["Legal & Formation",         0],
      ["Fund Administration",       0],
      ["Audit & Accounting",        0],
      ["Banking Charges",           0],
      ["Other Direct Costs",        0],
    ];
    expenseLines.forEach(([lbl, val], i) => {
      const rowBg = bg(i);
      rows.push([
        "",
        labelCell(lbl, rowBg),
        inputCell(val, USD_FMT, rowBg),
        cell("Enter when incurred through HSBC account", { fill: rowBg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left") }),
        "", "", "",
      ]);
    });
    rows.push([
      "",
      totalCell("TOTAL EXPENSES"),
      totalCell(v.total_expenses, USD_FMT),
      "", "", "", "",
    ]);

    rows.push(["", "", "", "", "", "", ""]);

    // ── E. IRR SENSITIVITY
    rows.push(["", sectionCell("E.  MOIC / HOLD PERIOD IRR SENSITIVITY"), sectionCell(""), sectionCell(""), "", "", ""]);
    rows.push([
      "",
      cell("Hold ↓  /  Exit MOIC →", { font: font({ bold: true, color: C.DARK_BROWN }), align: align("right") }),
      headerCell("1.5x"), headerCell("2.0x"), headerCell("3.0x"), headerCell("4.0x"), headerCell("5.0x"),
    ]);
    const holds = [2, 3, 4, 5, 7];
    const moics = [1.5, 2.0, 3.0, 4.0, 5.0];
    holds.forEach((yrs, i) => {
      const rowBg = bg(i);
      rows.push([
        "",
        cell(`${yrs} years`, { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
        ...moics.map(m => {
          const irr = Math.pow(m, 1 / yrs) - 1;
          return cell(irr, { fill: rowBg, font: font({ color: C.BLACK_FORM }), align: align("right"), numFmt: PCT_FMT });
        }),
      ]);
    });

    rows.push(["", "", "", "", "", "", ""]);
    rows.push([
      "",
      cell(`Data live from Supabase · ${now} · https://yoyrwrdzivygufbzckdv.supabase.co`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "", "",
    ]);

    return makeSheet(rows, [], COLS);
  }

  vectors.forEach(v => {
    const ws = buildSeriesSheet(v);
    const sheetName = v.short_code.replace("FC-VECTOR-", "Vector ") + " P&L";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ── SHEET 5: CONSOLIDATED ──────────────────────────────────────────────────
  {
    const COLS = [3, 36, 16, 16, 16, 3];
    const rows = [];
    const bg   = (i) => i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;

    const totalCommitted = vectors.reduce((s, v) => s + v.committed, 0);
    const totalCalled    = vectors.reduce((s, v) => s + v.called, 0);
    const totalUncalled  = vectors.reduce((s, v) => s + v.uncalled, 0);
    const totalCost      = vectors.reduce((s, v) => s + v.cost_basis, 0);
    const totalFV        = vectors.reduce((s, v) => s + (v.fair_value ?? v.cost_basis), 0);
    const totalGain      = vectors.reduce((s, v) => s + v.gain, 0);
    const totalCarry     = vectors.reduce((s, v) => s + v.carry, 0);
    const totalFees      = vectors.reduce((s, v) => s + v.fees, 0);
    const totalLPs       = vectors.reduce((s, v) => s + v.lp_count, 0);

    const banner = v2 => cell(v2, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }) });
    rows.push(["", banner(""), banner(""), banner(""), banner(""), ""]);
    rows.push([
      "",
      cell("FOUNDERS CAPITAL PLATFORM  ·  CONSOLIDATED P&L", { fill: C.DARK_BROWN, font: font({ bold: true, sz: 13, color: C.WHITE }), align: align("left") }),
      banner(""), banner(""), banner(""), "",
    ]);
    rows.push([
      "",
      cell(`All Series Aggregated  ·  As of ${now}`, { fill: C.DARK_BROWN, font: font({ sz: 9, color: C.CREAM }), align: align("left") }),
      banner(""), banner(""), banner(""), "",
    ]);
    rows.push(["", banner(""), banner(""), banner(""), banner(""), ""]);

    // Column headers
    const colHdrs = ["Line Item", ...vectors.map(v => `${v.short_code.replace("FC-","")}\n${v.investment}`), "TOTAL ($)"];
    rows.push(["", ...colHdrs.map(h => headerCell(h)), ""]);

    // ── A. LP CAPITAL
    rows.push(["", sectionCell("A.  LP CAPITAL ACCOUNT"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const lpMetrics = [
      { label: "Total LP Commitments",     key: "committed",  fmt: USD_FMT },
      { label: "Capital Called (to date)", key: "called",     fmt: USD_FMT },
      { label: "Uncalled Commitments",     key: "uncalled",   fmt: USD_FMT },
      { label: "Deal Fees Collected",      key: "fees",       fmt: USD_FMT },
      { label: "Number of LPs",            key: "lp_count",   fmt: INT_FMT },
    ];
    lpMetrics.forEach(({ label, key, fmt }, i) => {
      const rowBg = bg(i);
      const vals  = vectors.map(v => v[key]);
      const total = vals.reduce((s, v2) => s + v2, 0);
      rows.push([
        "",
        labelCell(label, rowBg),
        ...vals.map(val => cell(val, { fill: rowBg, font: font({ color: C.GREEN_LINK }), align: align("right"), numFmt: fmt })),
        cell(total, { fill: rowBg, font: font({ bold: true, color: C.BLACK_FORM }), align: align("right"), numFmt: fmt }),
        "",
      ]);
    });

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);

    // ── B. INVESTMENTS
    rows.push(["", sectionCell("B.  PORTFOLIO INVESTMENTS"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const invMetrics = [
      { label: "Cost Basis",           key: "cost_basis", fmt: USD_FMT },
      { label: "Current Fair Value",   key: "fair_value", fmt: USD_FMT, nullLabel: "Not marked" },
      { label: "Unrealised Gain/(L)",  key: "gain",       fmt: USD_FMT },
    ];
    invMetrics.forEach(({ label, key, fmt, nullLabel }, i) => {
      const rowBg = bg(i);
      const vals  = vectors.map(v => v[key]);
      const total = vals.reduce((s, v2) => s + (v2 ?? 0), 0);
      rows.push([
        "",
        labelCell(label, rowBg),
        ...vals.map(val => val == null
          ? cell(nullLabel || "—", { fill: rowBg, font: font({ italic: true, color: C.MID_GREY }), align: align("right") })
          : cell(val, { fill: rowBg, font: font({ color: C.GREEN_LINK }), align: align("right"), numFmt: fmt })
        ),
        cell(total, { fill: rowBg, font: font({ bold: true, color: C.BLACK_FORM }), align: align("right"), numFmt: fmt }),
        "",
      ]);
    });

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);

    // ── C. WATERFALL
    rows.push(["", sectionCell("C.  CONSOLIDATED P&L WATERFALL"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const wfMetrics = [
      { label: "Gross Portfolio Value",          vals: vectors.map(v => v.gross_val), total: vectors.reduce((s,v) => s + v.gross_val, 0) },
      { label: "Return of LP Cost Basis",        vals: vectors.map(v => Math.min(v.gross_val, v.cost_basis)), total: Math.min(totalFV, totalCost) },
      { label: "Gain Above Cost",                vals: vectors.map(v => v.gain),      total: totalGain },
      { label: "GP Carry @ 20%",                 vals: vectors.map(v => v.carry),     total: totalCarry },
      { label: "Net LP Proceeds (after Carry)",  vals: vectors.map(v => v.lp_net),    total: totalFV - totalCarry },
    ];
    wfMetrics.forEach(({ label, vals, total }, i) => {
      const isNet = label.startsWith("Net LP");
      const rowBg = isNet ? C.GOLD : bg(i);
      const fColor = isNet ? C.DARK_BROWN : C.BLACK_FORM;
      rows.push([
        "",
        cell(label, { fill: rowBg, font: font({ bold: isNet, color: fColor }), align: align("left") }),
        ...vals.map(val => cell(val, { fill: rowBg, font: font({ bold: isNet, color: fColor }), align: align("right"), numFmt: USD_FMT })),
        cell(total, { fill: rowBg, font: font({ bold: true, color: fColor }), align: align("right"), numFmt: USD_FMT }),
        "",
      ]);
    });

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);

    // ── D. MULTI-VECTOR LPs
    rows.push(["", sectionCell("D.  MULTI-VECTOR LP EXPOSURE  (LPs invested in 2+ Series)"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const multiLPs = [
      { name: "Paul Tanner",         iii: 130000 },
      { name: "Bram Vanderelst",      iii: 70000 },
      { name: "Krzysztof Bednarek",   iii: 60000 },
      { name: "Esteban Sadurni",      iii: 55000 },
      { name: "Ben Silvertown",        iii: 50200 },
      { name: "Nigel Ashfield",        iii: 50000 },
      { name: "Clifford Alper",        iii: 45000 },
      { name: "Michael O'Brien",       iii: 22500 },
      { name: "Pedro Azevedo",         iii: 20000 },
      { name: "Stratis Mouyer",        iii: 15000 },
      { name: "Konrad Staniecki",      iii: 15000 },
      { name: "Joseph Yearsley",       iii: 15000 },
    ];

    // Sub-header
    rows.push([
      "",
      headerCell("LP Name"),
      ...vectors.map(v => headerCell(`${v.short_code.replace("FC-","")} Committed ($)`)),
      headerCell("Total Exposure ($)"),
      "",
    ]);

    multiLPs.forEach(({ name, iii }, i) => {
      const rowBg = bg(i);
      // Only Vector III amounts are known at LP level; IV amounts need register reconciliation
      const vVals = vectors.map((v, vi) => vi === 0 ? iii : null);
      const total = vVals.reduce((s, v2) => s + (v2 ?? 0), 0);
      rows.push([
        "",
        labelCell(name, rowBg),
        ...vVals.map(val => val != null
          ? inputCell(val, USD_FMT, rowBg)
          : cell("See IV register", { fill: rowBg, font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("right") })
        ),
        cell(total, { fill: rowBg, font: font({ color: C.BLACK_FORM }), align: align("right"), numFmt: USD_FMT }),
        "",
      ]);
    });

    // Multi-LP total
    const mlTotal = multiLPs.reduce((s, lp) => s + lp.iii, 0);
    rows.push([
      "",
      totalCell("TOTAL MULTI-VECTOR EXPOSURE"),
      totalCell(mlTotal, USD_FMT),
      ...Array(vectors.length - 1).fill(cell("", { fill: C.GOLD })),
      totalCell(mlTotal, USD_FMT),
      "",
    ]);

    rows.push(["", "", ...Array(vectors.length).fill(""), "", ""]);
    rows.push([
      "",
      cell(`Source: Founders Capital Supabase DB · ${now} · https://yoyrwrdzivygufbzckdv.supabase.co`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "",
    ]);

    const ws = makeSheet(rows, [], COLS);
    XLSX.utils.book_append_sheet(wb, ws, "Consolidated");
  }

  // ── SHEET 6: GP ENTITY ─────────────────────────────────────────────────────
  {
    const COLS = [3, 36, 16, 16, 16, 3];
    const rows = [];
    const bg   = (i) => i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;

    const totalCarry = vectors.reduce((s, v) => s + v.carry, 0);
    const totalFees  = vectors.reduce((s, v) => s + v.fees, 0);

    const banner = v2 => cell(v2, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }) });
    rows.push(["", banner(""), banner(""), banner(""), banner(""), ""]);
    rows.push([
      "",
      cell("FOUNDERS CAPITAL PLATFORM LLC  ·  GP ECONOMICS", { fill: C.DARK_BROWN, font: font({ bold: true, sz: 13, color: C.WHITE }), align: align("left") }),
      banner(""), banner(""), banner(""), "",
    ]);
    rows.push([
      "",
      cell(`GP Entity P&L  ·  As of ${now}`, { fill: C.DARK_BROWN, font: font({ sz: 9, color: C.CREAM }), align: align("left") }),
      banner(""), banner(""), banner(""), "",
    ]);
    rows.push(["", banner(""), banner(""), banner(""), banner(""), ""]);

    rows.push([
      "",
      headerCell("Line Item"),
      ...vectors.map(v => headerCell(v.short_code.replace("FC-",""))),
      headerCell("TOTAL ($)"),
      "",
    ]);

    rows.push(["", sectionCell("GP REVENUE — CARRY & FEES"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const gpIncomeRows = [
      { label: "Gain Above Cost (LP level)",   vals: vectors.map(v => v.gain),  total: vectors.reduce((s,v) => s+v.gain, 0) },
      { label: "GP Carry @ 20%",               vals: vectors.map(v => v.carry), total: totalCarry },
      { label: "Deal Fees Collected",           vals: vectors.map(v => v.fees),  total: totalFees },
      { label: "Management Fees",               vals: vectors.map(() => 0),      total: 0 },
    ];
    gpIncomeRows.forEach(({ label, vals, total }, i) => {
      const rowBg = bg(i);
      rows.push([
        "",
        labelCell(label, rowBg),
        ...vals.map(val => inputCell(val, USD_FMT, rowBg)),
        cell(total, { fill: rowBg, font: font({ bold: true, color: C.BLACK_FORM }), align: align("right"), numFmt: USD_FMT }),
        "",
      ]);
    });
    rows.push([
      "",
      totalCell("TOTAL GP INCOME"),
      ...vectors.map(v => totalCell(v.carry + v.fees, USD_FMT)),
      totalCell(totalCarry + totalFees, USD_FMT),
      "",
    ]);

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);
    rows.push(["", sectionCell("GP EXPENSES (PLATFORM / OVERHEAD)"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    const gpExpRows = [
      "Platform / SaaS Costs",
      "Legal (GP Level)",
      "Accounting & Tax",
      "Insurance (D&O / E&O)",
      "Travel & Client Entertainment",
      "Other GP Overheads",
    ];
    gpExpRows.forEach((label, i) => {
      const rowBg = bg(i);
      rows.push([
        "",
        labelCell(label, rowBg),
        ...vectors.map(() => inputCell(0, USD_FMT, rowBg)),
        cell(0, { fill: rowBg, font: font({ color: C.BLACK_FORM }), align: align("right"), numFmt: USD_FMT }),
        "",
      ]);
    });
    rows.push([
      "",
      totalCell("TOTAL GP EXPENSES"),
      ...vectors.map(() => totalCell(0, USD_FMT)),
      totalCell(0, USD_FMT),
      "",
    ]);

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);
    rows.push(["", sectionCell("NET GP P&L"), ...Array(vectors.length).fill(sectionCell("")), sectionCell(""), ""]);

    rows.push([
      "",
      cell("NET GP PROFIT / (LOSS)", { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("left") }),
      ...vectors.map(v => cell(v.carry + v.fees, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT })),
      cell(totalCarry + totalFees, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT }),
      "",
    ]);

    rows.push(["", ...Array(vectors.length + 2).fill(""), ""]);
    rows.push([
      "",
      cell(`Source: Founders Capital Supabase DB · ${now} · https://yoyrwrdzivygufbzckdv.supabase.co`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "",
    ]);

    const ws = makeSheet(rows, [], COLS);
    XLSX.utils.book_append_sheet(wb, ws, "GP Entity");
  }

  // ── SHEET 7: LP CAPITAL ACCOUNTS ──────────────────────────────────────────
  {
    const COLS = [3, 30, 28, 8, 16, 16, 16, 16, 16, 3];
    const rows = [];
    const bg   = (i) => i % 2 === 0 ? C.LIGHT_GREY : C.CREAM;

    const banner = v2 => cell(v2, { fill: C.DARK_BROWN, font: font({ color: C.WHITE }) });
    rows.push(["", banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), ""]);
    rows.push([
      "",
      cell("LP CAPITAL ACCOUNTS  ·  TAX REPORTING VIEW", {
        fill: C.DARK_BROWN, font: font({ bold: true, sz: 13, color: C.WHITE }), align: align("left"),
      }),
      banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), "",
    ]);
    rows.push([
      "",
      cell(`By LP & Vector  ·  All Tax Years  ·  As of ${now}`, {
        fill: C.DARK_BROWN, font: font({ sz: 9, color: C.CREAM }), align: align("left"),
      }),
      banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), "",
    ]);
    rows.push(["", banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), banner(""), ""]);

    // Column headers
    rows.push([
      "",
      headerCell("Investor"),
      headerCell("Vector / Series"),
      headerCell("Tax Year"),
      headerCell("Contributions ($)"),
      headerCell("Fees ($)"),
      headerCell("Gain Alloc ($)"),
      headerCell("Carry Alloc ($)"),
      headerCell("Closing Balance ($)"),
      "",
    ]);

    if (!Array.isArray(capAcctBalances) || capAcctBalances.length === 0) {
      // No data yet — show placeholder row
      rows.push([
        "",
        cell("No capital account entries recorded yet.", {
          font: font({ italic: true, color: C.MID_GREY }), align: align("left"),
        }),
        cell("Run the sync from the portal to populate.", {
          font: font({ italic: true, color: C.MID_GREY }), align: align("left"),
        }),
        "", "", "", "", "", "", "",
      ]);
    } else {
      // Group by investor for sub-totals
      const byInvestor = {};
      capAcctBalances.forEach(r => {
        const key = r.investor_name || r.investor_id;
        if (!byInvestor[key]) byInvestor[key] = [];
        byInvestor[key].push(r);
      });

      let rowIdx = 0;
      Object.entries(byInvestor).forEach(([investor, entries]) => {
        // Investor section header
        rows.push([
          "",
          cell(investor, {
            fill: C.COBALT, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left"),
          }),
          cell(`${entries.length} row(s)`, {
            fill: C.COBALT, font: font({ color: C.WHITE, sz: 8 }), align: align("left"),
          }),
          ...Array(6).fill(cell("", { fill: C.COBALT })),
          "",
        ]);

        let invTotal = { contributions: 0, fees: 0, gain: 0, carry: 0, closing: 0 };

        entries.forEach((r, i) => {
          const rowBg = bg(i);
          const contributions = Number(r.total_contributions || 0);
          const fees          = Number(r.total_fees || 0);
          const gain          = Number(r.total_gain_allocations || 0);
          const carry         = Number(r.total_carry_allocations || 0);
          const closing       = Number(r.closing_balance || 0);

          invTotal.contributions += contributions;
          invTotal.fees          += fees;
          invTotal.gain          += gain;
          invTotal.carry         += carry;
          invTotal.closing        = closing; // use last year's closing as total

          const entityLabel = (r.entity_name || r.entity_id || "")
            .replace("Founders Capital Platform", "FC")
            .replace("FC-VECTOR-", "Vector ");

          rows.push([
            "",
            cell("", { fill: rowBg }),  // investor col blank (merged conceptually)
            cell(entityLabel, { fill: rowBg, font: font({ color: C.DARK_BROWN }), align: align("left") }),
            cell(String(r.tax_year || "—"), { fill: rowBg, font: font({ color: C.DARK_BROWN }), align: align("center") }),
            cell(contributions, { fill: rowBg, font: font({ color: C.GREEN_POS }), align: align("right"), numFmt: USD_FMT }),
            cell(fees, { fill: rowBg, font: font({ color: fees < 0 ? C.RED_NEG : C.BLACK_FORM }), align: align("right"), numFmt: USD_FMT }),
            cell(gain, { fill: rowBg, font: font({ color: gain >= 0 ? C.GREEN_POS : C.RED_NEG }), align: align("right"), numFmt: USD_FMT }),
            cell(carry, { fill: rowBg, font: font({ color: carry < 0 ? C.RED_NEG : C.BLACK_FORM }), align: align("right"), numFmt: USD_FMT }),
            cell(closing, { fill: rowBg, font: font({ bold: true, color: C.COBALT_DARK }), align: align("right"), numFmt: USD_FMT }),
            "",
          ]);
          rowIdx++;
        });

        // Investor sub-total row
        rows.push([
          "",
          totalCell(`${investor} — Total`),
          cell("", { fill: C.GOLD }),
          cell("", { fill: C.GOLD }),
          totalCell(invTotal.contributions, USD_FMT),
          totalCell(invTotal.fees, USD_FMT),
          totalCell(invTotal.gain, USD_FMT),
          totalCell(invTotal.carry, USD_FMT),
          totalCell(invTotal.closing, USD_FMT),
          "",
        ]);
        rows.push(["", "", "", "", "", "", "", "", "", ""]);
      });

      // Grand total
      const grand = {
        contributions: capAcctBalances.reduce((s, r) => s + Number(r.total_contributions || 0), 0),
        fees:  capAcctBalances.reduce((s, r) => s + Number(r.total_fees || 0), 0),
        gain:  capAcctBalances.reduce((s, r) => s + Number(r.total_gain_allocations || 0), 0),
        carry: capAcctBalances.reduce((s, r) => s + Number(r.total_carry_allocations || 0), 0),
      };
      rows.push([
        "",
        cell("FUND TOTAL — ALL LPs", { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("left") }),
        cell("", { fill: C.COBALT_DARK }),
        cell("", { fill: C.COBALT_DARK }),
        cell(grand.contributions, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT }),
        cell(grand.fees, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT }),
        cell(grand.gain, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT }),
        cell(grand.carry, { fill: C.COBALT_DARK, font: font({ bold: true, color: C.WHITE }), align: align("right"), numFmt: USD_FMT }),
        cell("", { fill: C.COBALT_DARK }),
        "",
      ]);
    }

    rows.push(["", "", "", "", "", "", "", "", "", ""]);
    rows.push([
      "",
      cell(`Source: lp_capital_account_balances view · Supabase · ${now}`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "", "", "", "", "",
    ]);

    const ws = makeSheet(rows, [], COLS);
    XLSX.utils.book_append_sheet(wb, ws, "Capital Accounts");
  }

  // ── SHEET 8: Accounts Payable ─────────────────────────────────────────────
  {
    // Fetch all non-void invoices
    const invoices = await fetchAll("invoices",
      "id,vendor,invoice_number,description,invoice_date,due_date,amount,currency,series_tag,status,paid_date,payment_reference"
    );

    const COLS_AP = [{ wch: 3 }, { wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 3 }];

    const rows = [];

    // Title
    rows.push(["", cell("Accounts Payable", { fill: C.COBALT_DARK, font: font({ bold: true, sz: 13, color: C.WHITE }), align: align("left") }), ...Array(8).fill(cell("", { fill: C.COBALT_DARK })), ""]);
    rows.push(["", cell(`Founders Capital Platform LLC — Delaware Series · Generated ${now}`, { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }), "", "", "", "", "", "", "", "", ""]);
    rows.push(Array(11).fill(""));

    // ── KPI summary row ──
    const unpaidTotal   = invoices.filter(i => i.status === "unpaid" ).reduce((s, i) => s + Number(i.amount || 0), 0);
    const overdueTotal  = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount || 0), 0);
    const paidTotal     = invoices.filter(i => i.status === "paid"   ).reduce((s, i) => s + Number(i.amount || 0), 0);

    rows.push(["",
      cell("SUMMARY", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("left") }),
      cell("", { fill: C.COBALT }),
      cell("", { fill: C.COBALT }),
      cell("Unpaid", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
      cell("Overdue", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
      cell("Paid", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("center") }),
      cell("", { fill: C.COBALT }), cell("", { fill: C.COBALT }), cell("", { fill: C.COBALT }),
      "",
    ]);
    rows.push(["",
      cell("All Entities", { fill: C.GOLD, font: font({ bold: true, color: C.DARK_BROWN }), align: align("left") }),
      cell("", { fill: C.GOLD }),
      cell("", { fill: C.GOLD }),
      cell(unpaidTotal,  { fill: C.GOLD, font: font({ bold: true, color: C.RED_NEG }), align: align("right"), numFmt: USD_FMT }),
      cell(overdueTotal, { fill: C.GOLD, font: font({ bold: true, color: C.RED_NEG }), align: align("right"), numFmt: USD_FMT }),
      cell(paidTotal,    { fill: C.GOLD, font: font({ bold: true, color: C.GREEN_POS }), align: align("right"), numFmt: USD_FMT }),
      cell("", { fill: C.GOLD }), cell("", { fill: C.GOLD }), cell("", { fill: C.GOLD }),
      "",
    ]);
    rows.push(Array(11).fill(""));

    // ── Summary by series ──
    const seriesOrder = ["PLATFORM", "VECTOR-I", "VECTOR-III", "VECTOR-IV"];
    const seriesLabel = (tag) => {
      const m = { "PLATFORM": "FC Platform", "VECTOR-I": "Vector I (Shield AI)", "VECTOR-III": "Vector III (Reach Power)", "VECTOR-IV": "Vector IV (Project Prometheus)" };
      return m[tag] || tag;
    };

    rows.push(["",
      cell("SERIES", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left") }),
      cell("TOTAL", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("", { fill: C.HEADER }),
      cell("UNPAID", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("OVERDUE", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("PAID", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("COUNT", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("", { fill: C.HEADER }), cell("", { fill: C.HEADER }),
      "",
    ]);

    // Collect unique series tags, ordered
    const allTags = [...new Set([...seriesOrder, ...invoices.map(i => i.series_tag || "PLATFORM")])];
    allTags.forEach((tag, idx) => {
      const tagInvoices = invoices.filter(i => (i.series_tag || "PLATFORM") === tag && i.status !== "void");
      if (tagInvoices.length === 0) return;
      const rowBg = idx % 2 === 0 ? C.ROW_EVEN : C.ROW_ODD;
      rows.push(["",
        cell(seriesLabel(tag), { fill: rowBg, font: font({ color: C.DARK_BROWN }), align: align("left") }),
        cell(tagInvoices.reduce((s, i) => s + Number(i.amount || 0), 0), { fill: rowBg, font: font({ bold: true, color: C.COBALT_DARK }), align: align("right"), numFmt: USD_FMT }),
        cell("", { fill: rowBg }),
        cell(tagInvoices.filter(i => i.status === "unpaid" ).reduce((s, i) => s + Number(i.amount || 0), 0), { fill: rowBg, font: font({ color: C.RED_NEG }), align: align("right"), numFmt: USD_FMT }),
        cell(tagInvoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount || 0), 0), { fill: rowBg, font: font({ color: C.RED_NEG }), align: align("right"), numFmt: USD_FMT }),
        cell(tagInvoices.filter(i => i.status === "paid"   ).reduce((s, i) => s + Number(i.amount || 0), 0), { fill: rowBg, font: font({ color: C.GREEN_POS }), align: align("right"), numFmt: USD_FMT }),
        cell(tagInvoices.length, { fill: rowBg, font: font({ color: C.MID_GREY }), align: align("right") }),
        cell("", { fill: rowBg }), cell("", { fill: rowBg }),
        "",
      ]);
    });

    rows.push(Array(11).fill(""));

    // ── Invoice detail table ──
    rows.push(["",
      cell("INVOICE DETAIL", { fill: C.COBALT, font: font({ bold: true, color: C.WHITE }), align: align("left") }),
      ...Array(8).fill(cell("", { fill: C.COBALT })),
      "",
    ]);
    rows.push(["",
      cell("Vendor",        { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left") }),
      cell("Invoice #",     { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("center") }),
      cell("Description",  { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left") }),
      cell("Invoice Date", { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("center") }),
      cell("Due Date",     { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("center") }),
      cell("Amount",       { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("right") }),
      cell("CCY",          { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("center") }),
      cell("Status",       { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("center") }),
      cell("Series",       { fill: C.HEADER, font: font({ bold: true, color: C.WHITE, sz: 9 }), align: align("left") }),
      "",
    ]);

    const statusColor = { unpaid: C.GOLD, paid: C.GREEN_POS, overdue: C.RED_NEG, draft: C.MID_GREY, void: C.MID_GREY };

    const sortedInvoices = [...invoices]
      .filter(i => i.status !== "void")
      .sort((a, b) => {
        const order = { overdue: 0, unpaid: 1, draft: 2, paid: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });

    sortedInvoices.forEach((inv, idx) => {
      const rowBg = idx % 2 === 0 ? C.ROW_EVEN : C.ROW_ODD;
      const amtColor = inv.status === "paid" ? C.GREEN_POS : (inv.status === "overdue" ? C.RED_NEG : C.DARK_BROWN);
      rows.push(["",
        cell(inv.vendor || "", { fill: rowBg, font: font({ color: C.DARK_BROWN }), align: align("left") }),
        cell(inv.invoice_number || "", { fill: rowBg, font: font({ color: C.MID_GREY, sz: 8 }), align: align("center") }),
        cell((inv.description || "").slice(0, 60), { fill: rowBg, font: font({ color: C.MID_GREY, sz: 8 }), align: align("left") }),
        cell(inv.invoice_date || "", { fill: rowBg, font: font({ color: C.DARK_BROWN, sz: 8 }), align: align("center") }),
        cell(inv.due_date || "",     { fill: rowBg, font: font({ color: inv.status === "overdue" ? C.RED_NEG : C.DARK_BROWN, sz: 8 }), align: align("center") }),
        cell(Number(inv.amount || 0), { fill: rowBg, font: font({ bold: true, color: amtColor }), align: align("right"), numFmt: USD_FMT }),
        cell(inv.currency || "USD",  { fill: rowBg, font: font({ color: C.MID_GREY, sz: 8 }), align: align("center") }),
        cell(inv.status.toUpperCase(), { fill: rowBg, font: font({ bold: true, color: statusColor[inv.status] || C.MID_GREY, sz: 8 }), align: align("center") }),
        cell(seriesLabel(inv.series_tag || "PLATFORM"), { fill: rowBg, font: font({ color: C.COBALT_DARK, sz: 8 }), align: align("left") }),
        "",
      ]);
    });

    if (sortedInvoices.length === 0) {
      rows.push(["", cell("No invoices recorded yet.", { font: font({ italic: true, sz: 9, color: C.MID_GREY }), align: align("left") }), "", "", "", "", "", "", "", "", ""]);
    }

    rows.push(Array(11).fill(""));
    rows.push(["",
      cell(`Source: invoices table · Supabase · ${now}`,
        { font: font({ italic: true, sz: 8, color: C.MID_GREY }), align: align("left") }),
      "", "", "", "", "", "", "", "", "",
    ]);

    const ws = makeSheet(rows, [], COLS_AP);
    XLSX.utils.book_append_sheet(wb, ws, "Accounts Payable");
  }

  // ── WRITE ──────────────────────────────────────────────────────────────────
  XLSX.writeFile(wb, OUT_PATH);
  console.log(`[PLGen] Written → ${OUT_PATH}`);
}

main().catch(err => {
  console.error("[PLGen] FATAL:", err.message);
  process.exit(1);
});
