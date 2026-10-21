#!/usr/bin/env python3
"""
Local Loyalty — 36-month financial model (Python 3 standard library only).

    python3 docs/finance/model/model.py            # writes CSVs into ./output/
    python3 docs/finance/model/model.py --quiet    # same, no console summary

Business model encoded here (founder's model, overrides the PRD where they differ):
  Phase 1  Loyalty is FREE FOREVER: no transaction fee, unlimited locations and staff.
           We pay to onboard merchants strip by strip (BIA neighbourhoods).
  Phase 2  Once the network has enough active merchants (plans.ts `unlockAtMerchants`
           = 150) paid operations plans unlock: Plus $39/mo, Pro $79/mo, plus a 0.75%
           platform fee on in-app payments (plans.ts PLATFORM_PAYMENT_FEE_BPS = 75).
  Phase 3  Network monetization: BIA neighbourhood campaigns (unlock at 100 active
           merchants), sponsored listings/promos, featured map pins and nearby push
           boosts (unlock at 400). Order processing is a later upside, not modelled.

Every number below is an ASSUMPTION unless its note cites a source. Replace them
with pilot data as soon as you have it. Money is CAD. Fractional merchants are
allowed (it is an expected-value model). HST is treated as pass-through and income
tax is ignored (the company is loss-making through most of the horizon; losses
carry forward). Grants and SR&ED credits are NOT included (upside, see
docs/finance/fundraising-and-bootstrap.md).

The Excel workbook (local-loyalty-model.xlsx, built by build_xlsx.py) implements the
same logic with live formulas; build_xlsx.py checks it against this file.
"""

import csv
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "output")


def A(value, unit, note):
    """One assumption: value, unit, and where it comes from (source or 'Assumption')."""
    return {"value": value, "unit": unit, "note": note}


VERTICALS = ["food_bev", "retail", "repair_auto", "personal_services", "pharmacy"]
VERTICAL_LABELS = {
    "food_bev": "Cafes, restaurants, bakeries",
    "retail": "Independent retail",
    "repair_auto": "Repair, auto, alterations, print",
    "personal_services": "Salons, barbers, fitness, pets",
    "pharmacy": "Independent pharmacies (front store only)",
}

