"use client";
import { Printer } from "lucide-react";
import type { paymentsManualApi, tiffinApi } from "@ll/shared";
import { EmptyState, Meter, Section, StatBlock, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { cutoffSentence, groupDietNotes } from "@/lib/restaurant/tcb";
import { DateNav, Loader, dayLabel, dietaryWords, todayISO } from "../common";

export type TodayGo = "plans" | "subscribers-awaiting" | "subscribers-past-due" | "routes" | "deliveries" | "revenue";

/**
 * The kitchen's morning screen (design T1): what to cook, how many meals are handed over, money waiting to be
 * confirmed, the cutoff clock, who needs the kitchen, and the driver run. Plan sections keep the per-plan menu with prep totals.
 */
export function TodayTab({ goPlans, go, gate }: { goPlans: () => void; go: (to: TodayGo) => void; gate: { featureKey: "restaurant.tiffin"; title: string; what: string } }) {
  const { api } = useMerchant();
  const [date, setDate] = useState(todayISO());
  const state = useApi(() => api.tiffin.kitchen(date), [api, date]);
  const awaiting = useApi(() => api.tiffin.awaiting(), [api]);
  const revenue = useApi(() => api.tiffin.revenue(), [api]);
  const d0 = state.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav label="Kitchen day" value={date} onChange={setDate} />
        <div className="flex flex-wrap items-center gap-2">
          {d0?.nextCutoffAt && d0.nextMealDate ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-bg-subtle px-3 py-1.5 text-meta text-fg print:hidden">
              <span aria-hidden className="size-1.5 rounded-full bg-location" />
              {cutoffSentence(d0.nextCutoffAt, d0.nextMealDate)}
            </span>
          ) : null}
          <Button size="sm" variant="secondary" iconStart={Printer} className="print:hidden" onClick={() => window.print()} disabled={!state.data?.plans.length}>
            Print kitchen sheet
          </Button>
        </div>
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
            <Kitchen d={d} go={go} awaiting={awaiting.data ?? undefined} revenue={revenue.data ?? undefined} />
          )
        }
      </Loader>
    </div>
  );
}

/** Tags every dish on the menu shares (all vegetarian, all Jain) are said once, not per dish. */
function sharedWords(menu: tiffinApi.MenuItem[]): string[] {
  if (menu.length < 2) return [];
  const sets = menu.map((m) => dietaryWords(m.dietary));
  return sets[0]!.filter((w) => sets.every((x) => x.includes(w)));
}

const PER_RE = /\s*\(\d{1,2}\)\s*$/;
const noun = (name: string) => name.replace(PER_RE, "").trim().toLowerCase();

