"use client";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Dot, EmptyState, Segmented } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { formatNumber, formatTime } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { DOW_SHORT, DateNav, Loader, addDaysISO, dayLabel, monthEndISO, monthGrid, monthLabel, monthStartISO, todayISO, torontoInstant, weekStartISO } from "../common";

type Gate = { featureKey: "restaurant.banquet"; title: string; what: string };
type Busy = restaurantApi.HallAvailabilityResponse["halls"][number]["busy"][number];
type View = "week" | "month";
const HEAD = [1, 2, 3, 4, 5, 6, 0];

/** Busy windows (confirmed bookings and live holds) per hall, by week or by month. */
export function AvailabilityTab({ gate, goHalls }: { gate: Gate; goHalls: () => void }) {
  const { api } = useMerchant();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayISO());
  const [hallId, setHallId] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const halls = useApi(() => api.banquet.halls(), [api]);
  const open = (halls.data?.items ?? []).filter((h) => h.active);
  const monthHall = hallId || open[0]?.id || "";
  const start = view === "week" ? weekStartISO(anchor) : monthGrid(anchor)[0]!;
  const end = view === "week" ? addDaysISO(start, 6) : monthGrid(anchor).slice(-1)[0]!;
  const from = torontoInstant(start, "00:00");
  const to = torontoInstant(addDaysISO(end, 1), "00:00");
  const hallFilter = view === "month" ? monthHall : hallId;
  const state = useApi(halls.data && (view === "week" || monthHall) ? () => api.banquet.availability(from, to, hallFilter || undefined) : null, [api, from, to, hallFilter, halls.data]);

  return (
    <div className="flex flex-col gap-4">
      <Loader state={halls} gate={gate}>
        {(h) =>
          open.length === 0 ? (
            <EmptyState title={h.items.length ? "All your halls are closed" : "No halls to show yet"} description="Add a hall, or open one for holds, and its busy days show up here." action={<Button size="sm" onClick={goHalls}>Go to halls</Button>} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented<View> label="View" value={view} onChange={(v) => { setView(v); setSel(null); }} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
                  <div className="w-52">
                    <Select label="Hall" hideLabel value={view === "month" ? monthHall : hallId} onChange={(e) => setHallId(e.target.value)} placeholder={view === "week" ? "All halls" : undefined} options={open.map((x) => ({ value: x.id, label: x.name }))} className="min-h-9 text-meta" />
                  </div>
                </div>
                <DateNav
                  label={view === "week" ? "Week" : "Month"}
                  value={view === "week" ? start : monthStartISO(anchor)}
                  unit={view === "week" ? "day" : "month"}
                  step={view === "week" ? 7 : 1}
                  text={view === "week" ? `${dayLabel(start)} to ${dayLabel(end)}` : monthLabel(anchor)}
                  onChange={(d) => { setAnchor(d); setSel(null); }}
                />
              </div>
              <Loader state={state} gate={gate} rows={5}>
                {(a) => (view === "week" ? <Week a={a} start={start} /> : <Month a={a} month={monthStartISO(anchor)} sel={sel} setSel={setSel} />)}
              </Loader>
              <p className="flex flex-wrap gap-x-4 text-meta text-fg-muted"><Dot tone="positive">Confirmed</Dot><Dot tone="info">On hold, not yet confirmed</Dot></p>
            </>
          )
        }
      </Loader>
    </div>
  );
}

function windowsOn(busy: Busy[], day: string): Busy[] {
  const a = torontoInstant(day, "00:00");
  const b = torontoInstant(addDaysISO(day, 1), "00:00");
  return busy.filter((x) => x.startsAt < b && x.endsAt > a);
}
function span(x: Busy, day: string): string {
  const startsBefore = x.startsAt < torontoInstant(day, "00:00");
  const endsAfter = x.endsAt > torontoInstant(addDaysISO(day, 1), "00:00");
  return `${startsBefore ? "Earlier" : formatTime(x.startsAt)} to ${endsAfter ? "next day" : formatTime(x.endsAt)}`;
}
const tone = (s: Busy["status"]) => (s === "confirmed" ? "positive" : "info");

