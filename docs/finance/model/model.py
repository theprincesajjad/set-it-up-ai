#!/usr/bin/env python3
"""
Local Loyalty — 36-month financial model (Python 3 standard library only).

    python3 docs/finance/model/model.py            # writes CSVs into ./output/
    python3 docs/finance/model/model.py --quiet    # same, no console summary

Business model encoded here (founder's model, overrides the PRD where they differ):
  Pricing v2 (founder decision, Oct 2026; docs/business/pricing.md): ONLY the loyalty program
           and reporting on it are free forever (plus network listing, wallet pass, directory,
           unlimited staff/locations). Promos, VIP/birthday/referrals, discount cards, email/SMS,
           CSV, POS auto-award and webhooks move to Plus. Effects modelled: lower free-merchant
           cost, higher free->paid conversion, slower free sign-ups (PRICING_V1 keeps the old
           inputs so output/pricing_v2_comparison.csv shows before/after).
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
    "strip_potential_merchants": A(27.2, "merchants/strip",
                                   "Assumption: 80+ storefronts (PRD strip criterion) x ~55% repeat-visit "
                                   "verticals x ~70% eventually sign = 32; Pricing v2 adoption risk -15% "
                                   "(a thinner free tier signs fewer shops) = 27.2 (v1: 32)"),
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
    # Pricing v2: promos, email/SMS, VIP/birthday/referrals and POS auto-award are now Plus, so
    # conversion rises most where those matter (food, retail, personal services). Blended
    # 12-month conversion: base 35% (v1 20%), bear ~20%, bull ~45% (via conversion_multiplier).
    "conv12_food_bev": A(0.43, "12-month conversion", "Assumption (Pricing v2; v1 20%): promos, double-points days, "
                                                      "email/SMS and order-ahead are all Plus"),
    "conv12_retail": A(0.26, "12-month conversion", "Assumption (Pricing v2; v1 12%): promos, email, POS auto-award now Plus"),
    "conv12_repair_auto": A(0.45, "12-month conversion",
                            "Assumption (Pricing v2; v1 40%): quote approval/deposits replace phone tag (validate with "
                            "$100 pilot deposits, PRD); POS auto-award/SMS add a little"),
    "conv12_personal_services": A(0.32, "12-month conversion", "Assumption (Pricing v2; v1 15%): birthday/VIP/SMS reminders now Plus"),
    "conv12_pharmacy": A(0.10, "12-month conversion", "Assumption (Pricing v2; v1 5%): limited by OCP inducement rules"),
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
    "txn_sms_per_customer": A(0.0, "SMS/month", "Pricing v2: no SMS on Free (reward-ready texts are Plus automations, "
                                                "inside the Plus/Pro allowance). v1: 0.3. NOTE: SMS receipts "
                                                "(smsReceiptsEnabled) are not yet gated in the API"),
    "infra_per_merchant": A(0.60, "CAD/month", "Assumption: DB, storage, wallet pass updates. Pricing v2: no email "
                                               "campaigns or POS sync on Free (v1: $1.00)"),
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
        "strip_potential_merchants": 20.4,  # v1 24, Pricing v2 -15%
        "activation_rate": 0.50,
        "members_per_active_merchant": 50,
        "conversion_multiplier": 0.513,  # Pricing v2: blended 12-month conversion ~20% (v1 0.6 -> ~13%)
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
    # The product is already built (this repo), so there is no contract-dev line in year 1;
    # the founder ships fixes with AI-assisted tooling and buys occasional contractor help
    # later. Overheads are what a solo bootstrapped founder actually pays at this size
    # (managed Postgres + hosting starts at tens of dollars, not hundreds). Recommended
    # gates + two BIA campaigns per mature strip, as in lean_plan.
    "bootstrap": {
        "unlock_pro_active_merchants": 40,
        "pro_features_ready_month": 8,
        "unlock_plus_active_merchants": 100,
        "unlock_ads_active_merchants": 300,
        "dev_monthly_y1": 0.0,
        "dev_monthly_y2": 1000.0,
        "dev_monthly_y3": 1500.0,
        "fixed_hosting_base": 60.0,
        "fixed_saas_tools": 60.0,
        "fixed_insurance": 100.0,
        "fixed_accounting": 75.0,
        "fixed_phone_misc": 30.0,
        "fixed_marketing": 0.0,
        "fixed_legal_reserve": 0.0,
        "one_time_costs": {1: 1500.0, 3: 2500.0},
        "strip_launch_cost": 300.0,
        "bia_campaigns_per_strip_year": 2.0,
        "strips_per_quarter": [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6],
    },
    "bull": {
        "strips_per_quarter": [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 6],
        "strip_potential_merchants": 32.3,  # v1 38, Pricing v2 -15%
        "activation_rate": 0.70,
        "members_per_active_merchant": 100,
        "conversion_multiplier": 1.385,  # Pricing v2: blended 12-month conversion ~45% (v1 1.3 -> ~25%)
        "paid_churn": 0.0225,
        "free_merchant_churn": 0.01,
        "payments_adoption": 0.75,
        "ad_fill_rate": 0.30,
        "ad_cpm": 15.0,
        "bia_campaigns_per_strip_year": 1.5,
        "rep_hours_per_signup": 2.0,
    },
}

SCENARIO_ORDER = ["bear", "base", "base_reco_gates", "lean_plan", "bootstrap", "bull"]

# Pricing v1 (before the Oct 2026 founder decision): promos, marketing, POS etc. were free.
# Overlaid on any scenario to reproduce the old numbers for output/pricing_v2_comparison.csv.
PRICING_V1 = {
    "conv12_food_bev": 0.20, "conv12_retail": 0.12, "conv12_repair_auto": 0.40,
    "conv12_personal_services": 0.15, "conv12_pharmacy": 0.05,
    "txn_sms_per_customer": 0.3, "infra_per_merchant": 1.00,
}
PRICING_V1_SCENARIO = {
    "base": {"strip_potential_merchants": 32},
    "bear": {"strip_potential_merchants": 24, "conversion_multiplier": 0.6},
    "bull": {"strip_potential_merchants": 38, "conversion_multiplier": 1.3},
    "base_reco_gates": {"strip_potential_merchants": 32},
    "lean_plan": {"strip_potential_merchants": 32},
    "bootstrap": {"strip_potential_merchants": 32},
}


# =====================================================================================
# LAUNCH PLAN (Oct 22, 2026): time-based paid launch + 3-month onboarding blitz.
# Founder's question: 3 months of free-only onboarding, then switch on Plus/Pro.
# Kept in a separate dict so the workbook (build_xlsx.py, which mirrors ASSUMPTIONS)
# is untouched; the defaults below switch every new mechanism OFF, so all scenarios
# in SCENARIOS produce exactly the numbers they did before.
# =====================================================================================
LAUNCH_ASSUMPTIONS = {
    # ---- Paid launch timing ---------------------------------------------------------
    "paid_launch_month": A(None, "model month", "None = density gates (unlock_*_active_merchants). A number unlocks "
                                                "Plus AND Pro that month regardless of density"),
    # ---- Acquisition engine -----------------------------------------------------------
    "acquisition_mode": A("strips", "strips|blitz", "'strips' = scheduled strip launches x acquisition_ramp (original); "
                                                    "'blitz' = capacity-driven founder/rep onboarding below"),
    "activation_lag_months": A(0, "months (0 or 1)", "1 = a shop counts as active (25 members) from the month after it "
                                                     "signs, not the month it signs"),
    "blitz_months": A(3, "months", "Founder's plan: months 1-3 are a non-stop onboarding blitz"),
    "weeks_per_month": A(4.33, "weeks", "52/12"),
    "blitz_strip_shops": A(35, "target shops/strip", "Founder: strips of ~30-40 repeat-visit shops"),
    "blitz_eventual_sign_rate": A(0.60, "share of target shops",
                                  "Assumption: ~70% eventually sign x Pricing v2 adoption hit -15% = 0.60 -> 21 shops/strip "
                                  "(the strip model's 27.2 counts 44 eligible storefronts)"),
    "blitz_max_monthly_share": A(0.50, "share of a strip's unsigned pool signable per month",
                                 "Assumption: owners need 1-3 visits; holdouts wait for proof. Caps how fast one strip "
                                 "can be signed however many reps you send"),
    "founder_signs_per_week_blitz": A(4.0, "signed shops/week", "Founder: ~3-5 signed shops/week alone"),
    "founder_signs_per_week_sustained": A(1.5, "signed shops/week",
                                          "Assumption: after month 3 the founder also runs support and paid upgrades"),
    "month1_ramp": A(0.75, "x capacity in month 1", "Assumption: first strip, pitch and kit still being tuned; reps training"),
    "reps_blitz": A(0, "student reps", "Option: 0 / 2 / 4"),
    "reps_sustained": A(0, "student reps", "Reps kept on after month 3 (same people, fewer shifts)"),
    "rep_shifts_per_week_blitz": A(3, "6-hr shifts/rep/week", "Founder: 'a few shifts a week' per rep"),
    "rep_shifts_per_week_sustained": A(1, "6-hr shifts/rep/week", "Assumption: part-time students after the blitz"),
    "rep_shift_hours": A(6, "hours", "PRD"),
    "rep_signs_per_shift": A(3.0, "signed shops/shift", "PRD: ~3 activations per 6-hour shift"),
    "rep_training_hours": A(12, "paid hours/rep, once", "Assumption: 2 paid training shifts (Ontario: training is paid time)"),
    "strips_open_cap_blitz": A(1.5, "new strips/month", "Assumption: how many new strips the team can prep and walk per month"),
    "strips_open_cap_sustained": A(0.5, "new strips/month", "Assumption: after the blitz"),
    # ---- Conversion and price response -------------------------------------------------
    "conv6_target": A(None, "share of active free merchants", "If set, conversion_multiplier is solved so that this share of a "
                                                              "static cohort of active free merchants upgrades within 6 months "
                                                              "of launch, at the reference prices (vertical-weighted)"),
    "price_ref_plus": A(39.0, "CAD/month", "Price at which the conversion rates are defined (plans.ts)"),
    "price_ref_pro": A(79.0, "CAD/month", "Price at which the conversion rates are defined (plans.ts)"),
    "price_elasticity_plus": A(0.0, "elasticity of conversion", "0 = conversion ignores price (original). Launch plan: 0.8"),
    "price_elasticity_pro": A(0.0, "elasticity of conversion", "0 = conversion ignores price (original). Launch plan: 0.5"),
    # ---- Early-paywall risks -----------------------------------------------------------
    "post_launch_signup_haircut": A(0.0, "share", "Fewer shops agree to join once most of the product is paywalled "
                                                  "(applies to every signup from the paid launch on)"),
    "launch_free_churn_shock": A(0.0, "share of network, once", "Free shops that leave in the launch month"),
    # ---- One-off BIA campaign ------------------------------------------------------------
    "bia_one_off": A({}, "CAD by month", "Optional: one BIA campaign sold early, e.g. {5: 2250} ($1,500-3,000 range)"),
}

# The cost base and gates every launch-plan scenario starts from: SCENARIOS["bootstrap"]
# (no contract dev in year 1, ~$340/mo overhead, ~$4k one-time, $300 strip launch) plus
# the blitz engine. Ongoing BIA campaigns are switched OFF so the grid isolates
# subscriptions (the one-off BIA add-on is a separate lever); ads stay as modelled.
LAUNCH_BASE = {
    **{k: x for k, x in SCENARIOS["bootstrap"].items() if k != "strips_per_quarter"},
    "acquisition_mode": "blitz",
    "activation_lag_months": 1,
    "plus_features_ready_month": 1,   # the product is built (this repo)
    "pro_features_ready_month": 1,
    "unlock_plus_active_merchants": 100,  # plans.ts unlockAtMerchants (Plus)
    "unlock_pro_active_merchants": 40,    # plans.ts unlockAtMerchants (Pro)
    "bia_campaigns_per_strip_year": 0.0,
    "price_elasticity_plus": 0.8,
    "price_elasticity_pro": 0.5,
    "conv6_target": 0.20,
}

ONBOARDING_OPTIONS = {
    "founder": {"reps_blitz": 0, "reps_sustained": 0, "founder_signs_per_week_blitz": 4.0,
                "strips_open_cap_blitz": 1.5, "strips_open_cap_sustained": 0.5},
    "reps2": {"reps_blitz": 2, "reps_sustained": 2, "founder_signs_per_week_blitz": 3.0,
              "strips_open_cap_blitz": 3.0, "strips_open_cap_sustained": 1.0},
    "reps4": {"reps_blitz": 4, "reps_sustained": 4, "founder_signs_per_week_blitz": 2.0,
              "strips_open_cap_blitz": 4.0, "strips_open_cap_sustained": 1.5},
}
ONBOARDING_LABELS = {"founder": "Founder alone", "reps2": "Founder + 2 reps", "reps4": "Founder + 4 reps"}
LAUNCH_OPTIONS = {"m4": {"paid_launch_month": 4}, "m7": {"paid_launch_month": 7}, "gated": {"paid_launch_month": None}}
LAUNCH_LABELS = {"m4": "Month 4", "m7": "Month 7", "gated": "Density gates (Plus 100 / Pro 40 active)"}
PRICE_OPTIONS = [(29.0, 79.0), (39.0, 79.0), (49.0, 79.0), (29.0, 99.0), (39.0, 99.0), (49.0, 99.0)]
CONVERSION_OPTIONS = {"low": 0.10, "base": 0.20, "high": 0.35}
BIA_ADDON = {5: 2250.0}  # one Silver campaign in month 5 (midpoint of $1,500-3,000)


def launch_values(onboarding="reps2", launch="m4", plus=39.0, pro=79.0, conv="base", bia=False, **extra):
    """Inputs for one launch-plan option (bootstrap cost base + blitz)."""
    o = dict(LAUNCH_BASE)
    o.update(ONBOARDING_OPTIONS[onboarding])
    o.update(LAUNCH_OPTIONS[launch])
    o.update(price_plus=plus, price_pro=pro, conv6_target=CONVERSION_OPTIONS[conv] if conv in CONVERSION_OPTIONS else conv)
    if bia:
        o["bia_one_off"] = dict(BIA_ADDON)
    o.update(extra)
    return values("base", **o)


def values_v1(scenario="base"):
    """Scenario inputs as they were under Pricing v1 (for the before/after comparison)."""
    return values(scenario, **PRICING_V1, **PRICING_V1_SCENARIO[scenario])


def conv12_blended(v):
    """Blended probability an active free merchant upgrades within 12 months of paid GA."""
    return sum(v["mix_" + vt] * (1 - (1 - hazard(v, vt)) ** 12) for vt in VERTICALS)

FIXED_KEYS = ["fixed_hosting_base", "fixed_saas_tools", "fixed_insurance", "fixed_accounting",
              "fixed_app_stores", "fixed_phone_misc", "fixed_marketing", "fixed_legal_reserve"]


def values(scenario="base", **overrides):
    """Flat {key: value} for a scenario, with optional extra overrides (for sensitivities)."""
    v = {k: a["value"] for k, a in ASSUMPTIONS.items()}
    v.update({k: a["value"] for k, a in LAUNCH_ASSUMPTIONS.items()})
    v.update(SCENARIOS[scenario])
    v.update(overrides)
    if v.get("conv6_target") is not None:
        v["conversion_multiplier"] = solve_conversion_multiplier(v, v["conv6_target"], 6)
    return v


def conv_blended_n(v, n, at_reference_prices=False):
    """Vertical-weighted share of a static cohort of active free merchants upgrading within n months."""
    return sum(v["mix_" + vt] * (1 - (1 - hazard(v, vt, at_reference_prices)) ** n) for vt in VERTICALS)


def solve_conversion_multiplier(v, target, n):
    """conversion_multiplier such that conv_blended_n(v, n) at the reference prices = target (bisection)."""
    lo, hi = 0.0, 20.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if conv_blended_n(dict(v, conversion_multiplier=mid), n, True) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


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


def price_factor(v, vert):
    """Conversion response to price vs the reference prices: (P/Pref)^-elasticity, Plus/Pro-weighted per vertical.
    Exactly 1.0 when elasticities are 0 (all original scenarios) or prices equal the reference."""
    ep, er = v.get("price_elasticity_plus", 0.0), v.get("price_elasticity_pro", 0.0)
    if not ep and not er:
        return 1.0
    fp = (v["price_plus"] / v["price_ref_plus"]) ** (-ep)
    fr = (v["price_pro"] / v["price_ref_pro"]) ** (-er)
    s = v["pro_share_" + vert]
    return (1 - s) * fp + s * fr


def hazard(v, vert, at_reference_prices=False):
    """Monthly upgrade probability for an active free merchant in a vertical."""
    h = (1 - (1 - v["conv12_" + vert]) ** (1 / 12)) * v["conversion_multiplier"]
    if not at_reference_prices:
        h *= price_factor(v, vert)
    return min(1.0, h)


def blitz_step(v, m, st, launched):
    """One month of capacity-driven onboarding (acquisition_mode='blitz').

    st carries: pool (signable shops left on open strips), haircut_applied.
    Founder signs first (no wage); reps take the rest and are paid only for the shifts
    actually needed. New strips open only when the open strips can't absorb capacity,
    capped by strips_open_cap_*. Returns (signups, strips_opened, founder_signups,
    rep_signups, rep_shifts).
    """
    blitz = m <= v["blitz_months"]
    wk = v["weeks_per_month"]
    ramp = v["month1_ramp"] if m == 1 else 1.0
    hc = v["post_launch_signup_haircut"] if launched else 0.0
    if launched and hc and not st["haircut_applied"]:
        st["pool"] *= (1 - hc)
        st["haircut_applied"] = True
    yld = 1 - hc
    f_cap = (v["founder_signs_per_week_blitz"] if blitz else v["founder_signs_per_week_sustained"]) * wk * ramp * yld
    reps = v["reps_blitz"] if blitz else v["reps_sustained"]
    shifts_cap = reps * (v["rep_shifts_per_week_blitz"] if blitz else v["rep_shifts_per_week_sustained"]) * wk * ramp
    per_shift = v["rep_signs_per_shift"] * yld
    cap = f_cap + shifts_cap * per_shift
    share = v["blitz_max_monthly_share"]
    strip_pool = v["blitz_strip_shops"] * v["blitz_eventual_sign_rate"] * yld
    open_cap = v["strips_open_cap_blitz"] if blitz else v["strips_open_cap_sustained"]
    need = max(0.0, (cap - st["pool"] * share) / (strip_pool * share))
    opened = min(need, open_cap)
    st["pool"] += opened * strip_pool
    signups = min(cap, st["pool"] * share)
    st["pool"] -= signups
    f_sign = min(f_cap, signups)
    r_sign = signups - f_sign
    r_shifts = r_sign / per_shift if per_shift > 0 else 0.0
    return signups, opened, f_sign, r_sign, r_shifts


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
             ads_months=0, paid_total=0.0, cum_cash=float(v["starting_cash"]), launched=False)
    blitz = v.get("acquisition_mode", "strips") == "blitz"
    bst = {"pool": 0.0, "haircut_applied": False}
    if blitz:
        L = []
    for vert in VERTICALS:
        p["paid_" + vert] = 0.0
    for i in range(v["months"]):
        m = i + 1
        r = {"month": m, "calendar": month_label(v["start_month"], i)}
        # --- acquisition
        plm = v.get("paid_launch_month")
        # "launched" = paid plans are live (time-based: from plm; density-gated: from the month after the first unlock)
        launched = (m >= plm) if plm else (p["plus_unlocked"] == 1 or p["pro_unlocked"] == 1)
        launch_now = (m == plm) if plm else (launched and not p["launched"])
        if blitz:
            su, opened, f_sign, r_sign, r_shifts = blitz_step(v, m, bst, launched)
            L.append(0)  # keep indexing simple
            L[i] = opened
            r["signups"], r["founder_signups"], r["rep_signups"], r["rep_shifts"] = su, f_sign, r_sign, r_shifts
        r["strips_launched"] = L[i]
        r["strips_cum"] = p["strips_cum"] + L[i]
        strips_cum_hist.append(r["strips_cum"])
        k = m - v["strip_maturity_months"]
        r["strips_mature"] = strips_cum_hist[k] if k >= 1 else 0.0
        if not blitz:
            r["signups"] = v["strip_potential_merchants"] * sum(
                L[i - j] * ramp[j] for j in range(len(ramp)) if i - j >= 0)
        shock = v.get("launch_free_churn_shock", 0.0) if launch_now else 0.0
        r["network_merchants"] = p["N"] * (1 - v["free_merchant_churn"] - shock) + r["signups"]
        lag = 1 if v.get("activation_lag_months", 0) else 0
        r["active_merchants"] = (r["network_merchants"] - lag * r["signups"]) * v["activation_rate"]
        r["activated_new"] = r["signups"] * v["activation_rate"]
        A_ = r["active_merchants"]
        # --- gates
        if plm:
            r["plus_unlocked"] = r["pro_unlocked"] = 1 if m >= plm else 0
        else:
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
        r["rev_bia"] = r["bia_campaigns"] * v["bia_price"] + float(v.get("bia_one_off", {}).get(m, 0.0))
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
        if blitz:
            # reps paid by the shift (+ one-time paid training when hired); founder's own signups cost no wage
            hires = v["reps_blitz"] if m == 1 else max(0, v["reps_sustained"] - v["reps_blitz"]) if m == v["blitz_months"] + 1 else 0
            hours = r["rep_shifts"] * v["rep_shift_hours"] + hires * v["rep_training_hours"]
            r["cac_rep_wages"] = hours * r["rep_wage"] * (1 + v["payroll_burden"]) * cm
            r["cac_activation_bonus"] = (r["rep_signups"] * v["activation_rate"] * v["activation_bonus"]
                                         * (1 + v["payroll_burden"]) * cm)
        else:
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
                 ads_months=r["ads_months"], paid_total=r["paid_total"], cum_cash=r["cum_cash"],
                 launched=launched)
        for vert in VERTICALS:
            p["paid_" + vert] = r["paid_" + vert]
    return rows


def unit_economics(v, cac_per_signed=None):
    """Steady-state per-merchant economics (same formulas as the 'Unit Economics' sheet).
    cac_per_signed: optional realised acquisition cost per signed shop (launch-plan runs)."""
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
    if cac_per_signed is not None:
        u["cac_per_signed"] = cac_per_signed
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


# =====================================================================================
# Launch-plan grid (docs/finance/launch-plan-economics.md)
# =====================================================================================
LAUNCH_MONTHLY_COLUMNS = MONTHLY_COLUMNS[:6] + ["founder_signups", "rep_signups", "rep_shifts"] + MONTHLY_COLUMNS[6:]


def sustained_breakeven(rows):
    e = [r["ebitda"] for r in rows]
    return next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)


def launch_summary(v):
    """Founder-facing metrics for one launch-plan option (36-month run + 60-month run for break-even)."""
    rows = run(v)
    ext = run(v, months=v["extended_months"])
    at = lambda m, k: rows[m - 1][k]
    s = {}
    s["revenue_start_month"] = next((r["month"] for r in rows if r["rev_total"] > 0.005), None)
    s["paid_launch_month"] = next((r["month"] for r in rows if r["plus_unlocked"] or r["pro_unlocked"]), None)
    for m in (6, 12, 18, 24):
        s[f"mrr_m{m}"] = at(m, "mrr_subscriptions")
    for m in (6, 12, 24):
        s[f"revenue_m{m}"] = at(m, "rev_total")
    for m in (3, 6, 12, 24):
        s[f"network_m{m}"] = at(m, "network_merchants")
    for m in (6, 12, 24):
        s[f"paying_m{m}"] = at(m, "paid_total")
    for m in (3, 12):
        s[f"strips_m{m}"] = at(m, "strips_cum")
    cash = [r["cum_cash"] for r in ext]
    low = min(cash)
    s["cash_low_point"] = min(0.0, low)
    s["cash_low_month"] = ext[cash.index(low)]["month"]
    s["cash_m12"] = at(12, "cum_cash")
    s["cash_m24"] = at(24, "cum_cash")
    s["breakeven_month"] = sustained_breakeven(ext)
    s["first_positive_month"] = next((r["month"] for r in ext if r["ebitda"] >= 0 and r["month"] > 3), None)
    s["y1_spend"] = sum(r["variable_total"] + r["cac_total"] + r["opex_total"] for r in rows[:12])
    s["blitz_spend_m1_3"] = sum(r["variable_total"] + r["cac_total"] + r["opex_total"] for r in rows[:3])
    acq = sum(r["cac_total"] - r["cac_upsell"] for r in rows[:24])
    signed = sum(r["signups"] for r in rows[:24])
    s["cac_per_signed"] = acq / signed if signed else 0.0
    u = unit_economics(v, cac_per_signed=s["cac_per_signed"])
    s["ltv_cac"] = u["ltv_cac"]
    s["contribution_paying"] = u["contribution_paying"]
    s["conv6_actual_prices"] = conv_blended_n(v, 6)
    s["conversion_multiplier"] = v["conversion_multiplier"]
    return s, rows


LAUNCH_GRID_METRICS = ["revenue_start_month", "paid_launch_month", "mrr_m6", "mrr_m12", "mrr_m18", "mrr_m24",
                       "revenue_m12", "revenue_m24", "cash_low_point", "cash_low_month", "cash_m12", "cash_m24",
                       "breakeven_month", "network_m3", "network_m6", "network_m12", "network_m24", "paying_m6",
                       "paying_m12", "paying_m24", "strips_m3", "strips_m12", "y1_spend", "blitz_spend_m1_3",
                       "cac_per_signed", "contribution_paying", "ltv_cac", "conv6_actual_prices"]

# Recommended option and the comparison set that gets its own monthly CSV.
RECOMMENDED = dict(onboarding="reps2", launch="m4", plus=39.0, pro=99.0, conv="base", bia=True)
KEY_OPTIONS = {
    "launch_reco": RECOMMENDED,
    "launch_founder_m4": dict(onboarding="founder", launch="m4", plus=39.0, pro=79.0, conv="base"),
    "launch_reps2_m4": dict(onboarding="reps2", launch="m4", plus=39.0, pro=79.0, conv="base"),
    "launch_reps4_m4": dict(onboarding="reps4", launch="m4", plus=39.0, pro=79.0, conv="base"),
    "launch_reps2_m7": dict(onboarding="reps2", launch="m7", plus=39.0, pro=79.0, conv="base"),
    "launch_reps2_gated": dict(onboarding="reps2", launch="gated", plus=39.0, pro=79.0, conv="base"),
}


def launch_grid():
    out = []
    for ob in ONBOARDING_OPTIONS:
        for la in LAUNCH_OPTIONS:
            for plus, pro in PRICE_OPTIONS:
                for cv in CONVERSION_OPTIONS:
                    for bia in (False, True):
                        s, _ = launch_summary(launch_values(ob, la, plus, pro, cv, bia))
                        out.append([ob, la, plus, pro, cv, "yes" if bia else "no"]
                                   + [s[k] if s[k] is not None else "none" for k in LAUNCH_GRID_METRICS])
    return out


def launch_risk_sensitivity():
    """Early-paywall risk: fewer signups after launch and a one-off loss of free shops, by launch timing."""
    cases = [("none", 0.0, 0.0), ("signups -10%", 0.10, 0.0), ("signups -20%", 0.20, 0.0),
             ("5% of free shops leave at launch", 0.0, 0.05), ("signups -20% + 5% leave", 0.20, 0.05),
             ("signups -20% + 10% leave", 0.20, 0.10)]
    out = []
    for la in LAUNCH_OPTIONS:
        for name, hc, sh in cases:
            o = dict(RECOMMENDED, launch=la)
            s, _ = launch_summary(launch_values(**o, post_launch_signup_haircut=hc, launch_free_churn_shock=sh))
            out.append([la, name, hc, sh] + [s[k] if s[k] is not None else "none" for k in LAUNCH_GRID_METRICS])
    # support is costed at $25/hr in every run; in a bootstrap the founder does it unpaid
    for la in ("m4",):
        o = dict(RECOMMENDED, launch=la)
        s, _ = launch_summary(launch_values(**o, support_hourly=0.0))
        out.append([la, "founder does all support (no cash cost)", 0.0, 0.0]
                   + [s[k] if s[k] is not None else "none" for k in LAUNCH_GRID_METRICS])
    # price-response sensitivity on the recommended option
    for e_plus, e_pro in [(0.0, 0.0), (1.5, 1.0)]:
        for plus, pro in [(39.0, 79.0), (39.0, 99.0), (49.0, 99.0)]:
            o = dict(RECOMMENDED, plus=plus, pro=pro)
            s, _ = launch_summary(launch_values(**o, price_elasticity_plus=e_plus, price_elasticity_pro=e_pro))
            out.append([f"m4 elasticity {e_plus}/{e_pro}", f"Plus {plus:.0f} / Pro {pro:.0f}", 0.0, 0.0]
                       + [s[k] if s[k] is not None else "none" for k in LAUNCH_GRID_METRICS])
    return out


def write_launch_outputs(quiet=False):
    for name, o in KEY_OPTIONS.items():
        s, rows = launch_summary(launch_values(**o))
        write_csv(os.path.join(OUT, f"monthly_{name}.csv"), LAUNCH_MONTHLY_COLUMNS,
                  [[r[c] for c in LAUNCH_MONTHLY_COLUMNS] for r in rows])
    hdr = ["onboarding", "launch", "price_plus", "price_pro", "conversion", "bia_addon"] + LAUNCH_GRID_METRICS
    write_csv(os.path.join(OUT, "launch_options.csv"), hdr, launch_grid())
    write_csv(os.path.join(OUT, "launch_risk_sensitivity.csv"),
              ["launch", "case", "post_launch_signup_haircut", "launch_free_churn_shock"] + LAUNCH_GRID_METRICS,
              launch_risk_sensitivity())
    write_csv(os.path.join(OUT, "launch_assumptions.csv"), ["key", "value", "unit", "note"],
              [[k, a["value"], a["unit"], a["note"]] for k, a in LAUNCH_ASSUMPTIONS.items()]
              + [["LAUNCH_BASE." + k, x, "", "override used by every launch-plan option"] for k, x in LAUNCH_BASE.items()]
              + [[f"ONBOARDING_OPTIONS.{ob}", o, "", ONBOARDING_LABELS[ob]] for ob, o in ONBOARDING_OPTIONS.items()])
    if not quiet:
        s, _ = launch_summary(launch_values(**RECOMMENDED))
        print(f"LAUNCH RECO {RECOMMENDED}: revenue from month {s['revenue_start_month']}, MRR m12 ${s['mrr_m12']:,.0f}, "
              f"m24 ${s['mrr_m24']:,.0f}; cash low ${s['cash_low_point']:,.0f} (month {s['cash_low_month']}); "
              f"break-even month {s['breakeven_month']}; LTV/CAC {s['ltv_cac']:.1f}x")


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
    # Pricing v2 before/after
    cmp_rows = []
    cmp_metrics = ["conv12_blended", "free_cost_per_active_merchant", "total_signups", "breakeven_month",
                   "breakeven_month_extended", "breakeven_calendar_extended", "peak_cash_need", "peak_cash_need_extended",
                   "ltv_cac", "ltv_cac_fully_loaded", "payback_months", "cac_per_paying", "m36_active_merchants",
                   "m36_paid_total", "m36_rev_total", "m36_ebitda", "y3_revenue"]
    for sc in ["bear", "base", "lean_plan", "bull"]:
        for label, v in (("v1", values_v1(sc)), ("v2", values(sc))):
            s = summarize(run(v), v)
            u = unit_economics(v)
            s["conv12_blended"] = conv12_blended(v)
            s["free_cost_per_active_merchant"] = u["free_cost_per_active_merchant"]
            s["ltv_cac_fully_loaded"] = u["ltv_cac_fully_loaded"]
            cmp_rows.append([sc, label] + [s[k] if s[k] is not None else "none" for k in cmp_metrics])
    write_csv(os.path.join(OUT, "pricing_v2_comparison.csv"), ["scenario", "pricing"] + cmp_metrics, cmp_rows)
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
    write_launch_outputs(quiet)
    return results


if __name__ == "__main__":
    main(quiet="--quiet" in sys.argv)