function Kitchen({ d, go, awaiting, revenue }: { d: tiffinApi.KitchenResponse; go: (to: TodayGo) => void; awaiting?: paymentsManualApi.AwaitingResponse; revenue?: tiffinApi.RevenueResponse }) {
  const t = d.totals;
  const handed = d.routes.reduce((a, r) => a + r.total, 0);
  const lead = d.routes.find((r) => r.id !== null && r.total > 0);
  const oldest = awaiting?.items[0];
  const needs: { key: string; tone: "accent" | "info" | "negative"; title: string; meta: string; action: string; to: TodayGo }[] = [];
  if (d.unrouted > 0) needs.push({ key: "unrouted", tone: "accent", title: `${formatNumber(d.unrouted)} ${d.unrouted === 1 ? "subscriber has" : "subscribers have"} no route yet`, meta: "Delivery subscribers need a route before they can go on a run.", action: "Assign", to: "routes" });
  if (d.awaiting.count > 0) needs.push({ key: "awaiting", tone: "info", title: "Waiting for e-transfer", meta: `${formatNumber(d.awaiting.count)} ${d.awaiting.count === 1 ? "subscriber" : "subscribers"} · ${formatMoney(d.awaiting.cents)}${oldest ? `. Oldest: ${formatDate(oldest.since)}` : ""}`, action: "Record", to: "subscribers-awaiting" });
  if (d.pastDue > 0) needs.push({ key: "pastdue", tone: "negative", title: `${formatNumber(d.pastDue)} ${d.pastDue === 1 ? "subscriber is" : "subscribers are"} past due`, meta: "Meals are on hold until they pay.", action: "Open", to: "subscribers-past-due" });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <StatBlock tiles
          label="Kitchen totals"
          cols={4}
          items={[
            { label: "Servings to cook", value: formatNumber(t.servings), caption: t.skippedServings ? `${formatNumber(t.skippedServings)} skipped or paused` : "No skips today" },
            { label: "Delivered", value: `${formatNumber(d.delivered)} / ${formatNumber(handed)}`, caption: lead ? `${lead.done} of ${lead.total} on ${lead.name}` : d.outForDelivery ? `${d.outForDelivery} out for delivery` : "Nothing out yet" },
            { label: "Pickup at counter", value: formatNumber(t.pickupServings), caption: "servings" },
            {
              label: "Money to confirm",
              value: formatMoney(d.awaiting.cents),
              caption: d.awaiting.count ? (
                <button type="button" onClick={() => go("subscribers-awaiting")} className="text-location underline-offset-4 hover:underline focus-visible:focus-ring">
                  {d.awaiting.count} {d.awaiting.count === 1 ? "e-transfer" : "e-transfers"} awaiting
                </button>
              ) : (
                "Nothing waiting"
              ),
            },
          ]}
        />
        <div className="flex flex-col">
          {d.plans.map((p) => (
            <Section key={p.planId} className="break-inside-avoid border-t border-line py-5 first:border-t-0 first:pt-0" id={`plan-${p.planId}`}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,13rem)_1fr] md:gap-8">
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
                  {sharedWords(p.menu).length ? <p className="mt-0.5 text-meta text-fg-muted">Every dish: {sharedWords(p.menu).join(", ").toLowerCase()}</p> : null}
                  {p.menu.length ? (
                    <ul className="mt-1 divide-y divide-line border-y border-line">
                      {p.menu.map((m, i) => {
                        const per = m.perServing ?? (/\((\d{1,2})\)\s*$/.exec(m.name)?.[1] ? Number(/\((\d{1,2})\)\s*$/.exec(m.name)![1]) : null);
                        return (
                          <li key={`${m.name}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                            <span className="text-body text-fg">{m.name.replace(PER_RE, "")}{per ? ` (${per} each)` : ""}</span>
                            {m.description ? <span className="text-meta text-fg-muted">{m.description}</span> : null}
                            <span className="ms-auto flex flex-wrap items-center gap-1">
                              {dietaryWords(m.dietary).filter((w) => !sharedWords(p.menu).includes(w)).map((w) => (
                                <Tag key={w}>{w}</Tag>
                              ))}
                              <span className="ps-2 text-meta tabular text-fg-muted">{per ? `${formatNumber(per * p.servings)} ${noun(m.name)}` : `pack ${formatNumber(p.servings)}`}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-meta text-fg-muted">No menu set for this day. Add one in the Menus tab so customers see what&apos;s coming.</p>
                  )}
                  {p.menuNotes ? <p className="mt-2 text-meta text-fg-muted">{p.menuNotes}</p> : null}
                  {groupDietNotes(p.dietaryNotes).map((g) => (
                    <p key={g.note} className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-meta">
                      <Tag tone={g.diet ? undefined : "accent"}>{g.diet ? "Diet" : "Allergy"}</Tag>
                      <span className="min-w-0 text-fg">{g.note}: {g.people.join(", ")}</span>
                    </p>
                  ))}
                </div>
              </div>
            </Section>
          ))}
          {d.prep.length ? (
            <Section title="Prep for the whole kitchen" description="Every plan together" className="border-t border-line py-5">
              <ul className="divide-y divide-line border-y border-line">
                {d.prep.map((x) => (
                  <li key={x.dish} className="flex items-baseline justify-between gap-3 py-2 text-body">
                    <span className="text-fg">{x.dish}</span>
                    <span className="tabular text-meta text-fg-muted">{x.pieces ? `${formatNumber(x.pieces)} ${x.dish.toLowerCase()}` : `pack ${formatNumber(x.packs)}`}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
      <aside className="order-first flex min-w-0 flex-col gap-4 print:hidden lg:order-none" aria-label="Needs you and driver run">
        <section className="rounded-card bg-card shadow-card p-5">
          <h3 className="text-headline text-fg">Needs you</h3>
          {needs.length ? (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {needs.map((n) => (
                <li key={n.key} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-body-strong text-fg">
                      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${n.tone === "accent" ? "bg-points" : n.tone === "info" ? "bg-location" : "bg-negative"}`} />
                      {n.title}
                    </p>
                    <p className="mt-0.5 ps-3.5 text-meta text-fg-muted">{n.meta}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => go(n.to)}>{n.action}</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">Nothing needs you right now.</p>
          )}
        </section>
        <section className="rounded-card bg-card shadow-card p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-headline text-fg">Driver run</h3>
            <button type="button" onClick={() => go("deliveries")} className="text-meta text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:focus-ring">Open</button>
          </div>
          {d.routes.length ? (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {d.routes.map((r) => (
                <li key={r.id ?? r.name} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body text-fg">{r.name}</span>
                    <span className="tabular text-meta text-fg-muted">{r.done} / {r.total}</span>
                  </div>
                  {r.driver ? <p className="text-meta text-fg-muted">{r.driver}</p> : null}
                  <Meter className="mt-1.5" value={r.done} max={Math.max(1, r.total)} label={`${r.name}: ${r.done} of ${r.total} handed over`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">No runs yet today. Deliveries appear once the day&apos;s list is made.</p>
          )}
        </section>
        {revenue ? (
          <section className="rounded-card bg-card shadow-card p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-meta text-fg-muted">{new Date(`${revenue.month}-01T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" })}</p>
              <button type="button" onClick={() => go("revenue")} className="text-meta text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:focus-ring">Revenue</button>
            </div>
            <p className="mt-1 text-[30px] font-semibold leading-9 tracking-[-0.01em] tabular text-fg">{formatMoney(revenue.mrrCents)}</p>
            <p className="mt-1 text-meta text-fg-muted">monthly recurring · {formatMoney(revenue.collectedCents)} collected</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
