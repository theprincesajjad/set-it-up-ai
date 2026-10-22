"""Strategy-audit scenarios for Local Loyalty. Imports docs/finance/model/model.py read-only and
writes only docs/finance/model/output/strategy_*.csv. Existing model outputs are not touched.

Run:  python3 -I strategy_audit.py /home/user/set-it-up-ai/docs/finance/model
"""
import csv
import os
import sys

MODEL_DIR = sys.argv[1]
sys.path.insert(0, MODEL_DIR)
import model as M  # noqa: E402

OUT = os.path.join(MODEL_DIR, "output")
LEAN = dict(support_min_free=1, support_min_paid=5, kit_cost=5.0, perk_value=0.0, merchants_per_cs=2500)

# ---------------------------------------------------------------- scenario inputs
# S0: the founder's remote lean-ops plan exactly as in model.py (REMOTE_KEY["remote_lean_ops"]).
S0 = dict(M.REMOTE_KEY["remote_lean_ops"])

# S0r: the same operating model with audit (realistic) assumptions. Every change is an assumption.
REALISTIC = dict(S0, target=250, pace=3,          # 56% of storefronts by phone, 3 areas/month after m3
                 activation=0.45,                 # phone-onboarded shops, no in-person counter training
                 conv=0.12,                       # 12% of active free shops upgrade within 6 months (not 20%)
                 paid_churn=0.04,                 # micro-merchant SaaS churn 4%/mo (not 3%)
                 free_merchant_churn=0.025,       # free shops leave/close 2.5%/mo (not 1.5%)
                 gmv_plus=1250.0, gmv_pro=3000.0)  # half the in-app GMV (order-ahead demand is unproven)


def base_multiplier(**o):
    return M.remote_values(**o)["conversion_multiplier"]


# Multiplier that gives 12% 6-month conversion at the ORIGINAL vertical mix; reused when the mix changes
# so that a wedge's higher blended conversion comes from the mix, not from a re-solve.
REAL_MULT = base_multiplier(**REALISTIC)

WEDGE_MIX = dict(mix_repair_auto=0.35, mix_personal_services=0.30, mix_food_bev=0.20, mix_retail=0.10,
                 mix_pharmacy=0.05)
# Wedge shops are pre-qualified by a $100 refundable Pro deposit, so their 12-month base rates rise
# (repair/auto 45% -> 60%, personal services 32% -> 40%) before the same realistic multiplier is applied.
S1 = dict(REALISTIC, conv=None, conversion_multiplier=REAL_MULT, pro=99.0, paid_launch_month=2,
          conv12_repair_auto=0.60, conv12_personal_services=0.40, **WEDGE_MIX)

S2 = dict(REALISTIC, activation=0.55,             # BIA intro + one in-person street day per area
          bia_campaigns_per_strip_year=0.5,       # blended: 1 in 4 areas buys a spring + holiday pair
          unlock_bia_active_merchants=0)          # gated per strip (6 months live), not network-wide
S2b = dict(S2, bia_campaigns_per_strip_year=1.0)

S12 = dict(S1, activation=0.55, bia_campaigns_per_strip_year=0.5, unlock_bia_active_merchants=0)

# Performance fee (S3): $2 per verified new-to-shop customer sourced by the network, billed to every
# ACTIVE shop (free included) from month 4; 3 such customers per active shop per month at full ramp
# (6-month linear ramp). 3.4% collection cost. Free churn +0.5 pt for the new bill.
PERF = dict(fee=2.0, per_shop=3.0, start=4, ramp=6, collect=0.034)
S3 = dict(REALISTIC, free_merchant_churn=0.03)
S123 = dict(S12, free_merchant_churn=0.03)

