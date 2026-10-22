"""Strategy audit 2: the founder's revenue structure (subscription + a platform fee on ALL in-app payments).

Read-only use of model.py. Writes ONLY output/strategy2_*.csv. model.py and every existing output are untouched.
Docs: docs/business/strategy-audit-2.md (and the first audit, docs/business/strategy-audit.md).

Run:  python3 -I docs/finance/model/strategy_audit_2.py

How it works
- The base is the first audit's recommended plan (S12: Pro-first service wedge + BIA-anchored strips, on the audit's
  realistic inputs), rebuilt here so this file stands alone.
- model.run() books in-app payments as payers x GMV x 60% x 0.75%. This script REMOVES that line (revenue and Connect
  cost) and replaces it with an ordering layer: adopting shops by vertical x orders/week x average ticket, a take rate on
  that GMV (plus an optional customer service fee), Stripe Connect platform costs, fraud/refund losses, order-ready SMS
  and extra support. Card processing (Stripe 2.9% + C$0.30) is passed through to the merchant: neither revenue nor cost.
- Two structures:
    "paid": ordering only on Plus/Pro (plans.ts today: orders.order_ahead, payments.in_app are Plus), fee on top.
    "all":  ordering open to every active shop, fee only; the subscription is for the other features.
- Every number below marked (A) is an assumption. Fee benchmarks are cited in strategy-audit-2.md.
"""
import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model as M  # noqa: E402

OUT = os.path.join(HERE, "output")

# ------------------------------------------------------------------ base plan (first audit, rebuilt)
S0 = dict(M.REMOTE_KEY["remote_lean_ops"])
REALISTIC = dict(S0, target=250, pace=3, activation=0.45, conv=0.12, paid_churn=0.04, free_merchant_churn=0.025,
                 gmv_plus=1250.0, gmv_pro=3000.0)
REAL_MULT = M.remote_values(**REALISTIC)["conversion_multiplier"]
WEDGE_MIX = dict(mix_repair_auto=0.35, mix_personal_services=0.30, mix_food_bev=0.20, mix_retail=0.10, mix_pharmacy=0.05)
COMMUNITY_MIX = dict(mix_food_bev=0.35, mix_retail=0.25, mix_repair_auto=0.20, mix_personal_services=0.12,
                     mix_pharmacy=0.08)  # model.py's original street mix
S12 = dict(REALISTIC, conv=None, conversion_multiplier=REAL_MULT, pro=99.0, paid_launch_month=2,
           conv12_repair_auto=0.60, conv12_personal_services=0.40, activation=0.55,
           bia_campaigns_per_strip_year=0.5, unlock_bia_active_merchants=0, **WEDGE_MIX)

# ------------------------------------------------------------------ ordering layer assumptions (all A)
# per vertical: (share of ELIGIBLE shops that adopt in-app ordering/payments at a 2% take rate after the ramp,
#                orders (payments) per week per adopting shop through us, average ticket CAD)
ORDER_SETS = {
    "realistic": {
        "food_bev": (0.30, 20, 15.0),           # cafe/bakery/restaurant pickup: ~3 a day through us
        "retail": (0.12, 5, 45.0),              # grocer, florist, pet, gift: click-and-collect
        "repair_auto": (0.45, 4, 180.0),        # deposits + final invoices on approved quotes
        "personal_services": (0.30, 8, 50.0),   # booking deposits / prepaid services
        "pharmacy": (0.05, 3, 30.0),            # front-store pickup only
    },
    "optimistic": {
        "food_bev": (0.45, 35, 16.0),
        "retail": (0.20, 8, 50.0),
        "repair_auto": (0.60, 6, 220.0),
        "personal_services": (0.45, 12, 55.0),
        "pharmacy": (0.10, 5, 30.0),
    },
}
# Quote-to-pay rail: service shops run deposits AND final invoices through us (not just pickup).
ORDER_SETS["service_rail"] = {
    "food_bev": (0.30, 20, 15.0),
    "retail": (0.12, 5, 45.0),
    "repair_auto": (0.35, 12, 300.0),       # (A) device ~$150 / auto ~$500 blended; deposits + invoices
    "personal_services": (0.30, 12, 60.0),  # (A) prepaid appointments
    "pharmacy": (0.05, 3, 30.0),
}
RAIL_PRICING = dict(take=0.015, take_v={"repair_auto": 0.01, "personal_services": 0.015},
                    cust_fee=0.49, cust_fee_v={"repair_auto": 0.0, "personal_services": 0.0})

