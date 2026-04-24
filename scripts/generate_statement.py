#!/usr/bin/env python3
"""
Founders Capital — Quarterly LP Capital Account Statement
Generates a professional PDF for a single LP covering all their Vector positions.
Called by the Express backend via child_process.execFile.

Usage:
  python generate_statement.py <json_input_file> <output_pdf_path>
"""

import sys
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

# ── Palette ──────────────────────────────────────────────────────────────────
FC_DARK    = colors.HexColor("#1A1209")   # Near-black warm brown — headers
FC_BLUE    = colors.HexColor("#3B5BDB")   # Royal/cobalt blue — FC primary CTA
FC_BLUE_LT = colors.HexColor("#EBF0FF")   # Light cobalt — row highlight
FC_BLUE_DK = colors.HexColor("#2F4AC0")   # Deeper cobalt — accent lines
FC_GOLD    = colors.HexColor("#D19900")   # Amber/gold — secondary accent
FC_BORDER  = colors.HexColor("#DDD9D4")   # Warm grey border
FC_MUTED   = colors.HexColor("#7A7570")   # Warm mid-grey
FC_WHITE   = colors.white
FC_SURFACE = colors.HexColor("#F5F3EF")   # Warm cream background
FC_TEXT    = colors.HexColor("#1A1209")   # Primary text
FC_GREEN   = colors.HexColor("#437A22")   # Success green
FC_AMBER   = colors.HexColor("#964219")   # Warning amber
# Aliases so all existing code keeps working unchanged
FC_TEAL    = FC_BLUE
FC_TEAL_LT = FC_BLUE_LT

W, H = A4
MARGIN = 18 * mm

def fmt_usd(n, decimals=2):
    if n is None: return "—"
    try:
        n = float(n)
        sign = "-" if n < 0 else ""
        return f"{sign}${abs(n):,.{decimals}f}"
    except:
        return "—"

def fmt_pct(n):
    if n is None: return "—"
    try: return f"{float(n)*100:.1f}%"
    except: return "—"

def vector_label(short_code):
    return short_code.replace("FC-", "") if short_code else short_code

