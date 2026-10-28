"use client";
/**
 * Butcher counter (grocery.counter_preorders), docs/research/grocers.md frame D5: pre-orders by weight with a deposit and a pick-up
 * hour, the weigh-in at the scale, the Eid al-Adha plan for qurbani, and the price list. The caps, deposits, wait list and Eid
 * date rules are the pre-order engine the restaurant pack already has; only the words and the weigh-in are new.
 */
import { Suspense, useMemo, useState } from "react";
import { perUnitLabel, type commerceApi } from "@ll/shared";
import { Capsules, DataTable, Dot, EmptyState, ErrorLine, FeatureGate, PageHeader, PageTabs, Tag, useMerchant, type Column } from "@/components/dashboard";
import { EidPlan } from "@/components/dashboard/grocery/EidPlan";
import { ItemSheet } from "@/components/dashboard/grocery/ItemSheet";
import { WeighSheet, needsWeighing, weighedLines } from "@/components/dashboard/grocery/WeighSheet";
import { dayLabel, todayISO, torontoDay, torontoHM, useTabParam } from "@/components/dashboard/restaurant/common";
import { formatPhone } from "@/components/dashboard/restaurant/shared";
import { TakeOrderSheet } from "@/components/dashboard/restaurant/TakeOrderSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { RulesSheet } from "../../restaurant/preorders/Sheets";

export default function ButcherPage() {
  return (
    <FeatureGate keys={["grocery.counter_preorders"]} title="Butcher counter">
      <Suspense>
        <Butcher />
      </Suspense>
    </FeatureGate>
  );
}

const TABS = ["orders", "eid", "prices"] as const;
const clock = (iso: string) => torontoHM(iso).replace(/^(\d{2}):(\d{2})$/, (_, h: string, m: string) => `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "pm" : "am"}`);

function Butcher() {
  const { api, role } = useMerchant();
  const [tab, setTab] = useTabParam(TABS, "orders");
  const [phoneOrder, setPhoneOrder] = useState(false);
  const [rules, setRules] = useState(false);
  const canEdit = role === "owner" || role === "manager";
  const rulesState = useApi(canEdit ? () => api.preorders.rules() : null, [api, canEdit]);
  const cancelRule = useApi(canEdit ? () => api.preorders.cancelRule() : null, [api, canEdit]);
  const orders = useApi(() => api.orders({ limit: 100, includeUnpaid: "true", status: "pending,accepted,preparing,ready" }), [api], { pollMs: 30_000 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Butcher counter"
        description="Pre-orders by weight, with a deposit and a pick-up hour. Weigh at the scale, and the customer pays the real price."
        actions={
          <>
            {canEdit ? <Button size="md" variant="secondary" onClick={() => setRules(true)}>Rules and caps</Button> : null}
            <Button size="md" onClick={() => setPhoneOrder(true)}>Take a pre-order</Button>
          </>
        }
      />
      <PageTabs
        label="Butcher counter sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: "orders", label: "Pre-orders", count: (orders.data?.items ?? []).filter((o) => o.kind === "preorder").length || null },
          { id: "eid", label: "Eid al-Adha" },
          { id: "prices", label: "Price list" },
        ]}
      />
      {tab === "orders" ? <PreorderDays state={orders} /> : null}
      {tab === "eid" ? <EidPlan canEdit={canEdit} /> : null}
      {tab === "prices" ? <PriceList canEdit={canEdit} /> : null}
      {rules ? <RulesSheet rules={rulesState.data ?? { preorderDailyCap: null, capByWeekday: {}, perHourCap: null, overrides: [] }} canEdit={canEdit} cancelHours={cancelRule.data?.cancelCutoffHours ?? null} onClose={() => setRules(false)} onSaved={() => { void rulesState.reload(); void cancelRule.reload(); }} /> : null}
      <TakeOrderSheet open={phoneOrder} mode="preorder" onClose={() => setPhoneOrder(false)} onPlaced={() => void orders.reload()} />
    </div>
  );
}

