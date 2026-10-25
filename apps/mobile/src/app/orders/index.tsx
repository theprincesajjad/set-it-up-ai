import { router } from "expo-router";
import { useState } from "react";
import { usePhase2 } from "../../features/customer/queries";
import { formatDateL } from "../../lib/formatL";
import { useLocale } from "../../lib/i18n";
import { Badge, Card, EmptyState, ListRow, ORDER_STATUS_KEYS, Screen, SegmentedControl, ShoppingBag, SkeletonList, TICKET_STATUS_KEYS, Ticket, Wrench, type BadgeTone } from "../../ui";

const ORDER_TONE: Record<string, BadgeTone> = { pending: "warning", accepted: "info", preparing: "info", ready: "success" };
const TICKET_TONE: Record<string, BadgeTone> = { intake: "info", diagnosing: "info", quote_sent: "warning", approved: "info", in_progress: "info", waiting_parts: "info", ready: "success" };

/** 9. Orders & tickets (Phase 2): Active / Past. */
export default function OrdersAndTickets() {
  const L = useLocale();
  const { t } = L;
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
    <Screen back title={t("sh.you.orders")} onRefresh={refetch} refreshing={false}>
      <SegmentedControl
        options={[
          { value: "active", label: t("tiffin.active") },
          { value: "past", label: t("rc.bq.past") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loading ? (
        <SkeletonList rows={3} rowHeight={64} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShoppingBag} title={t("cp.empty.ordersTitle")} body={t("cp.empty.ordersBody")} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {rows.map((r, i) =>
            r.kind === "order" ? (
              <ListRow
                divider={i < rows.length - 1}
                key={r.o.id}
                leadingIcon={ShoppingBag}
                title={t("sh.wallet.pickupOrder", { n: r.o.number })}
                subtitle={`${r.o.merchantName} · ${formatDateL(L, r.o.createdAt)}`}
                trailing={<Badge tone={ORDER_TONE[r.o.status] ?? "neutral"}>{t(ORDER_STATUS_KEYS[r.o.status])}</Badge>}
                onPress={() => router.push(`/orders/${r.o.id}`)}
              />
            ) : (
              <ListRow
                divider={i < rows.length - 1}
                key={r.x.id}
                leadingIcon={r.x.itemKind === "vehicle" ? Wrench : Ticket}
                title={[r.x.itemDetails.make, r.x.itemDetails.model].filter(Boolean).join(" ") || r.x.issue}
                subtitle={`${r.x.merchantName} · #${r.x.number}`}
                trailing={<Badge tone={TICKET_TONE[r.x.status] ?? "neutral"}>{r.x.status === "quote_sent" ? t("ms.needsApproval") : t(TICKET_STATUS_KEYS[r.x.status])}</Badge>}
                onPress={() => router.push(`/tickets/${r.x.id}`)}
              />
            ),
          )}
        </Card>
      )}
    </Screen>
  );
}
