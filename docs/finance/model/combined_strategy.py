"""Combined strategy: Local Loyalty (free street network + service quote-to-pay) + the Desi restaurant pack.

Read-only use of model.py (via strategy_audit_2.py). Writes ONLY output/combined_*.csv.
Docs: docs/business/combined-strategy.md (builds on strategy-audit.md and strategy-audit-2.md).

Run:  python3 -I docs/finance/model/combined_strategy.py

Three plans are compared, 60 months, CAD:
  A  audit-2 quote-to-pay rail, Toronto (strategy_audit_2 case V_rail_wedge_mix), as published.
  B  Desi-only: the founder's Desi restaurant SaaS (paid from day one), realistic inputs; plus the founder's own claims.
  C  Combined: Desi pack first in one corridor, the free core + service pack spreading from the corridors at a slower
     pace (the founder's time is split), one cost base.
Every input marked (A) is an assumption; (F) is the founder's brief (Sept 29-30, 2026), unverified unless the doc says so.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import strategy_audit_2 as S2  # noqa: E402  (imports model.py read-only)

M = S2.M
OUT = os.path.join(HERE, "output")

# ------------------------------------------------------------------ Desi restaurant pack (all A unless marked F)
DESI_REAL = dict(
    adds=[(3, 5.0), (12, 5.0), (24, 8.0), (999, 10.0)],  # paid restaurants signed per month, by month band (A)
    founding=20,                 # (F) first 20 restaurants: lifetime 50% off
    founding_discount=0.50,      # (F)
    ceiling=360,                 # (A) 900 GTA Desi restaurants (F: 600-1,500, unverified) x 40% max share
    churn=0.03,                  # (A) restaurant SaaS incl. closures
    tiers=((99.0, 0.40), (199.0, 0.45), (349.0, 0.15)),  # (F prices, A mix) Starter / Growth / Pro
    addons_from=4,
    whatsapp_take=0.50, whatsapp_price=49.0, whatsapp_cost=35.0,  # 1,000 marketing msgs at ~C$0.035 (F, unverified)
    extra_loc_take=0.10, extra_loc_price=49.0,
    banquet_take=0.05, banquet_price=99.0,
    phone_ai_take=0.10, phone_ai_price=79.0, phone_ai_cost=30.0,
    # payments flows on the RESTAURANT's own Stripe account (direct charges; restaurant is merchant of record)
    online_adopt=0.60, online_orders=150, online_ticket=40.0,   # direct online orders per adopting restaurant/month
    cust_fee=0.49, cust_fee_volume_hit=0.10,                    # optional customer service fee per online order
    tiffin_adopt=0.35, tiffin_gmv=5000.0,                       # 20 subscribers x $250 (F: $185-320/mo plans)
    catering_adopt=0.40, catering_gmv=3000.0,                   # deposits + balances
    growth_pro_share=0.60,                                      # tiffin/catering only on Growth/Pro
    recurring_fee=0.01,                                         # platform fee on tiffin + catering payments
    order_fee=0.0,                                              # 0% merchant commission on orders (the pitch)
    ramp_months=6,
    # costs
    support_min=30, support_hourly=25.0, infra=3.0, txn_msgs=5.0,
    billing_pct=0.036, billing_fixed=0.30,                      # our subscription via Stripe Billing: 2.9% + 0.7% (W/W?)
    photo=150.0, kit=20.0, rep_commission=100.0,                # (F) $150 menu digitisation + photography
    reps=[(2, 2500.0), (13, 2500.0), (25, 2500.0)],             # (A) part-time Hindi/Urdu/Punjabi field reps
    build=[(1, 6, 4000.0)],                                     # (A) contract dev for tiffin/WhatsApp/i18n, months 1-6
    legal_one_time={1: 3000.0},                                 # (A) payments/RPAA legal opinion
)
DESI_FOUNDER = dict(DESI_REAL, adds=[(3, 7.0), (12, 10.0), (999, 15.0)], churn=0.02, ceiling=600,
                    tiers=((199.0, 1.0),))  # the brief's own path: ~$199 average, faster adds, lower churn


def band(sched, m):
    return next(x for (upto, x) in sched if m <= upto)


def desi_rows(d, months=60, standalone=True):
    rows, paid, founding = [], 0.0, 0.0
    arpu = sum(p * s for p, s in d["tiers"])
    cum_signed = 0.0
    for m in range(1, months + 1):
        add = band(d["adds"], m)
        add = max(0.0, min(add, d["ceiling"] - paid * (1 - d["churn"])))
        new_founding = max(0.0, min(add, d["founding"] - cum_signed))
        cum_signed += add
        founding = founding * (1 - d["churn"]) + new_founding
        paid = paid * (1 - d["churn"]) + add
        ramp = min(1.0, m / d["ramp_months"])
        subs = (paid - founding) * arpu + founding * arpu * (1 - d["founding_discount"])
        on = m >= d["addons_from"]
        addons = on * paid * (d["whatsapp_take"] * d["whatsapp_price"] + d["extra_loc_take"] * d["extra_loc_price"]
                              + d["banquet_take"] * d["banquet_price"] + d["phone_ai_take"] * d["phone_ai_price"])
        orders = paid * d["online_adopt"] * ramp * d["online_orders"] * (1 - (d["cust_fee_volume_hit"] if d["cust_fee"] else 0))
        gmv_orders = orders * d["online_ticket"]
        gmv_recurring = paid * d["growth_pro_share"] * ramp * (d["tiffin_adopt"] * d["tiffin_gmv"]
                                                                 + d["catering_adopt"] * d["catering_gmv"])
        fees = orders * d["cust_fee"] + gmv_orders * d["order_fee"] + gmv_recurring * d["recurring_fee"]
        rev = subs + addons + fees
        var = (on * paid * (d["whatsapp_take"] * d["whatsapp_cost"] + d["phone_ai_take"] * d["phone_ai_cost"])
               + paid * (d["infra"] + d["txn_msgs"] + d["support_min"] / 60 * d["support_hourly"])
               + (subs + addons) * d["billing_pct"] + paid * d["billing_fixed"])
        acq = add * (d["photo"] + d["kit"] + d["rep_commission"]) + sum(a for (s, a) in d["reps"] if m >= s)
        build = sum(a for (s, e, a) in d["build"] if s <= m <= e)
        opex = build + d["legal_one_time"].get(m, 0.0)
        if standalone:  # model.py bootstrap overhead + one-time costs, counted once
            opex += 340.0 + {1: 1500.0, 3: 2500.0}.get(m, 0.0)
        rows.append(dict(month=m, desi_signed=add, desi_paying=paid, desi_founding=founding, desi_subs=subs,
                         desi_addons=addons, desi_fees=fees, desi_gmv=gmv_orders + gmv_recurring, desi_rev=rev,
                         desi_var=var, desi_acq=acq, desi_opex=opex,
                         desi_ebitda=rev - var - acq - opex))
    return rows


def finish(rows, founder_draw=0.0):
    cash = 0.0
    for r in rows:
        r["ebitda_total"] = r.get("net_ebitda", 0.0) + r.get("desi_ebitda", 0.0) - founder_draw
        r["revenue_total"] = r.get("net_rev", 0.0) + r.get("desi_rev", 0.0)
        r["recurring_total"] = r.get("net_subs", 0.0) + r.get("desi_subs", 0.0) + r.get("desi_addons", 0.0)
        cash += r["ebitda_total"]
        r["cum_cash"] = cash
    return rows


def network_rows(o, p, months=60):
    _, rows = S2.run_case(o, p, months=months)
    return [dict(month=r["month"], net_shops=r["network_merchants"], net_active=r["active_merchants"],
                 net_paying=r["paid_total"], net_subs=r["mrr_subscriptions"], net_fees=r.get("rev_take", 0.0),
                 net_bia=r["rev_bia"], net_rev=r["rev_total"], net_ebitda=r["ebitda"]) for r in rows]


def merge(a, b):
    return [{**x, **y} for x, y in zip(a, b)] if b else a


def summary(rows):
    at = lambda m, k: rows[m - 1].get(k, 0.0)
    cash = [r["cum_cash"] for r in rows]
    low = min(cash)
    e = [r["ebitda_total"] for r in rows]
    be = next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)
    s = {}
    for m in (12, 24, 36):
        s[f"revenue_m{m}"] = at(m, "revenue_total")
        s[f"recurring_m{m}"] = at(m, "recurring_total")
        s[f"desi_paying_m{m}"] = at(m, "desi_paying")
        s[f"net_shops_m{m}"] = at(m, "net_shops")
    s["cash_low"] = min(0.0, low)
    s["cash_low_month"] = rows[cash.index(low)]["month"]
    s["breakeven_month"] = be or "none in 60"
    s["first_month_arr_1m"] = next((r["month"] for r in rows if r["revenue_total"] * 12 >= 1_000_000), "none in 60")
    s["revenue_m60"] = at(60, "revenue_total")
    s["desi_paying_m60"] = at(60, "desi_paying")
    return s


def plans():
    P = S2.ORDER_BASE
    rail = dict(P, structure="all", order_set="service_rail", **S2.RAIL_PRICING)
    # C: the network spreads from the Desi corridors more slowly (founder time split): corridor-areas per month
    slow = dict(S2.S12, target=None, remote_m3_target=None, remote_shops_per_area=19.66,
                _pace_schedule=[(6, 1), (12, 2), (24, 3), (999, 3)])
    return {
        "A_audit2_rail_toronto": (network_rows(S2.S12, rail), None),
        "B_desi_only_realistic": (None, DESI_REAL),
        "B_desi_only_founder_claims": (None, DESI_FOUNDER),
        "C_combined_desi_first": (network_rows(slow, rail), DESI_REAL),
        "C_combined_desi_first_no_desi_build_spend": (network_rows(slow, rail), dict(DESI_REAL, build=[])),
        "C_combined_churn_2pct": (network_rows(slow, rail), dict(DESI_REAL, churn=0.02)),
        "C_combined_no_recurring_fee": (network_rows(slow, rail), dict(DESI_REAL, recurring_fee=0.0)),
        "C_combined_half_desi_adds": (network_rows(slow, rail),
                                      dict(DESI_REAL, adds=[(3, 2.5), (12, 2.5), (24, 4.0), (999, 5.0)])),
    }


def build_rows(net, desi):
    if net is None:
        return desi_rows(desi)
    if desi is None:
        return [dict(r) for r in net]
    return merge([dict(r) for r in net], desi_rows(desi, standalone=False))


def main():
    out, hdr = [], None
    for key, (net, desi) in plans().items():
        rows = finish(build_rows(net, desi))
        s = summary(rows)
        rows_d = finish(build_rows(net, desi), founder_draw=4000.0)
        sd = summary(rows_d)
        s["cash_low_4k_draw"], s["breakeven_4k_draw"] = sd["cash_low"], sd["breakeven_month"]
        if hdr is None:
            hdr = ["key"] + list(s)
        out.append([key] + [s[k] for k in hdr[1:]])
        cols = ["month", "net_shops", "net_paying", "net_subs", "net_fees", "net_bia", "net_rev", "desi_signed",
                "desi_paying", "desi_subs", "desi_addons", "desi_fees", "desi_gmv", "desi_rev", "desi_var",
                "desi_acq", "desi_opex", "revenue_total", "recurring_total", "ebitda_total", "cum_cash"]
        M.write_csv(os.path.join(OUT, f"combined_monthly_{key}.csv"), cols, [[r.get(c, 0.0) for c in cols] for r in rows])
    M.write_csv(os.path.join(OUT, "combined_comparison.csv"), hdr, out)

    # Desi pack unit economics per paying restaurant (steady state, after ramps)
    d = DESI_REAL
    arpu = sum(p * s for p, s in d["tiers"])
    addons = (d["whatsapp_take"] * d["whatsapp_price"] + d["extra_loc_take"] * d["extra_loc_price"]
              + d["banquet_take"] * d["banquet_price"] + d["phone_ai_take"] * d["phone_ai_price"])
    cf = d["online_adopt"] * d["online_orders"] * (1 - d["cust_fee_volume_hit"]) * d["cust_fee"]
    rf = d["growth_pro_share"] * (d["tiffin_adopt"] * d["tiffin_gmv"] + d["catering_adopt"] * d["catering_gmv"]) * d["recurring_fee"]
    var = (d["whatsapp_take"] * d["whatsapp_cost"] + d["phone_ai_take"] * d["phone_ai_cost"] + d["infra"] + d["txn_msgs"]
           + d["support_min"] / 60 * d["support_hourly"] + (arpu + addons) * d["billing_pct"] + d["billing_fixed"])
    contrib = arpu + addons + cf + rf - var
    cac_cash = d["photo"] + d["kit"] + d["rep_commission"] + 2500.0 / 5.0  # rep base spread over 5 signings/month
    life = 1 / d["churn"]
    ue = [["subscription_arpu_list", arpu], ["addons", addons], ["customer_fee", cf], ["recurring_fee_1pct", rf],
          ["revenue_per_restaurant", arpu + addons + cf + rf], ["variable_cost", var], ["contribution", contrib],
          ["gross_margin", contrib / (arpu + addons + cf + rf)], ["cac_cash_per_restaurant", cac_cash],
          ["lifetime_months", life], ["ltv", contrib * life], ["ltv_cac", contrib * life / cac_cash],
          ["payback_months", cac_cash / contrib],
          ["restaurants_for_1m_arr_at_this_revenue", 1_000_000 / 12 / (arpu + addons + cf + rf)],
          ["restaurants_for_1m_arr_at_199_flat", 1_000_000 / 12 / 199.0],
          ["steady_state_paying_at_10_adds_per_month", 10 / d["churn"]],
          ["adds_per_month_to_hold_400_at_3pct_churn", 400 * d["churn"]]]
    M.write_csv(os.path.join(OUT, "combined_desi_unit_economics.csv"), ["metric", "value"], ue)
    for r in out:
        print(dict(zip(hdr, r)))
    for r in ue:
        print(r)


if __name__ == "__main__":
    main()
