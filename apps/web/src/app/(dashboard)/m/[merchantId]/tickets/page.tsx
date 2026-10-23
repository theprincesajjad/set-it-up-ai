"use client";
import { EmptyState, ErrorLine, PageHeader, Segmented, SkeletonRows, StatusDot } from "@/components/dashboard/kit";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { relativeTime } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

const COLUMNS: { title: string; statuses: serviceApi.TicketStatus[] }[] = [
  { title: "Dropped off", statuses: ["intake", "diagnosing"] },
  { title: "Quotes", statuses: ["quote_sent", "declined"] },
  { title: "In the shop", statuses: ["approved", "in_progress", "waiting_parts"] },
  { title: "Ready for pickup", statuses: ["ready"] },
];

export default function TicketsPage() {
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <Board />
    </FeatureGate>
  );
}

function Board() {
  const { api, base } = useMerchant();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"open" | "past">("open");
  const list = useApi(() => api.tickets({ q: q.trim() || undefined, limit: 100, ...(view === "past" ? { status: "picked_up,cancelled" } : {}) }), [api, q, view], { pollMs: 30_000 });
  const items = list.data?.items ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Service tickets" description="Every repair from drop-off to pickup. Customers get a text at each step." actions={<div className="flex items-center gap-3"><Segmented label="Show" value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "past", label: "Past" }]} /><Button size="sm" iconStart={Plus} href={`${base}/tickets/new`}>New ticket</Button></div>} />
      <TextField type="search" label="Search tickets" hideLabel placeholder="Ticket #, customer, phone, device" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.error && !list.data ? (
        <ErrorLine message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={6} />
      ) : items.length && view === "past" ? (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`${base}/tickets/${t.id}`} className="-mx-2 flex items-center justify-between gap-4 rounded-sm px-2 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                <div className="min-w-0">
                  <p className="truncate text-body text-fg"><span className="text-meta-strong tabular">#{t.number}</span> {[t.itemDetails.make, t.itemDetails.model].filter(Boolean).join(" ") || t.itemKind}</p>
                  <p className="truncate text-meta text-fg-muted">{t.customer?.name ?? "Customer"} · {t.issue}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5"><StatusDot domain="ticket" status={t.status} label={copy.ticketStatus[t.status]} /><span className="text-caption text-fg-muted">{relativeTime(t.updatedAt)}</span></div>
              </Link>
            </li>
          ))}
        </ul>
      ) : items.length ? (
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const ts = items.filter((t) => col.statuses.includes(t.status));
            return (
              <section key={col.title} aria-label={col.title} className="min-w-0">
                <h2 className="flex items-baseline justify-between border-b border-line pb-2.5 text-body-strong text-fg">
                  {col.title} <span className="text-meta font-normal tabular text-fg-muted">{ts.length}</span>
                </h2>
                {ts.length ? (
                  <ul className="divide-y divide-line">
                    {ts.map((t) => (
                      <li key={t.id}>
                        <Link href={`${base}/tickets/${t.id}`} className="-mx-2 block rounded-sm px-2 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-meta-strong text-fg tabular">#{t.number}</span>
                            <StatusDot domain="ticket" status={t.status} label={copy.ticketStatus[t.status]} />
                          </div>
                          <p className="mt-1 truncate text-body text-fg">{[t.itemDetails.make, t.itemDetails.model].filter(Boolean).join(" ") || t.itemKind}</p>
                          <p className="truncate text-meta text-fg-muted">{t.issue}</p>
                          <p className="mt-0.5 truncate text-caption font-normal text-fg-muted">{t.customer?.name ?? "Customer"} · {relativeTime(t.updatedAt)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-meta text-fg-muted">Nothing here.</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState title={view === "past" ? "No finished tickets yet" : "No open tickets"} description={view === "past" ? "Picked-up and cancelled repairs show up here." : "Check in a repair to start tracking it."} action={<Button variant="secondary" size="sm" href={`${base}/tickets/new`}>New ticket</Button>} />
      )}
    </div>
  );
}
