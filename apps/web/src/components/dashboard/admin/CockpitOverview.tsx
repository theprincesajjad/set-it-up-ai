"use client";
/**
 * The founder's overview at the top of /admin (wave N, reworked in wave P for the Monday-morning check): the four numbers that matter
 * (signups this week, MRR, paying shops, trial to paid), then the three lists a founder acts on (shops at risk, who signed up, who
 * started paying), each row opening the business, then the two trends, then activity for the chosen window and where the money came
 * from. Numbers come from GET /v1/admin/cockpit and /v1/admin/health.
 */
import { useState } from "react";
import { Panel, QuietLink, RowList, Row, StatBlock, StatusPill } from "@/components/dashboard/kit";
import { BarChart, LineChart } from "@/components/dashboard/Charts";
import { ListAsync } from "@/components/dashboard/ListStates";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { relativeTime } from "@/lib/dashboard/time";
import { formatMoney, formatNumber } from "@/lib/format";
import { BusinessStatus, FLAG_LABEL, PeriodPicker, deltaLine, pct, planLabel, type Period } from "./cockpit";

/** Whole dollars from $1,000 up, so a tile number fits a phone column. */
const money0 = (c: number) => (c >= 100_000 ? `$${formatNumber(Math.round(c / 100))}` : formatMoney(c));
/** Axis ticks have about four characters: 1.6k, $18k. */
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : formatNumber(Math.round(n)));
const compactMoney = (c: number) => `$${compact(c / 100)}`;
/** Short week label for chart axes: "Oct 26". */
const weekLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

const AT_RISK_PREVIEW = 5;

