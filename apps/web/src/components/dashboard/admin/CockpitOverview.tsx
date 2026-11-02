"use client";
/**
 * The founder's overview at the top of /admin (wave N, reworked in wave P for the Monday-morning check): the four numbers that matter
 * (signups this week, MRR, paying shops, trial to paid), then the three lists a founder acts on (shops at risk, who signed up, who
 * started paying), each row opening the business, then the two trends, then activity for the chosen window and where the money came
 * from. Numbers come from GET /v1/admin/cockpit and /v1/admin/health.
 *
 * Wave Q (kit): KPI tiles roll their numbers in (AnimatedNumber) with a delta chip and a 12-week area sparkline; the trends are area charts
 * with a tooltip and the period total; the money split is one composition bar; every list has a skeleton and a real empty state; the API
 * status is a live pill.
 */
import { useState } from "react";
import { CircleCheck, CreditCard, UserPlus } from "lucide-react";
import Link from "next/link";
import { Panel, QuietLink, RowList, Row } from "@/components/dashboard/kit";
import { ListError } from "@/components/dashboard/ListStates";
import { TrendChart } from "@/components/dashboard/admin/AdminCharts";
import { HealthPill, KpiGrid, PanelEmpty, RowSkeletons, moneyNum, pctNum, type KpiItem } from "@/components/dashboard/admin/AdminKit";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { relativeTime } from "@/lib/dashboard/time";
import { formatMoney, formatNumber } from "@/lib/format";
import { BusinessStatus, FLAG_LABEL, PeriodPicker, deltaLine, pct, planLabel, type Period } from "./cockpit";
import { Skeleton } from "@/components/ui/Skeleton";

/** Whole dollars from $1,000 up, so a tile number fits a phone column. */
const money0 = (c: number) => (c >= 100_000 ? `$${formatNumber(Math.round(c / 100))}` : formatMoney(c));
/** Axis ticks have about four characters: 1.6k, $18k. */
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : formatNumber(Math.round(n)));
const compactMoney = (c: number) => `$${compact(c / 100)}`;
/** Short week label for chart axes: "Oct 26". */
const weekLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