ORDER_BASE = dict(
    structure="all",            # "paid" | "all"
    take=0.035,                 # platform fee on GMV, charged on top of the subscription
    cust_fee=0.0,               # optional per-order customer service fee (CAD)
    cust_fee_volume_hit=0.10,   # (A) orders lost when a customer fee is shown
    order_set="realistic",
    elasticity=1.0,             # (A) adoption ~ (merchant all-in cost / all-in cost at 2% take) ^ -elasticity
    ref_take=0.02,
    launch_month=4,             # ordering live from month 4 (founder's paid launch)
    ramp_months=9,              # (A) adoption and volume build linearly over 9 months
    payer_adopt_mult=2.0,       # (A) "paid": adoption among paying shops is 2x (cap 90%) - ordering is why they pay
    stripe_pct=0.029, stripe_fixed=0.30,  # Stripe Canada card-not-present, passed through (cited)
    connect_pct=0.0025,         # Stripe Connect "you handle pricing": 0.25% of payout volume (cited)
    connect_account=2.00,       # C$2 per monthly active account (cited)
    payout_fee=0.25 * 4.33,     # C$0.25 per payout, weekly payouts (cited fee; weekly schedule A)
    loss_pct=0.0015,            # (A) refunds absorbed, chargeback losses, fraud
    sms_per_order=0.5,          # (A) order-ready texts for customers without the app / push
    support_min=5,              # (A) extra human minutes per adopting shop per month
    food_sub_cannibal=0.20,     # (A) "all": food shops lose one reason to buy Plus -> conversion x 0.8
)


def merchant_rate(take, ticket, p):
    """Merchant's all-in cost of one in-app order as a share of the ticket (processing + our take)."""
    return p["stripe_pct"] + p["stripe_fixed"] / ticket + take


def apply_ordering(v, rows, p):
    vs = ORDER_SETS[p["order_set"]]
    for r in rows:
        # remove the model's built-in 0.75% payments line (we replace it)
        old_rev, old_cost = r["rev_payments"], r["cost_payments"]
        r["rev_total"] -= old_rev
        r["ebitda"] += -old_rev + old_cost
        gmv = orders = adopters = 0.0
        m = r["month"]
        ramp = 0.0 if m < p["launch_month"] else min(1.0, (m - p["launch_month"] + 1) / p["ramp_months"])
        for vt, (adopt, wk, ticket) in vs.items():
            take_v = p.get("take_v", {}).get(vt, p["take"])
            fee_v = p.get("cust_fee_v", {}).get(vt, p["cust_fee"])
            f = (merchant_rate(take_v, ticket, p) / merchant_rate(p["ref_take"], ticket, p)) ** (-p["elasticity"])
            if p["structure"] == "paid":
                base = r["paid_" + vt]
                a = min(0.9, adopt * p["payer_adopt_mult"]) * f
            else:
                base = r["active_merchants"] * v["mix_" + vt]
                a = min(0.95, adopt * f)
            n = base * a * ramp
            o = n * wk * 4.33 * ramp * (1 - (p["cust_fee_volume_hit"] if fee_v else 0.0))
            adopters += n
            orders += o
            gmv += o * ticket
            take_rev_v = o * ticket * take_v + o * fee_v
            r["rev_take_" + vt] = take_rev_v
        take_rev = sum(r["rev_take_" + vt] for vt in vs)
        cost = (gmv * (p["connect_pct"] + p["loss_pct"]) + adopters * (p["connect_account"] + p["payout_fee"])
                + orders * p["sms_per_order"] * v["sms_rate"] + adopters * p["support_min"] / 60 * v["support_hourly"])
        r.update(order_gmv=gmv, orders=orders, order_shops=adopters, rev_take=take_rev, cost_take=cost,
                 merchant_processing_paid=gmv * p["stripe_pct"] + orders * p["stripe_fixed"])
        r["rev_total"] += take_rev
        r["variable_total"] = r["variable_total"] - old_cost + cost
        r["ebitda"] += take_rev - cost
    return rows


# ------------------------------------------------------------------ scale-up mechanics (profit path)
_orig_launches = M.remote_launches


def _launches(v):
    sched = v.get("_pace_schedule")
    if not sched:
        return _orig_launches(v)
    out, cum = [], 0.0
    for i in range(v["months"]):
        m = i + 1
        rate = next(x for (upto, x) in sched if m <= upto)
        x = max(0.0, min(rate, v["remote_max_areas"] - cum))
        out.append(x)
        cum += x
    return out


M.remote_launches = _launches  # runtime only, inside this script; falls back to the original without a schedule