export function CockpitOverview() {
  const [days, setDays] = useState<Period>(30);
  const s = useApi(() => browserApi.admin.cockpit.overview(days), [days]);
  const health = useApi(() => browserApi.admin.cockpit.health(), []);
  const ctx = `vs previous ${days} days`;
  return (
    <section aria-labelledby="cockpit-title" className="flex flex-col gap-6">
      <h2 id="cockpit-title" className="sr-only">
        Overview
      </h2>
      <ListAsync state={s} errorTitle="Couldn't load the overview. Reload the page to try again." rows={3}>
        {(d) => {
          const plans = d.shops.payingByPlan;
          const planLine = [["Pro", plans.plus], ["Studio", plans.studio], ["Service", plans.pro], ["Restaurant", plans.restaurant]]
            .filter(([, n]) => (n as number) > 0)
            .map(([l, n]) => `${l} ${n}`)
            .join(" · ");
          return (
            <>
              <StatBlock
                tiles
                label="Growth"
                items={[
                  { label: "Signups this week", value: formatNumber(d.signupsWeek.current), delta: deltaLine(d.signupsWeek, "vs last week"), caption: `${formatNumber(d.signupsWeek.previous)} last week`, href: "/admin/businesses?sort=signedUpAt", spark: d.weekly.map((w) => w.signups) },
                  { label: "MRR", value: money0(d.money.mrrCents), caption: `ARR ${money0(d.money.arrCents)}`, href: "/admin/plans" },
                  { label: "Paying shops", value: formatNumber(d.shops.paying), caption: planLine || "None yet", href: "/admin/businesses?status=paying" },
                  { label: "Trial to paid", value: pct(d.money.trialToPaid.rate), caption: `${d.money.trialToPaid.converted} of ${d.money.trialToPaid.ended} ended trials · ${d.shops.trialing} in trial now`, href: "/admin/businesses?status=trial" },
                ]}
              />

              {/* The three lists a founder acts on. Every row opens the business. */}
              <div className="grid items-start gap-6 lg:grid-cols-3">
                <Panel
                  title="Shops at risk"
                  description={health.data ? (health.data.atRisk.length ? `${health.data.atRisk.length} to call, most urgent first` : "Nobody is slipping") : "Checking…"}
                  action={health.data && health.data.atRisk.length > AT_RISK_PREVIEW ? <QuietLink href="/admin/health">All {health.data.atRisk.length}</QuietLink> : null}
                >
                  {health.data ? (
                    health.data.atRisk.length ? (
                      <RowList label="Shops at risk">
                        {health.data.atRisk.slice(0, AT_RISK_PREVIEW).map((r) => (
                          <Row
                            key={r.merchantId}
                            href={`/admin/businesses/${r.merchantId}`}
                            leading={<span aria-hidden className={`size-2 rounded-full ${r.flags[0] === "payment_failed" ? "bg-negative" : "bg-points"}`} />}
                            title={r.name}
                            meta={`${FLAG_LABEL[r.flags[0]!]}. ${r.reasons[0] ?? ""}`}
                            trailing={r.mrrCents ? <span className="text-meta text-fg-muted">{formatMoney(r.mrrCents)}/mo</span> : null}
                          />
                        ))}
                      </RowList>
                    ) : (
                      <p className="text-meta text-fg-muted">No payment failures, stalled trials or usage drops right now.</p>
                    )
                  ) : (
                    <div className="h-40 skeleton rounded-sm" aria-hidden />
                  )}
                </Panel>
                <Panel title="New signups" description={`${formatNumber(d.signupsWeek.current)} this week`} action={<QuietLink href="/admin/businesses?sort=signedUpAt">All</QuietLink>}>
                  {d.recent.signups.length ? (
                    <RowList label="New signups">
                      {d.recent.signups.map((r) => (
                        <Row
                          key={r.id}
                          href={`/admin/businesses/${r.id}`}
                          title={r.name}
                          meta={[verticalLabel(r.trade), relativeTime(r.signedUpAt), r.source].filter(Boolean).join(" · ")}
                          trailing={<BusinessStatus status={r.status} />}
                        />
                      ))}
                    </RowList>
                  ) : (
                    <p className="text-meta text-fg-muted">No signups yet.</p>
                  )}
                </Panel>
                <Panel title="Started paying" description={`${formatNumber(d.shops.paying)} paying shops`} action={<QuietLink href="/admin/plans">Plans</QuietLink>}>
                  {d.recent.conversions.length ? (
                    <RowList label="Started paying">
                      {d.recent.conversions.map((r) => (
                        <Row key={r.id} href={`/admin/businesses/${r.id}`} title={r.name} meta={`${planLabel(r.plan)} · ${relativeTime(r.paidAt)}`} trailing={<span className="text-meta text-fg">{formatMoney(r.mrrCents)}/mo</span>} />
                      ))}
                    </RowList>
                  ) : (
                    <p className="text-meta text-fg-muted">No shop has paid yet.</p>
                  )}
                </Panel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                  <BarChart title="Signups per week" subtitle="Last 12 weeks" valueLabel="Signups" format={compact} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.signups }))} />
                </Panel>
                <Panel>
                  <LineChart title="Money processed per week" subtitle="Last 12 weeks, through the platform" valueLabel="Processed" format={compactMoney} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.gmvCents }))} />
                </Panel>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-headline font-bold text-fg">Activity</h3>
                    <p className="text-meta text-fg-muted">The last {days} days, compared with the {days} days before.</p>
                  </div>
                  <PeriodPicker value={days} onChange={setDays} />
                </div>
                <StatBlock
                  label={`Activity, last ${days} days`}
                  cols={4}
                  items={[
                    { label: "Money processed", value: money0(d.period.gmvCents.current), delta: deltaLine(d.period.gmvCents, ctx) },
                    { label: "Stamps given", value: formatNumber(d.period.stamps.current), delta: deltaLine(d.period.stamps, ctx) },
                    { label: "Bookings", value: formatNumber(d.period.bookings.current), delta: deltaLine(d.period.bookings, ctx) },
                    { label: "Active customers", value: formatNumber(d.period.activeCustomers.current), delta: deltaLine(d.period.activeCustomers, ctx) },
                  ]}
                />
                <StatBlock
                  label="Shops"
                  cols={4}
                  items={[
                    { label: "New shops", value: formatNumber(d.period.signups.current), delta: deltaLine(d.period.signups, ctx) },
                    { label: "Shops open", value: formatNumber(d.shops.total), caption: `${formatNumber(d.shops.churned)} churned`, href: "/admin/businesses" },
                    { label: "Live", value: formatNumber(d.shops.live), caption: d.shops.total ? `${Math.round((d.shops.live / d.shops.total) * 100)}% of shops` : undefined },
                    { label: "Activated", value: formatNumber(d.shops.activated), caption: `First stamp or booking${d.shops.total ? ` · ${Math.round((d.shops.activated / d.shops.total) * 100)}%` : ""}`, href: "/admin/onboarding" },
                  ]}
                />
                <Panel title="Where the money came from" description={`Processed through the platform in the last ${days} days. Deposits count only when no paid invoice carries them.`}>
                  <dl data-testid="gmv-split" className="grid grid-cols-2 gap-x-6 gap-y-3 text-meta sm:grid-cols-3 lg:grid-cols-6">
                    {(
                      [
                        ["Orders", d.period.gmvSplit.ordersCents],
                        ["Invoices", d.period.gmvSplit.invoicesCents],
                        ["Deposits", d.period.gmvSplit.depositsCents],
                        ["Tiffin", d.period.gmvSplit.tiffinCents],
                        ["Classes", d.period.gmvSplit.classesCents],
                        ["POS sales", d.period.gmvSplit.posCents],
                      ] as const
                    ).map(([label, cents]) => (
                      <div key={label}>
                        <dt className="text-label text-fg-muted">{label}</dt>
                        <dd className="text-body tabular text-fg">{formatMoney(cents)}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel>
                    <BarChart title="Stamps per week" subtitle="Last 12 weeks" valueLabel="Stamps" format={compact} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.stamps }))} />
                  </Panel>
                  <Panel>
                    <LineChart title="Active customers per week" subtitle="Last 12 weeks · a visit or a completed appointment" valueLabel="Customers" format={compact} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.activeCustomers }))} />
                  </Panel>
                </div>
              </div>
            </>
          );
        }}
      </ListAsync>
    </section>
  );
}

/** One line in the page header: is the API healthy (p95 and server errors over 24 hours)? Opens Performance. */
export function SystemStatus() {
  const s = useApi(() => browserApi.admin.cockpit.performance(24), []);
  if (!s.data) return null;
  const t = s.data.total;
  const slow = t.p95Ms >= 1000;
  const failing = t.errorRate >= 0.01;
  const ok = !slow && !failing;
  const p95 = t.p95Ms >= 1000 ? `${(t.p95Ms / 1000).toFixed(1)} s` : `${t.p95Ms} ms`;
  return (
    <QuietLink href="/admin/performance" chevron={false} className="inline-flex min-h-11 items-center gap-2 text-meta">
      <StatusPill tone={ok ? "positive" : "negative"}>{ok ? "API healthy" : slow ? "API slow" : "API errors"}</StatusPill>
      <span className="tabular text-fg-muted">p95 {p95} · {Math.round(t.errorRate * 10000) / 100}% errors, 24 h</span>
    </QuietLink>
  );
}