function PreorderDays({ state }: { state: ReturnType<typeof useApi<{ items: commerceApi.OrderDto[]; nextCursor: string | null }>> }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [picked, setPicked] = useState<string | null>(null);
  const [weigh, setWeigh] = useState<commerceApi.OrderDto | null>(null);
  const today = todayISO();
  const all = useMemo(() => (state.data?.items ?? []).filter((o) => o.kind === "preorder" && o.pickupAt), [state.data]);
  const byDay = useMemo(() => {
    const m = new Map<string, commerceApi.OrderDto[]>();
    for (const o of all) m.set(torontoDay(o.pickupAt!), [...(m.get(torontoDay(o.pickupAt!)) ?? []), o]);
    return m;
  }, [all]);
  const days = useMemo(() => {
    const keys = new Set<string>([today, ...[...byDay.keys()].filter((d) => d >= today)]);
    return [...keys].sort().slice(0, 10);
  }, [byDay, today]);
  const day = picked ?? (byDay.has(today) ? today : days.find((d) => byDay.has(d)) ?? today);
  const rows = (byDay.get(day) ?? []).slice().sort((a, b) => a.pickupAt!.localeCompare(b.pickupAt!));
  const toWeigh = all.filter(needsWeighing).length;

  async function handedOver(o: commerceApi.OrderDto) {
    const r = await act.run(async () => {
      if (o.status === "pending") await api.setOrderStatus(o.id, { status: "accepted" });
      if (o.status !== "ready") await api.setOrderStatus(o.id, { status: "ready" });
      return api.setOrderStatus(o.id, { status: "picked_up" });
    });
    if (r) {
      toast({ message: `#${r.number} handed over`, tone: "success" });
      void state.reload();
    }
  }

  const cols: Column<commerceApi.OrderDto>[] = [
    { key: "time", header: "Pick-up", mobile: "trailing", sortValue: (o) => o.pickupAt, cell: (o) => <span className="font-medium tabular">{clock(o.pickupAt!)}</span> },
    { key: "who", header: "Customer", mobile: "title", cell: (o) => <span className="font-medium">{o.customer?.name ?? formatPhone(o.customer?.phone)}</span> },
    {
      key: "what",
      header: "What",
      mobile: "subtitle",
      cell: (o) => (
        <span>
          {o.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.name}${i.actualWeightG != null ? ` (${(i.actualWeightG / (i.weightUnit === "kg" ? 1000 : 453.59237)).toFixed(2)} ${i.weightUnit})` : ""}`).join(", ")}
        </span>
      ),
    },
    {
      key: "state",
      header: "Status",
      mobile: "subtitle",
      cell: (o) => (needsWeighing(o) ? <Tag tone="accent">Weigh at pick-up</Tag> : o.balanceDueCents === 0 ? <Dot tone="positive">Paid</Dot> : o.depositPaidAt ? <Dot tone="positive">Deposit paid</Dot> : <Dot tone="neutral">Pay at pick-up</Dot>),
    },
    { key: "bal", header: "Balance", align: "end", mobile: "hidden", sortValue: (o) => o.balanceDueCents, cell: (o) => <span className="tabular">{o.balanceDueCents ? formatMoney(o.balanceDueCents) : "–"}</span> },
    {
      key: "act",
      header: "",
      align: "end",
      mobile: "hidden",
      cell: (o) =>
        weighedLines(o).length && o.status !== "picked_up" ? (
          <span className="inline-flex gap-2">
            <Button size="sm" variant={needsWeighing(o) ? "primary" : "secondary"} onClick={() => setWeigh(o)}>{needsWeighing(o) ? "Weigh" : "Weigh again"}</Button>
            {!needsWeighing(o) ? <Button size="sm" variant="secondary" onClick={() => void handedOver(o)}>Handed over</Button> : null}
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void handedOver(o)}>Handed over</Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {state.error && !state.data ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {toWeigh ? <Banner tone="info">{toWeigh} {toWeigh === 1 ? "order is" : "orders are"} waiting for the scale. The deposit is paid on an estimate; weighing sets the final price.</Banner> : null}
      <Capsules
        label="Pick-up day"
        value={day}
        onChange={setPicked}
        options={days.map((d) => ({ value: d, label: `${d === today ? "Today" : dayLabel(d).split(",")[0]} ${d.slice(8)}`, count: byDay.get(d)?.length ?? 0 }))}
      />
      <DataTable
        caption={`Pre-orders for ${dayLabel(day)}`}
        columns={cols}
        rows={rows}
        rowKey={(o) => o.id}
        loading={state.loading && !state.data}
        empty={<EmptyState title="No pre-orders for this day" description="They show up here as customers book, by phone, WhatsApp or the shop page." />}
      />
      {weigh ? <WeighSheet order={weigh} onClose={() => setWeigh(null)} onDone={() => void state.reload()} /> : null}
    </div>
  );
}

function PriceList({ canEdit }: { canEdit: boolean }) {
  const { api } = useMerchant();
  const catalog = useApi(() => api.catalog(), [api]);
  const [sheet, setSheet] = useState<{ item: commerceApi.CatalogItemDto | null } | null>(null);
  const items = (catalog.data?.items ?? []).filter((i) => i.available && (i.weightUnit || i.preorderOnly));
  const cols: Column<commerceApi.CatalogItemDto>[] = [
    { key: "name", header: "Item", mobile: "title", cell: (i) => <span className="font-medium">{i.name}</span> },
    { key: "price", header: "Price", mobile: "trailing", cell: (i) => <span className="font-semibold tabular text-points-text">{i.weightUnit && i.unitPriceCents ? perUnitLabel(i.unitPriceCents, i.weightUnit) : formatMoney(i.priceCents)}</span> },
    { key: "est", header: "Estimate", mobile: "subtitle", cell: (i) => <span className="tabular text-fg-muted">{i.weightUnit && i.nominalWeightG ? `${formatMoney(i.priceCents)} per ${i.nominalWeightG >= 1000 ? `${i.nominalWeightG / 1000} kg` : `${i.nominalWeightG} g`}` : "Fixed price"}</span> },
    { key: "dep", header: "Deposit", mobile: "subtitle", cell: (i) => <span className="text-fg-muted">{i.depositBps ? `${(i.depositBps ?? 0) / 100}%` : "None"}</span> },
    { key: "tax", header: "HST", mobile: "hidden", cell: (i) => <span className="text-fg-muted">{i.taxable === false ? "No (zero-rated)" : "Yes"}</span> },
    { key: "act", header: "", align: "end", mobile: "hidden", cell: (i) => (canEdit ? <Button size="sm" variant="ghost" onClick={() => setSheet({ item: i })}>Edit</Button> : null) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta text-fg-muted">Items customers can pre-order, by the kg or lb or as whole animals. The scale sets the final price.</p>
        {canEdit ? <Button size="md" onClick={() => setSheet({ item: null })}>Add an item</Button> : null}
      </div>
      <DataTable caption="Price list" columns={cols} rows={items} rowKey={(i) => i.id} loading={catalog.loading && !catalog.data} error={catalog.error} onRetry={() => void catalog.reload()} empty={<EmptyState title="No butcher items yet" description="Add goat curry cut, chicken legs, or a whole goat for qurbani." />} />
      {sheet ? <ItemSheet item={sheet.item} onClose={() => setSheet(null)} onSaved={() => void catalog.reload()} /> : null}
    </div>
  );
}