# =====================================================================================
# ASSUMPTIONS — the single source of truth. Grouped; every entry = A(value, unit, note).
# =====================================================================================
ASSUMPTIONS = {
    # ---- Timeline -----------------------------------------------------------------
    "start_month": A("2026-11", "YYYY-MM", "Model month 1 = Nov 2026 (plan dated Oct 21, 2026)"),
    "months": A(36, "months", "Projection horizon (CSV + workbook)"),
    "extended_months": A(60, "months", "Extended run used ONLY to find break-even if it falls after month 36; "
                                       "keeps launching at the last quarter's pace"),
    "starting_cash": A(0, "CAD", "Founder starts at $0; peak cash need = money required to bootstrap"),

    # ---- Strip (neighbourhood) launches ---------------------------------------------
    # 12 model quarters (Q1 = Nov 2026-Jan 2027). Q1 is the MVP build (PRD: ~4 months),
    # pilot strip launches in Q2. Within a quarter launches go to the middle month first,
    # then the last, then the first (launch_order_in_quarter).
    "strips_per_quarter": A([0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4], "strips/quarter",
                            "Assumption. One pilot strip, then gated growth (PRD: go/no-go gates)"),
    "launch_order_in_quarter": A([1, 2, 0], "month index", "Assumption: mid, last, first month of quarter"),
    "strip_potential_merchants": A(32, "merchants/strip",
                                   "Assumption: 80+ storefronts (PRD strip criterion) x ~55% repeat-visit "
                                   "verticals x ~70% eventually sign"),
    # Share of a strip's potential that signs in each month after launch (age 0 = launch month).
    "acquisition_ramp": A([0.25, 0.22, 0.15, 0.10, 0.06, 0.05] + [0.01] * 17, "share of potential",
                          "Assumption: blitz in first 2 months (2-4 reps per strip, PRD), long tail; sums to 100%"),
    "activation_rate": A(0.60, "share of signed", "PRD success metric: 60% of signed reach 25 active members"),
    "free_merchant_churn": A(0.015, "per month",
                             "Assumption: business closures + drop-outs; free plan has no switching cost"),

    # ---- Customers ---------------------------------------------------------------------
    "members_per_active_merchant": A(75, "active members", "PRD success metric (month 6 target)"),
    "membership_fill_speed": A(0.35, "share of gap closed/month", "Assumption: ~6 months to reach target"),
    "shops_per_customer": A(1.4, "shops per active customer",
                            "Assumption from PRD target: 30% of customers hold 2+ shops"),
    "customer_churn": A(0.04, "per month", "Assumption: active customers lapsing (drives re-acquisition SMS)"),
    "app_user_share": A(0.35, "share of active customers",
                        "Assumption: most join via wallet pass/phone number and never open the app"),

    # ---- Paid plan unlock gates (packages/shared/src/plans.ts) ------------------------
    # Plus-type verticals (everyone except repair/auto) convert once Plus features are GA;
    # repair/auto converts once Pro features (tickets, quotes, invoices) are GA.
    "unlock_plus_active_merchants": A(150, "active merchants", "plans.ts unlockAtMerchants for Plus features"),
    "plus_features_ready_month": A(10, "model month", "Assumption: Phase 2 build done Aug 2027 (PRD months 7-12)"),
    "unlock_pro_active_merchants": A(150, "active merchants", "plans.ts unlockAtMerchants for Pro features"),
    "pro_features_ready_month": A(10, "model month", "Assumption: Phase 2 build done Aug 2027 (PRD months 7-12)"),
    "unlock_bia_active_merchants": A(100, "active merchants", "plans.ts campaigns.neighbourhood unlockAtMerchants"),
    "unlock_ads_active_merchants": A(400, "active merchants", "plans.ts ads.* unlockAtMerchants"),
    "ads_ready_month": A(18, "model month", "Assumption: ad tooling built by Apr 2028"),

    # ---- Vertical mix and free->paid conversion (once paid features are GA) ------------
    "mix_food_bev": A(0.35, "share of merchants", "Assumption: daily-visit anchors of a strip"),
    "mix_retail": A(0.25, "share of merchants", "Assumption"),
    "mix_repair_auto": A(0.20, "share of merchants", "Assumption: PRD says lead with repair/auto for revenue"),
    "mix_personal_services": A(0.12, "share of merchants", "Assumption"),
    "mix_pharmacy": A(0.08, "share of merchants", "Assumption"),
    # Probability an active free merchant upgrades within 12 months of paid features being GA.
    "conv12_food_bev": A(0.20, "12-month conversion", "Assumption: order-ahead/pickup pain is moderate"),
    "conv12_retail": A(0.12, "12-month conversion", "Assumption: SMS + push promos only"),
    "conv12_repair_auto": A(0.40, "12-month conversion",
                            "Assumption: quote approval/deposits replace phone tag (validate with $100 pilot deposits, PRD)"),
    "conv12_personal_services": A(0.15, "12-month conversion", "Assumption"),
    "conv12_pharmacy": A(0.05, "12-month conversion", "Assumption: limited by OCP inducement rules"),
    # Of the merchants who upgrade in a vertical, the share choosing Pro ($79) rather than Plus ($39).
    "pro_share_food_bev": A(0.05, "share Pro", "Assumption"),
    "pro_share_retail": A(0.05, "share Pro", "Assumption"),
    "pro_share_repair_auto": A(0.85, "share Pro", "Assumption: service tickets, quotes, invoices are Pro"),
    "pro_share_personal_services": A(0.30, "share Pro", "Assumption: drop-off scheduling/permissions"),
    "pro_share_pharmacy": A(0.0, "share Pro", "Assumption"),
    "conversion_multiplier": A(1.0, "x", "Scenario/sensitivity lever on all conversion rates"),
    "paid_churn": A(0.03, "per month", "PRD assumption (~33-month life); churned payers drop back to Free"),

    # ---- Prices (plans.ts) and payments -------------------------------------------------
    "price_plus": A(39.0, "CAD/month", "plans.ts PLANS.plus.priceCents = 3900"),
    "price_pro": A(79.0, "CAD/month", "plans.ts PLANS.pro.priceCents = 7900"),
    "platform_fee": A(0.0075, "of in-app GMV", "plans.ts PLATFORM_PAYMENT_FEE_BPS = 75"),
    "payments_adoption": A(0.60, "share of payers", "Assumption: share of paying merchants using in-app payments"),
    "gmv_plus": A(2500.0, "CAD/month", "Assumption: order-ahead volume per Plus merchant using payments"),
    "gmv_pro": A(6000.0, "CAD/month", "Assumption: deposits + invoices per Pro merchant (PRD used $4,000 blended)"),
    "avg_ticket": A(35.0, "CAD", "Assumption: average in-app payment (for merchant fee comparison only)"),
    "stripe_pct": A(0.029, "of GMV", "Stripe CA domestic online card rate 2.9% (PRD, via Xero) — paid by merchant"),
    "stripe_fixed": A(0.30, "CAD/txn", "Stripe CA C$0.30 per txn (PRD) — paid by merchant"),
    "connect_pct": A(0.0025, "of GMV", "Assumption: Stripe Connect platform cost if we pick platform-paid "
                                       "pricing (US list 0.25% + payout fees); VERIFY CAD pricing"),
    "connect_account_fee": A(2.00, "CAD/active account/month", "Assumption: Stripe Connect active-account fee; VERIFY"),
    "billing_pct": A(0.034, "of subscription revenue", "Assumption: 2.9% card + ~0.5% Stripe Billing; VERIFY"),
    "billing_fixed": A(0.30, "CAD/invoice", "Stripe CA C$0.30 per card txn (PRD)"),

    # ---- SMS (Twilio) and infrastructure ------------------------------------------------
    "sms_rate": A(0.022, "CAD/segment", "Twilio CA outbound US$0.0079-0.0083/segment (twilio.com/en-us/sms/pricing/ca, "
                                        "Oct 2026) + carrier fees ~US$0.0064-0.0087 (third-party estimate) = ~US$0.016 "
                                        "x FX 1.38 (assumption); VERIFY before launch"),
    "sms_used_plus": A(300, "SMS/month", "Assumption: 60% of Plus allowance (plans.ts smsPerMonth = 500)"),
    "sms_used_pro": A(900, "SMS/month", "Assumption: 60% of Pro allowance (plans.ts smsPerMonth = 1500)"),
    "otp_sms_per_new_customer": A(1.5, "SMS", "Assumption: phone-number join verification + welcome"),
    "txn_sms_per_customer": A(0.3, "SMS/month", "Assumption: reward-ready / receipt texts on Free"),
    "infra_per_merchant": A(1.00, "CAD/month", "Assumption: DB, storage, wallet pass updates, email"),
    "infra_per_customer": A(0.01, "CAD/month", "Assumption: per active customer hosting + push"),
    "support_hourly": A(25.0, "CAD/hr", "Assumption: blended support cost (founder time is free, see fixed costs)"),
    "support_min_free": A(5, "min/merchant/month", "Assumption"),
    "support_min_paid": A(15, "min/merchant/month", "Assumption: extra support for ops features"),

    # ---- Network-funded perks (platform pays; merchants never fund network bonuses) ----
    "perk_qualify_rate": A(0.15, "of new customers", "Assumption: share hitting 'visit 3 shops on the strip'"),
    "perk_value": A(3.00, "CAD", "Assumption: platform-funded bonus value"),
    "perk_redeem_rate": A(0.60, "share redeemed", "Assumption (cost booked when earned x expected redemption)"),

    # ---- Phase 3 ads ---------------------------------------------------------------------
    "sessions_per_app_user": A(6, "sessions/month", "Assumption"),
    "ad_slots_per_session": A(2, "slots", "Assumption: 1 feed slot + 1 search/map slot"),
    "ad_fill_rate": A(0.20, "share of slots sold", "Assumption: small local inventory, self-serve"),
    "ad_cpm": A(12.0, "CAD per 1,000 impressions", "Assumption: hyper-local intent; see unit-economics.md rate card"),
    "pin_adoption": A(0.03, "share of active merchants", "Assumption: featured map pin buyers each month"),
    "pin_price_month": A(75.0, "CAD/month", "Assumption: ~$2.50/day rate card"),
    "boost_adoption": A(0.04, "share of active merchants", "Assumption: nearby push boost buyers each month"),
    "boosts_per_buyer": A(2, "boosts/month", "Assumption"),
    "boost_price": A(25.0, "CAD/boost", "Assumption"),
    "ads_ramp_months": A(6, "months", "Assumption: linear ramp to full demand after ads unlock"),
    "ads_ops_pct": A(0.10, "of ad revenue", "Assumption: creative help, moderation, ad serving"),

    # ---- Phase 3 BIA neighbourhood campaigns ------------------------------------------
    "strip_maturity_months": A(6, "months", "Assumption: a strip can sell a campaign 6 months after launch"),
    "bia_campaigns_per_strip_year": A(1.0, "campaigns/mature strip/year", "Assumption"),
    "bia_price": A(2250.0, "CAD/campaign", "Midpoint of founder's $1,500-3,000 range"),
    "bia_cost_pct": A(0.30, "of campaign revenue", "Assumption: prize basket, print, rep hours"),

    # ---- Customer acquisition cost (merchant side) ------------------------------------
    "rep_wage": A(17.95, "CAD/hr", "Ontario general minimum wage from Oct 1, 2026 (Hicks Morley, cited in PRD)"),
    "wage_indexation": A(0.025, "per year (each Oct 1)", "Assumption: Ontario indexes min wage to CPI every Oct 1"),
    "payroll_burden": A(0.13, "of wages", "Assumption: 4% vacation pay + CPP ~5.95% + EI ~2.3% + WSIB ~1%; VERIFY"),
    "rep_hours_per_signup": A(2.5, "paid hours/signed merchant",
                              "PRD: ~3 activations per 6-hour shift (2h) + 0.5h prospecting and day-7/30 calls"),
    "activation_bonus": A(25.0, "CAD/activated merchant", "PRD: bonus at 25 active members (paid on top of wage)"),
    "kit_cost": A(15.0, "CAD/signed merchant", "PRD: QR counter stand + print"),
    "strip_launch_cost": A(750.0, "CAD/strip", "Assumption: passport week prizes, flyers, launch event"),
    "upsell_cost": A(50.0, "CAD/conversion", "PRD: upsell bonus / onboarding of paid features"),
    "cac_multiplier": A(1.0, "x", "Scenario/sensitivity lever on all acquisition spend"),

    # ---- Fixed costs ---------------------------------------------------------------------
    "fixed_hosting_base": A(250.0, "CAD/month", "Assumption: managed DB, hosting, monitoring (Canadian region)"),
    "fixed_saas_tools": A(250.0, "CAD/month", "Assumption: email, design, CRM, Google Workspace"),
    "fixed_insurance": A(150.0, "CAD/month", "Assumption: CGL + cyber/privacy liability"),
    "fixed_accounting": A(250.0, "CAD/month", "Assumption: bookkeeping + year-end"),
    "fixed_app_stores": A(15.0, "CAD/month", "Apple Developer US$99/yr + Google Play one-time US$25, amortised"),
    "fixed_phone_misc": A(100.0, "CAD/month", "Assumption"),
    "fixed_marketing": A(300.0, "CAD/month", "Assumption: baseline brand, social, local press"),
    "fixed_legal_reserve": A(150.0, "CAD/month", "Assumption: ongoing legal/compliance reserve"),
    "dev_monthly_y1": A(4000.0, "CAD/month", "PRD: part-time contract developer ~$4,000/mo"),
    "dev_monthly_y2": A(5000.0, "CAD/month", "Assumption: more hours for Phase 2 (ops features)"),
    "dev_monthly_y3": A(6000.0, "CAD/month", "Assumption: Phase 3 (ads, campaigns)"),
    # Day-to-day support is already costed per merchant (support_min_*). This step is an
    # account / BIA-relationship manager added per 1,000 active merchants.
    "merchants_per_cs": A(1000, "active merchants per account-manager hire", "Assumption: founder covers it until then"),
    "cs_monthly_cost": A(4200.0, "CAD/month", "Assumption: one part-time account/BIA manager, loaded"),
    "founder_salary": A(0.0, "CAD/month", "Founder takes no salary initially (founder's model)"),
    "founder_salary_start_month": A(999, "model month", "Never within horizon in base case"),
    "founder_target_salary": A(5000.0, "CAD/month", "Assumption: 'ramen' salary used only for a reported metric"),
    # One-time costs by model month.
    "one_time_costs": A({1: 3500.0, 2: 1500.0, 3: 3000.0}, "CAD by month",
                        "Assumption: m1 incorporation + employment-lawyer call; m2 trademark/domain; "
                        "m3 lawyer review of ToS/privacy/merchant agreement"),
}

