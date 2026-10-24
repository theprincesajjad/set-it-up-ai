"""Data strategy: does "free for most features + sell data" beat the paid-plan model?

Read-only use of model.py / strategy_audit_2.py / combined_strategy.py (same assumptions, same network and restaurant
rows as `C_combined_desi_first` in docs/business/combined-strategy.md). Writes ONLY output/data_strategy_*.csv.
Doc: docs/business/data-strategy.md

Run:  python3 -I docs/finance/model/data_strategy.py

Scenarios (60 months, CAD, model month 1 = Nov 2026):
  a   Current plan: paid Plus/Pro + restaurant pack + payment fees + BIA campaigns (= combined C, unchanged).
  a2  Current plan + the aggregated Insights product launched at the coverage gates (nothing else changes).
  b   Free for all + data only: no subscriptions, no add-ons, no usage fees (we absorb SMS / WhatsApp / phone AI);
      payment fees as today (1.5% on orders, 1% on deposits and recurring billing); Insights at the gates.
  b+  Founder's best case for b: data revenue 2x our schedule and no consent haircut (everything sellable).
  c   Hybrid: free software for everything near-zero-cost; usage sold at a margin (WhatsApp packs, phone AI, SMS overage);
      payment fees; Insights at the gates. No subscriptions.
  d   Recommended: restaurant and service packs stay paid (value-priced workflows); near-zero-cost Plus features
      move to Free (Plus subscription revenue x0.65, +15% shop adoption); payments + usage fees; Insights at the gates.

Everything marked (A) is an assumption, (W) a sourced fact. The baseline's own optimistic assumptions (remote sales,
304 signed shops at month 12, restaurants paying from month 1) are inherited from combined_strategy.py and are NOT
endorsed here: the point is the DIFFERENCE between scenarios on the same base.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import combined_strategy as C  # noqa: E402  (read-only)

M = C.M
OUT = os.path.join(HERE, "output")
MONTHS = 60

# ----------------------------------------------------------------------------- data product assumptions (all A)
DATA = dict(
    # Contributing merchants = active merchants x consent coverage (merchant opt-in x shopper non-objection).
    consent_coverage=0.70,
    # Annual recurring revenue of the Insights product by contributing merchants, once launched and fully ramped.
    # Anchors: ~15 / 74 / 370 strips at 27 merchants a strip. BIAs $3-5k, CRE/landlord $20-30k, City/province $30-50k,
    # CPG $25-40k, lenders / research $15-60k. Placer.ai: >$100M run-rate / 4,300 customers = ~US$23k per customer (W?).
    arr_points=[(150, 0.0), (400, 25_000.0), (2_000, 430_000.0), (10_000, 3_500_000.0)],
    arr_mult=1.0,
    min_history_months=12,      # buyers want >= 12 months to see seasonality
    collection_start_month=5,   # pilot strip live (model: Q2)
    launch_gate_contributing=400,
    ramp_months=9,              # sales cycle: BIAs/City procurement 6-12 months
    fixed_monthly=5_000.0,      # 0.5 analyst/engineer + DPO tooling + annual audit and legal retainer
    commission=0.10,            # sales commission / reseller share
    legal_prep_one_time=12_000.0,   # month 6: terms rewrite, consent flows, PIA, anonymization opinion
    pipeline_one_time=15_000.0,     # launch-6: de-identification pipeline, k-anon tests, qualified-person review
)

# ----------------------------------------------------------------------------- per-scenario switches
SCEN = {
    "a":  dict(label="a  Current plan (paid plans + restaurant pack)", data=False, net_subs=1.0, desi_subs=1.0, addons="all", order_fee=0.0, uplift=1.0, extra_free=0.0),
    "a2": dict(label="a2 Current plan + Insights", data=True, net_subs=1.0, desi_subs=1.0, addons="all", order_fee=0.0, uplift=1.0, extra_free=0.0),
    "b":  dict(label="b  Free for all + data only", data=True, net_subs=0.0, desi_subs=0.0, addons="none", order_fee=0.015, uplift=1.25, extra_free=5.4, free_usage=True),
    "b+": dict(label="b+ Founder best case (2x data, no consent haircut)", data=True, net_subs=0.0, desi_subs=0.0, addons="none", order_fee=0.015, uplift=1.25, extra_free=5.4, free_usage=True, data_mult=2.0, coverage=1.0),
    "c":  dict(label="c  Hybrid: free software + usage and payment fees + Insights", data=True, net_subs=0.0, desi_subs=0.0, addons="usage", order_fee=0.015, uplift=1.25, extra_free=2.5),
    "d":  dict(label="d  Recommended: paid packs stay, near-zero features free, Insights", data=True, net_subs=0.65, desi_subs=1.0, addons="all", order_fee=0.0, uplift=1.15, extra_free=2.5),
}

# restaurant free-usage cost assumptions (A): what we eat if WhatsApp / phone AI are free to every restaurant
WA_COST_ALL_FREE = 21.0     # 1,000 msgs included, 60% used, ~C$0.035 each (F, U)
PHONE_AI_TAKE_FREE = 0.40   # share of restaurants who would switch on phone AI if it cost nothing
PHONE_AI_COST = 30.0        # ~250 minutes at ~C$0.12/min (A, same as combined_strategy.py)


STRESS_NET_SCALE = 0.5   # (A) stress case: half the network shops, and the restaurant adds of C_combined_half_desi_adds


def base_rows(stress=False):
    key = "C_combined_half_desi_adds" if stress else "C_combined_desi_first"
    net, desi = C.plans()[key]
    drows = C.desi_rows(desi, standalone=False)
    if stress:
        k = STRESS_NET_SCALE
        scaled = []
        for r in net:
            cost = r["net_rev"] - r["net_ebitda"]
            r2 = dict(r)
            for f in ("net_shops", "net_active", "net_paying", "net_subs", "net_fees", "net_bia", "net_rev"):
                r2[f] = r[f] * k
            r2["net_ebitda"] = r2["net_rev"] - (cost * k + 340.0 * (1 - k))  # fixed overhead does not halve
            scaled.append(r2)
        net = scaled
    return net, drows, desi


def data_schedule(active_total, cfg, shift=0, mult=1.0, zero_forever=False):
    """Return per-month (data_rev, data_cost, launch_month, contributing list)."""
    cov = cfg.get("coverage", DATA["consent_coverage"])
    contrib = [a * cov for a in active_total]
    pts = DATA["arr_points"]

    def arr(x):
        if x <= pts[0][0]:
            return 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x <= x1:
                if y0 == 0:
                    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                import math
                t = (math.log(x) - math.log(x0)) / (math.log(x1) - math.log(x0))
                return math.exp(math.log(y0) + t * (math.log(y1) - math.log(y0)))
        (x0, y0), (x1, y1) = pts[-2], pts[-1]
        import math
        slope = (math.log(y1) - math.log(y0)) / (math.log(x1) - math.log(x0))
        return y1 * (x / x1) ** slope

    earliest = DATA["collection_start_month"] + DATA["min_history_months"]
    launch = next((m for m in range(1, MONTHS + 1) if m >= earliest and contrib[m - 1] >= DATA["launch_gate_contributing"]), None)
    rev, cost = [0.0] * MONTHS, [0.0] * MONTHS
    if cfg.get("data") and launch is not None:
        sell_from = launch + shift
        cost[max(DATA["collection_start_month"] + 1, 6) - 1] += DATA["legal_prep_one_time"]
        cost[max(launch - 6, 6) - 1] += DATA["pipeline_one_time"]
        for m in range(max(launch - 3, 1), MONTHS + 1):
            cost[m - 1] += DATA["fixed_monthly"]
        for m in range(sell_from, MONTHS + 1):
            ramp = min(1.0, (m - sell_from + 1) / DATA["ramp_months"])
            r = 0.0 if zero_forever else arr(contrib[m - 1]) * DATA["arr_mult"] * mult * cfg.get("data_mult", 1.0) * ramp / 12.0
            rev[m - 1] = r
            cost[m - 1] += r * DATA["commission"]
    elif cfg.get("data"):
        cost[5] += DATA["legal_prep_one_time"]  # you still pay for the legal work even if coverage never arrives
    return rev, cost, launch, contrib


def run(key, shift=0, mult=1.0, zero_forever=False, draw=0.0, stress=False):
    cfg = SCEN[key]
    net, drows, dp = base_rows(stress)
    u = cfg["uplift"]
    rows, active_total = [], []
    for m in range(1, MONTHS + 1):
        n, d = net[m - 1], drows[m - 1]
        paid = d["desi_paying"]
        ramp = min(1.0, m / dp["ramp_months"])
        orders = paid * dp["online_adopt"] * ramp * dp["online_orders"] * (1 - (dp["cust_fee_volume_hit"] if dp["cust_fee"] else 0))
        gmv_orders = orders * dp["online_ticket"]
        on = m >= dp["addons_from"]
        # ---- network side
        net_cost = (n["net_rev"] - n["net_ebitda"]) * u
        net_rev = (n["net_subs"] * cfg["net_subs"] + (n["net_fees"] + n["net_bia"]) * 1.0) * (1.0 if cfg["net_subs"] > 0 and u == 1.0 else 1.0)
        net_rev = n["net_subs"] * cfg["net_subs"] + (n["net_fees"] + n["net_bia"]) * u
        baseline_payers = n["net_paying"]
        nonpaying_active = max(0.0, n["net_active"] * u - baseline_payers * cfg["net_subs"])
        net_cost += nonpaying_active * cfg["extra_free"]
        if cfg["net_subs"] == 0.0:  # no payers: the baseline cost of payers' SMS stays (they still use it) - already in net_cost
            pass
        # ---- restaurant side
        subs = d["desi_subs"] * cfg["desi_subs"]
        wa = dp["whatsapp_take"] * dp["whatsapp_price"]
        pa = dp["phone_ai_take"] * dp["phone_ai_price"]
        other = dp["extra_loc_take"] * dp["extra_loc_price"] + dp["banquet_take"] * dp["banquet_price"]
        if cfg["addons"] == "all":
            addons = d["desi_addons"]
        elif cfg["addons"] == "usage":
            addons = on * paid * (wa + pa)
        else:
            addons = 0.0
        fees = d["desi_fees"] + gmv_orders * cfg["order_fee"]
        var = d["desi_var"]
        if cfg["desi_subs"] == 0.0:  # no subscription invoices: drop our own billing cost
            var -= (d["desi_subs"] + d["desi_addons"]) * dp["billing_pct"] + paid * dp["billing_fixed"]
            var += addons * dp["billing_pct"]
        if cfg.get("free_usage"):  # WhatsApp + phone AI free to every restaurant
            var += on * paid * ((WA_COST_ALL_FREE + PHONE_AI_TAKE_FREE * PHONE_AI_COST)
                                - (dp["whatsapp_take"] * dp["whatsapp_cost"] + dp["phone_ai_take"] * dp["phone_ai_cost"]))
        desi_rev = subs + addons + fees
        desi_cost = var + d["desi_acq"] + d["desi_opex"]
        active_total.append(n["net_active"] * u + paid)
        rows.append(dict(month=m, merchants_signed=n["net_shops"] * u + paid, merchants_active=active_total[-1],
                         rev_subs=n["net_subs"] * cfg["net_subs"] + subs, rev_addons_usage=addons,
                         rev_payments=n["net_fees"] * u + fees, rev_bia=n["net_bia"] * u,
                         rev_core=net_rev + desi_rev, cost_core=net_cost + desi_cost))
    drev, dcost, launch, contrib = data_schedule(active_total, cfg, shift, mult, zero_forever)
    cash = 0.0
    for i, r in enumerate(rows):
        r["rev_data"] = drev[i]
        r["rev_total"] = r["rev_core"] + drev[i]
        r["cost_total"] = r["cost_core"] + dcost[i]
        r["ebitda"] = r["rev_total"] - r["cost_total"] - draw
        cash += r["ebitda"]
        r["cum_cash"] = cash
        r["contributing"] = contrib[i]
    return rows, launch


def summarize(rows):
    cash = [r["cum_cash"] for r in rows]
    low = min(cash)
    e = [r["ebitda"] for r in rows]
    be = next((rows[i]["month"] for i in range(len(rows)) if all(x >= 0 for x in e[i:])), None)
    # first month with positive EBITDA for 3 months in a row (less sensitive to month-1 blips)
    pos3 = next((rows[i]["month"] for i in range(len(rows) - 2) if all(x >= 0 for x in e[i:i + 3])), None)
    cum_pos = next((r["month"] for r in rows if r["month"] > cash.index(low) + 1 and r["cum_cash"] >= 0), None)
    at = lambda m, k: rows[m - 1][k]
    return dict(
        breakeven=be or ">60", positive3=pos3 or ">60", cash_needed=-min(0.0, low), cash_low_month=rows[cash.index(low)]["month"],
        payback_month=cum_pos or ">60",
        rev_m12=at(12, "rev_total"), rev_m24=at(24, "rev_total"), rev_m36=at(36, "rev_total"), rev_m60=at(60, "rev_total"),
        ebitda_m36=at(36, "ebitda"), ebitda_m60=at(60, "ebitda"), cum_m36=at(36, "cum_cash"), cum_m60=at(60, "cum_cash"),
        data_m36=at(36, "rev_data"), data_m60=at(60, "rev_data"),
        data_share_m60=at(60, "rev_data") / at(60, "rev_total") if at(60, "rev_total") else 0.0,
        active_m12=at(12, "merchants_active"), active_m24=at(24, "merchants_active"), active_m36=at(36, "merchants_active"),
        active_m60=at(60, "merchants_active"),
    )


# ----------------------------------------------------------------------------- static tables
def static_data_revenue():
    """Data ARR at 400 / 2,000 / 10,000 CONTRIBUTING merchants: low / base / high, by buyer."""
    tiers = {
        400: dict(strips=15, customers=22_000, history="12 mo",
                  buyers=[("BIAs", 8, 3_000), ("CRE / landlords", 0, 20_000), ("City / agencies", 0, 30_000), ("CPG brands", 0, 25_000), ("Lenders / research", 0, 15_000)]),
        2_000: dict(strips=74, customers=110_000, history="24 mo",
                    buyers=[("BIAs", 30, 4_000), ("CRE / landlords", 6, 20_000), ("City / agencies", 2, 30_000), ("CPG brands", 4, 25_000), ("Lenders / research", 2, 15_000)]),
        10_000: dict(strips=370, customers=540_000, history="36 mo+",
                     buyers=[("BIAs", 150, 5_000), ("CRE / landlords", 25, 30_000), ("City / agencies", 8, 50_000), ("CPG brands", 25, 40_000), ("Lenders / research", 10, 60_000)]),
    }
    out = []
    for n, t in tiers.items():
        lines = [(b, c, p, c * p) for (b, c, p) in t["buyers"]]
        base = sum(x[3] for x in lines)
        out.append((n, t, lines, base))
    return out


def marginal_costs():
    """Per-merchant monthly marginal cost by feature (CAD, A unless noted)."""
    sms, wa_mkt, wa_util = 0.022, 0.035, 0.012
    rows = [
        ("Hosting, DB, API (active merchant)", 0.60, "model.py infra_per_merchant (A)"),
        ("Customers' hosting + push (54 unique x $0.01)", 0.54, "model.py infra_per_customer x ~54 (A)"),
        ("Apple / Google Wallet passes", 0.05, "Issuing and updating passes is free from Apple and Google; cost is our API calls (A)"),
        ("Push notifications (APNs / FCM)", 0.02, "Free from the platforms; our send workers (A)"),
        ("Photo / file storage", 0.02, "~0.5 GB at ~US$0.015 per GB-month; service shops with intake photos ~$0.10 (A)"),
        ("Email (1,000 sends a month)", 0.40, "Transactional email ~US$0.0003 each (A)"),
        ("Support, free merchant (5 min at $25/hr)", 2.08, "model.py (A)"),
        ("Support, paid or restaurant merchant (15 to 30 min)", 6.25, "model.py: 15 min; restaurant pack 30 min = $12.50 (A)"),
        ("Stripe Connect platform cost", 2.00, "$2 per active account + ~0.25% of GMV; VERIFY CAD pricing (A)"),
        ("Join OTP SMS (1.5 per new customer, ~4 new a month)", 6 * sms, "$0.022 per segment (model.py, from Twilio CA + carrier fees) (A)"),
        ("SMS campaigns, 300 a month used", 300 * sms, "$6.60: usage-priced (A)"),
        ("WhatsApp marketing, 600 a month used", 600 * wa_mkt, "~C$0.035 each (F, unverified): $21; usage-priced (A)"),
        ("WhatsApp utility (order updates, review requests), 300 a month", 300 * wa_util, "~C$0.012 each; (A)"),
        ("Phone ordering assistant, ~250 min a month", 30.0, "~C$0.12 per minute for telephony + speech + model; (A)"),
        ("Card processing (Stripe 2.9% + $0.30)", None, "Pass-through, paid by the merchant out of each payment (W)"),
    ]
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    summary = {}
    monthly_cols = None
    for k in SCEN:
        rows, launch = run(k)
        s = summarize(rows)
        s["data_launch_month"] = launch if SCEN[k]["data"] else "n/a"
        summary[k] = s
        monthly_cols = list(rows[0])
        M.write_csv(os.path.join(OUT, f"data_strategy_monthly_{k.replace('+', 'plus')}.csv"), monthly_cols,
                    [[r[c] for c in monthly_cols] for r in rows])
    # draws
    for k in SCEN:
        rows, _ = run(k, draw=4000.0)
        s4 = summarize(rows)
        summary[k]["cash_needed_4k"] = s4["cash_needed"]
        summary[k]["breakeven_4k"] = s4["breakeven"]
    hdr = ["key"] + list(summary["a"])
    M.write_csv(os.path.join(OUT, "data_strategy_comparison.csv"), hdr, [[k] + [summary[k][c] for c in hdr[1:]] for k in SCEN])

    # sensitivity on data revenue: base / delayed 18 months / half / zero forever
    sens = []
    for k in ("a2", "b", "c", "d"):
        for label, kw in (("data as planned", {}), ("data 0 for 18 months after launch", dict(shift=18)), ("data at 50%", dict(mult=0.5)),
                          ("data 0 forever (costs still paid)", dict(zero_forever=True))):
            rows, launch = run(k, **kw)
            s = summarize(rows)
            sens.append([k, label, launch, s["breakeven"], s["cash_needed"], s["cum_m36"], s["cum_m60"], s["rev_m60"], s["ebitda_m60"]])
    M.write_csv(os.path.join(OUT, "data_strategy_sensitivity.csv"),
                ["scenario", "case", "data_launch_month", "breakeven", "cash_needed", "cum_cash_m36", "cum_cash_m60", "rev_m60", "ebitda_m60"], sens)

    # print everything for the doc
    print("== COMPARISON")
    for k in SCEN:
        s = summary[k]
        print(f"{SCEN[k]['label']:<70} BE {s['breakeven']!s:>4} | pos3 {s['positive3']!s:>4} | cash needed {s['cash_needed']:>10,.0f} (m{s['cash_low_month']}) | "
              f"w/ $4k draw {s['cash_needed_4k']:>10,.0f} BE {s['breakeven_4k']!s:>4} | rev m12/24/36/60 {s['rev_m12']:,.0f}/{s['rev_m24']:,.0f}/{s['rev_m36']:,.0f}/{s['rev_m60']:,.0f} | "
              f"cum m36 {s['cum_m36']:,.0f} m60 {s['cum_m60']:,.0f} | data m36 {s['data_m36']:,.0f} m60 {s['data_m60']:,.0f} share {s['data_share_m60']:.0%} | launch {s['data_launch_month']} | active m12/24/36/60 {s['active_m12']:.0f}/{s['active_m24']:.0f}/{s['active_m36']:.0f}/{s['active_m60']:.0f}")
    print("== SENSITIVITY")
    for r in sens:
        print(r[0], f"{r[1]:<38}", "launch", r[2], "BE", r[3], f"cash needed {r[4]:,.0f}", f"cum36 {r[5]:,.0f} cum60 {r[6]:,.0f} rev60 {r[7]:,.0f} ebitda60 {r[8]:,.0f}")
    print("== STRESS (half the shops, half the restaurant adds)")
    for k in SCEN:
        rows, launch = run(k, stress=True)
        s = summarize(rows)
        print(f"{SCEN[k]['label']:<70} BE {s['breakeven']!s:>4} | pos3 {s['positive3']!s:>4} | cash needed {s['cash_needed']:>10,.0f} (m{s['cash_low_month']}) | rev m36/60 {s['rev_m36']:,.0f}/{s['rev_m60']:,.0f} | cum m36 {s['cum_m36']:,.0f} m60 {s['cum_m60']:,.0f} | data m60 {s['data_m60']:,.0f} | launch {launch if SCEN[k]['data'] else 'n/a'} | active m36 {s['active_m36']:.0f} m60 {s['active_m60']:.0f}")
        summary["stress_" + k] = s
        summary["stress_" + k]["launch"] = launch
    M.write_csv(os.path.join(OUT, "data_strategy_stress.csv"), ["key"] + list(summary["stress_a"]),
                [[k] + [summary["stress_" + k][c] for c in summary["stress_a"]] for k in SCEN])
    print("== DATA ARR NEEDED TO REPLACE SUBSCRIPTIONS + ADD-ONS AT MONTH 36 (scenario a lines)")
    ra, _ = run("a")
    need = (ra[35]["rev_subs"] + ra[35]["rev_addons_usage"]) * 12
    lo, hi = 100.0, 200000.0
    cfg = SCEN["b"]
    import math
    for _ in range(80):
        mid = (lo + hi) / 2
        # ARR curve at `mid` contributing merchants (re-use the schedule's interpolation through a one-point call)
        rev, _c, _l, _ = data_schedule([mid / DATA["consent_coverage"]] * MONTHS, dict(cfg, data=True), 0, 1.0)
        arr_mid = rev[-1] * 12
        lo, hi = (mid, hi) if arr_mid < need else (lo, mid)
    print(f"annual subs+add-ons at m36 in (a): {need:,.0f}; contributing merchants needed on our ARR curve: {lo:,.0f}; "
          f"b contributing at m36: {run('b')[0][35]['contributing']:,.0f}")
    print("== STATIC DATA REVENUE")
    for n, t, lines, base in static_data_revenue():
        print(n, t["strips"], "strips", t["customers"], "customers", t["history"], "base", f"{base:,.0f}", "low", f"{base * 0.4:,.0f}", "high", f"{base * 2:,.0f}", "per merchant/mo", f"{base / n / 12:,.2f}")
        for b in lines:
            print("   ", b)
    print("== MARGINAL COST")
    for r in marginal_costs():
        print(r)
    # year-by-year first 5 years for a and d and b for revenue mix
    print("== REV MIX m36 / m60")
    for k in SCEN:
        rows, _ = run(k)
        for m in (36, 60):
            r = rows[m - 1]
            print(k, m, {c: round(r[c]) for c in ("rev_subs", "rev_addons_usage", "rev_payments", "rev_bia", "rev_data", "rev_total", "cost_total", "ebitda")})


if __name__ == "__main__":
    main()
