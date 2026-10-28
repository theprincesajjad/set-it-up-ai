"use client";
import Link from "next/link";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Capsules, EmptyState, Segmented, StatBlock, StatusDot, Row, RowList } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi, useNow } from "@/lib/dashboard/useApi";
import { Loader, addDaysISO, dayLabel, dayShort, todayISO } from "../common";
import { nextAction } from "@/lib/restaurant/tcb";
import { EVENT_TYPE_LABEL, SERVICE_LABEL, STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from "./labels";

type Gate = { featureKey: "restaurant.catering"; title: string; what: string };
type View = "board" | "list";
type Filter = "all" | restaurantApi.CateringStatus;

function title(e: restaurantApi.CateringEventDto) {
  return `${EVENT_TYPE_LABEL[e.eventType]}${e.customer?.name ? `, ${e.customer.name}` : ""}`;
}
const DAY = 86_400_000;
const TONE = { accent: "bg-points text-points-foreground", info: "bg-location", neutral: "bg-fg-subtle" } as const;
function meta(e: restaurantApi.CateringEventDto) {
  return `#${e.number} · ${dayLabel(e.eventDate)} · ${formatNumber(e.headcount)} guests · ${SERVICE_LABEL[e.service]}`;
}

export function PipelineView({ onNew, gate }: { onNew: () => void; gate: Gate }) {
  const { api, base } = useMerchant();
  const state = useApi(() => api.catering.list({ limit: 200 }), [api]);
  const now = useNow();
  const [view, setView] = useState<View>("board");
  const [filter, setFilter] = useState<Filter>("all");
  return (
    <div className="flex flex-col gap-4">
      <Loader state={state} gate={gate} rows={5}>
        {(d) => {
          const total = d.items.length;
          if (!total && !state.loading)
            return (
              <EmptyState
                title="No catering inquiries yet"
                description="When someone asks about a walima, mehndi or office lunch, add it here and take it from first call to final invoice."
                action={<Button size="sm" onClick={onNew}>Add an inquiry</Button>}
              />
            );
          const counts = d.counts;
          const shown = filter === "all" ? d.items : d.items.filter((e) => e.status === filter);
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Capsules<Filter>
                  label="Status"
                  value={filter}
                  onChange={(f) => { setFilter(f); if (f !== "all") setView("list"); }}
                  options={[{ value: "all", label: "All", count: total }, ...STATUS_ORDER.map((s) => ({ value: s as Filter, label: STATUS_LABEL[s], count: counts[s] ?? 0 }))]}
                />
                <Segmented<View> label="Layout" value={view} onChange={(v) => { setView(v); if (v === "board") setFilter("all"); }} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} className="hidden lg:inline-flex" />
              </div>
              <Tiles d={d} now={now} />
              {view === "board" && filter === "all" ? (
                <div className="hidden gap-x-4 gap-y-8 lg:grid lg:grid-cols-5">
                  {BOARD.map(({ key: s, label, hint, statuses }) => {
                    const col = d.items.filter((e) => statuses.includes(e.status));
                    return (
                      <section key={s} aria-label={label} className="min-w-0">
                        <div className="border-b border-line pb-2">
                          <h3 className="text-body-strong text-fg">{label} <span className="tabular text-fg-muted">{statuses.reduce((n, x) => n + (counts[x] ?? 0), 0)}</span></h3>
                          <p className="text-meta text-fg-muted">{hint}</p>
                        </div>
                        {col.length ? (
                          <ul className="mt-3 flex flex-col gap-3">
                            {col.map((e) => (
                              <li key={e.id}>
                                <Link href={`${base}/restaurant/catering/${e.id}`} className="block rounded-card bg-hover p-3 hover:bg-bg-subtle focus-visible:focus-ring">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-body-strong text-fg">{EVENT_TYPE_LABEL[e.eventType]}</span>
                                    {e.totalCents ? <span className="shrink-0 text-meta tabular text-fg">{formatMoney(e.totalCents)}</span> : null}
                                  </div>
                                  <p className="truncate text-meta text-fg-muted">{e.customer?.name ?? "Customer"}</p>
                                  <p className="truncate text-meta text-fg-muted">{dayLabel(e.eventDate)} · {formatNumber(e.headcount)} guests</p>
                                  {(() => {
                                    const n = nextAction(e, now, dayShort);
                                    return n ? (
                                      <p className={`mt-1 flex items-start gap-1.5 text-meta ${n.tone === "accent" ? "text-points-text" : n.tone === "info" ? "text-location" : "text-fg-muted"}`}>
                                        <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE[n.tone].split(" ")[0]}`} />
                                        <span>{n.text}</span>
                                      </p>
                                    ) : null;
                                  })()}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="py-3 text-meta text-fg-muted">Nothing here</p>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : null}
              <div className={view === "board" && filter === "all" ? "lg:hidden" : undefined}>
                {shown.length ? (
                  <RowList label="Catering events">
                    {shown.map((e) => (
                      <Row key={e.id} href={`${base}/restaurant/catering/${e.id}`} title={title(e)} meta={meta(e)} trailing={<span className="flex flex-col items-end"><StatusDot domain="catering" status={e.status} label={STATUS_LABEL[e.status]} />{e.totalCents ? <span className="text-meta text-fg-muted">{formatMoney(e.totalCents)}</span> : null}</span>} />
                    ))}
                  </RowList>
                ) : (
                  <EmptyState title={`No ${STATUS_LABEL[filter as restaurantApi.CateringStatus]?.toLowerCase() ?? ""} events`} description="Pick another status to see the rest of the pipeline." action={<Button size="sm" variant="secondary" onClick={() => setFilter("all")}>Show all</Button>} />
                )}
              </div>
            </>
          );
        }}
      </Loader>
    </div>
  );
}

/** One tap: text the customer about the deposit they have not paid yet (the server limits it to one every 12 hours). */
function RemindButton({ id }: { id: string }) {
  const { api } = useMerchant();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
      setBusy(true);
      try {
        await api.catering.remind(id);
        toast({ message: "Reminder sent", tone: "success" });
      } catch (err) {
        toast({ message: errorMessage(err), tone: "error" });
      } finally {
        setBusy(false);
      }
    }}>Remind</Button>
  );
}

const BOARD: { key: string; label: string; hint: string; statuses: restaurantApi.CateringStatus[] }[] = [
  { key: "inquiry", label: "Inquiry", hint: STATUS_HINT.inquiry, statuses: ["inquiry"] },
  { key: "tasting", label: "Tasting", hint: STATUS_HINT.tasting, statuses: ["tasting"] },
  { key: "quoted", label: "Quoted", hint: STATUS_HINT.quoted, statuses: ["quoted"] },
  { key: "confirmed", label: "Confirmed", hint: STATUS_HINT.confirmed, statuses: ["confirmed"] },
  { key: "done", label: "Done", hint: "Completed or cancelled", statuses: ["completed", "cancelled"] },
];

/** Money tiles and the next eight weeks (design C1): what is open, what to collect, what is due soon, what is booked. */
function Tiles({ d, now }: { d: { items: restaurantApi.CateringEventDto[]; summary?: restaurantApi.CateringSummary }; now: number }) {
  const sum = d.summary;
  if (!sum) return null;
  const today = todayISO();
  const unopened = d.items.filter((e) => e.status === "quoted" && !e.approvedAt && e.quoteSentAt && !e.quoteOpenedAt && now - Date.parse(e.quoteSentAt) >= 2 * DAY);
  const owing = d.items.filter((e) => e.status === "quoted" && e.approvedAt && !e.depositPaidAt).sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
  const soon = d.items.filter((e) => e.status === "confirmed" && e.eventDate >= today && e.eventDate <= addDaysISO(today, 14)).sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
  const guests = d.items.filter((e) => e.status === "confirmed" && e.eventDate >= today && e.eventDate < addDaysISO(today, 56)).reduce((n, e) => n + e.headcount, 0);
  const info = (t: string) => <span className="text-location">{t}</span>;
  return (
    <>
      <StatBlock tiles
        label="Catering money"
        cols={4}
        items={[
          { label: "Open quotes", value: formatMoney(sum.openQuotesCents), caption: unopened.length ? info(`${unopened.length} ${unopened.length === 1 ? "quote" : "quotes"}, sent ${Math.floor((now - Date.parse(unopened[0]!.quoteSentAt!)) / DAY)} days ago, not opened`) : "Waiting on customers" },
          { label: "Deposits to collect", value: formatMoney(sum.depositsToCollectCents), caption: owing ? <span className="flex flex-wrap items-center gap-x-2 text-location">{`${EVENT_TYPE_LABEL[owing.eventType]}, ${dayShort(owing.eventDate)} · awaiting deposit`}<RemindButton id={owing.id} /></span> : "Nothing waiting" },
          { label: "Balances due in 14 days", value: formatMoney(sum.balancesDue14dCents), caption: soon ? `${EVENT_TYPE_LABEL[soon.eventType]}, ${dayShort(soon.eventDate)}` : "No events in the next 14 days" },
          { label: "Booked, next 8 weeks", value: formatMoney(sum.bookedNext8wCents), caption: `${sum.bookedNext8wEvents} ${sum.bookedNext8wEvents === 1 ? "event" : "events"} · ${formatNumber(guests)} guests` },
        ]}
      />
      <section aria-label="Next 8 weeks" className="rounded-card bg-card shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body-strong text-fg">Next 8 weeks</h3>
          <p className="flex items-center gap-4 text-meta text-fg">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-trade" />Confirmed</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-location" />Quoted or held</span>
          </p>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-x-3 gap-y-3 sm:grid-cols-8">
          {sum.weeks.map((w) => (
            <li key={w.start} aria-label={`Week of ${dayShort(w.start)}: ${w.confirmed} confirmed, ${w.pending} quoted or held`}>
              <div className={`h-2.5 rounded-full ${w.confirmed ? "bg-trade" : w.pending ? "bg-location" : "bg-bg-muted"}`} />
              <p className="mt-1.5 text-meta tabular text-fg-muted">{dayShort(w.start)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