# Scenario overrides (anything not listed uses the base value).
SCENARIOS = {
    "bear": {
        "strips_per_quarter": [0, 1, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3],
        "strip_potential_merchants": 24,
        "activation_rate": 0.50,
        "members_per_active_merchant": 50,
        "conversion_multiplier": 0.6,
        "paid_churn": 0.045,
        "free_merchant_churn": 0.025,
        "payments_adoption": 0.40,
        "ad_fill_rate": 0.10,
        "ad_cpm": 8.0,
        "bia_campaigns_per_strip_year": 0.5,
        "rep_hours_per_signup": 3.5,
    },
    "base": {},
    # Base case + the rollout gates recommended in docs/finance/unit-economics.md.
    "base_reco_gates": {
        "unlock_pro_active_merchants": 40,
        "pro_features_ready_month": 8,
        "unlock_plus_active_merchants": 100,
        "unlock_ads_active_merchants": 300,
    },
    # The plan recommended to the founder: recommended gates + half the contract-dev
    # spend (technical co-founder on equity, or founder builds with AI-assisted tooling)
    # + BIA packages sold twice a year per mature strip (spring + holiday) + faster
    # strip pace once the pilot passes its gate. All other inputs = base.
    "lean_plan": {
        "unlock_pro_active_merchants": 40,
        "pro_features_ready_month": 8,
        "unlock_plus_active_merchants": 100,
        "unlock_ads_active_merchants": 300,
        "dev_monthly_y1": 2000.0,
        "dev_monthly_y2": 2500.0,
        "dev_monthly_y3": 3000.0,
        "bia_campaigns_per_strip_year": 2.0,
        "strips_per_quarter": [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6],
    },
    "bull": {
        "strips_per_quarter": [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6],
        "strip_potential_merchants": 38,
        "activation_rate": 0.70,
        "members_per_active_merchant": 100,
        "conversion_multiplier": 1.3,
        "paid_churn": 0.0225,
        "free_merchant_churn": 0.01,
        "payments_adoption": 0.75,
        "ad_fill_rate": 0.30,
        "ad_cpm": 15.0,
        "bia_campaigns_per_strip_year": 1.5,
        "rep_hours_per_signup": 2.0,
    },
}

