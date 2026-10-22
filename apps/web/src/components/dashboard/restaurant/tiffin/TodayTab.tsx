"use client";
import { Printer } from "lucide-react";
import type { tiffinApi } from "@ll/shared";
import { EmptyState, Section, StatBlock, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { DateNav, Loader, dayLabel, dietaryWords, todayISO } from "../common";

/** Kitchen count for one day: servings per plan after skips and pauses, the menu, delivery vs pickup, and dietary notes. */
export function TodayTab({ goPlans, gate }: { goPlans: () => void; gate: { featureKey: "restaurant.tiffin"; title: string; what: string } }) {
  const { api } = useMerchant();
  const [date, setDate] = useState(todayISO());
  const state = useApi(() => api.tiffin.kitchen(date), [api, date]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav label="Kitchen day" value={date} onChange={setDate} />
        <Button size="sm" variant="secondary" iconStart={Printer} className="print:hidden" onClick={() => window.print()} disabled={!state.data?.plans.length}>
          Print kitchen sheet
        </Button>
      </div>
      <h2 className="hidden text-title text-fg print:block">Kitchen count, {dayLabel(date)}</h2>
      <Loader state={state} gate={gate} rows={5}>
        {(d) =>
          d.plans.length === 0 ? (
            <EmptyState
              title={`Nothing to cook on ${dayLabel(date)}`}
              description="No active plan runs that day, or everyone has skipped. Plans decide which days of the week meals go out."
              action={
                <Button size="sm" onClick={goPlans}>
                  Set up a plan
                </Button>
              }
            />
          ) : (
            <Kitchen d={d} />
          )
        }
      </Loader>
    </div>
  );
}

function Kitchen({ d }: { d: tiffinApi.KitchenResponse }) {
  const t = d.totals;
  return (
    <>
      <StatBlock
        label="Kitchen totals"
        cols={4}
        items={[
          { label: "Servings to cook", value: formatNumber(t.servings), caption: t.skippedServings ? `${formatNumber(t.skippedServings)} skipped or paused` : "No skips today" },
          { label: "Subscribers", value: formatNumber(t.subscribers) },
          { label: "Delivery", value: formatNumber(t.deliveryServings), caption: "servings on the road" },
          { label: "Pickup", value: formatNumber(t.pickupServings), caption: "servings at the counter" },
        ]}
      />
      <div className="flex flex-col">
        {d.plans.map((p) => (
          <Section key={p.planId} className="break-inside-avoid border-t border-line py-5 first:border-t-0 first:pt-0" id={`plan-${p.planId}`}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8">
              <div>
                <h3 className="text-body-strong text-fg">{p.planName}</h3>
                <p className="mt-1 text-[30px] font-semibold leading-9 tracking-[-0.01em] tabular text-fg">
                  {formatNumber(p.servings)} <span className="text-meta font-normal text-fg-muted">{p.servings === 1 ? "serving" : "servings"}</span>
                </p>
                <p className="mt-1 text-meta text-fg-muted">
                  {formatNumber(p.deliveryServings)} delivery · {formatNumber(p.pickupServings)} pickup · {formatNumber(p.subscribers)} {p.subscribers === 1 ? "subscriber" : "subscribers"}
                </p>
                {p.skippedServings ? <p className="text-meta text-fg-muted">{formatNumber(p.skippedServings)} skipped or paused</p> : null}
              </div>
              <div className="min-w-0">
                <h4 className="text-meta-strong text-fg">Today&apos;s menu</h4>
                {p.menu.length ? (
                  <ul className="mt-1 divide-y divide-line border-y border-line">
                    {p.menu.map((m, i) => (
                      <li key={`${m.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="text-body text-fg">{m.name}</span>
                        {m.description ? <span className="text-meta text-fg-muted">{m.description}</span> : null}
                        <span className="ms-auto flex flex-wrap gap-1">
                          {dietaryWords(m.dietary).map((w) => (
                            <Tag key={w}>{w}</Tag>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-meta text-fg-muted">No menu set for this day. Add one in the Menus tab so customers see what&apos;s coming.</p>
                )}
                {p.menuNotes ? <p className="mt-2 text-meta text-fg-muted">{p.menuNotes}</p> : null}
                {p.dietaryNotes.length ? (
                  <>
                    <h4 className="mt-4 text-meta-strong text-fg">Dietary notes</h4>
                    <ul className="mt-1 divide-y divide-line border-y border-line">
                      {p.dietaryNotes.map((n) => (
                        <li key={n.subscriptionId} className="flex flex-wrap items-baseline gap-x-3 py-2 text-meta">
                          <span className="font-medium text-fg">{n.customer ?? "Subscriber"}</span>
                          <span className="tabular text-fg-muted">{n.servings} {n.servings === 1 ? "serving" : "servings"}</span>
                          <span className="min-w-0 basis-full text-fg sm:basis-auto sm:flex-1">{n.note}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          </Section>
        ))}
      </div>
    </>
  );
}