const AT_RISK_PREVIEW = 5;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Loading shape of the overview: four tiles, three lists, two charts (no layout jump when the numbers land). */
function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the overview" className="flex flex-col gap-6">
      <span className="sr-only">Loading the overview</span>
      <KpiGrid label="Growth" loading items={["Signups this week", "MRR", "Paying shops", "Trial to paid"].map((label) => ({ label, value: "" }))} />
      <div className="grid gap-6 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-card p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-44" />
            <div className="mt-4">
              <RowSkeletons rows={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SPLIT_TONES = ["bg-trade", "bg-trade/70", "bg-trade/50", "bg-trade/35", "bg-trade/22", "bg-trade/12"] as const;

/** Where the money came from: one composition bar (largest first) and the six amounts with their share. */
export function MoneySplit({ parts, testId }: { parts: readonly (readonly [string, number])[]; testId: string }) {
  const total = sum(parts.map(([, c]) => c));
  const ranked = [...parts].map(([l, c], i) => ({ l, c, i })).sort((a, b) => b.c - a.c);
  const tone = new Map(ranked.map((r, k) => [r.l, SPLIT_TONES[k] ?? SPLIT_TONES[5]]));
  return (
    <div className="flex flex-col gap-4">
      {total > 0 ? (
        <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {ranked.filter((r) => r.c > 0).map((r) => (
            <span key={r.l} className={`${tone.get(r.l)} h-full border-e-2 border-card last:border-e-0`} style={{ width: `${(r.c / total) * 100}%` }} />
          ))}
        </div>
      ) : null}
      <dl data-testid={testId} className="grid grid-cols-2 gap-x-6 gap-y-3 text-meta sm:grid-cols-3 lg:grid-cols-6">
        {parts.map(([label, cents]) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-label text-fg-muted">
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${total > 0 && cents > 0 ? tone.get(label) : "bg-muted"}`} />
              {label}
            </dt>
            <dd className="mt-0.5 text-body font-[550] tabular text-fg">
              {formatMoney(cents)}
              {total > 0 ? <span className="ms-1.5 text-caption font-normal text-fg-muted">{Math.round((cents / total) * 100)}%</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CockpitOverview() {
  const [days, setDays] = useState<Period>(30);
  const s = useApi(() => browserApi.admin.cockpit.overview(days), [days]);
  const health = useApi(() => browserApi.admin.cockpit.health(), []);
  const ctx = `vs previous ${days} days`;
  const d = s.data;
  return (
    <section aria-labelledby="cockpit-title" className="flex flex-col gap-6">
      <h2 id="cockpit-title" className="sr-only">
        Overview
      </h2>
      {s.error && !d ? (
        <ListError title="Couldn't load the overview. Reload the page to try again." detail={s.error} onRetry={s.reload} />
      ) : !d ? (
        <OverviewSkeleton />
      ) : (
        (() => {
          const plans = d.shops.payingByPlan;
          const planLine = [["Pro", plans.plus], ["Studio", plans.studio], ["Service", plans.pro], ["Restaurant", plans.restaurant]]
            .filter(([, n]) => (n as number) > 0)
            .map(([l, n]) => `${l} ${n}`)
            .join(" · ");
          const growth: KpiItem[] = [
            { label: "Signups this week", value: formatNumber(d.signupsWeek.current), num: d.signupsWeek.current, delta: deltaLine(d.signupsWeek, "vs last week"), caption: `${formatNumber(d.signupsWeek.previous)} last week`, href: "/admin/businesses?sort=signedUpAt", spark: d.weekly.map((w) => w.signups) },
            { label: "MRR", value: money0(d.money.mrrCents), ...moneyNum(d.money.mrrCents), caption: `ARR ${money0(d.money.arrCents)}`, href: "/admin/plans" },
            { label: "Paying shops", value: formatNumber(d.shops.paying), num: d.shops.paying, caption: planLine || "None yet", href: "/admin/businesses?status=paying" },
            { label: "Trial to paid", value: pct(d.money.trialToPaid.rate), ...pctNum(d.money.trialToPaid.rate ?? 0), caption: `${d.money.trialToPaid.converted} of ${d.money.trialToPaid.ended} ended trials · ${d.shops.trialing} in trial now`, href: "/admin/businesses?status=trial" },
          ];
          const atRisk = health.data?.atRisk ?? [];
          const signups12 = sum(d.weekly.map((w) => w.signups));
          const gmv12 = sum(d.weekly.map((w) => w.gmvCents));
          return (
            <>
              <KpiGrid label="Growth" items={growth} />

              {/* The three lists a founder acts on. Every row opens the business. */}
              <div className="grid items-start gap-6 lg:grid-cols-3">
                <Panel
                  title="Shops at risk"
                  description={health.data ? (atRisk.length ? `${atRisk.length} to call, most urgent first` : "Nobody is slipping") : "Checking…"}
                  action={health.data && atRisk.length > AT_RISK_PREVIEW ? <QuietLink href="/admin/health">All {atRisk.length}</QuietLink> : null}
                >
                  {health.data ? (
                    atRisk.length ? (
                      <RowList label="Shops at risk">
                        {atRisk.slice(0, AT_RISK_PREVIEW).map((r) => (
                          <Row
                            key={r.merchantId}
                            href={`/admin/businesses/${r.merchantId}`}
                            leading={<span aria-hidden className={`inline-flex size-2 rounded-full ring-4 ${r.flags[0] === "payment_failed" ? "bg-destructive ring-destructive-soft" : "bg-warning ring-warning-soft"}`} />}
                            title={r.name}
                            meta={`${FLAG_LABEL[r.flags[0]!]}. ${r.reasons[0] ?? ""}`}
                            trailing={r.mrrCents ? <span className="text-meta text-fg-muted">{formatMoney(r.mrrCents)}/mo</span> : null}
                          />
                        ))}
                      </RowList>
                    ) : (
                      <PanelEmpty icon={CircleCheck} tone="good" title="Nobody is slipping" description="No payment failures, stalled trials or usage drops right now." />
                    )
                  ) : health.error ? (
                    <ListError title="Couldn't check health." detail={health.error} onRetry={health.reload} />
                  ) : (
                    <RowSkeletons rows={4} label="Checking health" />
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
                    <PanelEmpty icon={UserPlus} title="No signups yet" description="New shops show here the minute they finish signup." action={<QuietLink href="/admin/funnel">Signup funnel</QuietLink>} />
                  )}
                </Panel>
                <Panel title="Started paying" description={`${formatNumber(d.shops.paying)} paying shops`} action={<QuietLink href="/admin/plans">Plans</QuietLink>}>
                  {d.recent.conversions.length ? (
                    <RowList label="Started paying">
                      {d.recent.conversions.map((r) => (
                        <Row key={r.id} href={`/admin/businesses/${r.id}`} title={r.name} meta={`${planLabel(r.plan)} · ${relativeTime(r.paidAt)}`} trailing={<span className="text-meta font-[550] text-fg">{formatMoney(r.mrrCents)}/mo</span>} />
                      ))}
                    </RowList>
                  ) : (
                    <PanelEmpty icon={CreditCard} title="No shop has paid yet" description="Trials that convert show here with their plan and MRR." action={<QuietLink href="/admin/businesses?status=trial">Shops in trial</QuietLink>} />
                  )}
                </Panel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                  <TrendChart title="Signups per week" subtitle="Last 12 weeks" valueLabel="Signups" format={compact} headline={`${formatNumber(signups12)} shops`} delta={deltaLine(d.signupsWeek, "this week vs last")} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.signups }))} />
                </Panel>
                <Panel>
                  <TrendChart title="Money processed per week" subtitle="Last 12 weeks, through the platform" valueLabel="Processed" format={compactMoney} headline={money0(gmv12)} delta={deltaLine(d.period.gmvCents, ctx)} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.gmvCents }))} />
                </Panel>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-headline font-bold text-fg">Activity</h3>
                    <p className="text-meta text-fg-muted">The last {days} days, compared with the {days} days before.</p>
                  </div>
                  <PeriodPicker value={days} onChange={setDays} />
                </div>
                <KpiGrid
                  label={`Activity, last ${days} days`}
                  size="sm"
                  items={[
                    { label: "Money processed", value: money0(d.period.gmvCents.current), ...moneyNum(d.period.gmvCents.current), delta: deltaLine(d.period.gmvCents, ctx) },
                    { label: "Stamps given", value: formatNumber(d.period.stamps.current), num: d.period.stamps.current, delta: deltaLine(d.period.stamps, ctx) },
                    { label: "Bookings", value: formatNumber(d.period.bookings.current), num: d.period.bookings.current, delta: deltaLine(d.period.bookings, ctx) },
                    { label: "Active customers", value: formatNumber(d.period.activeCustomers.current), num: d.period.activeCustomers.current, delta: deltaLine(d.period.activeCustomers, ctx) },
                  ]}
                />
                <KpiGrid
                  label="Shops"
                  size="sm"
                  items={[
                    { label: "New shops", value: formatNumber(d.period.signups.current), num: d.period.signups.current, delta: deltaLine(d.period.signups, ctx) },
                    { label: "Shops open", value: formatNumber(d.shops.total), num: d.shops.total, caption: `${formatNumber(d.shops.churned)} churned`, href: "/admin/businesses" },
                    { label: "Live", value: formatNumber(d.shops.live), num: d.shops.live, caption: d.shops.total ? `${Math.round((d.shops.live / d.shops.total) * 100)}% of shops` : undefined },
                    { label: "Activated", value: formatNumber(d.shops.activated), num: d.shops.activated, caption: `First stamp or booking${d.shops.total ? ` · ${Math.round((d.shops.activated / d.shops.total) * 100)}%` : ""}`, href: "/admin/onboarding" },
                  ]}
                />
                <Panel title="Where the money came from" description={`${formatMoney(d.period.gmvCents.current)} processed through the platform in the last ${days} days. Deposits count only when no paid invoice carries them.`}>
                  <MoneySplit
                    testId="gmv-split"
                    parts={[
                      ["Orders", d.period.gmvSplit.ordersCents],
                      ["Invoices", d.period.gmvSplit.invoicesCents],
                      ["Deposits", d.period.gmvSplit.depositsCents],
                      ["Tiffin", d.period.gmvSplit.tiffinCents],
                      ["Classes", d.period.gmvSplit.classesCents],
                      ["POS sales", d.period.gmvSplit.posCents],
                    ]}
                  />
                </Panel>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel>
                    <TrendChart title="Stamps per week" subtitle="Last 12 weeks" valueLabel="Stamps" format={compact} headline={formatNumber(sum(d.weekly.map((w) => w.stamps)))} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.stamps }))} />
                  </Panel>
                  <Panel>
                    <TrendChart title="Active customers per week" subtitle="Last 12 weeks · a visit or a completed appointment" valueLabel="Customers" format={compact} headline={formatNumber(d.weekly.at(-1)?.activeCustomers ?? 0)} data={d.weekly.map((w) => ({ label: weekLabel(w.weekStart), value: w.activeCustomers }))} />
                  </Panel>
                </div>
              </div>
            </>
          );
        })()
      )}
    </section>
  );
}

/** The page header's status: a live pill (API healthy / slow / errors) and p95 and errors over 24 hours. Opens Performance. */
export function SystemStatus() {
  const s = useApi(() => browserApi.admin.cockpit.performance(24), []);
  if (!s.data) return <Skeleton className="h-6 w-40 rounded-full" />;
  const t = s.data.total;
  const slow = t.p95Ms >= 1000;
  const failing = t.errorRate >= 0.01;
  const ok = !slow && !failing;
  const p95 = t.p95Ms >= 1000 ? `${(t.p95Ms / 1000).toFixed(1)} s` : `${t.p95Ms} ms`;
  return (
    <Link href="/admin/performance" className="inline-flex min-h-11 items-center gap-2 rounded-full pe-1 text-meta hover:text-fg focus-visible:focus-ring">
      <HealthPill tone={ok ? "ok" : failing ? "down" : "warn"} live={ok}>
        {ok ? "API healthy" : slow ? "API slow" : "API errors"}
      </HealthPill>
      <span className="tabular text-fg-muted max-sm:hidden">p95 {p95} · {Math.round(t.errorRate * 10000) / 100}% errors, 24 h</span>
    </Link>
  );
}