SCENARIO_ORDER = ["bear", "base", "base_reco_gates", "lean_plan", "bull"]

FIXED_KEYS = ["fixed_hosting_base", "fixed_saas_tools", "fixed_insurance", "fixed_accounting",
              "fixed_app_stores", "fixed_phone_misc", "fixed_marketing", "fixed_legal_reserve"]


def values(scenario="base", **overrides):
    """Flat {key: value} for a scenario, with optional extra overrides (for sensitivities)."""
    v = {k: a["value"] for k, a in ASSUMPTIONS.items()}
    v.update(SCENARIOS[scenario])
    v.update(overrides)
    return v


def monthly_launches(v):
    months = v["months"]
    out = [0] * months
    order = v["launch_order_in_quarter"]
    spq = list(v["strips_per_quarter"])
    while len(spq) * 3 < months:
        spq.append(spq[-1])
    for q, n in enumerate(spq):
        for j in range(n):
            m = q * 3 + order[j % 3]
            if m < months:
                out[m] += 1
    return out


def month_label(start, i):
    y, mo = (int(x) for x in start.split("-"))
    mo += i
    y += (mo - 1) // 12
    mo = (mo - 1) % 12 + 1
    return f"{y:04d}-{mo:02d}"


def hazard(v, vert):
    """Monthly upgrade probability for an active free merchant in a vertical."""
    return (1 - (1 - v["conv12_" + vert]) ** (1 / 12)) * v["conversion_multiplier"]


