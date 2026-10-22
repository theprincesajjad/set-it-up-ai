"use client";
import { useState } from "react";
import { Row, RowList, Section, StatBlock } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { DateNav, Loader, monthLabel, todayISO } from "../common";

type Gate = { featureKey: "restaurant.tiffin"; title: string; what: string };
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;

export function RevenueTab({ gate }: { gate: Gate }) {
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
                { label: "Platform fee", value: formatMoney(r.platformFeeCents), caption: "Taken from collected payments" },
              ]}
            />
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
