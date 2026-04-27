#!/usr/bin/env python3
"""
Founders Capital — Quarterly LP Capital Account Statement
Generates a branded PDF for a single LP covering all their Vector positions.
Called by the Express backend via child_process.execFile.

Usage:
  python generate_statement.py <json_input_file> <output_pdf_path>
"""

import sys
import json
import os
import urllib.request
from pathlib import Path
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak,
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as rl_canvas

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_DIR = Path("/tmp/fc_fonts")
FONT_DIR.mkdir(exist_ok=True)

FONTS = {
    "DMSans":        "https://github.com/googlefonts/dm-fonts/raw/main/Sans/Variable/DMSans%5Bopsz%2Cwght%5D.ttf",
    "DMSans-Bold":   "https://github.com/googlefonts/dm-fonts/raw/main/Sans/Variable/DMSans%5Bopsz%2Cwght%5D.ttf",
    "DMMono":        "https://github.com/google/fonts/raw/main/ofl/dmmono/DMMono-Regular.ttf",
    "DMMono-Medium": "https://github.com/google/fonts/raw/main/ofl/dmmono/DMMono-Medium.ttf",
}

def _load_fonts():
    """Download and register fonts, fall back to Helvetica if download fails."""
    try:
        for name, url in FONTS.items():
            path = FONT_DIR / f"{name}.ttf"
            if not path.exists():
                urllib.request.urlretrieve(url, path)
            pdfmetrics.registerFont(TTFont(name, str(path)))
        return "DMSans", "DMSans-Bold", "DMMono", "DMMono-Medium"
    except Exception:
        # Fallback to built-ins
        return "Helvetica", "Helvetica-Bold", "Courier", "Courier-Bold"

FONT_BODY, FONT_BOLD, FONT_MONO, FONT_MONO_MED = _load_fonts()

# ── Palette ───────────────────────────────────────────────────────────────────
FC_DARK     = colors.HexColor("#1A1209")   # Near-black warm brown — primary text
FC_BLUE     = colors.HexColor("#3B5BDB")   # Cobalt blue — FC primary accent
FC_BLUE_LT  = colors.HexColor("#EBF0FF")   # Light cobalt — row highlight
FC_BLUE_DK  = colors.HexColor("#2F4AC0")   # Deeper cobalt
FC_GOLD     = colors.HexColor("#D19900")   # Amber/gold — secondary
FC_BORDER   = colors.HexColor("#DDD9D4")   # Warm grey border
FC_MUTED    = colors.HexColor("#7A7570")   # Warm mid-grey
FC_WHITE    = colors.white
FC_SURFACE  = colors.HexColor("#F5F3EF")   # Warm cream
FC_TEXT     = colors.HexColor("#1A1209")
FC_GREEN    = colors.HexColor("#437A22")
FC_AMBER    = colors.HexColor("#964219")
FC_RED      = colors.HexColor("#A13544")
FC_TEAL     = FC_BLUE                      # alias kept for legacy
FC_TEAL_LT  = FC_BLUE_LT

W, H   = A4
MARGIN = 18 * mm
CW     = W - 2 * MARGIN   # content width


# ── Helpers ───────────────────────────────────────────────────────────────────
def fmt_usd(n, decimals=0):
    if n is None:
        return "—"
    try:
        n = float(n)
        sign = "-" if n < 0 else ""
        return f"{sign}${abs(n):,.{decimals}f}"
    except Exception:
        return "—"

def fmt_pct(n):
    if n is None:
        return "—"
    try:
        return f"{float(n) * 100:.1f}%"
    except Exception:
        return "—"

def vector_label(short_code):
    return short_code.replace("FC-", "") if short_code else "—"

def moic_str(cost, fv):
    """Return MOIC string, e.g. '1.23x', or '—'."""
    try:
        c, f = float(cost), float(fv)
        if c > 0:
            return f"{f / c:.2f}x"
    except Exception:
        pass
    return "—"

