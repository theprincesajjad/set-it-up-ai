"use client";
import { EmptyState, ErrorLine, PageHeader, RowList, Segmented, SkeletonRows, StatusDot } from "@/components/dashboard/kit";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { OrderBadges } from "@/components/dashboard/restaurant/orderBadges";
import { SplitSheet, canSplit } from "@/components/dashboard/restaurant/SplitBill";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { formatMoney, formatTime } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const NEXT: Record<string, { status: commerceApi.UpdateOrderStatusBody["status"]; label: string }[]> = {
  pending: [{ status: "accepted", label: "Accept" }],
  accepted: [{ status: "preparing", label: "Start preparing" }, { status: "ready", label: "Mark ready" }],
  preparing: [{ status: "ready", label: "Mark ready" }],
  ready: [{ status: "picked_up", label: "Picked up" }],
};

export default function OrdersPage() {
  return (
    <FeatureGate keys={["orders.order_ahead"]} title="Order-ahead">
      <Orders />
    </FeatureGate>
  );
}

function Orders() {
  const { api, enabled } = useMerchant();
  const splitOn = enabled("restaurant.split_bills");
  const [split, setSplit] = useState<commerceApi.OrderDto | null>(null);
  const toast = useToast();
  const [view, setView] = useState<"open" | "done">("open");
  const orders = useApi(() => api.orders(view === "open" ? {} : { status: "picked_up,cancelled,refunded", limit: 30 }), [api, view], { pollMs: view === "open" ? 10_000 : undefined });
  const [cancel, setCancel] = useState<commerceApi.OrderDto | null>(null);
  const [reason, setReason] = useState("");
  const act = useAction();
  const move = async (o: commerceApi.OrderDto, status: commerceApi.UpdateOrderStatusBody["status"]) => {
    const r = await act.run(() => api.setOrderStatus(o.id, { status }));
    if (r) {
      toast({ message: `#${r.number}: ${copy.orderStatus[r.status] ?? r.status}`, tone: "success" });
      await orders.reload();
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Orders" description="Updates every 10 seconds. Customers get a text when you mark an order ready." actions={<Segmented label="Show" value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }]} />} />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {orders.error && !orders.data ? (
        <ErrorLine message={orders.error} onRetry={orders.reload} />
      ) : orders.loading && !orders.data ? (
        <SkeletonRows rows={4} />
      ) : orders.data?.items.length ? (
        <RowList label={view === "open" ? "Open orders" : "Finished orders"}>
          {orders.data.items.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-strong text-fg tabular">
                      #{o.number}
                      <OrderBadges kind={o.kind} channel={o.channel} />
                    </p>
                    <p className="text-meta text-fg-muted">
                      {o.customer?.name ?? "Customer"} · {o.pickupAt ? `Pickup ${formatTime(o.pickupAt)}` : `Placed ${relativeTime(o.createdAt)}`}
                    </p>
                  </div>
                  <StatusDot domain="order" status={o.status} />
                </div>
                <ul className="text-meta text-fg">
                  {o.items.map((i) => (
                    <li key={i.id}>
                      <span className="tabular">{i.quantity} ×</span> {i.name}
                      {i.modifiers.length ? <span className="text-fg-muted"> ({i.modifiers.map((m) => m.option).join(", ")})</span> : null}
                    </li>
                  ))}
                </ul>
                {o.notes ? (
                  <p className="text-meta text-fg">
                    <span className="text-fg-muted">Note: </span>
                    {o.notes}
                  </p>
                ) : null}
                <p className="text-meta text-fg-muted tabular">
                  {formatMoney(o.totalCents)} · {o.paymentMethod === "in_app" ? `Paid in app (${o.paymentStatus})` : "Pay at pickup"}
                </p>
                {o.depositCents > 0 ? (
                  <p className="text-meta text-fg tabular">
                    Deposit {formatMoney(o.depositCents)} {o.depositPaidAt ? "paid" : "not paid yet"}
                    {o.balanceDueCents > 0 ? <span className="font-medium"> · {formatMoney(o.balanceDueCents)} due at pickup</span> : " · nothing left to pay"}
                  </p>
                ) : null}
                {o.cashDiscountCents > 0 ? <p className="text-meta text-fg-muted tabular">Cash price: {formatMoney(o.cashDiscountCents)} off</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                {(NEXT[o.status] ?? []).map((n) => (
                  <Button key={n.status} size="sm" variant={n.status === "ready" ? "primary" : "secondary"} onClick={() => move(o, n.status)}>
                    {n.label}
                  </Button>
                ))}
                {splitOn && view === "open" && canSplit(o) ? (
                  <Button size="sm" variant="secondary" onClick={() => setSplit(o)}>
                    Split bill
                  </Button>
                ) : null}
                {view === "open" ? (
                  <Button size="sm" variant="ghost" onClick={() => setCancel(o)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </RowList>
      ) : (
        <EmptyState title={view === "open" ? "No open orders" : "No finished orders yet"} description="New orders show up here automatically." />
      )}
      <SplitSheet order={split} onClose={() => setSplit(null)} onChanged={() => void orders.reload()} />
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title={`Cancel order #${cancel?.number}?`} body="The customer gets your reason and a refund if they paid in the app." confirmLabel="Cancel order" danger disabled={!reason.trim()} onConfirm={async () => {
        await api.setOrderStatus(cancel!.id, { status: "cancelled", reason: reason.trim() });
        setReason("");
        await orders.reload();
      }}>
        <TextField label="Reason (shown to the customer)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Out of croissants today, sorry" />
      </ConfirmDialog>
    </div>
  );
}
