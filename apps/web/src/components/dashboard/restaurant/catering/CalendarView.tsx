"use client";
import { useState } from "react";
import Link from "next/link";
import type { restaurantApi } from "@ll/shared";
import { EmptyState, Row, RowList } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { DOW_SHORT, DateNav, Loader, dayLabel, monthGrid, monthLabel, monthEndISO, monthStartISO, todayISO } from "../common";
import { EVENT_TYPE_LABEL } from "./labels";

type Gate = { featureKey: "restaurant.catering"; title: string; what: string };
const HEAD = [1, 2, 3, 4, 5, 6, 0];

/** Month grid of confirmed events, with guests per day so the kitchen can see a crunch coming. */
export function CalendarView({ gate }: { gate: Gate }) {
  const { api, base } = useMerchant();
  const [month, setMonth] = useState(monthStartISO(todayISO()));
  const [sel, setSel] = useState<string | null>(null);
  const grid = monthGrid(month);
  const state = useApi(() => api.catering.calendar(grid[0]!, grid[grid.length - 1]!), [api, month]);
  const today = todayISO();
  return (
    <div className="flex flex-col gap-4">
      <DateNav label="Month" value={month} unit="month" text={monthLabel(month)} onChange={(d) => { setMonth(monthStartISO(d)); setSel(null); }} showToday={false} />
      <Loader state={state} gate={gate} rows={6}>
        {(d: restaurantApi.CateringCalendarResponse) => {
          const byDay = new Map(d.days.map((x) => [x.date, x]));
          const events = (day: string) => d.items.filter((e) => e.eventDate === day);
          const selDay = sel ?? (byDay.has(today) && today.startsWith(month.slice(0, 7)) ? today : null);
          return (
            <>
              <div role="group" aria-label={`Confirmed events, ${monthLabel(month)}`} className="grid grid-cols-7 border-s border-t border-line">
                {HEAD.map((i) => (
                  <div key={i} className="border-e border-b border-line bg-bg-subtle py-1.5 text-center text-caption font-medium text-fg-muted">{DOW_SHORT[i]}</div>
                ))}
                {grid.map((day) => {
                  const inMonth = day >= month && day <= monthEndISO(month);
                  const info = byDay.get(day);
                  const on = selDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                     
                      aria-label={`${dayLabel(day)}${info ? `, ${info.events} ${info.events === 1 ? "event" : "events"}, ${info.headcount} guests` : ", nothing booked"}`}
                      aria-pressed={on}
                      onClick={() => setSel(day)}
                      className={cn("flex min-h-14 flex-col items-start gap-0.5 border-e border-b border-line p-1.5 text-start hover:bg-bg-subtle focus-visible:focus-ring sm:min-h-[84px] sm:p-2", !inMonth && "bg-bg-subtle/60 text-fg-subtle", on && "bg-bg-muted")}
                    >
                      <span className={cn("text-meta tabular", day === today ? "inline-flex size-6 items-center justify-center rounded-full bg-fg font-medium text-bg" : inMonth ? "text-fg" : "text-fg-subtle")}>{Number(day.slice(8))}</span>
                      {info ? (
                        <>
                          <span className="text-caption font-medium tabular text-fg sm:text-meta">{formatNumber(info.headcount)}<span className="hidden text-fg-muted sm:inline"> guests</span></span>
                          <span className="hidden text-caption text-fg-muted sm:inline">{info.events} {info.events === 1 ? "event" : "events"}</span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-meta text-fg-muted">Confirmed events only. The number under each date is guests.</p>
              {selDay ? (
                events(selDay).length ? (
                  <RowList label={`Events on ${dayLabel(selDay)}`}>
                    {events(selDay).map((e) => (
                      <Row key={e.id} href={`${base}/restaurant/catering/${e.id}`} title={`${EVENT_TYPE_LABEL[e.eventType]}${e.customer?.name ? `, ${e.customer.name}` : ""}`} meta={`${e.startTime ?? "Time to confirm"} · ${e.venueName ?? "Venue to confirm"}`} trailing={`${formatNumber(e.headcount)} guests`} />
                    ))}
                  </RowList>
                ) : (
                  <p className="border-y border-line py-4 text-meta text-fg-muted">Nothing confirmed on {dayLabel(selDay)}.</p>
                )
              ) : d.items.length === 0 ? (
                <EmptyState title={`No confirmed events in ${monthLabel(month)}`} description="Events show here once the customer approves the quote and the deposit is in." action={<Link href={`${base}/restaurant/catering`} className="text-meta font-medium text-fg underline underline-offset-4">Go to the pipeline</Link>} />
              ) : null}
            </>
          );
        }}
      </Loader>
    </div>
  );
}