def run_case(o, p=None, months=60, extra_opex=None, founder_draw=None):
    v = M.remote_values(**o)
    rows = M.run(v, months=months)
    if p is not None:
        apply_ordering(v, rows, p)
    cash = 0.0
    for r in rows:
        x = 0.0
        if extra_opex:
            x += sum(amt for (start, amt) in extra_opex if r["month"] >= start)
        if founder_draw:
            x += sum(amt for (start, amt) in founder_draw if r["month"] >= start)
        r["opex_extra"] = x
        r["ebitda"] -= x
        cash += r["ebitda"]
        r["cum_cash"] = cash
    return v, rows


def first_month(rows, key, level):
    return next((r["month"] for r in rows if r[key] >= level), None)


def summary(v, rows):
    at = lambda m, k: rows[m - 1].get(k, 0.0)
    cash = [r["cum_cash"] for r in rows]
    low = min(cash)
    e = [r["ebitda"] for r in rows]
    be = next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)
    s = {}
    for m in (12, 24, 36):
        s[f"shops_m{m}"] = at(m, "network_merchants")
        s[f"order_shops_m{m}"] = at(m, "order_shops")
        s[f"gmv_m{m}"] = at(m, "order_gmv")
        s[f"sub_mrr_m{m}"] = at(m, "mrr_subscriptions")
        s[f"take_rev_m{m}"] = at(m, "rev_take")
        s[f"bia_m{m}"] = at(m, "rev_bia")
        s[f"revenue_m{m}"] = at(m, "rev_total")
        s[f"gross_margin_m{m}"] = (at(m, "rev_total") - at(m, "variable_total")) / at(m, "rev_total") if at(m, "rev_total") else 0.0
    s["cash_low"] = min(0.0, low)
    s["cash_low_month"] = rows[cash.index(low)]["month"]
    s["breakeven_month"] = be if be else "none in 60"
    for lvl in (10000, 50000, 100000):
        s[f"first_month_rev_{lvl // 1000}k"] = first_month(rows, "rev_total", lvl) or "none in 60"
    return s


def write(name, header, rows):
    M.write_csv(os.path.join(OUT, f"strategy2_{name}.csv"), header, rows)