def run(v, months=None):
    """Monthly projection. Returns list of row dicts (one per month)."""
    if months:
        v = dict(v, months=months)
    L = monthly_launches(v)
    ramp = v["acquisition_ramp"]
    fixed_total = sum(v[k] for k in FIXED_KEYS)
    rows = []
    strips_cum_hist = [0.0]  # index = month number; month 0 = 0
    p = dict(strips_cum=0.0, N=0.0, M=0.0, C=0.0, plus_unlocked=0, pro_unlocked=0, bia_unlocked=0, ads_unlocked=0,
             ads_months=0, paid_total=0.0, cum_cash=float(v["starting_cash"]))
    for vert in VERTICALS:
        p["paid_" + vert] = 0.0
    for i in range(v["months"]):
        m = i + 1
        r = {"month": m, "calendar": month_label(v["start_month"], i)}
        # --- acquisition
        r["strips_launched"] = L[i]
        r["strips_cum"] = p["strips_cum"] + L[i]
        strips_cum_hist.append(r["strips_cum"])
        k = m - v["strip_maturity_months"]
        r["strips_mature"] = strips_cum_hist[k] if k >= 1 else 0.0
        r["signups"] = v["strip_potential_merchants"] * sum(
            L[i - j] * ramp[j] for j in range(len(ramp)) if i - j >= 0)
        r["network_merchants"] = p["N"] * (1 - v["free_merchant_churn"]) + r["signups"]
        r["active_merchants"] = r["network_merchants"] * v["activation_rate"]
        r["activated_new"] = r["signups"] * v["activation_rate"]
        A_ = r["active_merchants"]
        # --- gates
        r["plus_unlocked"] = 1 if (p["plus_unlocked"] == 1 or (
            A_ >= v["unlock_plus_active_merchants"] and m >= v["plus_features_ready_month"])) else 0
        r["pro_unlocked"] = 1 if (p["pro_unlocked"] == 1 or (
            A_ >= v["unlock_pro_active_merchants"] and m >= v["pro_features_ready_month"])) else 0
        r["bia_unlocked"] = 1 if (p["bia_unlocked"] == 1 or A_ >= v["unlock_bia_active_merchants"]) else 0
        r["ads_unlocked"] = 1 if (p["ads_unlocked"] == 1 or (
            A_ >= v["unlock_ads_active_merchants"] and m >= v["ads_ready_month"])) else 0
        r["ads_months"] = p["ads_months"] + 1 if r["ads_unlocked"] else 0
        r["ads_ramp"] = min(1.0, r["ads_months"] / v["ads_ramp_months"])
        # --- customers
        r["memberships"] = p["M"] + (A_ * v["members_per_active_merchant"] - p["M"]) * v["membership_fill_speed"]
        r["active_customers"] = r["memberships"] / v["shops_per_customer"]
        r["new_customers"] = max(0.0, r["active_customers"] - p["C"]) + p["C"] * v["customer_churn"]
        # --- paid conversion by vertical
        plus = pro = 0.0
        for vert in VERTICALS:
            prev = p["paid_" + vert]
            gate = r["pro_unlocked"] if vert == "repair_auto" else r["plus_unlocked"]
            val = prev * (1 - v["paid_churn"]) + gate * hazard(v, vert) * max(
                0.0, A_ * v["mix_" + vert] - prev)
            r["paid_" + vert] = val
            plus += val * (1 - v["pro_share_" + vert])
            pro += val * v["pro_share_" + vert]
        r["paid_total"] = plus + pro
        r["plus_merchants"] = plus
        r["pro_merchants"] = pro
        r["new_conversions"] = max(0.0, r["paid_total"] - p["paid_total"] * (1 - v["paid_churn"]))
        # --- revenue
        r["rev_plus"] = plus * v["price_plus"]
        r["rev_pro"] = pro * v["price_pro"]
        r["gmv_in_app"] = (plus * v["gmv_plus"] + pro * v["gmv_pro"]) * v["payments_adoption"]
        r["rev_payments"] = r["gmv_in_app"] * v["platform_fee"]
        r["rev_ads_impressions"] = (r["active_customers"] * v["app_user_share"] * v["sessions_per_app_user"]
                                    * v["ad_slots_per_session"] * v["ad_fill_rate"] * v["ad_cpm"] / 1000
                                    * r["ads_ramp"])
        r["rev_map_pins"] = A_ * v["pin_adoption"] * v["pin_price_month"] * r["ads_ramp"]
        r["rev_push_boosts"] = A_ * v["boost_adoption"] * v["boosts_per_buyer"] * v["boost_price"] * r["ads_ramp"]
        r["bia_campaigns"] = r["strips_mature"] * v["bia_campaigns_per_strip_year"] / 12 * r["bia_unlocked"]
        r["rev_bia"] = r["bia_campaigns"] * v["bia_price"]
        r["rev_total"] = (r["rev_plus"] + r["rev_pro"] + r["rev_payments"] + r["rev_ads_impressions"]
                          + r["rev_map_pins"] + r["rev_push_boosts"] + r["rev_bia"])
        r["mrr_subscriptions"] = r["rev_plus"] + r["rev_pro"]
        # --- variable costs
        r["cost_free_merchants"] = r["network_merchants"] * (
            v["infra_per_merchant"] + v["support_min_free"] / 60 * v["support_hourly"])
        r["cost_paid_support"] = r["paid_total"] * v["support_min_paid"] / 60 * v["support_hourly"]
        r["cost_customer_infra"] = r["active_customers"] * v["infra_per_customer"]
        r["cost_sms"] = (plus * v["sms_used_plus"] + pro * v["sms_used_pro"]
                         + r["new_customers"] * v["otp_sms_per_new_customer"]
                         + r["active_customers"] * v["txn_sms_per_customer"]) * v["sms_rate"]
        r["cost_payments"] = (r["gmv_in_app"] * v["connect_pct"]
                              + r["paid_total"] * v["payments_adoption"] * v["connect_account_fee"])
        r["cost_billing"] = (r["rev_plus"] + r["rev_pro"]) * v["billing_pct"] + r["paid_total"] * v["billing_fixed"]
        r["cost_network_perks"] = r["new_customers"] * v["perk_qualify_rate"] * v["perk_value"] * v["perk_redeem_rate"]
        r["cost_ads_ops"] = (r["rev_ads_impressions"] + r["rev_map_pins"] + r["rev_push_boosts"]) * v["ads_ops_pct"]
        r["cost_bia"] = r["rev_bia"] * v["bia_cost_pct"]
        r["variable_total"] = (r["cost_free_merchants"] + r["cost_paid_support"] + r["cost_customer_infra"]
                               + r["cost_sms"] + r["cost_payments"] + r["cost_billing"] + r["cost_network_perks"]
                               + r["cost_ads_ops"] + r["cost_bia"])
        r["gross_profit"] = r["rev_total"] - r["variable_total"]
        # --- acquisition spend
        r["rep_wage"] = v["rep_wage"] * (1 + v["wage_indexation"]) ** math.floor(m / 12)
        cm = v["cac_multiplier"]
        r["cac_rep_wages"] = r["signups"] * v["rep_hours_per_signup"] * r["rep_wage"] * (1 + v["payroll_burden"]) * cm
        r["cac_activation_bonus"] = r["activated_new"] * v["activation_bonus"] * (1 + v["payroll_burden"]) * cm
        r["cac_kits"] = r["signups"] * v["kit_cost"] * cm
        r["cac_strip_launch"] = L[i] * v["strip_launch_cost"] * cm
        r["cac_upsell"] = r["new_conversions"] * v["upsell_cost"] * cm
        r["cac_total"] = (r["cac_rep_wages"] + r["cac_activation_bonus"] + r["cac_kits"]
                          + r["cac_strip_launch"] + r["cac_upsell"])
        # --- fixed opex
        r["opex_fixed_overhead"] = fixed_total
        r["opex_developer"] = v["dev_monthly_y1"] if m <= 12 else (v["dev_monthly_y2"] if m <= 24 else v["dev_monthly_y3"])
        r["opex_customer_success"] = math.floor(A_ / v["merchants_per_cs"]) * v["cs_monthly_cost"]
        r["opex_founder_salary"] = v["founder_salary"] if m >= v["founder_salary_start_month"] else 0.0
        r["opex_one_time"] = float(v["one_time_costs"].get(m, 0.0))
        r["opex_total"] = (r["opex_fixed_overhead"] + r["opex_developer"] + r["opex_customer_success"]
                           + r["opex_founder_salary"] + r["opex_one_time"])
        # --- bottom line
        r["ebitda"] = r["gross_profit"] - r["cac_total"] - r["opex_total"]
        r["cum_cash"] = p["cum_cash"] + r["ebitda"]
        # info: what merchants pay Stripe directly on in-app payments (not our revenue or cost)
        r["merchant_paid_stripe_fees"] = r["gmv_in_app"] * v["stripe_pct"] + r["gmv_in_app"] / v["avg_ticket"] * v["stripe_fixed"]
        rows.append(r)
        p = dict(strips_cum=r["strips_cum"], N=r["network_merchants"], M=r["memberships"], C=r["active_customers"],
                 plus_unlocked=r["plus_unlocked"], pro_unlocked=r["pro_unlocked"], bia_unlocked=r["bia_unlocked"], ads_unlocked=r["ads_unlocked"],
                 ads_months=r["ads_months"], paid_total=r["paid_total"], cum_cash=r["cum_cash"])
        for vert in VERTICALS:
            p["paid_" + vert] = r["paid_" + vert]
    return rows


