"use client";
import { useMemo, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { Capsules, EmptyState, ErrorLine, PageHeader, Segmented, SkeletonRows, StatusDot } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { OrderBadges } from "@/components/dashboard/restaurant/orderBadges";
import { formatPhone } from "@/components/dashboard/restaurant/shared";
import { SplitSheet, canSplit } from "@/components/dashboard/restaurant/SplitBill";
import { TakeOrderSheet } from "@/components/dashboard/restaurant/TakeOrderSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { hasRestaurantFeature, enabledSet } from "@/lib/dashboard/nav";
import { relativeTime } from "@/lib/dashboard/time";
import { chipOf, splitLine, type OrderChip } from "@/lib/restaurant/orders";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Order = commerceApi.OrderDto;
type Chip = OrderChip;

const NEXT: Record<string, { status: commerceApi.UpdateOrderStatusBody["status"]; label: string }[]> = {
  pending: [{ status: "accepted", label: "Accept" }],
  accepted: [{ status: "preparing", label: "Start preparing" }, { status: "ready", label: "Mark ready" }],
  preparing: [{ status: "ready", label: "Mark ready" }],
  ready: [{ status: "picked_up", label: "Handed over" }],
};
const CHANNELS: { value: string; label: string }[] = [
  { value: "all", label: "Channel: all" },
  { value: "counter", label: "Channel: counter" },
  { value: "phone", label: "Channel: phone" },
  { value: "whatsapp", label: "Channel: WhatsApp" },
  { value: "web", label: "Channel: web link" },
  { value: "app", label: "Channel: app" },
];

export default function OrdersPage() {
  return (
    <FeatureGate keys={["orders.order_ahead"]} title="Order-ahead">
      <Orders />
    </FeatureGate>
  );
}

function Orders() {
  const { api, enabled, features } = useMerchant();
  const restaurant = hasRestaurantFeature(enabledSet(features.features));
  const splitOn = enabled("restaurant.split_bills");
  const [split, setSplit] = useState<Order | null>(null);
  const [taking, setTaking] = useState(false);
  const toast = useToast();
  const [view, setView] = useState<"open" | "done">("open");
  const [chip, setChip] = useState<Chip>("all");
  const [channel, setChannel] = useState("all");
  const orders = useApi(() => api.orders(view === "open" ? {} : { status: "picked_up,cancelled,refunded", limit: 30 }), [api, view], { pollMs: view === "open" ? 10_000 : undefined });
  const [cancel, setCancel] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const act = useAction();
  const move = async (o: Order, status: commerceApi.UpdateOrderStatusBody["status"]) => {
    const r = await act.run(() => api.setOrderStatus(o.id, { status }));
    if (r) {
      toast({ message: `#${r.number}: ${copy.orderStatus[r.status] ?? r.status}`, tone: "success" });
      await orders.reload();
    }
  };

  const all = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const counts = useMemo(
    () => ({ all: all.length, new: all.filter((o) => chipOf(o) === "new").length, cooking: all.filter((o) => chipOf(o) === "cooking").length, ready: all.filter((o) => chipOf(o) === "ready").length, preorder: all.filter((o) => o.kind === "preorder").length }),
    [all],
  );
  const shown = useMemo(
    () => all.filter((o) => (view === "done" || chip === "all" || (chip === "preorder" ? o.kind === "preorder" : chipOf(o) === chip)) && (channel === "all" || o.channel === channel)),
    [all, chip, channel, view],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Orders"
        description={restaurant ? "Counter, phone, WhatsApp and web-link orders in one queue. Updates live." : "Updates every 10 seconds. Customers get a text when you mark an order ready."}
        actions={restaurant && enabled("orders.order_ahead") ? <Button size="md" onClick={() => setTaking(true)}>New counter order</Button> : undefined}
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {view === "open" ? (
          <>
            <Capsules<Chip>
              label="Filter orders"
              value={chip}
              onChange={setChip}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "new", label: "New", count: counts.new },
                { value: "cooking", label: "Cooking", count: counts.cooking },
                { value: "ready", label: "Ready", count: counts.ready },
                { value: "preorder", label: "Pre-orders", count: counts.preorder },
              ]}
            />
            {restaurant ? (
              <label className="inline-flex">
                <span className="sr-only">Channel</span>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-8 rounded-full border border-line bg-bg px-3 text-meta text-fg focus-visible:focus-ring">
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        <Segmented className="ms-auto" label="Show" value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }]} />
      </div>

      {orders.error && !orders.data ? (
        <ErrorLine message={orders.error} onRetry={orders.reload} />
      ) : orders.loading && !orders.data ? (
        <SkeletonRows rows={4} />
      ) : shown.length ? (
        <ul aria-label={view === "open" ? "Open orders" : "Finished orders"} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.id} className="min-w-0">
              <OrderCard o={o} view={view} restaurant={restaurant} canSplitIt={splitOn && view === "open" && canSplit(o)} selected={split?.id === o.id} onMove={move} onSplit={() => setSplit(o)} onCancel={() => setCancel(o)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={view === "done" ? "No finished orders yet" : all.length ? "No orders match those filters" : "No open orders"}
          description={all.length && view === "open" ? "Clear a filter to see the rest of the queue." : "New orders show up here automatically."}
          action={all.length && view === "open" ? <Button size="sm" variant="secondary" onClick={() => { setChip("all"); setChannel("all"); }}>Show every order</Button> : undefined}
        />
      )}
      <SplitSheet order={split} onClose={() => setSplit(null)} onChanged={() => void orders.reload()} />
      <TakeOrderSheet open={taking} mode="counter" onClose={() => setTaking(false)} onPlaced={() => void orders.reload()} />
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

function OrderCard({ o, view, restaurant, canSplitIt, selected, onMove, onSplit, onCancel }: { o: Order; view: "open" | "done"; restaurant: boolean; canSplitIt: boolean; selected: boolean; onMove: (o: Order, s: commerceApi.UpdateOrderStatusBody["status"]) => void; onSplit: () => void; onCancel: () => void }) {
  const who = o.customer?.name && !/^\s*$/.test(o.customer.name) ? o.customer.name : o.customer?.phone ? formatPhone(o.customer.phone) : "Customer";
  const pickup = o.pickupAt ? `pickup ${formatDate(o.pickupAt) === formatDate(new Date()) ? "" : `${formatDate(o.pickupAt, true)} `}${formatTime(o.pickupAt)}` : `placed ${relativeTime(o.createdAt)}`;
  return (
    <article aria-label={`Order ${o.number}`} className={cn("flex h-full flex-col gap-2.5 rounded-card border bg-bg p-5", selected ? "border-2 border-fg" : "border-line")}>
      <header className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-[18px] font-semibold leading-6 text-fg tabular">
          #{o.number}
          <OrderBadges kind={o.kind} channel={o.channel} />
        </p>
        <StatusDot domain="order" status={o.status} />
      </header>
      <p className="text-meta text-fg-muted">
        {who} · {pickup}
      </p>
      {o.allergyNote ? (
        <p className="rounded-sm bg-negative/10 px-2 py-1 text-meta font-medium text-negative">Allergy: {o.allergyNote}</p>
      ) : null}
      <ul className="text-body text-fg">
        {o.items.map((i) => (
          <li key={i.id}>
            <span className="tabular">{i.quantity} ×</span> {i.name}
            {i.modifiers.length ? <span className="text-fg-muted"> ({i.modifiers.map((m) => m.option).join(", ")})</span> : null}
          </li>
        ))}
      </ul>
      {o.notes ? <p className="rounded-sm bg-bg-muted px-2.5 py-2 text-meta text-fg">{o.notes}</p> : null}
      {o.splits?.length ? <p className="rounded-sm bg-bg-muted px-2.5 py-2 text-meta text-fg">{splitLine(o.splits)}</p> : null}
      <p className="text-meta text-fg-muted tabular">
        {o.depositCents > 0 ? (
          <span className="font-medium text-fg">
            Deposit {formatMoney(o.depositCents)} {o.depositPaidAt ? "paid" : "not paid yet"}
            {o.balanceDueCents > 0 ? ` · ${formatMoney(o.balanceDueCents)} due at pickup` : " · nothing left to pay"}
          </span>
        ) : o.paymentMethod === "in_app" ? (
          `Paid online · ${formatMoney(o.totalCents)}${o.paymentStatus === "paid" ? "" : ` (${o.paymentStatus})`}`
        ) : (
          `${formatMoney(o.totalCents)} · ${restaurant && o.channel === "counter" ? "pay at table" : "pay at pickup"}`
        )}
        {o.cashDiscountCents > 0 ? ` · cash price ${formatMoney(o.cashDiscountCents)} off` : ""}
      </p>
      {view === "open" ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {(NEXT[o.status] ?? []).map((n, idx) => (
            <Button key={n.status} size="sm" variant={idx === 0 || n.status === "ready" ? "primary" : "secondary"} onClick={() => onMove(o, n.status)}>
              {n.label}
            </Button>
          ))}
          {canSplitIt ? (
            <Button size="sm" variant="secondary" onClick={onSplit}>
              Split bill
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </article>
  );
}