def main():
    P = ORDER_BASE
    NET = dict(S12, conv12_food_bev=0.43 * (1 - P["food_sub_cannibal"]), **COMMUNITY_MIX)  # community street mix
    cases = [("R0_audit_recommended_S12", "First audit's recommendation (0.75% on payer GMV, model.py)", S12, None)]
    for t in (0.02, 0.035, 0.05, 0.08):
        cases.append((f"F_paid_take{t*100:g}", f"Founder: ordering on Plus/Pro, {t*100:g}% on top", S12,
                      dict(P, structure="paid", take=t)))
    for t in (0.02, 0.035, 0.05, 0.08):
        cases.append((f"N_all_take{t*100:g}", f"Network: ordering for every shop, {t*100:g}% fee", NET,
                      dict(P, structure="all", take=t)))
    cases.append(("N_all_1.5pct_plus_49c", "Network: 1.5% merchant + $0.49 customer fee", NET,
                  dict(P, structure="all", take=0.015, cust_fee=0.49)))
    cases.append(("N_all_take3.5_optimistic", "Network 3.5%, optimistic ordering volumes", NET,
                  dict(P, structure="all", take=0.035, order_set="optimistic")))
    cases.append(("N_all_take3.5_elastic2", "Network 3.5%, merchants twice as price-sensitive", NET,
                  dict(P, structure="all", take=0.035, elasticity=2.0)))
    cases.append(("N_all_take3.5_half_volume", "Network 3.5%, half the orders per shop", NET,
                  dict(P, structure="all", take=0.035, order_set="half")))
    cases.append(("V_rail_wedge_mix", "Primary thesis: service quote-to-pay rail + street pickup (wedge mix)", S12,
                  dict(P, structure="all", order_set="service_rail", **RAIL_PRICING)))
    cases.append(("V_rail_wedge_mix_half_invoices", "Primary thesis, half the service invoices", S12,
                  dict(P, structure="all", order_set="service_rail_half", **RAIL_PRICING)))
    ORDER_SETS["service_rail_half"] = {k: ((a, w / 2, t) if k in ("repair_auto", "personal_services") else (a, w, t))
                                       for k, (a, w, t) in ORDER_SETS["service_rail"].items()}
    ORDER_SETS["half"] = {k: (a, w / 2, t) for k, (a, w, t) in ORDER_SETS["realistic"].items()}

    hdr, out = None, []
    for key, label, o, p in cases:
        v, rows = run_case(o, p)
        s = summary(v, rows)
        _, rows_d = run_case(o, p, founder_draw=[(1, 4000.0)])
        sd = summary(v, rows_d)
        s["cash_low_4k_draw"], s["breakeven_4k_draw"] = sd["cash_low"], sd["breakeven_month"]
        if hdr is None:
            hdr = ["key", "label"] + list(s)
        out.append([key, label] + [s[k] for k in hdr[2:]])
    write("comparison", hdr, out)

    # GMV and merchant all-in cost per adopting shop, by vertical (realistic set)
    unit = []
    for vt, (adopt, wk, ticket) in ORDER_SETS["realistic"].items():
        gmv = wk * 4.33 * ticket
        row = [vt, adopt, wk, ticket, gmv]
        for t in (0.02, 0.035, 0.05, 0.08):
            row += [gmv * t, merchant_rate(t, ticket, P)]
        row += [merchant_rate(0.015, ticket, P)]
        unit.append(row)
    write("ordering_unit_economics",
          ["vertical", "adoption_at_2pct", "orders_per_week", "avg_ticket", "gmv_per_adopting_shop_month",
           "take_2pct", "merchant_all_in_2pct", "take_3.5pct", "merchant_all_in_3.5pct", "take_5pct",
           "merchant_all_in_5pct", "take_8pct", "merchant_all_in_8pct", "merchant_all_in_1.5pct_plus_customer_fee"],
          unit)

    # Profit path: Toronto-only vs Ontario/GTA expansion with a team (network 3.5% and 1.5% + $0.49)
    paths = []
    scale = dict(NET, _pace_schedule=[(3, 5), (12, 3), (24, 6), (999, 8)], remote_max_areas=420)
    team = [(13, 9000.0), (13, 5500.0), (25, 5500.0), (25, 9000.0), (37, 11000.0)]  # (A) eng, launcher, launcher, eng, sales lead
    draw = [(13, 5000.0)]
    variants = [
        ("toronto_only_3.5", NET, dict(P, structure="all", take=0.035), None, None),
        ("toronto_only_1.5_plus_49c", NET, dict(P, structure="all", take=0.015, cust_fee=0.49), None, None),
        ("ontario_scale_3.5_team", scale, dict(P, structure="all", take=0.035), team, draw),
        ("ontario_scale_1.5_plus_49c_team", scale, dict(P, structure="all", take=0.015, cust_fee=0.49), team, draw),
        ("ontario_scale_rail_team", dict(S12, _pace_schedule=[(3, 5), (12, 3), (24, 6), (999, 8)],
                                         remote_max_areas=420),
         dict(P, structure="all", order_set="service_rail", **RAIL_PRICING), team, draw),
        ("ontario_scale_3.5_team_optimistic", scale, dict(P, structure="all", take=0.035, order_set="optimistic"),
         team, draw),
    ]
    mcols = ["month", "calendar", "strips_cum", "network_merchants", "active_merchants", "paid_total",
             "order_shops", "orders", "order_gmv", "mrr_subscriptions", "rev_take", "rev_bia", "rev_total",
             "variable_total", "cac_total", "opex_total", "opex_extra", "ebitda", "cum_cash"]
    psum = []
    for key, o, p, tm, dr in variants:
        v, rows = run_case(o, p, extra_opex=tm, founder_draw=dr)
        s = summary(v, rows)
        psum.append([key] + [s[k] for k in ("revenue_m12", "revenue_m24", "revenue_m36", "first_month_rev_10k",
                                            "first_month_rev_50k", "first_month_rev_100k", "cash_low",
                                            "cash_low_month", "breakeven_month")] + [rows[59]["rev_total"],
                                                                                     rows[59]["network_merchants"],
                                                                                     rows[59]["ebitda"]])
        write(f"monthly_{key}", mcols, [[r.get(c, 0.0) for c in mcols] for r in rows])
    write("profit_path", ["case", "revenue_m12", "revenue_m24", "revenue_m36", "first_month_rev_10k",
                          "first_month_rev_50k", "first_month_rev_100k", "cash_low", "cash_low_month",
                          "breakeven_month", "revenue_m60", "shops_m60", "ebitda_m60"], psum)
    # take revenue by vertical, month 24, for the main cases
    tv = []
    for key, label, o, p in cases:
        if p is None:
            continue
        v, rows = run_case(o, p)
        r = rows[23]
        tv.append([key] + [r.get("rev_take_" + vt, 0.0) for vt in M.VERTICALS] + [r["rev_take"], r["order_gmv"]])
    write("take_by_vertical_m24", ["key"] + [f"take_{vt}" for vt in M.VERTICALS] + ["take_total", "gmv_total"], tv)
    for r in out:
        print(dict(zip(hdr, r)))
    for r in unit:
        print(r)
    for r in psum:
        print(r)


if __name__ == "__main__":
    main()