def unit_economics(v):
    """Steady-state per-merchant economics (same formulas as the 'Unit Economics' sheet)."""
    u = {}
    cust_per_merchant = v["members_per_active_merchant"] / v["shops_per_customer"]
    u["free_cost_direct"] = v["infra_per_merchant"] + v["support_min_free"] / 60 * v["support_hourly"]
    u["free_cost_customers"] = cust_per_merchant * (
        v["infra_per_customer"] + v["txn_sms_per_customer"] * v["sms_rate"]
        + v["customer_churn"] * (v["otp_sms_per_new_customer"] * v["sms_rate"]
                                 + v["perk_qualify_rate"] * v["perk_value"] * v["perk_redeem_rate"]))
    u["free_cost_per_active_merchant"] = u["free_cost_direct"] + u["free_cost_customers"]
    conv24 = {vt: 1 - (1 - hazard(v, vt)) ** 24 for vt in VERTICALS}
    u["conv24_blended"] = sum(v["mix_" + vt] * conv24[vt] for vt in VERTICALS)
    u["pro_mix"] = sum(v["mix_" + vt] * conv24[vt] * v["pro_share_" + vt] for vt in VERTICALS) / u["conv24_blended"]
    u["arpu_subscription"] = v["price_plus"] * (1 - u["pro_mix"]) + v["price_pro"] * u["pro_mix"]
    gmv = v["gmv_plus"] * (1 - u["pro_mix"]) + v["gmv_pro"] * u["pro_mix"]
    u["payments_net_margin"] = v["payments_adoption"] * (gmv * (v["platform_fee"] - v["connect_pct"]) - v["connect_account_fee"])
    u["sms_cost_paid"] = (v["sms_used_plus"] * (1 - u["pro_mix"]) + v["sms_used_pro"] * u["pro_mix"]) * v["sms_rate"]
    u["billing_cost"] = u["arpu_subscription"] * v["billing_pct"] + v["billing_fixed"]
    u["paid_support_cost"] = v["support_min_paid"] / 60 * v["support_hourly"]
    u["contribution_paying"] = (u["arpu_subscription"] + u["payments_net_margin"] - u["sms_cost_paid"]
                                - u["billing_cost"] - u["paid_support_cost"])
    cm = v["cac_multiplier"]
    u["cac_per_signed"] = cm * (v["rep_hours_per_signup"] * v["rep_wage"] * (1 + v["payroll_burden"])
                                + v["activation_rate"] * v["activation_bonus"] * (1 + v["payroll_burden"])
                                + v["kit_cost"] + v["strip_launch_cost"] / v["strip_potential_merchants"])
    u["cac_per_active"] = u["cac_per_signed"] / v["activation_rate"]
    u["cac_per_paying"] = u["cac_per_signed"] / (v["activation_rate"] * u["conv24_blended"]) + v["upsell_cost"] * cm
    u["paid_life_months"] = 1 / v["paid_churn"]
    u["ltv_paying"] = u["contribution_paying"] * u["paid_life_months"]
    u["ltv_cac"] = u["ltv_paying"] / u["cac_per_paying"]
    u["payback_months"] = u["cac_per_paying"] / u["contribution_paying"]
    # Free merchants who never pay still cost money each month: carry for 24 months per paying merchant.
    u["free_carry_24m_per_paying"] = (1 - u["conv24_blended"]) / u["conv24_blended"] * u["free_cost_per_active_merchant"] * 24
    u["ltv_cac_fully_loaded"] = u["ltv_paying"] / (u["cac_per_paying"] + u["free_carry_24m_per_paying"])
    # Merchant all-in cost of in-app payments vs SoPoints' 5% free-plan fee.
    u["merchant_all_in_payment_rate"] = v["stripe_pct"] + v["stripe_fixed"] / v["avg_ticket"] + v["platform_fee"]
    return u


