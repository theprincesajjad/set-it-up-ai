"use client";
/**
 * One business (wave N): its funnel (signed up → booking link live → first customer → first stamp → paid), usage per week, money
 * processed, plan and billing history, the landing page and variant it came from, and its health. Opening this page is written to
 * the audit log by the API (admin.business_viewed).
 */
import { BadgeCheck, CircleDollarSign, Link2, Stamp, UserPlus, UserRound } from "lucide-react";
import { useParams } from "next/navigation";
import type { adminCockpitApi } from "@ll/shared";
import { BackLink, DefList, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { BarChart } from "@/components/dashboard/Charts";
import { TrendChart } from "@/components/dashboard/admin/AdminCharts";
import { HealthPill, KpiGrid, PanelEmpty, moneyNum } from "@/components/dashboard/admin/AdminKit";
import { HistoryTimeline } from "@/components/dashboard/admin/AdminTimeline";
import { MoneySplit } from "@/components/dashboard/admin/CockpitOverview";
import { Async } from "@/components/dashboard/PageStates";
import { BusinessStatus, FLAG_LABEL, planLabel } from "@/components/dashboard/admin/cockpit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const STEP_ICON = { signed_up: UserPlus, booking_link_live: Link2, first_customer: UserRound, first_stamp: Stamp, paid: CircleDollarSign } as const;
const weekLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

const STEP_LABEL: Record<adminCockpitApi.FunnelStepKey, string> = {
  signed_up: "Signed up",
  booking_link_live: "Booking link live",
  first_customer: "First customer",
  first_stamp: "First stamp",
  paid: "Paid",
};

export default function AdminBusinessPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const s = useApi(() => browserApi.admin.cockpit.business(merchantId), [merchantId]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin/businesses">Businesses</BackLink>
      <Async state={s}>
        {(d) => {
          const r = d.row;
          const a = d.attribution;
          return (
            <>
              <PageHeader
                title={r.name}
                description={
                  <span className="flex flex-wrap items-center gap-3">
                    <BusinessStatus status={r.status} />
                    <span>{verticalLabel(r.trade)}</span>
                    <span>{planLabel(r.plan)} plan</span>
                    {r.city ? <span>{r.city}</span> : null}
                  </span>
                }
                actions={
                  <Button size="sm" variant="secondary" href={`/admin/merchants/${r.id}`}>
                    Support tools
                  </Button>
                }
              />
              {d.health.flags.length ? (
                <Banner tone={d.health.flags.includes("payment_failed") ? "danger" : "warning"} title={`At risk: ${d.health.flags.map((f) => FLAG_LABEL[f].toLowerCase()).join(", ")}`} action={<Button size="sm" variant="secondary" href={`/admin/merchants/${r.id}`}>Open support tools</Button>}>
                  {d.health.detail.join(" ")}
                </Banner>
              ) : null}
              <KpiGrid
                label="Key numbers"
                items={[
                  { label: "MRR", value: r.mrrCents ? formatMoney(r.mrrCents) : "–", ...(r.mrrCents ? moneyNum(r.mrrCents) : {}), caption: `${planLabel(d.billing.plan)} plan` },
                  { label: "Processed, 30 days", value: formatMoney(d.gmv.last30.totalCents), ...moneyNum(d.gmv.last30.totalCents), caption: `${formatMoney(d.gmv.allTimeCents)} all time`, spark: d.usage.map((u) => u.gmvCents) },
                  { label: "Stamps, 30 days", value: formatNumber(r.stamps30d), num: r.stamps30d, caption: `${formatNumber(r.bookings30d)} bookings`, spark: d.usage.map((u) => u.stamps) },
                  { label: "Active customers, 30 days", value: formatNumber(r.activeCustomers30d), num: r.activeCustomers30d, caption: r.lastActiveAt ? `Last active ${formatDate(r.lastActiveAt)}` : "Never active" },
                ]}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Progress" description="From signup to paying">
                  <HistoryTimeline
                    label="Funnel progress"
                    grouped={false}
                    entries={d.funnel.map((f) => ({
                      id: f.key,
                      at: f.at,
                      icon: STEP_ICON[f.key] ?? BadgeCheck,
                      state: f.at ? ("done" as const) : ("pending" as const),
                      title: STEP_LABEL[f.key],
                      trailing: f.at ? formatDate(f.at) : "Not yet",
                    }))}
                  />
                </Panel>
                <div className="flex flex-col gap-6">
                <Panel title="Health" action={<HealthPill tone={d.health.flags.includes("payment_failed") ? "down" : d.health.flags.length ? "warn" : "ok"}>{d.health.flags.length ? "At risk" : "Healthy"}</HealthPill>} description={d.health.changePct === null ? `${d.health.usageThisWeek} stamps, bookings and logins this week` : `${d.health.usageThisWeek} this week, ${d.health.usageLastWeek} last week (${d.health.changePct > 0 ? "+" : ""}${d.health.changePct}%)`}>
                  {d.health.flags.length ? (
                    <ul className="flex flex-col gap-2" aria-label="Risk flags">
                      {d.health.flags.map((f, i) => (
                        <li key={f} className="text-meta">
                          <span className={f === "payment_failed" ? "font-medium text-destructive-text" : "font-medium text-fg"}>{FLAG_LABEL[f]}.</span> <span className="text-fg-muted">{d.health.detail[i]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-meta text-fg-muted">No risk flags: payments are fine and usage is steady.</p>
                  )}
                </Panel>
                <Panel title="Where they came from" description={a.matchedVisit ? "Matched to their landing visit" : a.landingPage || a.source ? "From the signup's own source" : "No landing visit on record (a rep, a referral, or counting was off)"}>
                  <DefList
                    items={[
                      { label: "Landing page", value: a.landingPage ?? "–" },
                      { label: "Variant", value: a.variant ? `${a.variant}${a.experimentId ? ` (${a.experimentId})` : ""}` : "–" },
                      { label: "Source", value: a.source ?? a.utmSource ?? "–" },
                      { label: "UTM", value: [a.utmSource, a.utmMedium, a.utmCampaign].some(Boolean) ? [a.utmSource, a.utmMedium, a.utmCampaign].map((x) => x ?? "–").join(" / ") : "–" },
                      { label: "Device", value: a.device ?? "–" },
                    ]}
                  />
                </Panel>
                </div>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                  <BarChart title="Stamps per week" subtitle="Last 12 weeks" valueLabel="Stamps" data={d.usage.map((u) => ({ label: weekLabel(u.weekStart), value: u.stamps }))} />
                </Panel>
                <Panel>
                  <BarChart title="Bookings per week" subtitle="Last 12 weeks" valueLabel="Bookings" data={d.usage.map((u) => ({ label: weekLabel(u.weekStart), value: u.bookings }))} />
                </Panel>
                <Panel>
                  <BarChart title="Staff logins per week" subtitle="Last 12 weeks" valueLabel="Logins" data={d.usage.map((u) => ({ label: weekLabel(u.weekStart), value: u.logins }))} />
                </Panel>
                <Panel>
                  <TrendChart title="Money processed per week" subtitle="Last 12 weeks" valueLabel="Processed" headline={formatMoney(d.usage.reduce((a, u) => a + u.gmvCents, 0))} format={(c) => (c >= 100_000 ? `$${Math.round(c / 10_000) / 10}k` : `$${Math.round(c / 100)}`)} data={d.usage.map((u) => ({ label: weekLabel(u.weekStart), value: u.gmvCents }))} />
                </Panel>
              </div>
              <Panel title="Plan and billing" description={d.billing.trial ? `Trial of ${planLabel(d.billing.trial.plan ?? "plus")}${d.billing.trial.startedAt ? ` from ${formatDate(d.billing.trial.startedAt)}` : ""}${d.billing.trial.endsAt ? ` to ${formatDate(d.billing.trial.endsAt)}` : ""}` : "No trial"} padded={false}>
                {d.billing.subscriptions.length ? (
                  <div className="overflow-x-auto">
                    <Table label="Subscriptions">
                      <thead>
                        <tr>
                          <Th className="md:static">Plan</Th>
                          <Th className="md:static">Status</Th>
                          <Th className="md:static">Billed</Th>
                          <Th className="md:static">Started</Th>
                          <Th className="md:static">Period ends</Th>
                          <Th align="end" className="md:static">MRR</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.billing.subscriptions.map((sub) => (
                          <Tr key={sub.id}>
                            <Td>{sub.restaurantTier ? `Restaurant ${sub.restaurantTier}` : planLabel(sub.plan)}</Td>
                            <Td>
                              <HealthPill size="sm" tone={sub.status === "active" ? "ok" : sub.status === "trialing" ? "info" : sub.status === "past_due" || sub.status === "unpaid" ? "down" : "neutral"}>
                                {sub.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
                              </HealthPill>
                            </Td>
                            <Td>{sub.interval === "year" ? "Yearly" : "Monthly"}</Td>
                            <Td>{formatDate(sub.createdAt)}</Td>
                            <Td>{sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "–"}</Td>
                            <Td align="end" className="tabular">
                              {formatMoney(sub.mrrCents)}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  <PanelEmpty icon={CircleDollarSign} title="No subscription yet" description={d.billing.trial ? "They are on a trial. A paid plan shows here when they subscribe." : "They are on Free. A paid plan shows here when they subscribe."} />
                )}
              </Panel>
              <Panel title="Money processed, 30 days" description={`${formatMoney(d.gmv.last30.totalCents)} in the last 30 days, ${formatMoney(d.gmv.allTimeCents)} all time`}>
                <MoneySplit
                  testId="business-gmv-split"
                  parts={[
                    ["Orders", d.gmv.last30.ordersCents],
                    ["Invoices", d.gmv.last30.invoicesCents],
                    ["Deposits", d.gmv.last30.depositsCents],
                    ["Tiffin", d.gmv.last30.tiffinCents],
                    ["Classes", d.gmv.last30.classesCents],
                    ["POS sales", d.gmv.last30.posCents],
                  ]}
                />
              </Panel>
            </>
          );
        }}
      </Async>
    </div>
  );
}
