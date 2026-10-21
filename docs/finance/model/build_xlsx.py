#!/usr/bin/env python3
"""
Builds local-loyalty-model.xlsx from model.py's ASSUMPTIONS with live Excel formulas.

    python3 docs/finance/model/build_xlsx.py

Unlike model.py (standard library only), this script needs `openpyxl`. Formulas are
cached by recalculating with LibreOffice (headless) when it is available; the script
then reads the workbook back and checks it against model.py's numbers.

Sheets
  Assumptions      every input; one column per scenario (non-Base columns link to Base
                   unless overridden: overrides are blue on yellow), plus the strip launch
                   schedules and one-time costs by month.
  Monthly          Base case, months 0-60 (months 1-36 = the projection; 37-60 = extension
                   used only to find break-even). Every cell is a formula.
  Monthly_<name>   the same engine for each other scenario.
  Scenarios        side-by-side KPIs pulled live from each monthly sheet.
  Unit Economics   steady-state per-merchant economics per scenario, live formulas.
  Sensitivity      static table pasted from model.py output (re-run model.py to refresh).
"""

import csv
import os
import subprocess
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model as M  # noqa: E402

XLSX = os.path.join(HERE, "local-loyalty-model.xlsx")
H = 60  # months modelled in the workbook (36 projection + 24 extension)

SCEN = [  # (scenario key, column header, monthly sheet name)
    ("base", "Base", "Monthly"),
    ("bear", "Bear", "Monthly_Bear"),
    ("base_reco_gates", "Base + reco gates", "Monthly_RecoGates"),
    ("lean_plan", "Lean plan", "Monthly_Lean"),
    ("bull", "Bull", "Monthly_Bull"),
]
SCOL = {k: get_column_letter(3 + i) for i, (k, _, _) in enumerate(SCEN)}  # base=C, bear=D ...

F = "Arial"
BLUE = Font(name=F, color="0000FF")
BLACK = Font(name=F, color="000000")
GREEN = Font(name=F, color="008000")
BOLD = Font(name=F, bold=True)
TITLE = Font(name=F, bold=True, size=14)
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEAD = PatternFill("solid", fgColor="DDE3EA")
EXT = PatternFill("solid", fgColor="F2F2F2")
THIN = Border(bottom=Side(style="thin", color="999999"))

CUR = '$#,##0;($#,##0);"-"'
CUR2 = '$#,##0.00;($#,##0.00);"-"'
NUM1 = '#,##0.0;(#,##0.0);"-"'
NUM0 = '#,##0;(#,##0);"-"'
PCT = '0.0%;(0.0%);"-"'
PCT2 = '0.00%;(0.00%);"-"'
FLAG = '0;0;"-"'


def number_format_for(key, unit):
    u = (unit or "").lower()
    if "share" in u or "per month" in u or u.startswith("of ") or "conversion" in u or "per year" in u \
            or key.startswith(("mix_", "pro_share_", "conv12_")) or key in ("platform_fee", "payroll_burden", "ramp"):
        return PCT2 if key in ("platform_fee", "connect_pct", "stripe_pct") else PCT
    if "cad" in u:
        return CUR2
    return "General"