def gl_str(cost, fv):
    """Return unrealised G/L as formatted string with sign."""
    try:
        c, f = float(cost), float(fv)
        gl = f - c
        pct = (gl / c * 100) if c else 0
        sign = "+" if gl >= 0 else ""
        return f"{fmt_usd(gl)} ({sign}{pct:.1f}%)"
    except Exception:
        return "—"


# ── FC Logo mark ──────────────────────────────────────────────────────────────
def draw_fc_logo(c, x, y, cell=4.5, gap=1.2):
    """
    Draw the FC 3×3 grid logo (white squares on dark background).
    Omits centre-middle and bottom-right cells (FC brand mark).
    x, y = bottom-left of the logo bounding box.
    """
    grid_w = 3 * cell + 2 * gap
    grid_h = 3 * cell + 2 * gap

    # Dark background pill
    c.setFillColor(FC_DARK)
    c.roundRect(x - 2, y - 2, grid_w + 4, grid_h + 4, 2, fill=1, stroke=0)

    absent = {(1, 1), (2, 0)}   # (col, row) — 0=bottom row, 1=mid, 2=top

    c.setFillColor(FC_WHITE)
    for row in range(3):
        for col in range(3):
            if (col, row) in absent:
                continue
            cx = x + col * (cell + gap)
            cy = y + row * (cell + gap)
            c.roundRect(cx, cy, cell, cell, 0.8, fill=1, stroke=0)


# ── Page template (headers + footers) ─────────────────────────────────────────
class FCPageTemplate:
    """Provides onFirstPage / onLaterPages callbacks for doc.build()."""

    def __init__(self, lp_name: str, period: str, report_date: str, total_pages_ref: list):
        self.lp_name = lp_name
        self.period = period
        self.report_date = report_date
        self.total_pages_ref = total_pages_ref   # mutable — filled in after build

    def _header(self, c, doc):
        c.saveState()
        page_w = doc.pagesize[0]

        # Left: logo + fund name
        logo_x = MARGIN
        logo_y = H - MARGIN - 12 * mm + 2
        draw_fc_logo(c, logo_x, logo_y)
        c.setFont(FONT_BOLD, 8)
        c.setFillColor(FC_DARK)
        c.drawString(logo_x + 20 * mm, logo_y + 6, "Founders Capital Platform LLC")
        c.setFont(FONT_BODY, 7.5)
        c.setFillColor(FC_MUTED)
        c.drawString(logo_x + 20 * mm, logo_y + 0.5, "Capital Account Statement — Confidential")

        # Right: period + page
        c.setFont(FONT_BOLD, 8)
        c.setFillColor(FC_DARK)
        c.drawRightString(page_w - MARGIN, logo_y + 6, f"{self.period}")
        c.setFont(FONT_BODY, 7.5)
        c.setFillColor(FC_MUTED)
        c.drawRightString(page_w - MARGIN, logo_y + 0.5, f"Page {doc.page}")

        # Divider line
        c.setStrokeColor(FC_BLUE)
        c.setLineWidth(1.2)
        c.line(MARGIN, H - MARGIN - 14 * mm, page_w - MARGIN, H - MARGIN - 14 * mm)
        c.restoreState()

    def _footer(self, c, doc):
        c.saveState()
        page_w = doc.pagesize[0]
        y = MARGIN - 6 * mm

        c.setStrokeColor(FC_BORDER)
        c.setLineWidth(0.4)
        c.line(MARGIN, y + 4 * mm, page_w - MARGIN, y + 4 * mm)

        c.setFont(FONT_BODY, 6.5)
        c.setFillColor(FC_MUTED)
        footer_text = (
            f"Prepared {self.report_date}  ·  {self.lp_name}  ·  "
            "This statement is confidential and for the exclusive use of the named investor. "
            "All figures in USD. Not financial advice."
        )
        c.drawCentredString(page_w / 2, y, footer_text)
        c.restoreState()

    def on_first_page(self, c, doc):
        self._header(c, doc)
        self._footer(c, doc)

    def on_later_pages(self, c, doc):
        self._header(c, doc)
        self._footer(c, doc)


