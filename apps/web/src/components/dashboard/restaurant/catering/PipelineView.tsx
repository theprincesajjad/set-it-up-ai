"use client";
import Link from "next/link";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { Capsules, EmptyState, Segmented, StatusDot, Row, RowList } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { Loader, dayLabel } from "../common";
import { EVENT_TYPE_LABEL, SERVICE_LABEL, STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from "./labels";

type Gate = { featureKey: "restaurant.catering"; title: string; what: string };
type View = "board" | "list";
type Filter = "all" | restaurantApi.CateringStatus;

function title(e: restaurantApi.CateringEventDto) {
  return `${EVENT_TYPE_LABEL[e.eventType]}${e.customer?.name ? `, ${e.customer.name}` : ""}`;
}
function meta(e: restaurantApi.CateringEventDto) {
  return `#${e.number} · ${dayLabel(e.eventDate)} · ${formatNumber(e.headcount)} guests · ${SERVICE_LABEL[e.service]}`;
}

export function PipelineView({ onNew, gate }: { onNew: () => void; gate: Gate }) {
  const { api, base } = useMerchant();
  const state = useApi(() => api.catering.list({ limit: 200 }), [api]);
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
              {view === "board" && filter === "all" ? (
                <div className="hidden gap-x-5 gap-y-8 lg:grid lg:grid-cols-3">
                  {STATUS_ORDER.map((s) => {
                    const col = d.items.filter((e) => e.status === s);
                    return (
                      <section key={s} aria-label={STATUS_LABEL[s]} className="min-w-0">
                        <div className="flex items-baseline justify-between border-b border-line pb-2">
                          <h3 className="text-body-strong text-fg">{STATUS_LABEL[s]} <span className="tabular text-fg-muted">{counts[s] ?? 0}</span></h3>
                          <span className="text-meta text-fg-muted">{STATUS_HINT[s]}</span>
                        </div>
                        {col.length ? (
                          <ul className="divide-y divide-line">
                            {col.map((e) => (
                              <li key={e.id}>
                                <Link href={`${base}/restaurant/catering/${e.id}`} className="-mx-2 block rounded-sm px-2 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-body text-fg">{title(e)}</span>
                                    {e.totalCents ? <span className="shrink-0 text-meta tabular text-fg">{formatMoney(e.totalCents)}</span> : null}
                                  </div>
                                  <p className="truncate text-meta text-fg-muted">{dayLabel(e.eventDate)} · {formatNumber(e.headcount)} guests</p>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="py-3 text-meta text-fg-subtle">Nothing here</p>
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