# ---------------------------------------------------------------- Assumptions sheet
def build_assumptions(wb):
    ws = wb.active
    ws.title = "Assumptions"
    ws["A1"] = "Local Loyalty — Assumptions (CAD)"
    ws["A1"].font = TITLE
    ws["A2"] = ("Legend: blue = input you can change; black = formula; blue on yellow = scenario override of Base. "
                "Non-Base columns follow Base unless overridden. Source/notes in column I. Mirrors model.py ASSUMPTIONS.")
    ws["A2"].font = Font(name=F, italic=True)
    hdr = ["Key", "Assumption"] + [h for _, h, _ in SCEN] + ["Unit", "Source / note"]
    for j, h in enumerate(hdr, 1):
        c = ws.cell(row=4, column=j, value=h)
        c.font = BOLD
        c.fill = HEAD
    ref = {}
    r = 5
    scen_vals = {k: M.values(k) for k, _, _ in SCEN}

    def put(key, label, unit, note, getter):
        nonlocal r
        ws.cell(row=r, column=1, value=key).font = BLACK
        ws.cell(row=r, column=2, value=label).font = BLACK
        base_v = getter(scen_vals["base"])
        c = ws.cell(row=r, column=3, value=base_v)
        c.font = BLUE
        fmt_ = number_format_for(key, unit)
        c.number_format = fmt_
        for k, _, _ in SCEN[1:]:
            val = getter(scen_vals[k])
            cc = ws[f"{SCOL[k]}{r}"]
            if val != base_v:
                cc.value = val
                cc.font = BLUE
                cc.fill = YELLOW
            else:
                cc.value = f"=$C${r}"
                cc.font = BLACK
            cc.number_format = fmt_
        ws.cell(row=r, column=8, value=unit).font = BLACK
        ws.cell(row=r, column=9, value=note).font = BLACK
        ref[key] = r
        r += 1

    def section(title):
        nonlocal r
        r += 1
        c = ws.cell(row=r, column=1, value=title)
        c.font = BOLD
        r += 1

    skip = {"start_month", "strips_per_quarter", "launch_order_in_quarter", "acquisition_ramp", "one_time_costs"}
    section("Scalar assumptions")
    for key, a in M.ASSUMPTIONS.items():
        if key in skip:
            continue
        put(key, key.replace("_", " ").capitalize(), a["unit"], a["note"], lambda v, k=key: v[k])
    # derived: fixed overhead total
    ws.cell(row=r, column=1, value="fixed_overhead_total").font = BLACK
    ws.cell(row=r, column=2, value="Fixed overhead total (sum of fixed_* lines)").font = BOLD
    for k, _, _ in SCEN:
        col = SCOL[k]
        ws[f"{col}{r}"] = "=" + "+".join(f"{col}{ref[x]}" for x in M.FIXED_KEYS)
        ws[f"{col}{r}"].number_format = CUR
        ws[f"{col}{r}"].font = BLACK
    ws.cell(row=r, column=8, value="CAD/month")
    ref["fixed_overhead_total"] = r
    r += 1

    section("Acquisition ramp: share of a strip's potential merchants signing in each month after launch "
            "(age 0 = launch month). " + M.ASSUMPTIONS["acquisition_ramp"]["note"])
    for j, x in enumerate(M.ASSUMPTIONS["acquisition_ramp"]["value"]):
        put(f"ramp_{j}", f"Ramp, strip age {j} months", "share of potential", "Assumption",
            lambda v, j=j: v["acquisition_ramp"][j])
    ws.cell(row=r, column=2, value="Ramp total (should be 100%)").font = BOLD
    for k, _, _ in SCEN:
        col = SCOL[k]
        ws[f"{col}{r}"] = f"=SUM({col}{ref['ramp_0']}:{col}{r-1})"
        ws[f"{col}{r}"].number_format = PCT
    r += 1

    # schedules
    section("Schedules by model month (row inputs). Strip launches derived from strips_per_quarter in model.py "
            "(launch order within quarter: middle, last, first month). Months 37-60 repeat the last quarter's pace.")
    sched_hdr = r
    ws.cell(row=r, column=2, value="Model month →").font = BOLD
    for m in range(1, H + 1):
        c = ws.cell(row=r, column=2 + m, value=m)
        c.font = BOLD
        c.fill = HEAD if m <= 36 else EXT
    r += 1
    ws.cell(row=r, column=2, value="Calendar month").font = BOLD
    for m in range(1, H + 1):
        ws.cell(row=r, column=2 + m, value=M.month_label(M.ASSUMPTIONS["start_month"]["value"], m - 1))
    r += 1
    sched = {}
    for k, h, _ in SCEN:
        v = dict(scen_vals[k], months=H)
        L = M.monthly_launches(v)
        ws.cell(row=r, column=1, value=f"launches_{k}")
        ws.cell(row=r, column=2, value=f"Strip launches — {h}").font = BLACK
        for m in range(1, H + 1):
            c = ws.cell(row=r, column=2 + m, value=L[m - 1])
            c.font = BLUE
        ws.cell(row=r, column=3 + H, value="strips_per_quarter = " + str(v["strips_per_quarter"]))
        sched[f"launches_{k}"] = r
        r += 1
    ws.cell(row=r, column=1, value="one_time_costs")
    ws.cell(row=r, column=2, value="One-time costs (all scenarios), CAD").font = BLACK
    ot = M.ASSUMPTIONS["one_time_costs"]["value"]
    for m in range(1, H + 1):
        c = ws.cell(row=r, column=2 + m, value=float(ot.get(m, 0.0)))
        c.font = BLUE
        c.number_format = CUR
    ws.cell(row=r, column=3 + H, value=M.ASSUMPTIONS["one_time_costs"]["note"])
    sched["one_time_costs"] = r
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 44
    for col in "CDEFG":
        ws.column_dimensions[col].width = 14
    ws.column_dimensions["H"].width = 24
    ws.column_dimensions["I"].width = 90
    ws.freeze_panes = "C5"
    for row in ws.iter_rows():
        for c in row:
            if c.font is None or c.font.name != F:
                c.font = Font(name=F, bold=c.font.bold if c.font else False,
                              color=c.font.color if c.font else None,
                              italic=c.font.italic if c.font else False,
                              size=c.font.size if c.font else 10)
    return ref, sched, sched_hdr


