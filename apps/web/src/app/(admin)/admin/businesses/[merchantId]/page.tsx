"use client";
/**
 * One business (wave N): its funnel (signed up → booking link live → first customer → first stamp → paid), usage per week, money
 * processed, plan and billing history, the landing page and variant it came from, and its health. Opening this page is written to
 * the audit log by the API (admin.business_viewed).
 */
import { Check, Circle } from "lucide-react";
import { useParams } from "next/navigation";
import type { adminCockpitApi } from "@ll/shared";
import { BackLink, DefList, PageHeader, Panel, StatBlock, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { BarChart, LineChart } from "@/components/dashboard/Charts";
import { Async } from "@/components/dashboard/PageStates";
import { BusinessStatus, FLAG_LABEL, planLabel } from "@/components/dashboard/admin/cockpit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

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
              <StatBlock
                items={[
                  { label: "MRR", value: r.mrrCents ? formatMoney(r.mrrCents) : "–", caption: planLabel(d.billing.plan) },
                  { label: "Processed, 30 days", value: formatMoney(d.gmv.last30.totalCents), caption: `${formatMoney(d.gmv.allTimeCents)} all time` },
                  { label: "Stamps, 30 days", value: formatNumber(r.stamps30d), caption: `${formatNumber(r.bookings30d)} bookings` },
                  { label: "Active customers, 30 days", value: formatNumber(r.activeCustomers30d), caption: r.lastActiveAt ? `Last active ${formatDate(r.lastActiveAt)}` : "Never active" },
                ]}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Progress" description="From signup to paying">
                  <ol className="flex flex-col gap-2" aria-label="Funnel progress">
                    {d.funnel.map((f) => (
                      <li key={f.key} className="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0">
                        {f.at ? <Check aria-hidden className="size-4 shrink-0 text-positive" strokeWidth={2.5} /> : <Circle aria-hidden className="size-4 shrink-0 text-fg-subtle" />}
                        <span className={f.at ? "flex-1 text-body text-fg" : "flex-1 text-body text-fg-muted"}>{STEP_LABEL[f.key]}</span>
                        <span className="text-meta tabular text-fg-muted">{f.at ? formatDate(f.at) : "Not yet"}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
                <div className="flex flex-col gap-6">
                <Panel title="Health" description={d.health.changePct === null ? `${d.health.usageThisWeek} stamps, bookings and logins this week` : `${d.health.usageThisWeek} this week, ${d.health.usageLastWeek} last week (${d.health.changePct > 0 ? "+" : ""}${d.health.changePct}%)`}>
                  {d.health.flags.length ? (
                    <ul className="flex flex-col gap-2" aria-label="Risk flags">
                      {d.health.flags.map((f, i) => (
                        <li key={f} className="text-meta">
                          <span className="font-medium text-fg">{FLAG_LABEL[f]}.</span> <span className="text-fg-muted">{d.health.detail[i]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-meta text-fg-muted">No risk flags.</p>
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
                  <BarChart title="Stamps per week" subtitle="Last 12 weeks" valueLabel="Stamps" data={d.usage.map((u) => ({ label: u.weekStart, value: u.stamps }))} />
                </Panel>
                <Panel>
                  <BarChart title="Bookings per week" subtitle="Last 12 weeks" valueLabel="Bookings" data={d.usage.map((u) => ({ label: u.weekStart, value: u.bookings }))} />
                </Panel>
                <Panel>
                  <BarChart title="Staff logins per week" subtitle="Last 12 weeks" valueLabel="Logins" data={d.usage.map((u) => ({ label: u.weekStart, value: u.logins }))} />
                </Panel>
                <Panel>
                  <LineChart title="Money processed per week" subtitle="Last 12 weeks" valueLabel="Processed" format={(c) => (c >= 100_000 ? `$${Math.round(c / 10_000) / 10}k` : `$${Math.round(c / 100)}`)} data={d.usage.map((u) => ({ label: u.weekStart, value: u.gmvCents }))} />
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
                            <Td>{sub.status.replace(/_/g, " ")}</Td>
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
                  <p className="px-4 py-4 text-meta text-fg-muted">No subscription yet.</p>
                )}
              </Panel>
              <Panel title="Money processed, 30 days" description={`${formatMoney(d.gmv.last30.totalCents)} in the last 30 days, ${formatMoney(d.gmv.allTimeCents)} all time`}>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-meta sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      ["Orders", d.gmv.last30.ordersCents],
                      ["Invoices", d.gmv.last30.invoicesCents],
                      ["Deposits", d.gmv.last30.depositsCents],
                      ["Tiffin", d.gmv.last30.tiffinCents],
                      ["Classes", d.gmv.last30.classesCents],
                      ["POS sales", d.gmv.last30.posCents],
                    ] as const
                  ).map(([label, cents]) => (
                    <div key={label}>
                      <dt className="text-label text-fg-muted">{label}</dt>
                      <dd className="text-body tabular text-fg">{formatMoney(cents)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </>
          );
        }}
      </Async>
    </div>
  );
}
