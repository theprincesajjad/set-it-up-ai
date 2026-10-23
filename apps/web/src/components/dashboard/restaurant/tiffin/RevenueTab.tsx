"use client";
import { useState } from "react";
import { Meter, Row, RowList, Section, StatBlock } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { DateNav, Loader, monthLabel, todayISO } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;

const METHOD_LABEL: Record<string, string> = { etransfer: "Interac e-transfer (recorded)", card: "Card", pad: "Pre-authorized debit", cash: "Cash", cheque: "Cheque", other: "Other" };

export function RevenueTab({ gate, openAwaiting }: { gate: Gate; openAwaiting?: () => void }) {
  const { api } = useMerchant();
  const [month, setMonth] = useState(`${todayISO().slice(0, 7)}-01`);
  const state = useApi(() => api.tiffin.revenue(month.slice(0, 7)), [api, month]);
  return (
    <div className="flex flex-col gap-6">
      <DateNav label="Month" value={month} text={monthLabel(month)} onChange={(m) => setMonth(`${m.slice(0, 7)}-01`)} unit="month" showToday={false} />
      <Loader state={state} gate={gate} rows={5}>
        {(r) => (
          <>
            <StatBlock
              label="Subscribers"
              cols={4}
              items={[
                { label: "Monthly recurring revenue", value: formatMoney(r.mrrCents), caption: "Active and past due; weekly plans counted as 52 weeks a year" },
                { label: "Active subscribers", value: formatNumber(r.activeSubscribers), caption: `${r.newThisMonth} new this month` },
                { label: "Paused", value: formatNumber(r.pausedSubscribers), caption: "Away or on a break" },
                { label: "Past due", value: formatNumber(r.pastDueSubscribers), caption: r.pastDueSubscribers ? "Payment failed, meals on hold" : "Everyone is paid up", delta: r.pastDueSubscribers ? { text: "Needs a look", good: false } : null },
              ]}
            />
            <StatBlock
              label="This month"
              cols={4}
              items={[
                { label: "Collected", value: formatMoney(r.collectedCents) },
                { label: "Skip credits given", value: formatMoney(r.creditsCents), caption: `Skip rate ${pct(r.skipRate)} of meal days` },
                { label: "Churn", value: pct(r.churnRate), caption: `${r.churnedThisMonth} cancelled` },
                { label: "Platform fee", value: formatMoney(r.platformFeeCents), caption: "1% of payments made in the app" },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-label="Collected by method" className="rounded-card border border-line p-5">
                <h3 className="text-headline text-fg">Collected this month by how they paid</h3>
                {r.collectedByMethod.length ? (
                  <ul className="mt-3 flex flex-col gap-3">
                    {r.collectedByMethod.map((m) => (
                      <li key={m.method}>
                        <div className="flex items-baseline justify-between gap-3 text-body text-fg">
                          <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                          <span className="tabular text-meta text-fg-muted">{formatMoney(m.cents)} · {m.count} {m.count === 1 ? "payment" : "payments"}</span>
                        </div>
                        <Meter className="mt-1.5" value={m.cents} max={Math.max(1, r.collectedByMethod.reduce((a, x) => a + x.cents, 0))} label={`${METHOD_LABEL[m.method] ?? m.method}: ${formatMoney(m.cents)}`} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-meta text-fg-muted">Nothing collected in {monthLabel(month)} yet.</p>
                )}
                <p className="mt-4 border-t border-line pt-3 text-meta text-fg-muted">
                  Platform fee {formatMoney(r.platformFeeCents)} (1% of payments made in the app). Payments you record by hand carry no fee.
                </p>
              </section>
              <section aria-label="Still to come in" className="rounded-card border border-line p-5">
                <h3 className="text-headline text-fg">Still to come in</h3>
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  <li className="flex items-center justify-between gap-3 py-3 text-body"><span className="flex items-center gap-2"><span aria-hidden className="size-1.5 rounded-full bg-location" />Awaiting e-transfer or cash</span><span className="tabular text-meta text-fg-muted">{r.awaitingCount} · {formatMoney(r.awaitingCents)}</span></li>
                  <li className="flex items-center justify-between gap-3 py-3 text-body"><span className="flex items-center gap-2"><span aria-hidden className="size-1.5 rounded-full bg-negative" />Past due</span><span className="tabular text-meta text-fg-muted">{r.pastDueSubscribers} · {formatMoney(r.pastDueCents)}</span></li>
                  <li className="flex items-center justify-between gap-3 py-3 text-body"><span className="flex items-center gap-2"><span aria-hidden className="size-1.5 rounded-full bg-fg-subtle" />Bank debit in flight</span><span className="tabular text-meta text-fg-muted">{formatMoney(r.inFlightCents)}</span></li>
                </ul>
                {openAwaiting ? <Button size="sm" variant="secondary" className="mt-2" onClick={openAwaiting}>Open the list</Button> : null}
              </section>
            </div>
            <Section title="By plan">
              {r.byPlan.length ? (
                <RowList label="Revenue by plan">
                  {r.byPlan.map((p) => (
                    <Row key={p.planId} title={p.planName} meta={`${p.activeSubscribers} active`} trailing={formatMoney(p.mrrCents)} />
                  ))}
                </RowList>
              ) : (
                <p className="border-y border-line py-6 text-meta text-fg-muted">No active subscribers in {monthLabel(month)} yet. Once someone subscribes, each plan&apos;s share shows up here.</p>
              )}
            </Section>
          </>
        )}
      </Loader>
    </div>
  );
}