# ---------------------------------------------------------------- Monthly sheet(s)
def build_monthly(wb, sheet, scen_key, ref, sched):
    ws = wb.create_sheet(sheet)
    acol = SCOL[scen_key]
    rows = {}   # key -> row number
    defs = []   # (key, label, fmt, fn(m)->formula or value, month0 value, style)

    def X(key):
        return f"Assumptions!${acol}${ref[key]}"

    cur = {"m": 0}

    def col(m):
        return get_column_letter(3 + m)  # month 0 = C, month 1 = D

    def R(key, lag=0):
        return f"{col(cur['m'] - lag)}{rows[key]}"

    def add(key, label, fmt, fn, m0=None, kind="calc"):
        defs.append((key, label, fmt, fn, m0, kind))

    def hdr(label):
        defs.append((None, label, None, None, None, "header"))

    V = M.VERTICALS
    hdr("Strips & merchants")
    add("month", "Model month", "0", lambda m: m, 0, "const")
    add("strips_launched", "Strips launched", NUM0,
        lambda m: f"=Assumptions!{get_column_letter(2 + m)}${sched['launches_' + scen_key]}", 0, "link")
    add("strips_cum", "Strips live (cumulative)", NUM0, lambda m: f"={R('strips_cum', 1)}+{R('strips_launched')}", 0)
    add("strips_mature", "Mature strips (launched >= maturity months ago)", NUM0,
        lambda m: (f"=IF({R('month')}>{X('strip_maturity_months')},INDEX($D${rows['strips_cum']}:${col(H)}${rows['strips_cum']},"
                   f"{R('month')}-{X('strip_maturity_months')}),0)"), 0)

    def signups(m):
        terms = []
        for j in range(len(M.ASSUMPTIONS["acquisition_ramp"]["value"])):
            if m - j >= 1:
                terms.append(f"{R('strips_launched', j)}*{X('ramp_' + str(j))}")
        return f"={X('strip_potential_merchants')}*(" + "+".join(terms) + ")"
    add("signups", "New merchant sign-ups", NUM1, signups, 0)
    add("network_merchants", "Network merchants (signed, net of churn)", NUM1,
        lambda m: f"={R('network_merchants', 1)}*(1-{X('free_merchant_churn')})+{R('signups')}", 0)
    add("active_merchants", "Active merchants (>= 25 active members)", NUM1,
        lambda m: f"={R('network_merchants')}*{X('activation_rate')}", 0)
    add("activated_new", "Newly activated merchants", NUM1, lambda m: f"={R('signups')}*{X('activation_rate')}", 0)
    hdr("Rollout gates (1 = unlocked; plans.ts unlockAtMerchants)")
    add("plus_unlocked", "Plus features GA", FLAG,
        lambda m: (f"=IF(OR({R('plus_unlocked', 1)}=1,AND({R('active_merchants')}>={X('unlock_plus_active_merchants')},"
                   f"{R('month')}>={X('plus_features_ready_month')})),1,0)"), 0)
    add("pro_unlocked", "Pro features GA", FLAG,
        lambda m: (f"=IF(OR({R('pro_unlocked', 1)}=1,AND({R('active_merchants')}>={X('unlock_pro_active_merchants')},"
                   f"{R('month')}>={X('pro_features_ready_month')})),1,0)"), 0)
    add("bia_unlocked", "BIA campaigns available", FLAG,
        lambda m: f"=IF(OR({R('bia_unlocked', 1)}=1,{R('active_merchants')}>={X('unlock_bia_active_merchants')}),1,0)", 0)
    add("ads_unlocked", "Ads available", FLAG,
        lambda m: (f"=IF(OR({R('ads_unlocked', 1)}=1,AND({R('active_merchants')}>={X('unlock_ads_active_merchants')},"
                   f"{R('month')}>={X('ads_ready_month')})),1,0)"), 0)
    add("ads_months", "Months since ads unlocked", NUM0,
        lambda m: f"=IF({R('ads_unlocked')}=1,{R('ads_months', 1)}+1,0)", 0)
    add("ads_ramp", "Ad demand ramp", PCT, lambda m: f"=MIN(1,{R('ads_months')}/{X('ads_ramp_months')})", 0)
    hdr("Customers")
    add("memberships", "Memberships (customer-shop pairs)", NUM0,
        lambda m: (f"={R('memberships', 1)}+({R('active_merchants')}*{X('members_per_active_merchant')}-"
                   f"{R('memberships', 1)})*{X('membership_fill_speed')}"), 0)
    add("active_customers", "Active customers (unique)", NUM0,
        lambda m: f"={R('memberships')}/{X('shops_per_customer')}", 0)
    add("new_customers", "New / re-acquired customers", NUM0,
        lambda m: (f"=MAX(0,{R('active_customers')}-{R('active_customers', 1)})+{R('active_customers', 1)}*"
                   f"{X('customer_churn')}"), 0)
    hdr("Paying merchants by vertical (repair/auto gated by Pro, others by Plus)")
    for vt in V:
        gate = "pro_unlocked" if vt == "repair_auto" else "plus_unlocked"
        add("paid_" + vt, "Paying — " + M.VERTICAL_LABELS[vt], NUM1,
            lambda m, vt=vt, gate=gate: (
                f"={R('paid_' + vt, 1)}*(1-{X('paid_churn')})+{R(gate)}*((1-(1-{X('conv12_' + vt)})^(1/12))*"
                f"{X('conversion_multiplier')})*MAX(0,{R('active_merchants')}*{X('mix_' + vt)}-{R('paid_' + vt, 1)})"), 0)
    add("paid_total", "Paying merchants (total)", NUM1,
        lambda m: "=" + "+".join(R("paid_" + vt) for vt in V), 0)
    add("plus_merchants", "Plus merchants", NUM1,
        lambda m: "=" + "+".join(f"{R('paid_' + vt)}*(1-{X('pro_share_' + vt)})" for vt in V))
    add("pro_merchants", "Pro merchants", NUM1,
        lambda m: "=" + "+".join(f"{R('paid_' + vt)}*{X('pro_share_' + vt)}" for vt in V))
    add("new_conversions", "New paid conversions", NUM1,
        lambda m: f"=MAX(0,{R('paid_total')}-{R('paid_total', 1)}*(1-{X('paid_churn')}))")
    hdr("Revenue (CAD)")
    add("rev_plus", "Plus subscriptions", CUR, lambda m: f"={R('plus_merchants')}*{X('price_plus')}")
    add("rev_pro", "Pro subscriptions", CUR, lambda m: f"={R('pro_merchants')}*{X('price_pro')}")
    add("gmv_in_app", "In-app payment volume (GMV)", CUR,
        lambda m: f"=({R('plus_merchants')}*{X('gmv_plus')}+{R('pro_merchants')}*{X('gmv_pro')})*{X('payments_adoption')}")
    add("rev_payments", "Platform fee on payments (0.75%)", CUR, lambda m: f"={R('gmv_in_app')}*{X('platform_fee')}")
    add("rev_ads_impressions", "Sponsored listings/promos (CPM)", CUR,
        lambda m: (f"={R('active_customers')}*{X('app_user_share')}*{X('sessions_per_app_user')}*{X('ad_slots_per_session')}"
                   f"*{X('ad_fill_rate')}*{X('ad_cpm')}/1000*{R('ads_ramp')}"))
    add("rev_map_pins", "Featured map pins", CUR,
        lambda m: f"={R('active_merchants')}*{X('pin_adoption')}*{X('pin_price_month')}*{R('ads_ramp')}")
    add("rev_push_boosts", "Nearby push boosts", CUR,
        lambda m: f"={R('active_merchants')}*{X('boost_adoption')}*{X('boosts_per_buyer')}*{X('boost_price')}*{R('ads_ramp')}")
    add("bia_campaigns", "BIA campaigns sold (expected)", NUM1,
        lambda m: f"={R('strips_mature')}*{X('bia_campaigns_per_strip_year')}/12*{R('bia_unlocked')}")
    add("rev_bia", "BIA neighbourhood campaigns", CUR, lambda m: f"={R('bia_campaigns')}*{X('bia_price')}")
    add("rev_total", "Total revenue", CUR,
        lambda m: "=" + "+".join(R(k) for k in ["rev_plus", "rev_pro", "rev_payments", "rev_ads_impressions",
                                                 "rev_map_pins", "rev_push_boosts", "rev_bia"]), None, "total")
    add("mrr_subscriptions", "Subscription MRR", CUR, lambda m: f"={R('rev_plus')}+{R('rev_pro')}")
    hdr("Variable costs (CAD)")
    add("cost_free_merchants", "Free-tier merchant cost (infra + support)", CUR,
        lambda m: (f"={R('network_merchants')}*({X('infra_per_merchant')}+{X('support_min_free')}/60*"
                   f"{X('support_hourly')})"))
    add("cost_paid_support", "Extra support, paying merchants", CUR,
        lambda m: f"={R('paid_total')}*{X('support_min_paid')}/60*{X('support_hourly')}")
    add("cost_customer_infra", "Customer infra", CUR, lambda m: f"={R('active_customers')}*{X('infra_per_customer')}")
    add("cost_sms", "SMS (Twilio)", CUR,
        lambda m: (f"=({R('plus_merchants')}*{X('sms_used_plus')}+{R('pro_merchants')}*{X('sms_used_pro')}+"
                   f"{R('new_customers')}*{X('otp_sms_per_new_customer')}+{R('active_customers')}*"
                   f"{X('txn_sms_per_customer')})*{X('sms_rate')}"))
    add("cost_payments", "Stripe Connect platform costs", CUR,
        lambda m: (f"={R('gmv_in_app')}*{X('connect_pct')}+{R('paid_total')}*{X('payments_adoption')}*"
                   f"{X('connect_account_fee')}"))
    add("cost_billing", "Subscription billing fees", CUR,
        lambda m: f"=({R('rev_plus')}+{R('rev_pro')})*{X('billing_pct')}+{R('paid_total')}*{X('billing_fixed')}")
    add("cost_network_perks", "Platform-funded network perks", CUR,
        lambda m: f"={R('new_customers')}*{X('perk_qualify_rate')}*{X('perk_value')}*{X('perk_redeem_rate')}")
    add("cost_ads_ops", "Ad operations", CUR,
        lambda m: f"=({R('rev_ads_impressions')}+{R('rev_map_pins')}+{R('rev_push_boosts')})*{X('ads_ops_pct')}")
    add("cost_bia", "BIA campaign delivery", CUR, lambda m: f"={R('rev_bia')}*{X('bia_cost_pct')}")
    add("variable_total", "Total variable costs", CUR,
        lambda m: "=" + "+".join(R(k) for k in ["cost_free_merchants", "cost_paid_support", "cost_customer_infra",
                                                 "cost_sms", "cost_payments", "cost_billing", "cost_network_perks",
                                                 "cost_ads_ops", "cost_bia"]), None, "total")
    add("gross_profit", "Gross profit", CUR, lambda m: f"={R('rev_total')}-{R('variable_total')}", None, "total")
    hdr("Merchant acquisition (CAC) spend (CAD)")
    add("rep_wage", "Rep hourly wage (indexed each Oct 1)", CUR2,
        lambda m: f"={X('rep_wage')}*(1+{X('wage_indexation')})^INT({R('month')}/12)")
    add("cac_rep_wages", "Rep wages incl. payroll burden", CUR,
        lambda m: (f"={R('signups')}*{X('rep_hours_per_signup')}*{R('rep_wage')}*(1+{X('payroll_burden')})*"
                   f"{X('cac_multiplier')}"))
    add("cac_activation_bonus", "Activation bonuses incl. burden", CUR,
        lambda m: f"={R('activated_new')}*{X('activation_bonus')}*(1+{X('payroll_burden')})*{X('cac_multiplier')}")
    add("cac_kits", "Counter kits", CUR, lambda m: f"={R('signups')}*{X('kit_cost')}*{X('cac_multiplier')}")
    add("cac_strip_launch", "Strip launch events", CUR,
        lambda m: f"={R('strips_launched')}*{X('strip_launch_cost')}*{X('cac_multiplier')}")
    add("cac_upsell", "Paid upsell cost", CUR, lambda m: f"={R('new_conversions')}*{X('upsell_cost')}*{X('cac_multiplier')}")
    add("cac_total", "Total acquisition spend", CUR,
        lambda m: "=" + "+".join(R(k) for k in ["cac_rep_wages", "cac_activation_bonus", "cac_kits",
                                                 "cac_strip_launch", "cac_upsell"]), None, "total")
    hdr("Fixed operating costs (CAD)")
    add("opex_fixed_overhead", "Fixed overhead", CUR, lambda m: f"={X('fixed_overhead_total')}")
    add("opex_developer", "Part-time developer", CUR,
        lambda m: (f"=IF({R('month')}<=12,{X('dev_monthly_y1')},IF({R('month')}<=24,{X('dev_monthly_y2')},"
                   f"{X('dev_monthly_y3')}))"))
    add("opex_customer_success", "Account / BIA manager", CUR,
        lambda m: f"=INT({R('active_merchants')}/{X('merchants_per_cs')})*{X('cs_monthly_cost')}")
    add("opex_founder_salary", "Founder salary", CUR,
        lambda m: f"=IF({R('month')}>={X('founder_salary_start_month')},{X('founder_salary')},0)")
    add("opex_one_time", "One-time costs", CUR,
        lambda m: f"=Assumptions!{get_column_letter(2 + m)}${sched['one_time_costs']}", None, "link")
    add("opex_total", "Total fixed opex", CUR,
        lambda m: "=" + "+".join(R(k) for k in ["opex_fixed_overhead", "opex_developer", "opex_customer_success",
                                                 "opex_founder_salary", "opex_one_time"]), None, "total")
    hdr("Bottom line (CAD)")
    add("ebitda", "EBITDA / net cash flow", CUR,
        lambda m: f"={R('gross_profit')}-{R('cac_total')}-{R('opex_total')}", None, "total")
    add("cum_cash", "Cumulative cash (from starting cash)", CUR,
        lambda m: f"={R('cum_cash', 1)}+{R('ebitda')}", "starting", "total")
    add("merchant_paid_stripe_fees", "Info: Stripe fees paid by merchants (not ours)", CUR,
        lambda m: f"={R('gmv_in_app')}*{X('stripe_pct')}+{R('gmv_in_app')}/{X('avg_ticket')}*{X('stripe_fixed')}")
    hdr("Break-even helpers")
    add("pos_flag", "EBITDA >= 0", FLAG, lambda m: f"=IF({R('ebitda')}>=0,1,0)")
    # stays-positive flags computed right to left (filled below)
    add("stays36", "EBITDA >= 0 from here to month 36", FLAG, None)
    add("stays60", "EBITDA >= 0 from here to month 60", FLAG, None)

    # assign rows
    r = 6
    for d in defs:
        if d[5] == "header":
            r += 1
            continue
        if d[0]:
            rows[d[0]] = r
        r += 1
    # header rows
    ws["A1"] = f"Local Loyalty — monthly model: {dict((k, h) for k, h, _ in SCEN)[scen_key]} scenario (CAD)"
    ws["A1"].font = TITLE
    ws["A2"] = ("Every cell is a formula driven by the Assumptions sheet (column "
                f"{acol}). Months 1-36 = projection; grey months 37-60 = extension used only to locate break-even.")
    ws["A2"].font = Font(name=F, italic=True)
    ws.cell(row=4, column=2, value="Model month").font = BOLD
    ws.cell(row=5, column=2, value="Calendar month").font = BOLD
    for m in range(0, H + 1):
        c = ws.cell(row=4, column=3 + m, value=m)
        c.font = BOLD
        c.fill = HEAD if m <= 36 else EXT
        ws.cell(row=5, column=3 + m,
                value="start" if m == 0 else M.month_label(M.ASSUMPTIONS["start_month"]["value"], m - 1)).font = BOLD
    r = 6
    for key, label, fmt, fn, m0, kind in defs:
        if kind == "header":
            r += 1
            c = ws.cell(row=r - 1, column=2, value=label)
            c.font = BOLD
            continue
        ws.cell(row=r, column=1, value=key).font = Font(name=F, color="808080", size=8)
        lc = ws.cell(row=r, column=2, value=label)
        lc.font = BOLD if kind == "total" else BLACK
        # month 0
        c0 = ws.cell(row=r, column=3)
        if m0 == "starting":
            c0.value = f"={X('starting_cash')}"
        elif m0 is not None:
            c0.value = m0
        c0.number_format = fmt or "General"
        if fn is not None:
            for m in range(1, H + 1):
                cur["m"] = m
                c = ws.cell(row=r, column=3 + m, value=fn(m))
                c.number_format = fmt
                c.font = GREEN if kind == "link" else (BOLD if kind == "total" else BLACK)
                if kind == "total":
                    c.border = THIN
                if m > 36:
                    c.fill = EXT
        r += 1
    # stays flags (right to left)
    for key, last in (("stays36", 36), ("stays60", H)):
        rr = rows[key]
        for m in range(1, last + 1):
            c = ws.cell(row=rr, column=3 + m)
            pos = f"{col(m)}{rows['pos_flag']}"
            c.value = f"={pos}" if m == last else f"=IF(AND({pos}=1,{col(m + 1)}{rr}=1),1,0)"
            c.number_format = FLAG
            c.font = BLACK
    # metrics block
    r += 1
    ws.cell(row=r, column=2, value="Key outputs").font = TITLE
    r += 1
    end36, endH = col(36), col(H)
    e, cc = rows["ebitda"], rows["cum_cash"]
    metrics = [
        ("breakeven_36", "Break-even month (EBITDA >= 0 through month 36)",
         f'=IFERROR(MATCH(1,D{rows["stays36"]}:{end36}{rows["stays36"]},0),"none")', "0"),
        ("breakeven_60", "Break-even month, extended run (EBITDA >= 0 through month 60)",
         f'=IFERROR(MATCH(1,D{rows["stays60"]}:{endH}{rows["stays60"]},0),"none")', "0"),
        ("first_positive", "First month with EBITDA >= 0 (36m)",
         f'=IFERROR(MATCH(1,D{rows["pos_flag"]}:{end36}{rows["pos_flag"]},0),"none")', "0"),
        ("peak_cash_36", "Peak cash need, months 1-36", f"=-MIN(0,MIN(D{cc}:{end36}{cc}))", CUR),
        ("trough_36", "Month of cash trough (36m)", f"=MATCH(MIN(D{cc}:{end36}{cc}),D{cc}:{end36}{cc},0)", "0"),
        ("peak_cash_60", "Peak cash need, months 1-60 (to break-even)", f"=-MIN(0,MIN(D{cc}:{endH}{cc}))", CUR),
        ("plus_unlock", "Plus unlock month",
         f'=IFERROR(MATCH(1,D{rows["plus_unlocked"]}:{end36}{rows["plus_unlocked"]},0),"none")', "0"),
        ("pro_unlock", "Pro unlock month",
         f'=IFERROR(MATCH(1,D{rows["pro_unlocked"]}:{end36}{rows["pro_unlocked"]},0),"none")', "0"),
        ("bia_unlock", "BIA campaigns unlock month",
         f'=IFERROR(MATCH(1,D{rows["bia_unlocked"]}:{end36}{rows["bia_unlocked"]},0),"none")', "0"),
        ("ads_unlock", "Ads unlock month",
         f'=IFERROR(MATCH(1,D{rows["ads_unlocked"]}:{end36}{rows["ads_unlocked"]},0),"none")', "0"),
        ("m36_active", "Month-36 active merchants", f"={end36}{rows['active_merchants']}", NUM0),
        ("m36_paid", "Month-36 paying merchants", f"={end36}{rows['paid_total']}", NUM0),
        ("m36_customers", "Month-36 active customers", f"={end36}{rows['active_customers']}", NUM0),
        ("m36_rev", "Month-36 revenue", f"={end36}{rows['rev_total']}", CUR),
        ("m36_ebitda", "Month-36 EBITDA", f"={end36}{rows['ebitda']}", CUR),
        ("y1_rev", "Year-1 revenue", f"=SUM(D{rows['rev_total']}:O{rows['rev_total']})", CUR),
        ("y2_rev", "Year-2 revenue", f"=SUM(P{rows['rev_total']}:AA{rows['rev_total']})", CUR),
        ("y3_rev", "Year-3 revenue", f"=SUM(AB{rows['rev_total']}:AM{rows['rev_total']})", CUR),
        ("y1_ebitda", "Year-1 EBITDA", f"=SUM(D{e}:O{e})", CUR),
        ("y2_ebitda", "Year-2 EBITDA", f"=SUM(P{e}:AA{e})", CUR),
        ("y3_ebitda", "Year-3 EBITDA", f"=SUM(AB{e}:AM{e})", CUR),
    ]
    mref = {}
    for k, label, fml, fmt in metrics:
        ws.cell(row=r, column=2, value=label).font = BOLD
        c = ws.cell(row=r, column=3, value=fml)
        c.number_format = fmt
        c.font = BOLD
        mref[k] = f"'{sheet}'!$C${r}" if "_" in sheet else f"{sheet}!$C${r}"
        r += 1
    ws.column_dimensions["A"].width = 18
    ws.column_dimensions["B"].width = 46
    for m in range(0, H + 1):
        ws.column_dimensions[col(m)].width = 11
    ws.freeze_panes = "D6"
    return rows, mref


