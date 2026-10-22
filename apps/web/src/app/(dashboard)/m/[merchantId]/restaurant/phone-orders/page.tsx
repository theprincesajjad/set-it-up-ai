"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Capsules, DataTable, EmptyState, ErrorLine, PageHeader, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CopyButton, RestaurantGate, TierTeaser, formatPhone, whenTor } from "@/components/dashboard/restaurant/shared";
import { env } from "@/lib/env";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { CallStatus, languageName } from "./CallStatus";

type Filter = "all" | "drafted" | "confirmed" | "discarded" | "failed";

export default function PhoneOrdersPage() {
  return (
    <RestaurantGate featureKey="restaurant.phone_ai" title="Phone orders">
      <PhoneOrders />
    </RestaurantGate>
  );
}

function PhoneOrders() {
  const { api, base, merchantId } = useMerchant();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useApi(() => api.phone.calls({ limit: 25, status: filter === "all" ? undefined : filter }), [api, filter]);
  const [more, setMore] = useState<{ key: Filter; items: whatsappApi.PhoneCallDto[]; cursor: string | null } | null>(null);
  const loadMore = useAction();
  if (list.status === 402) return <TierTeaser featureKey="restaurant.phone_ai" title="Phone orders" />;
  const extra = more?.key === filter ? more : null;
  const rows = [...(list.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : (list.data?.nextCursor ?? null);
  const webhook = `${env.apiUrl}/v1/webhooks/phone/${merchantId}`;
  const cols: Column<whatsappApi.PhoneCallDto>[] = [
    { key: "status", header: "Status", mobile: "trailing", sortValue: (c) => c.status, cell: (c) => <CallStatus status={c.status} /> },
    { key: "from", header: "From", mobile: "title", cell: (c) => <span className="font-medium">{formatPhone(c.fromPhone)}</span> },
    { key: "lang", header: "Language", mobile: "subtitle", cell: (c) => languageName(c.language) },
    { key: "items", header: "Order", mobile: "subtitle", cell: (c) => summary(c) },
    { key: "when", header: "Time", align: "end", mobile: "subtitle", sortValue: (c) => c.createdAt, cell: (c) => whenTor(c.createdAt) },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Phone orders" description="Your phone assistant listens in Urdu, Hindi, Punjabi or English and drafts the order. You check it, fix anything it got wrong, and confirm." />
      {list.error && !list.data ? <ErrorLine message={list.error} onRetry={() => void list.reload()} /> : null}
      <DataTable
        caption="Phone calls"
        columns={cols}
        rows={rows}
        rowKey={(c) => c.id}
        loading={list.loading && !list.data}
        onRowClick={(c) => router.push(`${base}/restaurant/phone-orders/${c.id}`)}
        hasMore={!!cursor}
        loadingMore={loadMore.busy}
        onLoadMore={async () => {
          if (!cursor) return;
          const r = await loadMore.run(() => api.phone.calls({ limit: 25, cursor, status: filter === "all" ? undefined : filter }));
          if (r) setMore({ key: filter, items: [...(extra?.items ?? []), ...r.items], cursor: r.nextCursor });
        }}
        toolbar={<Capsules label="Filter calls" value={filter} onChange={setFilter} options={[{ value: "all", label: "All calls" }, { value: "drafted", label: "Needs a look" }, { value: "confirmed", label: "Became an order" }, { value: "discarded", label: "Discarded" }, { value: "failed", label: "Couldn't place" }]} />}
        empty={
          filter !== "all" ? (
            <EmptyState title="No calls with that status" action={<button type="button" onClick={() => setFilter("all")} className="text-meta font-medium text-fg underline decoration-line underline-offset-4">Show all calls</button>} />
          ) : (
            <EmptyState
              title="No phone orders yet"
              description={`When a customer calls, the draft order lands here. To start, point your phone line's voice webhook at ${webhook}`}
              action={<CopyButton text={webhook} label="Copy webhook URL" />}
            />
          )
        }
      />
    </div>
  );
}

function summary(c: whatsappApi.PhoneCallDto): string {
  const n = c.draftOrder?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const parts = [n ? `${n} ${n === 1 ? "item" : "items"}` : "No items"];
  if (c.unmatched.length) parts.push(`${c.unmatched.length} to check`);
  return parts.join(", ");
}