function Week({ a, start }: { a: restaurantApi.HallAvailabilityResponse; start: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const today = todayISO();
  return (
    <div className="flex flex-col gap-8">
      {a.halls.map(({ hall, busy }) => (
        <section key={hall.id} aria-label={hall.name}>
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <h3 className="text-body-strong text-fg">{hall.name}</h3>
            <span className="text-meta text-fg-muted">Seats {formatNumber(hall.capacity)} · {busy.length ? `${busy.length} ${busy.length === 1 ? "booking" : "bookings"} this week` : "free all week"}</span>
          </div>
          <ol className="grid sm:grid-cols-7 sm:divide-x sm:divide-line">
            {days.map((d) => {
              const w = windowsOn(busy, d);
              return (
                <li key={d} className={cn("flex gap-3 border-b border-line py-2 sm:min-h-24 sm:flex-col sm:gap-1 sm:px-2 sm:first:ps-0", d === today && "bg-bg-subtle/60")}>
                  <span className="w-24 shrink-0 text-meta-strong text-fg sm:w-auto"><span className="sm:hidden">{dayLabel(d)}</span><span className="hidden sm:inline">{DOW_SHORT[(new Date(`${d}T00:00:00Z`).getUTCDay())]} {Number(d.slice(8))}</span></span>
                  {w.length ? (
                    <ul className="flex min-w-0 flex-1 flex-col gap-1">
                      {w.map((x) => (
                        <li key={x.bookingId} className="text-meta"><Dot tone={tone(x.status)} className="whitespace-normal">{span(x, d)}</Dot><span className="sr-only">{x.status === "confirmed" ? " confirmed" : " on hold"}</span></li>
                      ))}
                    </ul>
                  ) : <span className="text-meta text-fg-muted">Free</span>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Month({ a, month, sel, setSel }: { a: restaurantApi.HallAvailabilityResponse; month: string; sel: string | null; setSel: (d: string) => void }) {
  const entry = a.halls[0];
  if (!entry) return null;
  const grid = monthGrid(month);
  const today = todayISO();
  const selDay = sel ?? (today.startsWith(month.slice(0, 7)) ? today : null);
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={`${entry.hall.name}, ${monthLabel(month)}`} className="grid grid-cols-7 border-s border-t border-line">
        {HEAD.map((i) => <div key={i} className="border-e border-b border-line bg-bg-subtle py-1.5 text-center text-caption font-medium text-fg-muted">{DOW_SHORT[i]}</div>)}
        {grid.map((day) => {
          const inMonth = day >= month && day <= monthEndISO(month);
          const w = windowsOn(entry.busy, day);
          const on = selDay === day;
          return (
            <button key={day} type="button" aria-pressed={on} aria-label={`${dayLabel(day)}, ${w.length ? `${w.length} booked` : "free"}`} onClick={() => setSel(day)} className={cn("flex min-h-14 flex-col items-start gap-1 border-e border-b border-line p-1.5 text-start hover:bg-bg-subtle focus-visible:focus-ring sm:min-h-[76px] sm:p-2", !inMonth && "bg-bg-subtle/60", on && "bg-bg-muted")}>
              <span className={cn("text-meta tabular", day === today ? "inline-flex size-6 items-center justify-center rounded-full bg-fg font-medium text-bg" : inMonth ? "text-fg" : "text-fg-subtle")}>{Number(day.slice(8))}</span>
              {w.length ? <span className="flex flex-wrap gap-1">{w.map((x) => <span key={x.bookingId} aria-hidden className={cn("size-2 rounded-full", x.status === "confirmed" ? "bg-positive" : "bg-location")} />)}</span> : null}
            </button>
          );
        })}
      </div>
      {selDay ? (
        <div>
          <h3 className="text-meta-strong text-fg">{dayLabel(selDay)}</h3>
          {windowsOn(entry.busy, selDay).length ? (
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {windowsOn(entry.busy, selDay).map((x) => <li key={x.bookingId} className="flex items-center justify-between gap-3 py-2 text-meta"><Dot tone={tone(x.status)}>{x.status === "confirmed" ? "Confirmed" : "On hold"}</Dot><span className="tabular text-fg">{span(x, selDay)}</span></li>)}
            </ul>
          ) : <p className="mt-1 border-y border-line py-3 text-meta text-fg-muted">{entry.hall.name} is free that day.</p>}
        </div>
      ) : null}
    </div>
  );
}