# ---------------------------------------------------------------- Scenarios sheet
def build_scenarios(wb, mrefs):
    ws = wb.create_sheet("Scenarios")
    ws["A1"] = "Scenarios — live KPIs from each monthly sheet (CAD)"
    ws["A1"].font = TITLE
    ws["A2"] = "Scenario inputs are the columns of the Assumptions sheet; overrides are highlighted there."
    ws["A2"].font = Font(name=F, italic=True)
    for j, (_, h, _) in enumerate(SCEN):
        c = ws.cell(row=4, column=2 + j, value=h)
        c.font = BOLD
        c.fill = HEAD
    ws.cell(row=4, column=1, value="Metric").font = BOLD
    labels = [
        ("breakeven_36", "Break-even month (36m)", "0"), ("breakeven_60", "Break-even month (60m run)", "0"),
        ("first_positive", "First EBITDA-positive month", "0"),
        ("peak_cash_36", "Peak cash need, months 1-36", CUR), ("peak_cash_60", "Cash needed to reach break-even (60m)", CUR),
        ("trough_36", "Cash trough month (36m)", "0"),
        ("plus_unlock", "Plus unlock month", "0"), ("pro_unlock", "Pro unlock month", "0"),
        ("bia_unlock", "BIA unlock month", "0"), ("ads_unlock", "Ads unlock month", "0"),
        ("m36_active", "Month-36 active merchants", NUM0), ("m36_paid", "Month-36 paying merchants", NUM0),
        ("m36_customers", "Month-36 active customers", NUM0), ("m36_rev", "Month-36 revenue", CUR),
        ("m36_ebitda", "Month-36 EBITDA", CUR), ("y1_rev", "Year-1 revenue", CUR), ("y2_rev", "Year-2 revenue", CUR),
        ("y3_rev", "Year-3 revenue", CUR), ("y1_ebitda", "Year-1 EBITDA", CUR), ("y2_ebitda", "Year-2 EBITDA", CUR),
        ("y3_ebitda", "Year-3 EBITDA", CUR),
    ]
    r = 5
    for k, label, fmt in labels:
        ws.cell(row=r, column=1, value=label).font = BLACK
        for j, (sk, _, _) in enumerate(SCEN):
            c = ws.cell(row=r, column=2 + j, value=f"={mrefs[sk][k]}")
            c.font = GREEN
            c.number_format = fmt
        r += 1
    r += 1
    ws.cell(row=r, column=1, value="LTV/CAC (from Unit Economics)").font = BLACK
    ws.cell(row=r + 1, column=1, value="Payback months (from Unit Economics)").font = BLACK
    ws.column_dimensions["A"].width = 42
    for j in range(len(SCEN)):
        ws.column_dimensions[get_column_letter(2 + j)].width = 18
    return ws, r


