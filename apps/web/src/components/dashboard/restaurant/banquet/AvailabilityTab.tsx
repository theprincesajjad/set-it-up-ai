"use client";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Capsules, Dot, EmptyState, Segmented, StatBlock } from "@/components/dashboard/kit";
import Link from "next/link";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber, formatTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { holdWord } from "@/lib/restaurant/tcb";
import { DOW_SHORT, DateNav, Loader, addDaysISO, dayLabel, monthEndISO, monthGrid, monthLabel, monthStartISO, todayISO, torontoDay, torontoInstant, weekStartISO } from "../common";

type Gate = { featureKey: "restaurant.banquet"; title: string; what: string };
type Busy = restaurantApi.HallAvailabilityResponse["halls"][number]["busy"][number];
type View = "week" | "month";
const HEAD = [0, 1, 2, 3, 4, 5, 6];
const ALL = "__all";

/** Busy windows (confirmed bookings and live holds) per hall, by week or by month. */
export function AvailabilityTab({ gate, goHalls }: { gate: Gate; goHalls: () => void }) {
  const { api } = useMerchant();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(todayISO());
  const [hallId, setHallId] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const halls = useApi(() => api.banquet.halls(), [api]);
  const open = (halls.data?.items ?? []).filter((h) => h.active);
  const monthHall = view === "month" && hallId === ALL ? "" : hallId || open[0]?.id || "";
  const bookings = useApi(() => api.banquet.bookings(), [api]);
  const start = view === "week" ? weekStartISO(anchor) : monthGrid(anchor)[0]!;
  const end = view === "week" ? addDaysISO(start, 6) : monthGrid(anchor).slice(-1)[0]!;
  const from = torontoInstant(start, "00:00");
  const to = torontoInstant(addDaysISO(end, 1), "00:00");
  const hallFilter = view === "month" ? monthHall : hallId === ALL ? "" : hallId;
  const state = useApi(halls.data ? () => api.banquet.availability(from, to, hallFilter || undefined) : null, [api, from, to, hallFilter, halls.data]);

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
                  <Capsules<string>
                    label="Hall"
                    value={view === "month" ? (hallId === ALL ? ALL : monthHall) : hallId || ALL}
                    onChange={(v) => { setHallId(v); setSel(null); }}
                    options={[...open.map((x) => ({ value: x.id, label: `${x.name} · ${formatNumber(x.capacity)}` })), ...(open.length > 1 ? [{ value: ALL, label: "Both halls" }] : [])]}
                  />
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
              {view === "month" ? <Strip bookings={bookings.data?.items ?? []} /> : null}
              <Loader state={state} gate={gate} rows={5}>
                {(a) => (view === "week" ? <Week a={a} start={start} /> : <Month a={a} month={monthStartISO(anchor)} sel={sel} setSel={setSel} bookings={bookings.data?.items ?? []} />)}
              </Loader>
              <p className="flex flex-wrap gap-x-4 text-meta text-fg-muted"><Dot tone="positive">Confirmed, deposit in</Dot><Dot tone="info">On hold, deposit not in</Dot></p>
            </>
          )
        }
      </Loader>
    </div>
  );
}