# ── Style factory ─────────────────────────────────────────────────────────────
def S(name, **kw):
    defaults = dict(fontName=FONT_BODY, fontSize=9, leading=13, textColor=FC_TEXT)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)

def make_styles():
    s_h1   = S("h1",   fontName=FONT_BOLD,  fontSize=22, textColor=FC_DARK,  leading=26)
    s_h2   = S("h2",   fontName=FONT_BOLD,  fontSize=13, textColor=FC_DARK,  leading=17)
    s_h3   = S("h3",   fontName=FONT_BOLD,  fontSize=9.5, textColor=FC_BLUE, leading=14)
    s_body = S("body", fontSize=9, leading=13)
    s_muted= S("muted",fontSize=7.5, textColor=FC_MUTED, leading=11)
    s_bold = S("bold", fontName=FONT_BOLD, fontSize=9, leading=13)
    s_mono = S("mono", fontName=FONT_MONO, fontSize=8.5, leading=13)
    s_r    = S("r",    alignment=TA_RIGHT,  fontName=FONT_MONO, fontSize=8.5)
    s_rb   = S("rb",   alignment=TA_RIGHT,  fontName=FONT_MONO_MED, fontSize=8.5)
    s_label= S("label",fontSize=7,  textColor=FC_MUTED, leading=10, fontName=FONT_BODY)
    s_disc = S("disc", fontSize=6.5, textColor=FC_MUTED, leading=9.5)
    return s_h1, s_h2, s_h3, s_body, s_muted, s_bold, s_mono, s_r, s_rb, s_label, s_disc


# ── Table header helper ───────────────────────────────────────────────────────
def TH(text, align=TA_CENTER):
    return Paragraph(
        f"<b>{text}</b>",
        S("th", fontName=FONT_BOLD, fontSize=7.5, textColor=FC_WHITE, alignment=align)
    )