def build_statement(data: dict, output_path: str):
    lp       = data["investor"]
    period   = data["period"]
    report_date = data.get("report_date", datetime.today().strftime("%d %B %Y"))
    positions   = data["positions"]        # list of per-Vector dicts
    is_multi    = len(positions) > 1
    totals      = data.get("totals", {})
    fund_name   = "Founders Capital Platform LLC"

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title=f"Quarterly Capital Account — {lp['full_name']} — {period}",
        author="Founders Capital Platform LLC",
    )

    # ── Styles ────────────────────────────────────────────────────────────────
    def S(name, **kw):
        defaults = dict(fontName="Helvetica", fontSize=9, leading=13, textColor=FC_TEXT)
        defaults.update(kw)
        return ParagraphStyle(name, **defaults)

    s_h1    = S("h1", fontName="Helvetica-Bold", fontSize=20, textColor=FC_DARK, leading=24)
    s_h2    = S("h2", fontName="Helvetica-Bold", fontSize=12, textColor=FC_DARK, leading=16)
    s_h3    = S("h3", fontName="Helvetica-Bold", fontSize=10, textColor=FC_TEAL, leading=14)
    s_body  = S("body", fontSize=9, leading=13)
    s_muted = S("muted", fontSize=8, textColor=FC_MUTED, leading=12)
    s_bold  = S("bold", fontName="Helvetica-Bold", fontSize=9, leading=13)
    s_r     = S("r", alignment=TA_RIGHT, fontName="Helvetica", fontSize=9)
    s_rb    = S("rb", alignment=TA_RIGHT, fontName="Helvetica-Bold", fontSize=9)
    s_label = S("label", fontSize=7.5, textColor=FC_MUTED, leading=11,
                fontName="Helvetica-Oblique")

    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph(f"<b>{fund_name}</b>", S("hf", fontName="Helvetica-Bold",
                  fontSize=10, textColor=FC_DARK)),
        Paragraph(f"<b>Capital Account Statement</b>", S("hfr",
                  fontName="Helvetica-Bold", fontSize=10, textColor=FC_DARK,
                  alignment=TA_RIGHT)),
    ]]
    header_tbl = Table(header_data, colWidths=[(W - 2*MARGIN)*0.6, (W - 2*MARGIN)*0.4])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=2, color=FC_TEAL, spaceAfter=10))

    # ── Title block ───────────────────────────────────────────────────────────
    story.append(Paragraph(lp["full_name"], s_h1))
    story.append(Spacer(1, 2*mm))

    meta_data = [
        ["Period:", period,          "Report Date:", report_date],
        ["Email:",  lp.get("email","—"), "Investor Type:", lp.get("investor_type","—").replace("_"," ").title()],
        ["Country:", lp.get("country_of_residence") or "—", "Carry Rate:", "20%"],
    ]
    meta_tbl = Table(meta_data, colWidths=[28*mm, 62*mm, 32*mm, 48*mm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME",   (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8.5),
        ("TEXTCOLOR",  (0,0), (0,-1), FC_MUTED),
        ("TEXTCOLOR",  (2,0), (2,-1), FC_MUTED),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("TOPPADDING",    (0,0), (-1,-1), 3),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 6*mm))

    # ── Consolidated summary (multi-Vector LPs only) ──────────────────────────
    if is_multi:
        story.append(HRFlowable(width="100%", thickness=0.5, color=FC_BORDER, spaceAfter=4))
        story.append(Paragraph("Consolidated Portfolio Summary", s_h2))
        story.append(Spacer(1, 2*mm))
        story.append(Paragraph(
            f"This LP holds positions in {len(positions)} Founders Capital Series. "
            f"The consolidated figures below represent the aggregate capital account "
            f"across all Vectors as at {report_date}.",
            s_muted))
        story.append(Spacer(1, 3*mm))

        # Consolidated KPI row
        kpis = [
            ("Total Committed", fmt_usd(totals.get("total_committed"))),
            ("Total Called", fmt_usd(totals.get("total_called"))),
            ("Total Outstanding", fmt_usd(totals.get("total_outstanding"))),
            ("Total 6% Fee", fmt_usd(totals.get("total_fee"))),
            ("Vectors", str(len(positions))),
        ]
        kpi_data = [[Paragraph(k, s_label) for k,_ in kpis],
                    [Paragraph(v, S("kv", fontName="Helvetica-Bold", fontSize=11,
                                    textColor=FC_DARK)) for _,v in kpis]]
        kpi_tbl = Table(kpi_data, colWidths=[(W - 2*MARGIN)/len(kpis)]*len(kpis))
        kpi_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), FC_TEAL_LT),
            ("ROUNDEDCORNERS", [4]),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("ALIGN",         (0,0), (-1,-1), "CENTER"),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(kpi_tbl)
        story.append(Spacer(1, 4*mm))

        # Cross-Vector summary table
        cols = ["Vector", "Investment", "Committed", "Called", "Outstanding", "Fee (6%)", "% Called"]
        col_w = [24*mm, 46*mm, 24*mm, 24*mm, 24*mm, 20*mm, 18*mm]
        rows = [[Paragraph(f"<b>{c}</b>", S("th", fontName="Helvetica-Bold",
                 fontSize=8, textColor=FC_WHITE, alignment=TA_CENTER)) for c in cols]]

        for pos in positions:
            called    = float(pos.get("called_amount") or 0)
            committed = float(pos.get("committed_amount") or 0)
            outstanding = committed - called
            pct_called  = (called / committed * 100) if committed else 0
            fee         = committed * float(pos.get("fee_rate") or 0.06)
            rows.append([
                Paragraph(vector_label(pos["short_code"]), s_bold),
                Paragraph(pos.get("company_name") or "—", s_body),
                Paragraph(fmt_usd(committed), s_r),
                Paragraph(fmt_usd(called), s_r),
                Paragraph(fmt_usd(outstanding, 0), S("ro", alignment=TA_RIGHT,
                          textColor=FC_AMBER if outstanding > 0 else FC_TEXT, fontSize=9)),
                Paragraph(fmt_usd(fee), s_r),
                Paragraph(f"{pct_called:.0f}%", S("rc", alignment=TA_RIGHT, fontSize=9,
                          textColor=FC_GREEN if pct_called >= 100 else FC_TEXT)),
            ])

        # Totals row
        tc = float(totals.get("total_committed") or 0)
        tca = float(totals.get("total_called") or 0)
        rows.append([
            Paragraph("<b>Total</b>", s_bold),
            Paragraph("", s_body),
            Paragraph(f"<b>{fmt_usd(tc)}</b>", s_rb),
            Paragraph(f"<b>{fmt_usd(tca)}</b>", s_rb),
            Paragraph(f"<b>{fmt_usd(tc - tca, 0)}</b>", S("rbt", alignment=TA_RIGHT,
                      fontName="Helvetica-Bold", fontSize=9,
                      textColor=FC_AMBER if tc - tca > 0 else FC_TEXT)),
            Paragraph(f"<b>{fmt_usd(tc * 0.06)}</b>", s_rb),
            Paragraph(f"<b>{(tca/tc*100 if tc else 0):.0f}%</b>", s_rb),
        ])

        sum_tbl = Table(rows, colWidths=col_w, repeatRows=1)
        sum_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), FC_DARK),
            ("BACKGROUND",    (0,-1), (-1,-1), FC_TEAL_LT),
            ("ROWBACKGROUNDS",(0,1), (-1,-2), [FC_WHITE, FC_SURFACE]),
            ("FONTSIZE",      (0,0), (-1,-1), 8.5),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("RIGHTPADDING",  (0,0), (-1,-1), 6),
            ("GRID",          (0,0), (-1,-1), 0.3, FC_BORDER),
            ("LINEABOVE",     (0,-1), (-1,-1), 1, FC_TEAL),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(sum_tbl)
        story.append(Spacer(1, 8*mm))

    # ── Per-Vector Sections ────────────────────────────────────────────────────
    for i, pos in enumerate(positions):
        vcode      = vector_label(pos["short_code"])
        entity     = pos.get("entity_name", pos["short_code"])
        company    = pos.get("company_name") or "—"
        committed  = float(pos.get("committed_amount") or 0)
        called     = float(pos.get("called_amount") or 0)
        outstanding= committed - called
        fee        = committed * float(pos.get("fee_rate") or 0.06)
        pct_called = (called / committed * 100) if committed else 0
        cost_basis = pos.get("cost_basis")
        fair_value = pos.get("current_fair_value") or pos.get("nav")
        unreal_gl  = (float(fair_value) - float(cost_basis)) if fair_value and cost_basis else None
        inv_date   = pos.get("investment_date") or "—"
        commit_date= pos.get("commitment_date") or "—"
        nav_date   = pos.get("nav_mark_date") or "—"

        # Ownership % of total SPV
        spv_total_committed = float(pos.get("spv_total_committed") or committed)
        ownership_pct = (committed / spv_total_committed * 100) if spv_total_committed else 0

        # Section divider
        section_header_data = [[
            Paragraph(f"<b>{vcode}</b>", S("sh", fontName="Helvetica-Bold",
                      fontSize=13, textColor=FC_WHITE)),
            Paragraph(f"<b>{company}</b>", S("shi", fontName="Helvetica-Bold",
                      fontSize=11, textColor=FC_TEAL_LT, alignment=TA_RIGHT)),
        ]]
        section_tbl = Table(section_header_data,
                            colWidths=[(W-2*MARGIN)*0.35, (W-2*MARGIN)*0.65])
        section_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), FC_DARK),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))

        story.append(KeepTogether([
            section_tbl,
            Spacer(1, 3*mm),

            # Capital account table
            Table([
                [Paragraph("<b>Capital Account Detail</b>", s_h3), ""],
            ], colWidths=[(W-2*MARGIN)*0.5, (W-2*MARGIN)*0.5]),
        ]))

        # Capital account rows
        ca_rows = [
            [Paragraph("<b>Item</b>", S("th", fontName="Helvetica-Bold", fontSize=8.5, textColor=FC_WHITE)),
             Paragraph("<b>Amount</b>", S("thr", fontName="Helvetica-Bold", fontSize=8.5, textColor=FC_WHITE, alignment=TA_RIGHT)),
             Paragraph("<b>Notes</b>", S("thn", fontName="Helvetica-Bold", fontSize=8.5, textColor=FC_WHITE))],

            [Paragraph("Commitment Date", s_body), Paragraph(str(commit_date), s_r), Paragraph("", s_muted)],
            [Paragraph("Capital Committed", s_body), Paragraph(fmt_usd(committed), s_r), Paragraph("Subscription amount", s_muted)],
            [Paragraph("Capital Called", s_body), Paragraph(fmt_usd(called), s_r), Paragraph(f"{pct_called:.0f}% of commitment", s_muted)],
            [Paragraph("Capital Outstanding", s_body),
             Paragraph(fmt_usd(outstanding),
                       S("ro", alignment=TA_RIGHT, textColor=FC_AMBER if outstanding > 0 else FC_GREEN, fontSize=9)),
             Paragraph("Uncalled commitment", s_muted)],
            [Paragraph("Management Fee (6%)", s_body), Paragraph(fmt_usd(fee), s_r), Paragraph("6% of committed amount", s_muted)],
            [Paragraph("Carry Rate", s_body), Paragraph("20%", s_r), Paragraph("GP carried interest on profits", s_muted)],
            [Paragraph(f"SPV Ownership %", s_body),
             Paragraph(f"{ownership_pct:.3f}%", s_r),
             Paragraph(f"Of {entity}", s_muted)],
        ]

        if cost_basis:
            ca_rows.append([Paragraph("Cost Basis", s_body), Paragraph(fmt_usd(float(cost_basis)), s_r), Paragraph(f"Investment date: {inv_date}", s_muted)])
        if fair_value:
            ca_rows.append([Paragraph("Current Fair Value (NAV)", s_body),
                            Paragraph(fmt_usd(float(fair_value)), S("rv", alignment=TA_RIGHT,
                                      textColor=FC_GREEN if (unreal_gl or 0) >= 0 else colors.red, fontSize=9)),
                            Paragraph(f"Mark date: {nav_date}", s_muted)])
        if unreal_gl is not None:
            gl_pct = (unreal_gl / float(cost_basis) * 100) if cost_basis else 0
            ca_rows.append([Paragraph("Unrealised Gain / (Loss)", s_body),
                            Paragraph(fmt_usd(unreal_gl),
                                      S("rgl", alignment=TA_RIGHT, fontSize=9,
                                        textColor=FC_GREEN if unreal_gl >= 0 else colors.red)),
                            Paragraph(f"{'+' if gl_pct >= 0 else ''}{gl_pct:.1f}% vs cost", s_muted)])

        ca_col_w = [(W-2*MARGIN)*0.38, (W-2*MARGIN)*0.22, (W-2*MARGIN)*0.40]
        ca_tbl = Table(ca_rows, colWidths=ca_col_w, repeatRows=1)
        ca_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), FC_TEAL),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [FC_WHITE, FC_SURFACE]),
            ("FONTSIZE",      (0,0), (-1,-1), 8.5),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 7),
            ("RIGHTPADDING",  (0,0), (-1,-1), 7),
            ("GRID",          (0,0), (-1,-1), 0.3, FC_BORDER),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(ca_tbl)

        # Capital call history if present
        calls = pos.get("capital_calls", [])
        if calls:
            story.append(Spacer(1, 3*mm))
            story.append(Paragraph("Capital Call History", s_h3))
            story.append(Spacer(1, 1*mm))
            call_rows = [[
                Paragraph(f"<b>{h}</b>", S("th", fontName="Helvetica-Bold", fontSize=8, textColor=FC_WHITE))
                for h in ["Call #", "Call Date", "Due Date", "Call Amount", "Fee", "Status"]
            ]]
            for cc in calls:
                call_rows.append([
                    Paragraph(str(cc.get("call_number","—")), s_body),
                    Paragraph(str(cc.get("call_date","—")), s_body),
                    Paragraph(str(cc.get("due_date","—")), s_body),
                    Paragraph(fmt_usd(cc.get("call_amount")), s_r),
                    Paragraph(fmt_usd(cc.get("fee_amount")), s_r),
                    Paragraph(str(cc.get("status","—")).replace("_"," ").title(),
                              S("st", fontSize=8, textColor=FC_GREEN if cc.get("status") in ("funded","fully_funded") else FC_AMBER)),
                ])
            call_tbl = Table(call_rows, colWidths=[16*mm, 24*mm, 24*mm, 28*mm, 24*mm, 26*mm], repeatRows=1)
            call_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,0), FC_TEAL),
                ("ROWBACKGROUNDS",(0,1), (-1,-1), [FC_WHITE, FC_SURFACE]),
                ("FONTSIZE",      (0,0), (-1,-1), 8),
                ("TOPPADDING",    (0,0), (-1,-1), 4),
                ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ("LEFTPADDING",   (0,0), (-1,-1), 6),
                ("RIGHTPADDING",  (0,0), (-1,-1), 6),
                ("GRID",          (0,0), (-1,-1), 0.3, FC_BORDER),
                ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ]))
            story.append(call_tbl)

        # Series expenses allocated to this LP
        expenses = pos.get("expense_allocations", [])
        if expenses:
            story.append(Spacer(1, 3*mm))
            story.append(Paragraph("Series Expenses — Your Share", s_h3))
            story.append(Spacer(1, 1*mm))
            exp_rows = [[
                Paragraph(f"<b>{h}</b>", S("th", fontName="Helvetica-Bold", fontSize=8, textColor=FC_WHITE))
                for h in ["Date", "Vendor", "Type", "Total Expense", "Your Share"]
            ]]
            total_exp_share = 0
            for ex in expenses:
                exp_rows.append([
                    Paragraph(str(ex.get("paid_date","—")), s_body),
                    Paragraph(str(ex.get("vendor","—")), s_body),
                    Paragraph(str(ex.get("cost_type","—")).title(), s_body),
                    Paragraph(fmt_usd(ex.get("expense_amount")), s_r),
                    Paragraph(fmt_usd(ex.get("allocated_amount")), s_r),
                ])
                total_exp_share += float(ex.get("allocated_amount") or 0)
            exp_rows.append([
                Paragraph("", s_body), Paragraph("", s_body), Paragraph("<b>Total</b>", s_bold),
                Paragraph("", s_r),
                Paragraph(f"<b>{fmt_usd(total_exp_share)}</b>", s_rb),
            ])
            exp_tbl = Table(exp_rows, colWidths=[22*mm, 52*mm, 22*mm, 28*mm, 28*mm], repeatRows=1)
            exp_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,0), FC_TEAL),
                ("BACKGROUND",    (0,-1), (-1,-1), FC_TEAL_LT),
                ("ROWBACKGROUNDS",(0,1), (-1,-2), [FC_WHITE, FC_SURFACE]),
                ("FONTSIZE",      (0,0), (-1,-1), 8),
                ("TOPPADDING",    (0,0), (-1,-1), 4),
                ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ("LEFTPADDING",   (0,0), (-1,-1), 6),
                ("RIGHTPADDING",  (0,0), (-1,-1), 6),
                ("GRID",          (0,0), (-1,-1), 0.3, FC_BORDER),
                ("LINEABOVE",     (0,-1), (-1,-1), 1, FC_TEAL),
                ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ]))
            story.append(exp_tbl)

        story.append(Spacer(1, 8*mm))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=FC_BORDER, spaceAfter=4))
    story.append(Paragraph(
        f"This statement is prepared by {fund_name} for the exclusive use of {lp['full_name']}. "
        f"It is confidential and must not be disclosed to any third party. "
        f"All figures are in USD. Past performance is not indicative of future results. "
        f"This document does not constitute financial advice.",
        S("disc", fontSize=7, textColor=FC_MUTED, leading=10)
    ))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f"Founders Capital Platform LLC · Delaware Series LLC · "
        f"Prepared: {report_date} · Period: {period}",
        S("footer", fontSize=7, textColor=FC_MUTED, alignment=TA_CENTER)
    ))

    doc.build(story)
    print(f"OK:{output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate_statement.py <input.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        data = json.load(f)

    build_statement(data, sys.argv[2])