function windowsOn<T extends Busy>(busy: T[], day: string): T[] {
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

/** Holds about to lapse, deposits to collect, and how many weekend nights are taken (design B1). */
function Strip({ bookings }: { bookings: restaurantApi.HallBookingDto[] }) {
  const now = useNow();
  const live = bookings.filter((b) => b.status === "hold" && b.holdExpiresAt && Date.parse(b.holdExpiresAt) > now);
  const soon = live.filter((b) => Date.parse(b.holdExpiresAt!) - now <= 48 * 3_600_000).sort((a, b) => a.holdExpiresAt!.localeCompare(b.holdExpiresAt!));
  const owed = live.filter((b) => !b.depositPaidAt && b.depositCents > 0);
  const owedCents = owed.reduce((s, b) => s + b.depositCents, 0);
  const todayStr = todayISO();
  const month = todayStr.slice(0, 7);
  // Only nights still ahead this month: a Saturday that has gone by is neither taken nor open.
  const nights = new Set(
    bookings
      .filter((b) => (b.status === "confirmed" || b.status === "hold") && torontoDay(b.startsAt).startsWith(month) && torontoDay(b.startsAt) >= todayStr && [5, 6].includes(new Date(`${torontoDay(b.startsAt)}T12:00:00Z`).getUTCDay()))
      .map((b) => `${b.hallId}|${torontoDay(b.startsAt)}`),
  ).size;
  const [y, m] = month.split("-").map(Number) as [number, number];
  let weekend = 0;
  for (let d = Number(todayStr.slice(8)); d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) if ([5, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay())) weekend++;
  const hallCount = new Set(bookings.map((b) => b.hallId)).size || 1;
  const first = soon[0];
  return (
    <StatBlock tiles
      label="Banquet numbers"
      cols={3}
      items={[
        { label: "Holds expiring in 48 h", value: formatNumber(soon.length), caption: first ? <span className="text-points-text">{first.hallName ?? "Hall"}, {dayLabel(torontoDay(first.startsAt))}</span> : "None about to lapse" },
        { label: "Deposits to collect", value: formatMoney(owedCents), caption: owed.length ? <span className="text-location">{owed.length} {owed.length === 1 ? "hold" : "holds"} · e-transfer or card</span> : "Nothing waiting" },
        { label: "Weekend nights taken, rest of month", value: `${nights} of ${weekend * hallCount}`, caption: `${Math.max(0, weekend * hallCount - nights)} still open` },
      ]}
    />
  );
}

function Month({ a, month, sel, setSel, bookings }: { a: restaurantApi.HallAvailabilityResponse; month: string; sel: string | null; setSel: (d: string) => void; bookings: restaurantApi.HallBookingDto[] }) {
  const now = useNow();
  const { base } = useMerchant();
  if (!a.halls.length) return null;
  const busyAll = a.halls.flatMap((h) => h.busy.map((b) => ({ ...b, hall: h.hall.name })));
  const grid = monthGrid(month);
  const today = todayISO();
  const selDay = sel ?? (today.startsWith(month.slice(0, 7)) ? today : null);
  const chip = (x: Busy) => (x.label?.split(" · ")[1] ?? "Booked").replace(/^./, (c) => c.toUpperCase());
  const selected = selDay ? windowsOn(busyAll, selDay) : [];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        <div role="group" aria-label={`${a.halls.map((h) => h.hall.name).join(" and ")}, ${monthLabel(month)}`} className="grid grid-cols-7 overflow-hidden rounded-card border-s border-t border-line">
          {HEAD.map((i) => <div key={i} className="border-e border-b border-line bg-bg-subtle px-2 py-2 text-start text-meta text-fg-muted">{DOW_SHORT[i]}</div>)}
          {grid.map((day) => {
            const inMonth = day >= month && day <= monthEndISO(month);
            const w = windowsOn(busyAll, day);
            const on = selDay === day;
            return (
              <button key={day} type="button" aria-pressed={on} aria-label={`${dayLabel(day)}, ${w.length ? `${w.length} booked` : "free"}`} onClick={() => setSel(day)} className={cn("flex min-h-16 flex-col items-stretch gap-1 border-e border-b border-line p-1.5 text-start hover:bg-bg-subtle focus-visible:focus-ring sm:min-h-[92px] sm:p-2", !inMonth && "bg-bg-subtle/60", on && "bg-bg-muted")}>
                <span className={cn("text-meta tabular", day === today ? "inline-flex size-6 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground" : inMonth ? "text-fg-muted" : "text-fg-subtle")}>{Number(day.slice(8))}</span>
                {w.map((x) => (
                  <span key={x.bookingId} className={cn("hidden rounded-[6px] px-1.5 py-1 text-caption leading-tight sm:block", x.status === "confirmed" ? "bg-primary text-primary-foreground" : "border border-location bg-location/10 text-location")}>
                    <span className="block truncate font-medium">{chip(x)}</span>
                    <span className="block truncate opacity-80">{x.status === "confirmed" ? "Confirmed" : holdWord(x.holdExpiresAt, now)}</span>
                  </span>
                ))}
                {w.length ? <span className="flex gap-1 sm:hidden">{w.map((x) => <span key={x.bookingId} aria-hidden className={cn("size-2 rounded-full", x.status === "confirmed" ? "bg-fg" : "bg-location")} />)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {selDay ? (
        <aside aria-label={dayLabel(selDay)} className="min-w-0 rounded-card bg-card shadow-card p-5">
          {selected.length ? (
            selected.map((x) => {
              const b = bookings.find((y) => y.id === x.bookingId);
              const left = x.holdExpiresAt ? Math.max(0, Math.floor((Date.parse(x.holdExpiresAt) - now) / 3_600_000)) : null;
              return (
                <div key={x.bookingId} className="flex flex-col gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0 [&:not(:first-child)]:pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-headline text-fg">{dayLabel(selDay)} · {x.hall}</h3>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-caption", x.status === "confirmed" ? "bg-bg-muted text-fg" : "bg-location/10 text-location")}>{x.status === "confirmed" ? "Confirmed" : "On hold"}</span>
                  </div>
                  <p className="text-meta text-fg-muted">{x.label?.replace(/ · /g, " · ")}{b?.packageName ? ` · ${b.packageName}` : ""}</p>
                  {x.status === "hold" && left !== null ? (
                    <div className="rounded-card bg-points/10 px-3 py-2 text-meta">
                      <p className="font-medium text-points-text">Hold expires in {left} h</p>
                      <p className="text-fg-muted">{formatTime(x.holdExpiresAt!)} on {dayLabel(torontoDay(x.holdExpiresAt!))}. The date then opens to other inquiries.</p>
                    </div>
                  ) : null}
                  {b ? (
                    <>
                      <dl className="divide-y divide-line border-y border-line text-meta">
                        <div className="flex justify-between py-2"><dt className="text-fg-muted">Total with tax</dt><dd className="tabular text-body-strong text-fg">{formatMoney(b.totalCents)}</dd></div>
                      </dl>
                      {b.schedule.length ? (
                        <ul className="flex flex-col gap-2">
                          {b.schedule.map((r, i) => (
                            <li key={`${r.label}-${i}`} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-body text-fg">{r.label}</p>
                                <p className="flex items-center gap-1.5 text-meta text-fg-muted"><span aria-hidden className={`size-1.5 rounded-full ${r.paidAt ? "bg-positive" : "bg-fg-subtle"}`} />{r.paidAt ? `Paid ${dayLabel(r.paidAt.slice(0, 10))}` : `Due ${dayLabel(r.dueOn)}`}</p>
                              </div>
                              <span className="tabular text-body text-fg">{formatMoney(r.amountCents)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                  <div><Link href={`${base}/restaurant/banquet?tab=bookings&booking=${x.bookingId}`} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-meta font-medium text-primary-foreground focus-visible:focus-ring">Open booking</Link></div>
                </div>
              );
            })
          ) : (
            <>
              <h3 className="text-headline text-fg">{dayLabel(selDay)}</h3>
              <p className="mt-1 text-meta text-fg-muted">Free that day{a.halls.length === 1 ? ` in ${a.halls[0]!.hall.name}` : ""}.</p>
            </>
          )}
        </aside>
      ) : null}
    </div>
  );
}