# ---------------------------------------------------------------- Unit economics sheet
def build_unit_econ(wb, ref):
    ws = wb.create_sheet("Unit Economics")
    ws["A1"] = "Unit economics — steady state, per merchant per month (CAD)"
    ws["A1"].font = TITLE
    ws["A2"] = ("Live formulas on the Assumptions sheet. CAC per paying merchant loads all acquisition spend on "
                "free merchants onto the ones that convert within 24 months.")
    ws["A2"].font = Font(name=F, italic=True)
    for j, (_, h, _) in enumerate(SCEN):
        c = ws.cell(row=4, column=2 + j, value=h)
        c.font = BOLD
        c.fill = HEAD
    ws.cell(row=4, column=1, value="Metric").font = BOLD
    V = M.VERTICALS
    urow = {}
    lines = []

    def L(key, label, fmt, fn):
        lines.append((key, label, fmt, fn))

    def X(c, k):
        return f"Assumptions!${c}${ref[k]}"

    ucol = {"c": "B"}

    def U(c, k):  # same-sheet reference in the column currently being written
        return f"{ucol['c']}{urow[k]}"

    def haz(c, vt):
        return f"((1-(1-{X(c, 'conv12_' + vt)})^(1/12))*{X(c, 'conversion_multiplier')})"

    def conv24(c, vt):
        return f"(1-(1-{haz(c, vt)})^24)"

    L("cust_per_merchant", "Unique customers per active merchant", NUM1,
      lambda c: f"={X(c, 'members_per_active_merchant')}/{X(c, 'shops_per_customer')}")
    L("free_cost_direct", "Free merchant: infra + support", CUR2,
      lambda c: f"={X(c, 'infra_per_merchant')}+{X(c, 'support_min_free')}/60*{X(c, 'support_hourly')}")
    L("free_cost_customers", "Free merchant: its customers (infra, SMS, perks)", CUR2,
      lambda c: (f"={U(c, 'cust_per_merchant')}*({X(c, 'infra_per_customer')}+{X(c, 'txn_sms_per_customer')}*"
                 f"{X(c, 'sms_rate')}+{X(c, 'customer_churn')}*({X(c, 'otp_sms_per_new_customer')}*{X(c, 'sms_rate')}+"
                 f"{X(c, 'perk_qualify_rate')}*{X(c, 'perk_value')}*{X(c, 'perk_redeem_rate')}))"))
    L("free_cost_per_active_merchant", "Cost of a free active merchant / month", CUR2,
      lambda c: f"={U(c, 'free_cost_direct')}+{U(c, 'free_cost_customers')}")
    L("conv24_blended", "Free→paid within 24 months (mix-weighted)", PCT,
      lambda c: "=" + "+".join(f"{X(c, 'mix_' + vt)}*{conv24(c, vt)}" for vt in V))
    L("pro_mix", "Share of payers on Pro", PCT,
      lambda c: ("=(" + "+".join(f"{X(c, 'mix_' + vt)}*{conv24(c, vt)}*{X(c, 'pro_share_' + vt)}" for vt in V)
                 + f")/{U(c, 'conv24_blended')}"))
    L("arpu_subscription", "Subscription ARPU (blended Plus/Pro)", CUR2,
      lambda c: f"={X(c, 'price_plus')}*(1-{U(c, 'pro_mix')})+{X(c, 'price_pro')}*{U(c, 'pro_mix')}")
    L("payments_net_margin", "Payments margin net of Stripe Connect", CUR2,
      lambda c: (f"={X(c, 'payments_adoption')}*(({X(c, 'gmv_plus')}*(1-{U(c, 'pro_mix')})+{X(c, 'gmv_pro')}*"
                 f"{U(c, 'pro_mix')})*({X(c, 'platform_fee')}-{X(c, 'connect_pct')})-{X(c, 'connect_account_fee')})"))
    L("sms_cost_paid", "SMS cost (included allowance used)", CUR2,
      lambda c: (f"=({X(c, 'sms_used_plus')}*(1-{U(c, 'pro_mix')})+{X(c, 'sms_used_pro')}*{U(c, 'pro_mix')})*"
                 f"{X(c, 'sms_rate')}"))
    L("billing_cost", "Subscription billing fees", CUR2,
      lambda c: f"={U(c, 'arpu_subscription')}*{X(c, 'billing_pct')}+{X(c, 'billing_fixed')}")
    L("paid_support_cost", "Extra support for paid features", CUR2,
      lambda c: f"={X(c, 'support_min_paid')}/60*{X(c, 'support_hourly')}")
    L("contribution_paying", "Contribution per paying merchant / month", CUR2,
      lambda c: (f"={U(c, 'arpu_subscription')}+{U(c, 'payments_net_margin')}-{U(c, 'sms_cost_paid')}-"
                 f"{U(c, 'billing_cost')}-{U(c, 'paid_support_cost')}"))
    L("cac_per_signed", "CAC per signed merchant", CUR2,
      lambda c: (f"={X(c, 'cac_multiplier')}*({X(c, 'rep_hours_per_signup')}*{X(c, 'rep_wage')}*(1+{X(c, 'payroll_burden')})"
                 f"+{X(c, 'activation_rate')}*{X(c, 'activation_bonus')}*(1+{X(c, 'payroll_burden')})+{X(c, 'kit_cost')}"
                 f"+{X(c, 'strip_launch_cost')}/{X(c, 'strip_potential_merchants')})"))
    L("cac_per_active", "CAC per activated merchant", CUR2,
      lambda c: f"={U(c, 'cac_per_signed')}/{X(c, 'activation_rate')}")
    L("cac_per_paying", "CAC per paying merchant", CUR2,
      lambda c: (f"={U(c, 'cac_per_signed')}/({X(c, 'activation_rate')}*{U(c, 'conv24_blended')})+"
                 f"{X(c, 'upsell_cost')}*{X(c, 'cac_multiplier')}"))
    L("paid_life_months", "Average paid life (months)", NUM1, lambda c: f"=1/{X(c, 'paid_churn')}")
    L("ltv_paying", "LTV per paying merchant (undiscounted contribution)", CUR,
      lambda c: f"={U(c, 'contribution_paying')}*{U(c, 'paid_life_months')}")
    L("ltv_cac", "LTV / CAC", "0.0x", lambda c: f"={U(c, 'ltv_paying')}/{U(c, 'cac_per_paying')}")
    L("payback_months", "CAC payback (months)", NUM1,
      lambda c: f"={U(c, 'cac_per_paying')}/{U(c, 'contribution_paying')}")
    L("free_carry_24m_per_paying", "Free-tier carry cost per paying merchant (24 months)", CUR,
      lambda c: (f"=(1-{U(c, 'conv24_blended')})/{U(c, 'conv24_blended')}*{U(c, 'free_cost_per_active_merchant')}*24"))
    L("ltv_cac_fully_loaded", "LTV / (CAC + free carry), fully loaded", "0.0x",
      lambda c: f"={U(c, 'ltv_paying')}/({U(c, 'cac_per_paying')}+{U(c, 'free_carry_24m_per_paying')})")
    L("merchant_all_in_payment_rate", "Merchant all-in cost of an in-app payment (Stripe + 0.75%)", PCT2,
      lambda c: f"={X(c, 'stripe_pct')}+{X(c, 'stripe_fixed')}/{X(c, 'avg_ticket')}+{X(c, 'platform_fee')}")
    r = 5
    for key, *_ in lines:
        urow[key] = r
        r += 1
    for key, label, fmt, fn in lines:
        rr = urow[key]
        ws.cell(row=rr, column=1, value=label).font = BOLD if key in ("contribution_paying", "ltv_cac", "cac_per_paying") else BLACK
        for j, (sk, _, _) in enumerate(SCEN):
            ucol["c"] = get_column_letter(2 + j)
            c = ws.cell(row=rr, column=2 + j, value=fn(SCOL[sk]))
            c.number_format = fmt
            c.font = BLACK
    ws.column_dimensions["A"].width = 58
    for j in range(len(SCEN)):
        ws.column_dimensions[get_column_letter(2 + j)].width = 18
    return ws, urow