def summarize(rows, v):
    s = {}
    e = [r["ebitda"] for r in rows]
    s["first_positive_ebitda_month"] = next((r["month"] for r in rows if r["ebitda"] >= 0), None)
    be = None
    for i in range(len(rows)):
        if all(x >= 0 for x in e[i:]):
            be = rows[i]["month"]
            break
    s["breakeven_month"] = be  # first month from which EBITDA stays >= 0 to month 36
    s["breakeven_calendar"] = rows[be - 1]["calendar"] if be else "not within 36 months"
    # Extended horizon: only to locate break-even / peak cash if they fall after month 36.
    ext = run(v, months=v["extended_months"])
    ee = [r["ebitda"] for r in ext]
    bx = None
    for i in range(len(ext)):
        if all(x >= 0 for x in ee[i:]):
            bx = ext[i]["month"]
            break
    s["breakeven_month_extended"] = bx
    s["breakeven_calendar_extended"] = ext[bx - 1]["calendar"] if bx else f"not within {v['extended_months']} months"
    s["peak_cash_need_extended"] = -min(0.0, min(r["cum_cash"] for r in ext))
    cash = [r["cum_cash"] for r in rows]
    trough = min(cash)
    s["peak_cash_need"] = -min(0.0, trough)
    s["trough_month"] = rows[cash.index(trough)]["month"]
    s["founder_salary_month"] = next((r["month"] for r in rows if r["ebitda"] >= v["founder_target_salary"]), None)
    s["plus_unlock_month"] = next((r["month"] for r in rows if r["plus_unlocked"]), None)
    s["pro_unlock_month"] = next((r["month"] for r in rows if r["pro_unlocked"]), None)
    s["bia_unlock_month"] = next((r["month"] for r in rows if r["bia_unlocked"]), None)
    s["ads_unlock_month"] = next((r["month"] for r in rows if r["ads_unlocked"]), None)
    last = rows[-1]
    for k in ["strips_cum", "network_merchants", "active_merchants", "active_customers", "paid_total",
              "plus_merchants", "pro_merchants", "rev_total", "mrr_subscriptions", "ebitda", "cum_cash"]:
        s["m36_" + k] = last[k]
    for y in range(3):
        yr = rows[y * 12:(y + 1) * 12]
        s[f"y{y+1}_revenue"] = sum(r["rev_total"] for r in yr)
        s[f"y{y+1}_ebitda"] = sum(r["ebitda"] for r in yr)
        s[f"y{y+1}_cac_spend"] = sum(r["cac_total"] for r in yr)
    s["total_signups"] = sum(r["signups"] for r in rows)
    u = unit_economics(v)
    s["ltv_cac"] = u["ltv_cac"]
    s["payback_months"] = u["payback_months"]
    s["cac_per_paying"] = u["cac_per_paying"]
    s["contribution_paying"] = u["contribution_paying"]
    return s


MONTHLY_COLUMNS = [
    "month", "calendar", "strips_launched", "strips_cum", "strips_mature", "signups", "network_merchants",
    "active_merchants", "activated_new", "plus_unlocked", "pro_unlocked", "bia_unlocked", "ads_unlocked", "ads_ramp",
    "memberships", "active_customers", "new_customers",
] + ["paid_" + vt for vt in VERTICALS] + [
    "paid_total", "plus_merchants", "pro_merchants", "new_conversions",
    "rev_plus", "rev_pro", "gmv_in_app", "rev_payments", "rev_ads_impressions", "rev_map_pins",
    "rev_push_boosts", "bia_campaigns", "rev_bia", "rev_total", "mrr_subscriptions",
    "cost_free_merchants", "cost_paid_support", "cost_customer_infra", "cost_sms", "cost_payments",
    "cost_billing", "cost_network_perks", "cost_ads_ops", "cost_bia", "variable_total", "gross_profit",
    "rep_wage", "cac_rep_wages", "cac_activation_bonus", "cac_kits", "cac_strip_launch", "cac_upsell", "cac_total",
    "opex_fixed_overhead", "opex_developer", "opex_customer_success", "opex_founder_salary", "opex_one_time",
    "opex_total", "ebitda", "cum_cash", "merchant_paid_stripe_fees",
]


def fmt(x):
    if isinstance(x, float):
        if x != 0 and abs(x) < 1:
            return f"{x:.4f}"
        return f"{x:.2f}"
    return x


def write_csv(path, header, rows):
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for r in rows:
            w.writerow([fmt(c) for c in r])


