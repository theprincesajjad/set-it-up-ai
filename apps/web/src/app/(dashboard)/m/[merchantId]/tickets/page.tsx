"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, ErrorLine, PageHeader, Segmented, SkeletonRows, StatusDot } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { TicketCard } from "@/components/dashboard/service/TicketCard";
import { TicketFilters, type BoardFilter } from "@/components/dashboard/service/TicketFilters";
import { TicketStats } from "@/components/dashboard/service/TicketStats";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { BOARD_COLUMNS, cardModel, deviceTitle, dueText, sortColumn } from "@/lib/dashboard/tickets";
import { relativeTime } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

type View = "board" | "list" | "past";

export default function TicketsPage() {
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <Board />
    </FeatureGate>
  );
}

function Board() {
  const { api, base, me } = useMerchant();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("board");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const list = useApi(() => api.tickets({ q: q.trim() || undefined, limit: 200, ...(view === "past" ? { status: "picked_up,cancelled" } : {}) }), [api, q, view], { pollMs: 30_000 });
  const summary = useApi(() => api.serviceOps.summary(), [api], { pollMs: 30_000 });
  const now = new Date();
  const all = list.data?.items ?? [];
  const items = useMemo(
    () =>
      all.filter((t) => {
        if (view === "past") return true;
        if (filter === "mine") return t.assignedStaffId === me.user.id;
        if (filter === "today") return t.dueState === "today" || t.dueState === "overdue";
        if (filter === "overdue") return t.dueState === "overdue";
        if (filter === "photos") return t.photos.length > 0;
        return true;
      }),
    [all, filter, view, me.user.id],
  );
  const s = summary.data;
  const counts = { today: all.filter((t) => t.dueState === "today" || t.dueState === "overdue").length, overdue: all.filter((t) => t.dueState === "overdue").length };
  const open = view !== "past";
  const desc = !open
    ? "Picked-up and cancelled repairs."
    : s
      ? `${all.length} open. ${s.needsYou} need you today, ${s.waitingOnCustomer} ${s.waitingOnCustomer === 1 ? "is" : "are"} waiting on a customer.`
      : "Every repair from drop-off to pickup. Customers get a text at each step.";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Tickets"
        description={desc}
        actions={
          <div className="flex items-center gap-3">
            <Segmented label="View" value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }, { value: "past", label: "Past" }]} />
            <Button size="sm" iconStart={Plus} href={`${base}/tickets/new`}>New ticket</Button>
          </div>
        }
      />
      {open ? <TicketStats summary={s} loading={summary.loading} /> : null}
      {open ? <TicketFilters value={filter} onChange={setFilter} counts={counts} /> : null}
      <TextField type="search" label="Search tickets" hideLabel placeholder="Ticket #, customer, phone, device" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.error && !list.data ? (
        <ErrorLine message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={6} />
      ) : items.length && view !== "board" ? (
        <ul className="divide-y divide-line border-y border-line">
          {(view === "list" ? sortColumn(items) : items).map((t) => (
            <li key={t.id}>
              <Link href={`${base}/tickets/${t.id}`} className="-mx-2 flex items-center justify-between gap-4 rounded-sm px-2 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                <div className="min-w-0">
                  <p className="truncate text-body text-fg"><span className="text-meta-strong tabular">#{t.number}</span> {deviceTitle(t)}</p>
                  <p className="truncate text-meta text-fg-muted">{t.customer?.name ?? "Customer"} · {t.issue}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <StatusDot domain="ticket" status={t.status} label={copy.ticketStatus[t.status]} />
                  <span className={t.dueState === "overdue" ? "text-caption text-negative" : "text-caption text-fg-muted"}>{dueText(t, now) ?? relativeTime(t.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : items.length ? (
        <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((col) => {
            const ts = sortColumn(items.filter((t) => col.statuses.includes(t.status)));
            return (
              <section key={col.key} aria-label={col.title} className="min-w-0">
                <h2 className="mb-3 flex items-baseline justify-between text-body-strong text-fg">
                  {col.title} <span className="text-meta font-normal tabular text-fg-muted">{ts.length}</span>
                </h2>
                {ts.length ? (
                  <ul className="flex flex-col gap-3">
                    {ts.map((t) => (
                      <li key={t.id}>
                        <TicketCard model={cardModel(t, now)} href={`${base}/tickets/${t.id}`} />
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
        <EmptyState
          title={view === "past" ? "No finished tickets yet" : filter !== "all" ? "No tickets match this filter" : "No open tickets"}
          description={view === "past" ? "Picked-up and cancelled repairs show up here." : filter !== "all" ? "Try All staff to see everything." : "Check in a repair to start tracking it."}
          action={<Button variant="secondary" size="sm" href={`${base}/tickets/new`}>New ticket</Button>}
        />
      )}
    </div>
  );
}