def build_sensitivity(wb):
    ws = wb.create_sheet("Sensitivity")
    ws["A1"] = "Sensitivity (static values pasted from model.py output/sensitivity.csv — re-run model.py to refresh)"
    ws["A1"].font = TITLE
    r = 3
    for fname in ["sensitivity.csv", "sensitivity_conversion_x_churn.csv"]:
        with open(os.path.join(M.OUT, fname)) as fh:
            for i, row in enumerate(csv.reader(fh)):
                for j, val in enumerate(row):
                    try:
                        val = float(val)
                    except ValueError:
                        pass
                    c = ws.cell(row=r, column=1 + j, value=val)
                    c.font = BOLD if i == 0 else BLACK
                    if i == 0:
                        c.fill = HEAD
                r += 1
        r += 2
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 30
    return ws


def main():
    wb = Workbook()
    ref, sched, _ = build_assumptions(wb)
    mrefs = {}
    for sk, _, sheet in SCEN:
        _, mrefs[sk] = build_monthly(wb, sheet, sk, ref, sched)
    sws, lrow = build_scenarios(wb, mrefs)
    uws, urow = build_unit_econ(wb, ref)
    for j in range(len(SCEN)):
        col = get_column_letter(2 + j)
        for rr, key, fmt in ((lrow, "ltv_cac", "0.0x"), (lrow + 1, "payback_months", NUM1)):
            c = sws.cell(row=rr, column=2 + j, value=f"='Unit Economics'!{col}{urow[key]}")
            c.font = GREEN
            c.number_format = fmt
    build_sensitivity(wb)
    order = ["Assumptions", "Scenarios", "Unit Economics"] + [s for _, _, s in SCEN] + ["Sensitivity"]
    wb._sheets = [wb[n] for n in order]
    wb.active = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.value is not None and (c.font is None or c.font.name != F):
                    c.font = Font(name=F, bold=c.font.bold, italic=c.font.italic, color=c.font.color, size=c.font.size)
    wb.save(XLSX)
    print("wrote", XLSX)


def verify():
    """Compare the recalculated workbook with model.py, row by row, for every scenario."""
    wb = load_workbook(XLSX, data_only=True)
    worst = 0.0
    keys = ["signups", "network_merchants", "active_merchants", "active_customers", "paid_total", "rev_total",
            "variable_total", "cac_total", "opex_total", "ebitda", "cum_cash"]
    for sk, _, sheet in SCEN:
        ws = wb[sheet]
        rowmap = {ws.cell(r, 1).value: r for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value}
        py = M.run(M.values(sk), months=H)
        for k in keys:
            for m in range(1, H + 1):
                xv = ws.cell(rowmap[k], 3 + m).value
                if xv is None:
                    raise SystemExit("workbook has no cached values: recalculate it first (LibreOffice)")
                pv = py[m - 1][k]
                worst = max(worst, abs(xv - pv) / max(1.0, abs(pv)))
    print(f"verify: max relative difference workbook vs model.py = {worst:.2e}")
    if worst > 1e-6:
        raise SystemExit("verify FAILED")


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        main()
        print("Now recalculate (e.g. open and save in Excel/LibreOffice) and run: python3 build_xlsx.py --verify")