def sensitivity():
    """One-way sensitivities on base and lean_plan + a conversion x churn grid (base).

    Break-even rarely lands inside 36 months, so each row reports both the 36-month
    figures and the extended-horizon (60-month) break-even month and cash needed to
    reach it.
    """
    levers = {
        "conversion_multiplier": [0.5, 0.75, 1.0, 1.25, 1.5],
        "paid_churn": [0.02, 0.03, 0.045, 0.06, 0.08],
        "cac_multiplier": [0.5, 0.75, 1.0, 1.5, 2.0],
        "ad_fill_rate": [0.05, 0.10, 0.20, 0.30, 0.40],
        "bia_campaigns_per_strip_year": [0.0, 0.5, 1.0, 2.0, 3.0],
        "strip_potential_merchants": [20, 26, 32, 38, 44],
        "free_merchant_churn": [0.005, 0.01, 0.015, 0.025, 0.04],
    }
    out = []
    for sc in ["base", "lean_plan"]:
        for lever, vals in levers.items():
            for x in vals:
                v = values(sc, **{lever: x})
                s = summarize(run(v), v)
                out.append([sc, lever, x, s["breakeven_month"] or "none", s["breakeven_month_extended"] or "none",
                            round(s["peak_cash_need"]), round(s["peak_cash_need_extended"]),
                            round(s["m36_rev_total"]), round(s["m36_ebitda"]),
                            round(s["m36_paid_total"], 1), round(s["ltv_cac"], 2), round(s["payback_months"], 1)])
        # developer spend as one lever (all three years scaled together)
        for mult in [0.0, 0.5, 1.0, 1.5]:
            b = values(sc)
            o = {k: b[k] * mult for k in ["dev_monthly_y1", "dev_monthly_y2", "dev_monthly_y3"]}
            v = values(sc, **o)
            s = summarize(run(v), v)
            out.append([sc, "developer_spend_multiplier", mult, s["breakeven_month"] or "none",
                        s["breakeven_month_extended"] or "none", round(s["peak_cash_need"]),
                        round(s["peak_cash_need_extended"]), round(s["m36_rev_total"]), round(s["m36_ebitda"]),
                        round(s["m36_paid_total"], 1), round(s["ltv_cac"], 2), round(s["payback_months"], 1)])
    grid = []
    churns = [0.02, 0.03, 0.045, 0.06]
    for cmul in [0.5, 0.75, 1.0, 1.25, 1.5]:
        row = [cmul]
        for ch in churns:
            v = values("base", conversion_multiplier=cmul, paid_churn=ch)
            s = summarize(run(v), v)
            row.append(f"{round(s['peak_cash_need_extended'])} / {s['breakeven_month_extended'] or 'none'}")
        grid.append(row)
    return out, grid, churns


def main(quiet=False):
    os.makedirs(OUT, exist_ok=True)
    results = {}
    for sc in SCENARIO_ORDER:
        v = values(sc)
        rows = run(v)
        results[sc] = (v, rows, summarize(rows, v))
        write_csv(os.path.join(OUT, f"monthly_{sc}.csv" if sc != "base" else "monthly_projection.csv"),
                  MONTHLY_COLUMNS, [[r[c] for c in MONTHLY_COLUMNS] for r in rows])
    # scenarios.csv
    keys = list(results["base"][2].keys())
    write_csv(os.path.join(OUT, "scenarios.csv"), ["metric"] + SCENARIO_ORDER,
              [[k] + [results[sc][2][k] for sc in SCENARIO_ORDER] for k in keys])
    # sensitivity
    one_way, grid, churns = sensitivity()
    write_csv(os.path.join(OUT, "sensitivity.csv"),
              ["scenario", "lever", "value", "breakeven_month_36m", "breakeven_month_60m", "peak_cash_need_36m",
               "peak_cash_need_to_breakeven_60m", "m36_revenue", "m36_ebitda", "m36_paying_merchants",
               "ltv_cac", "payback_months"], one_way)
    write_csv(os.path.join(OUT, "sensitivity_conversion_x_churn.csv"),
              ["base: conversion_multiplier \\ paid_churn (cell = cash needed to break-even / break-even month, 60m run)"]
              + [str(c) for c in churns], grid)
    # unit economics
    ue = {sc: unit_economics(results[sc][0]) for sc in SCENARIO_ORDER}
    write_csv(os.path.join(OUT, "unit_economics.csv"), ["metric"] + SCENARIO_ORDER,
              [[k] + [ue[sc][k] for sc in SCENARIO_ORDER] for k in ue["base"]])
    # assumptions dump (for reference / diffing)
    write_csv(os.path.join(OUT, "assumptions.csv"), ["key", "value", "unit", "note"],
              [[k, a["value"], a["unit"], a["note"]] for k, a in ASSUMPTIONS.items()])
    # summary
    b = results["base"][2]
    lines = ["Local Loyalty model summary (CAD)", ""]
    for sc in SCENARIO_ORDER:
        s = results[sc][2]
        lines.append(
            f"{sc.upper():15s} break-even (sustained) month: {s['breakeven_month'] or 'none'} ({s['breakeven_calendar']}); "
            f"extended run: {s['breakeven_month_extended'] or 'none'} ({s['breakeven_calendar_extended']}); "
            f"peak cash need 36m: ${s['peak_cash_need']:,.0f} (trough month {s['trough_month']}), "
            f"to break-even: ${s['peak_cash_need_extended']:,.0f}; "
            f"LTV/CAC {s['ltv_cac']:.1f}x; payback {s['payback_months']:.1f} mo; "
            f"M36 paying {s['m36_paid_total']:.0f} of {s['m36_active_merchants']:.0f} active; "
            f"M36 revenue ${s['m36_rev_total']:,.0f}/mo; M36 EBITDA ${s['m36_ebitda']:,.0f}/mo")
    lines.append("")
    lines.append(f"Base unlocks: Plus month {b['plus_unlock_month']}, Pro month {b['pro_unlock_month']}, BIA month {b['bia_unlock_month']}, "
                 f"ads month {b['ads_unlock_month']}")
    u = ue["base"]
    lines.append(f"Base unit economics: free merchant ${u['free_cost_per_active_merchant']:.2f}/mo; paying contribution "
                 f"${u['contribution_paying']:.2f}/mo; CAC per signed ${u['cac_per_signed']:.0f}, per paying "
                 f"${u['cac_per_paying']:.0f}; LTV ${u['ltv_paying']:.0f}; fully-loaded LTV/CAC "
                 f"{u['ltv_cac_fully_loaded']:.1f}x")
    with open(os.path.join(OUT, "summary.txt"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    if not quiet:
        print("\n".join(lines))
    return results


if __name__ == "__main__":
    main(quiet="--quiet" in sys.argv)