SCEN = [
    ("S0_current_remote_lean_ops", "Current plan: remote lean ops (as modelled)", S0, None),
    ("S0r_realistic_rebase", "Same plan, audit assumptions", REALISTIC, None),
    ("S1_service_pro_wedge", "Pro-first service wedge", S1, None),
    ("S2_bia_anchored", "BIA-anchored strips", S2, None),
    ("S2b_bia_anchored_high", "BIA-anchored, 1 campaign/area/yr", S2b, None),
    ("S3_performance_fee", "Performance fee on every active shop", S3, PERF),
    ("S12_wedge_plus_bia", "Recommended: wedge + BIA", S12, None),
    ("S123_wedge_bia_perf", "Recommended + performance fee", S123, PERF),
]


def run_strategy(o, perf, months=60, founder_draw=0.0):
    v = M.remote_values(**o)
    rows = M.run(v, months=months)
    cash = 0.0
    for r in rows:
        fee = 0.0
        if perf and r["month"] >= perf["start"]:
            ramp = min(1.0, (r["month"] - perf["start"] + 1) / perf["ramp"])
            fee = r["active_merchants"] * perf["per_shop"] * perf["fee"] * ramp
        r["rev_perf_fee"] = fee
        r["rev_total"] += fee
        r["ebitda"] += fee * (1 - perf["collect"]) if perf else 0.0
        r["ebitda"] -= founder_draw
        cash += r["ebitda"]
        r["cum_cash"] = cash
    return v, rows


def summary(v, rows):
    at = lambda m, k: rows[m - 1][k]
    cash = [r["cum_cash"] for r in rows]
    low = min(cash)
    e = [r["ebitda"] for r in rows]
    be = next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)
    return {
        "shops_per_area": v["remote_shops_per_area"],
        "network_m3": at(3, "network_merchants"), "network_m12": at(12, "network_merchants"),
        "active_m12": at(12, "active_merchants"), "active_customers_m12": at(12, "active_customers"),
        "paying_m12": at(12, "paid_total"), "paying_m24": at(24, "paid_total"),
        "sub_mrr_m12": at(12, "mrr_subscriptions"), "sub_mrr_m24": at(24, "mrr_subscriptions"),
        "revenue_m12": at(12, "rev_total"), "revenue_m24": at(24, "rev_total"),
        "revenue_m36": at(36, "rev_total"), "ebitda_m36": at(36, "ebitda"),
        "cash_low": min(0.0, low), "cash_low_month": rows[cash.index(low)]["month"],
        "breakeven_month": be if be else "none in 60",
        "conv6_blended": M.conv_blended_n(v, 6),
    }


