import { router } from "expo-router";
import { useState } from "react";
import { t } from "../../copy/en-CA";
import { usePhase2 } from "../../features/customer/queries";
import { formatDate } from "../../lib/format";
import { Badge, Card, EmptyState, ListRow, ORDER_STATUS_LABELS, Screen, SegmentedControl, ShoppingBag, SkeletonList, TICKET_STATUS_LABELS, Ticket, Wrench, type BadgeTone } from "../../ui";

const ORDER_TONE: Record<string, BadgeTone> = { pending: "warning", accepted: "info", preparing: "info", ready: "success" };
const TICKET_TONE: Record<string, BadgeTone> = { intake: "info", diagnosing: "info", quote_sent: "warning", approved: "info", in_progress: "info", waiting_parts: "info", ready: "success" };

/** 9. Orders & tickets (Phase 2): Active / Past. */
export default function OrdersAndTickets() {
  const { orders, tickets, loading, refetch } = usePhase2();
  const [tab, setTab] = useState<"active" | "past">("active");
  const activeOrder = (s: string) => ["pending", "accepted", "preparing", "ready"].includes(s);
  const activeTicket = (s: string) => !["picked_up", "cancelled", "declined"].includes(s);
  const rows = [
    ...orders.filter((o) => (tab === "active") === activeOrder(o.status)).map((o) => ({ kind: "order" as const, at: o.createdAt, o })),
    ...tickets.filter((x) => (tab === "active") === activeTicket(x.status)).map((x) => ({ kind: "ticket" as const, at: x.updatedAt, x })),
  ].sort((a, b) => {
    const needs = (r: (typeof rows)[number]) => (r.kind === "ticket" && r.x.status === "quote_sent" ? 1 : 0);
    return needs(b) - needs(a) || b.at.localeCompare(a.at);
  });
  return (
    <Screen back title="Orders & tickets" onRefresh={refetch} refreshing={false}>
      <SegmentedControl
        options={[
          { value: "active", label: "Active" },
          { value: "past", label: "Past" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loading ? (
        <SkeletonList rows={3} rowHeight={64} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title={t("empty.orders.title")} body={t("empty.orders.body")} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {rows.map((r) =>
            r.kind === "order" ? (
              <ListRow
                key={r.o.id}
                leadingIcon={ShoppingBag}
                title={`Pickup order #${r.o.number}`}
                subtitle={`${r.o.merchantName} · ${formatDate(r.o.createdAt)}`}
                trailing={<Badge tone={ORDER_TONE[r.o.status] ?? "neutral"}>{ORDER_STATUS_LABELS[r.o.status]}</Badge>}
                onPress={() => router.push(`/orders/${r.o.id}`)}
              />
            ) : (
              <ListRow
                key={r.x.id}
                leadingIcon={r.x.itemKind === "vehicle" ? Wrench : Ticket}
                title={[r.x.itemDetails.make, r.x.itemDetails.model].filter(Boolean).join(" ") || r.x.issue}
                subtitle={`${r.x.merchantName} · #${r.x.number}`}
                trailing={<Badge tone={TICKET_TONE[r.x.status] ?? "neutral"}>{r.x.status === "quote_sent" ? "Needs approval" : TICKET_STATUS_LABELS[r.x.status]}</Badge>}
                onPress={() => router.push(`/tickets/${r.x.id}`)}
              />
            ),
          )}
        </Card>
      )}
    </Screen>
  );
}