TABLE_HEADER_STYLE = [
    ("BACKGROUND",    (0, 0), (-1, 0), FC_DARK),
    ("FONTSIZE",      (0, 0), (-1, -1), 8.5),
    ("TOPPADDING",    (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING",   (0, 0), (-1, -1), 7),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
    ("GRID",          (0, 0), (-1, -1), 0.3, FC_BORDER),
    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [FC_WHITE, FC_SURFACE]),
]


# ── Main build ────────────────────────────────────────────────────────────────
def build_statement(data: dict, output_path: str):
    lp          = data["investor"]
    period      = data["period"]
    report_date = data.get("report_date", datetime.today().strftime("%d %B %Y"))
    positions   = data["positions"]
    is_multi    = len(positions) > 1
    totals      = data.get("totals", {})
    fund_name   = "Founders Capital Platform LLC"

    s_h1, s_h2, s_h3, s_body, s_muted, s_bold, s_mono, s_r, s_rb, s_label, s_disc = make_styles()

    # Top margin extra to clear the running header
    top_m = MARGIN + 16 * mm

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=top_m,
        bottomMargin=MARGIN + 8 * mm,
        title=f"Capital Account Statement — {lp['full_name']} — {period}",
        author="Perplexity Computer",
    )

    tpl_ref = []
    tpl = FCPageTemplate(lp["full_name"], period, report_date, tpl_ref)

    story = []

    # ── Cover block ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(lp["full_name"], s_h1))
    story.append(Spacer(1, 1.5 * mm))

    sub_line = (
        f"{period}  ·  "
        f"{lp.get('investor_type', '').replace('_', ' ').title()}  ·  "
        f"{lp.get('country_of_residence') or '—'}"
    )
    story.append(Paragraph(sub_line, S("sub", fontSize=9, textColor=FC_MUTED)))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=FC_BORDER, spaceAfter=6))

    # ── Portfolio NAV Summary (the headline table LPs actually want) ───────────
    # Compute totals across all positions
    total_cost = 0.0
    total_fv   = 0.0
    total_committed = float(totals.get("total_committed") or 0)
    total_called    = float(totals.get("total_called") or 0)
    for pos in positions:
        cb = pos.get("cost_basis")
        fv = pos.get("current_fair_value") or pos.get("nav")
        if cb:
            total_cost += float(cb)
        if fv:
            total_fv += float(fv)

    has_fv = total_fv > 0
    # Only compute MOIC / G-L against positions that actually have FV marks
    marked_cost = sum(
        float(p.get("cost_basis") or 0)
        for p in positions
        if p.get("current_fair_value") or p.get("nav")
    )
    all_marked = all((p.get("current_fair_value") or p.get("nav")) for p in positions)
    if total_fv > 0 and marked_cost > 0:
        overall_moic = f"{total_fv / marked_cost:.2f}x" + ("" if all_marked else "*")
        overall_gl   = total_fv - marked_cost
    else:
        overall_moic = "1.00x*"
        overall_gl   = None

    story.append(Paragraph("Portfolio Summary", s_h2))
    story.append(Spacer(1, 2 * mm))

    # KPI row — 4 boxes
    kpis = [
        ("Capital Committed",   fmt_usd(total_committed)),
        ("Capital Called",      fmt_usd(total_called)),
        ("Cost Basis",          fmt_usd(total_cost) if total_cost else "—"),
        ("Current NAV",         (fmt_usd(total_fv) + ("" if all_marked else "†")) if has_fv else "At Cost*"),
        ("Portfolio MOIC",      overall_moic),
        ("Positions",           str(len(positions))),
    ]
    # Two rows of 3
    for chunk_start in range(0, len(kpis), 3):
        chunk = kpis[chunk_start:chunk_start + 3]
        kpi_data = [
            [Paragraph(k, S(f"kl{i}", fontSize=7, textColor=FC_MUTED, leading=10)) for i, (k, _) in enumerate(chunk)],
            [Paragraph(v, S(f"kv{i}", fontName=FONT_MONO_MED, fontSize=13, textColor=FC_DARK, leading=17)) for i, (_, v) in enumerate(chunk)],
        ]
        kpi_tbl = Table(kpi_data, colWidths=[CW / 3] * 3)
        kpi_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), FC_BLUE_LT),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("LINEBELOW",     (0, 0), (-1, 0),  0.3, FC_BORDER),
            ("GRID",          (0, 0), (-1, -1), 0.3, FC_BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(kpi_tbl)
        story.append(Spacer(1, 1 * mm))

    if not has_fv:
        story.append(Paragraph(
            "* NAV figures shown at cost — fair value marks not yet recorded for this period.",
            S("nav_note", fontSize=7, textColor=FC_AMBER, leading=10)
        ))
    if not all_marked and has_fv:
        story.append(Paragraph(
            u"\u2020 NAV and MOIC reflect only positions with recorded marks. "
            "Remaining positions are carried at cost.",
            S("nav_partial", fontSize=7, textColor=FC_AMBER, leading=10)
        ))
    if has_fv and overall_gl is not None:
        gl_color = FC_GREEN if overall_gl >= 0 else FC_RED
        sign = "+" if overall_gl >= 0 else ""
        pct  = (overall_gl / total_cost * 100) if total_cost > 0 else 0
        story.append(Paragraph(
            f"Unrealised gain / (loss): {sign}{fmt_usd(overall_gl)} ({sign}{pct:.1f}%) vs cost basis as at {report_date}",
            S("gl_note", fontSize=7.5, textColor=gl_color, leading=11)
        ))

    story.append(Spacer(1, 6 * mm))

    # ── Consolidated multi-Vector summary ────────────────────────────────────
    if is_multi:
        story.append(HRFlowable(width="100%", thickness=0.5, color=FC_BORDER, spaceAfter=4))
        story.append(Paragraph("Consolidated Portfolio — All Positions", s_h2))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            f"This investor holds {len(positions)} positions across Founders Capital Series. "
            "The table below summarises each position. Detailed capital account information follows.",
            s_muted
        ))
        story.append(Spacer(1, 3 * mm))

        cols = ["Vector", "Investment", "Committed", "Called", "Cost Basis", "Fair Value", "MOIC", "% Called"]
        cw   = [22*mm, 36*mm, 24*mm, 24*mm, 24*mm, 24*mm, 16*mm, 12*mm]
        rows = [[TH(c) for c in cols]]

        for pos in positions:
            comm  = float(pos.get("committed_amount") or 0)
            cal   = float(pos.get("called_amount") or 0)
            cb    = pos.get("cost_basis")
            fv    = pos.get("current_fair_value") or pos.get("nav")
            pct_c = (cal / comm * 100) if comm else 0
            m     = moic_str(cb, fv) if (cb and fv) else "1.00x*"
            rows.append([
                Paragraph(vector_label(pos["short_code"]), s_bold),
                Paragraph(pos.get("company_name") or "—", s_body),
                Paragraph(fmt_usd(comm), s_r),
                Paragraph(fmt_usd(cal),  s_r),
                Paragraph(fmt_usd(float(cb)) if cb else "—", s_r),
                Paragraph(fmt_usd(float(fv)) if fv else "At Cost", s_r),
                Paragraph(m, S("mc", alignment=TA_RIGHT, fontName=FONT_MONO_MED, fontSize=8.5,
                               textColor=FC_GREEN if (fv and cb and float(fv) >= float(cb)) else FC_TEXT)),
                Paragraph(f"{pct_c:.0f}%", S("rc", alignment=TA_RIGHT, fontSize=8.5,
                               textColor=FC_GREEN if pct_c >= 100 else FC_TEXT)),
            ])

        # Totals row
        tc  = float(totals.get("total_committed") or 0)
        tca = float(totals.get("total_called") or 0)
        rows.append([
            Paragraph("<b>Total</b>", s_bold), Paragraph("", s_body),
            Paragraph(f"<b>{fmt_usd(tc)}</b>",  s_rb),
            Paragraph(f"<b>{fmt_usd(tca)}</b>", s_rb),
            Paragraph(f"<b>{fmt_usd(total_cost) if total_cost else '—'}</b>", s_rb),
            Paragraph(f"<b>{fmt_usd(total_fv) if total_fv else '—'}</b>",    s_rb),
            Paragraph(f"<b>{overall_moic}</b>", s_rb),
            Paragraph(f"<b>{(tca/tc*100 if tc else 0):.0f}%</b>", s_rb),
        ])

        sum_tbl = Table(rows, colWidths=cw, repeatRows=1)
        sum_tbl.setStyle(TableStyle(TABLE_HEADER_STYLE + [
            ("BACKGROUND",  (0, -1), (-1, -1), FC_BLUE_LT),
            ("LINEABOVE",   (0, -1), (-1, -1), 1, FC_BLUE),
        ]))
        story.append(sum_tbl)
        story.append(Spacer(1, 8 * mm))

    # ── Per-Vector sections ───────────────────────────────────────────────────
    for idx, pos in enumerate(positions):
        vcode       = vector_label(pos["short_code"])
        entity      = pos.get("entity_name", pos["short_code"])
        company     = pos.get("company_name") or "—"
        committed   = float(pos.get("committed_amount") or 0)
        called      = float(pos.get("called_amount") or 0)
        outstanding = committed - called
        fee_rate    = float(pos.get("fee_rate") or 0.06)
        fee         = committed * fee_rate
        pct_called  = (called / committed * 100) if committed else 0
        cost_basis  = pos.get("cost_basis")
        fair_value  = pos.get("current_fair_value") or pos.get("nav")
        unreal_gl   = (float(fair_value) - float(cost_basis)) if (fair_value and cost_basis) else None
        inv_date    = pos.get("investment_date") or "—"
        commit_date = pos.get("commitment_date") or "—"
        nav_date    = pos.get("nav_mark_date") or "—"
        spv_total   = float(pos.get("spv_total_committed") or committed)
        own_pct     = (committed / spv_total * 100) if spv_total else 0

        # Section header bar
        section_data = [[
            Paragraph(f"<b>{vcode}</b>",   S("sh",  fontName=FONT_BOLD, fontSize=14, textColor=FC_WHITE)),
            Paragraph(f"<b>{company}</b>", S("shi", fontName=FONT_BOLD, fontSize=10, textColor=FC_BLUE_LT, alignment=TA_RIGHT)),
        ]]
        section_tbl = Table(section_data, colWidths=[CW * 0.3, CW * 0.7])
        section_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), FC_DARK),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(KeepTogether([
            section_tbl,
            Spacer(1, 3 * mm),
        ]))

        # ── Capital account detail ────────────────────────────────────────────
        story.append(Paragraph("Capital Account Detail", s_h3))
        story.append(Spacer(1, 1.5 * mm))

        def ca_row(label, value, note="", bold=False, val_color=None):
            style_v = S("car", alignment=TA_RIGHT, fontName=FONT_MONO_MED if bold else FONT_MONO,
                        fontSize=8.5, textColor=val_color or FC_TEXT)
            return [
                Paragraph(f"<b>{label}</b>" if bold else label, s_bold if bold else s_body),
                Paragraph(value, style_v),
                Paragraph(note,  s_muted),
            ]

        ca_rows = [[TH("Item", TA_LEFT), TH("Amount", TA_RIGHT), TH("Notes", TA_LEFT)]]
        ca_rows.append(ca_row("Commitment Date",    str(commit_date)))
        ca_rows.append(ca_row("Capital Committed",  fmt_usd(committed),  "Subscription amount"))
        ca_rows.append(ca_row("Capital Called",     fmt_usd(called),     f"{pct_called:.0f}% of commitment"))
        ca_rows.append(ca_row("Capital Outstanding",fmt_usd(outstanding),
                               "Uncalled commitment",
                               val_color=FC_AMBER if outstanding > 0 else FC_GREEN))
        ca_rows.append(ca_row("Management Fee",     fmt_usd(fee),
                               f"{fee_rate*100:.0f}% of committed amount"))
        ca_rows.append(ca_row("Carry Rate",         "20%",               "GP carried interest on profits"))
        ca_rows.append(ca_row("SPV Ownership %",    f"{own_pct:.3f}%",   f"Of {entity}"))

        if cost_basis:
            ca_rows.append(ca_row("Cost Basis", fmt_usd(float(cost_basis)),
                                   f"Investment date: {inv_date}"))
        if fair_value:
            fv_color = FC_GREEN if (unreal_gl is None or unreal_gl >= 0) else FC_RED
            ca_rows.append(ca_row("Current Fair Value (NAV)", fmt_usd(float(fair_value)),
                                   f"Mark date: {nav_date}", val_color=fv_color))

        if unreal_gl is not None:
            gl_color = FC_GREEN if unreal_gl >= 0 else FC_RED
            ca_rows.append(ca_row("Unrealised Gain / (Loss)", gl_str(cost_basis, fair_value),
                                   "", val_color=gl_color))
            ca_rows.append(ca_row("MOIC", moic_str(cost_basis, fair_value), "",
                                   bold=True,
                                   val_color=FC_GREEN if float(fair_value) >= float(cost_basis) else FC_RED))

        ca_col_w = [CW * 0.36, CW * 0.24, CW * 0.40]
        ca_tbl = Table(ca_rows, colWidths=ca_col_w, repeatRows=1)
        ca_tbl.setStyle(TableStyle(TABLE_HEADER_STYLE))
        story.append(ca_tbl)

        # ── Capital call history ──────────────────────────────────────────────
        calls = pos.get("capital_calls", [])
        if calls:
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph("Capital Call History", s_h3))
            story.append(Spacer(1, 1 * mm))
            call_rows = [[TH("Call #"), TH("Call Date"), TH("Due Date"),
                          TH("Amount"), TH("Fee"), TH("Status")]]
            for cc in calls:
                status_str = str(cc.get("status", "—")).replace("_", " ").title()
                is_funded  = cc.get("status") in ("funded", "fully_funded")
                call_rows.append([
                    Paragraph(str(cc.get("call_number", "—")), s_mono),
                    Paragraph(str(cc.get("call_date",   "—")), s_body),
                    Paragraph(str(cc.get("due_date",    "—")), s_body),
                    Paragraph(fmt_usd(cc.get("call_amount")),  s_r),
                    Paragraph(fmt_usd(cc.get("fee_amount")),   s_r),
                    Paragraph(status_str, S("st", fontSize=8,
                              textColor=FC_GREEN if is_funded else FC_AMBER)),
                ])
            call_tbl = Table(call_rows, colWidths=[16*mm, 25*mm, 25*mm, 28*mm, 24*mm, 26*mm],
                             repeatRows=1)
            call_tbl.setStyle(TableStyle(TABLE_HEADER_STYLE))
            story.append(call_tbl)

        # ── Series expenses ───────────────────────────────────────────────────
        expenses = pos.get("expense_allocations", [])
        if expenses:
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph("Series Expenses — Your Allocation", s_h3))
            story.append(Spacer(1, 1 * mm))
            exp_rows = [[TH("Date"), TH("Vendor", TA_LEFT), TH("Type"), TH("Total Expense"), TH("Your Share")]]
            total_share = 0.0
            for ex in expenses:
                exp_rows.append([
                    Paragraph(str(ex.get("paid_date", "—")),          s_body),
                    Paragraph(str(ex.get("vendor",    "—")),          s_body),
                    Paragraph(str(ex.get("cost_type", "—")).title(),  s_body),
                    Paragraph(fmt_usd(ex.get("expense_amount")),      s_r),
                    Paragraph(fmt_usd(ex.get("allocated_amount")),    s_r),
                ])
                total_share += float(ex.get("allocated_amount") or 0)
            exp_rows.append([
                Paragraph("", s_body), Paragraph("", s_body),
                Paragraph("<b>Total</b>", s_bold),
                Paragraph("", s_r),
                Paragraph(f"<b>{fmt_usd(total_share)}</b>", s_rb),
            ])
            exp_tbl = Table(exp_rows, colWidths=[22*mm, 52*mm, 22*mm, 28*mm, 28*mm], repeatRows=1)
            exp_tbl.setStyle(TableStyle(TABLE_HEADER_STYLE + [
                ("BACKGROUND",  (0, -1), (-1, -1), FC_BLUE_LT),
                ("LINEABOVE",   (0, -1), (-1, -1), 1, FC_BLUE),
            ]))
            story.append(exp_tbl)

        # ── Capital account movement ──────────────────────────────────────────
        cap_acct = pos.get("capital_account") or {}
        if cap_acct:
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph("Capital Account Movement", s_h3))
            story.append(Spacer(1, 1 * mm))

            tax_year      = cap_acct.get("tax_year", "")
            opening_bal   = cap_acct.get("opening_balance")
            contributions = float(cap_acct.get("total_contributions") or 0)
            fees_amt      = float(cap_acct.get("total_fees") or 0)
            gain_alloc    = float(cap_acct.get("total_gain_allocations") or 0)
            carry_alloc   = float(cap_acct.get("total_carry_allocations") or 0)
            distributions = float(cap_acct.get("total_distributions") or 0)
            closing_bal   = float(cap_acct.get("closing_balance") or 0)

            def cam_row(label, value, note="", bold=False, color=None):
                st_v = S("camr", alignment=TA_RIGHT,
                         fontName=FONT_MONO_MED if bold else FONT_MONO,
                         fontSize=9, textColor=color or FC_TEXT)
                return [
                    Paragraph(f"<b>{label}</b>" if bold else label, s_bold if bold else s_body),
                    Paragraph(fmt_usd(value), st_v),
                    Paragraph(note, s_muted),
                ]

            cam_rows = [[TH("Movement Item", TA_LEFT), TH("Amount", TA_RIGHT), TH("Notes", TA_LEFT)]]
            if opening_bal is not None:
                yr_prev = str(int(tax_year) - 1) if str(tax_year).isdigit() else "—"
                cam_rows.append(cam_row("Opening Balance (1 Jan)", float(opening_bal),
                                        f"Prior year closing as at 31 Dec {yr_prev}"))
            cam_rows.append(cam_row("(+) Capital Contributions", contributions,
                                    "Cash called from LP", color=FC_GREEN))
            if fees_amt:
                cam_rows.append(cam_row("(-) Management / Deal Fees", fees_amt,
                                        "Deal fee deducted", color=FC_AMBER))
            if gain_alloc:
                cam_rows.append(cam_row("(+/-) Allocated Gain / (Loss)", gain_alloc,
                                        "Pro-rata share of unrealised gain/(loss)",
                                        color=FC_GREEN if gain_alloc >= 0 else FC_RED))
            if carry_alloc:
                cam_rows.append(cam_row("(-) GP Carry Allocation", carry_alloc,
                                        "20% carried interest reserved for GP", color=FC_AMBER))
            if distributions:
                cam_rows.append(cam_row("(-) Distributions Received", distributions,
                                        "Cash returned to LP", color=FC_GREEN))
            cam_rows.append(cam_row("Closing Balance (31 Dec)", closing_bal,
                                    f"Tax year {tax_year} — K-1 basis",
                                    bold=True,
                                    color=FC_BLUE if closing_bal >= 0 else FC_RED))

            cam_tbl = Table(cam_rows, colWidths=[CW * 0.36, CW * 0.24, CW * 0.40], repeatRows=1)
            cam_tbl.setStyle(TableStyle(TABLE_HEADER_STYLE + [
                ("BACKGROUND",  (0, -1), (-1, -1), FC_BLUE_LT),
                ("LINEABOVE",   (0, -1), (-1, -1), 1.5, FC_BLUE),
            ]))
            story.append(cam_tbl)
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph(
                "This capital account summary is for informational purposes only and must not be used "
                "for tax filing without reference to the official K-1 issued by the GP.",
                s_disc
            ))

        story.append(Spacer(1, 10 * mm))
        # Page break between vectors (except last)
        if idx < len(positions) - 1:
            story.append(PageBreak())

    # ── Footer disclaimer ─────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.4, color=FC_BORDER, spaceAfter=4))
    story.append(Paragraph(
        f"This statement is prepared by {fund_name} for the exclusive use of {lp['full_name']}. "
        "It is confidential and must not be disclosed to any third party without prior written consent. "
        "All figures are in USD unless otherwise stated. Past performance is not indicative of future results. "
        "This document does not constitute financial advice.",
        s_disc
    ))
    story.append(Spacer(1, 1.5 * mm))
    story.append(Paragraph(
        f"{fund_name}  ·  Delaware Series LLC  ·  Prepared: {report_date}  ·  Period: {period}",
        S("footer_c", fontSize=6.5, textColor=FC_MUTED, alignment=TA_CENTER)
    ))

    doc.build(
        story,
        onFirstPage=tpl.on_first_page,
        onLaterPages=tpl.on_later_pages,
    )
    print(f"OK:{output_path}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate_statement.py <input.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        data = json.load(f)

    build_statement(data, sys.argv[2])