def main():
    hdr = None
    out = []
    for key, label, o, perf in SCEN:
        v, rows = run_strategy(o, perf)
        s = summary(v, rows)
        _, rows_d = run_strategy(o, perf, founder_draw=4000.0)
        sd = summary(v, rows_d)
        s["cash_low_with_4k_founder_draw"] = sd["cash_low"]
        s["breakeven_with_4k_founder_draw"] = sd["breakeven_month"]
        if hdr is None:
            hdr = ["key", "label"] + list(s.keys())
        out.append([key, label] + [s[k] for k in hdr[2:]])
        cols = ["month", "calendar", "signups", "network_merchants", "active_merchants", "active_customers",
                "paid_total", "plus_merchants", "pro_merchants", "mrr_subscriptions", "rev_payments", "rev_bia",
                "rev_perf_fee", "rev_total", "variable_total", "cac_total", "opex_total", "ebitda", "cum_cash"]
        if key != "S0_current_remote_lean_ops":
            M.write_csv(os.path.join(OUT, f"strategy_monthly_{key}.csv"), cols,
                        [[r.get(c, 0.0) for c in cols] for r in rows[:36]])
    M.write_csv(os.path.join(OUT, "strategy_comparison.csv"), hdr, out)
    print("REAL_MULT", REAL_MULT)
    for row in out:
        print(dict(zip(hdr, row)))

    # What breaks the plan: one-way stress tests on the current lean-ops plan (S0).
    tests = [
        ("as modelled", {}),
        ("conversion 10% (6 months)", {"conv": 0.10}),
        ("conversion 5% (6 months)", {"conv": 0.05}),
        ("activation 45%", {"activation": 0.45}),
        ("activation 30%", {"activation": 0.30}),
        ("paid churn 5%/mo", {"paid_churn": 0.05}),
        ("free churn 3%/mo", {"free_merchant_churn": 0.03}),
        ("in-app GMV halved", {"gmv_plus": 1250.0, "gmv_pro": 3000.0}),
        ("in-app GMV zero", {"payments_adoption": 0.0}),
        ("250 by m3, 3 areas/mo", {"target": 250, "pace": 3}),
        ("150 by m3, 2 areas/mo", {"target": 150, "pace": 2}),
        ("support 3 min free / 10 min paid", {"support_min_free": 3, "support_min_paid": 10}),
        ("support 5 / 15 min (human ops)", {"support_min_free": 5, "support_min_paid": 15}),
        ("founder draw $4k/mo", "draw"),
        ("all audit assumptions (S0r)", "real"),
    ]
    st = []
    for name, ex in tests:
        if ex == "draw":
            v, rows = run_strategy(S0, None, founder_draw=4000.0)
        elif ex == "real":
            v, rows = run_strategy(REALISTIC, None)
        else:
            v, rows = run_strategy(dict(S0, **ex), None)
        s = summary(v, rows)
        st.append([name, s["sub_mrr_m12"], s["sub_mrr_m24"], s["revenue_m24"], s["paying_m24"], s["cash_low"],
                   s["cash_low_month"], s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_stress_tests.csv"),
                ["case", "sub_mrr_m12", "sub_mrr_m24", "revenue_m24", "paying_m24", "cash_low", "cash_low_month",
                 "breakeven_month"], st)
    for r in st:
        print(r)

    # How robust is the recommended plan (S12)?
    rs = []
    for name, ex, draw in [("S12 as modelled", {}, 0.0),
                           ("BIA 0.25 campaigns/area/yr", {"bia_campaigns_per_strip_year": 0.25}, 0.0),
                           ("no BIA revenue at all", {"bia_campaigns_per_strip_year": 0.0}, 0.0),
                           ("conversion halved", {"conversion_multiplier": REAL_MULT / 2}, 0.0),
                           ("paid churn 6%/mo", {"paid_churn": 0.06}, 0.0),
                           ("activation 40%", {"activation": 0.40}, 0.0),
                           ("founder draw $4k/mo", {}, 4000.0),
                           ("no BIA + founder draw $4k/mo", {"bia_campaigns_per_strip_year": 0.0}, 4000.0)]:
        v, rows = run_strategy(dict(S12, **ex), None, founder_draw=draw)
        s = summary(v, rows)
        rs.append([name, s["sub_mrr_m12"], s["sub_mrr_m24"], s["revenue_m12"], s["revenue_m24"], s["cash_low"],
                   s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_recommended_sensitivity.csv"),
                ["case", "sub_mrr_m12", "sub_mrr_m24", "revenue_m12", "revenue_m24", "cash_low", "breakeven_month"], rs)
    for r in rs:
        print(r)

    # Performance-fee break-even: network-sourced new customers per active shop per month needed.
    pf = []
    for per in (0.5, 1, 2, 3, 5):
        for fee in (1.0, 2.0, 3.0):
            v, rows = run_strategy(S3, dict(PERF, per_shop=per, fee=fee))
            s = summary(v, rows)
            pf.append([per, fee, s["revenue_m12"], s["revenue_m24"], s["cash_low"], s["breakeven_month"]])
    M.write_csv(os.path.join(OUT, "strategy_perf_fee_grid.csv"),
                ["new_customers_per_active_shop_month", "fee_per_customer", "revenue_m12", "revenue_m24",
                 "cash_low", "breakeven_month"], pf)
    for r in pf:
        print(r)


if __name__ == "__main__":
    main()
