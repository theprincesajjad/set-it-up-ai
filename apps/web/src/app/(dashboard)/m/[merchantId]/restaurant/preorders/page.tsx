"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { DataTable, Dot, EmptyState, Meter, PageHeader, Panel, RowList, Row, Section, StatBlock, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { DOW_SHORT, addDaysISO, dayLabel, dowOf, todayISO, torontoHM, weekStartISO } from "@/components/dashboard/restaurant/common";
import { RestaurantGate, formatPhone } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { NumberField } from "@/components/dashboard/restaurant/common";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function PreordersPage() {
  return (
    <RestaurantGate featureKey="restaurant.degh_preorders" title="Pre-orders">
      <Preorders />
    </RestaurantGate>
  );
}

function Preorders() {
  const { api, role } = useMerchant();
  const today = todayISO();
  const [week, setWeek] = useState(weekStartISO(today));
  const [picked, setDay] = useState<string | null>(null);
  const from = week;
  const to = addDaysISO(week, 6);
  const state = useApi(() => api.preorders.list({ from, to }), [api, from, to], { pollMs: 30_000 });
  const settings = useApi(() => api.preorders.settings(), [api]);

  const byDate = new Map((state.data?.days ?? []).map((d) => [d.date, d]));
  // Until a day is picked, open on today, or the first day this week that has pots when today is empty.
  const firstBusy = (state.data?.days ?? []).find((d) => d.pots > 0)?.date;
  const day = picked ?? (byDate.get(today)?.pots ? today : firstBusy ?? (today >= from && today <= to ? today : from));
  const strip = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const cur = byDate.get(day);
  const cap = cur?.cap ?? settings.data?.preorderDailyCap ?? null;

  const move = (n: number) => {
    setWeek(addDaysISO(week, n * 7));
    setDay(addDaysISO(week, n * 7));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Pre-orders" description="Pots of biryani, haleem and nihari booked ahead. See what to cook and who owes a balance." />

      <section aria-label="Pick a day" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta-strong text-fg tabular">{dayLabel(week).replace(/^\w+, /, "")} to {dayLabel(to).replace(/^\w+, /, "")}</p>
          <div className="flex items-center gap-1.5 print:hidden">
            <button type="button" aria-label="Previous week" onClick={() => move(-1)} className="inline-flex size-8 items-center justify-center rounded-input border border-line hover:bg-bg-subtle focus-visible:focus-ring">
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button type="button" onClick={() => { setWeek(weekStartISO(today)); setDay(today); }} className="inline-flex h-8 items-center rounded-input px-2.5 text-meta font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
              Today
            </button>
            <button type="button" aria-label="Next week" onClick={() => move(1)} className="inline-flex size-8 items-center justify-center rounded-input border border-line hover:bg-bg-subtle focus-visible:focus-ring">
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
        <div role="group" aria-label="Days of the week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {strip.map((d) => {
            const v = byDate.get(d);
            const sel = d === day;
            const full = v?.cap != null && v.pots >= v.cap;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={sel}
                aria-label={`${dayLabel(d)}: ${v?.pots ?? 0} ${v?.pots === 1 ? "pot" : "pots"}${v?.cap != null ? ` of ${v.cap}` : ""}`}
                onClick={() => setDay(d)}
                className={cn("flex min-h-[84px] flex-col items-stretch justify-between rounded-card border p-2 text-start transition-colors focus-visible:focus-ring sm:min-h-[96px] sm:p-3", sel ? "border-fg bg-fg text-bg" : "border-line bg-bg hover:bg-bg-subtle")}
              >
                <span>
                  <span className={cn("block text-caption", sel ? "text-bg/70" : "text-fg-muted")}>{DOW_SHORT[dowOf(d)]}</span>
                  <span className="block text-headline tabular">{Number(d.slice(8))}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className={cn("text-caption tabular", sel ? "text-bg/80" : full ? "font-medium text-fg" : "text-fg-muted")}>
                    {v?.pots ?? 0}
                    {v?.cap != null ? `/${v.cap}` : ""}
                    <span className="hidden sm:inline"> {v?.pots === 1 ? "pot" : "pots"}</span>
                  </span>
                  {v?.cap != null ? <span className={cn("block h-1 overflow-hidden rounded-full", sel ? "bg-bg/25" : "bg-bg-muted")}><span className={cn("block h-full rounded-full", sel ? "bg-bg" : "bg-fg")} style={{ width: `${Math.min(100, (v.pots / v.cap) * 100)}%` }} /></span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {state.error && !state.data ? <Banner tone="danger" action={<Button size="sm" variant="ghost" onClick={() => void state.reload()}>Try again</Button>}>{state.error}</Banner> : null}

      <StatBlock
        label={`Pots on ${dayLabel(day)}`}
        loading={state.loading && !state.data}
        items={[
          { label: "Pots booked", value: cur?.pots ?? 0, caption: cap != null ? `of ${cap} a day` : "No daily cap" },
          { label: "Pots left", value: cap != null ? Math.max(0, cap - (cur?.pots ?? 0)) : "Open", caption: cap != null && (cur?.pots ?? 0) >= cap ? "Full" : undefined },
          { label: "Orders", value: cur?.orders.length ?? 0 },
          { label: "Balances due", value: formatMoney((cur?.orders ?? []).reduce((a, o) => a + o.balanceDueCents, 0)), caption: "At pickup" },
        ]}
      />
      {cap != null ? <Meter value={cur?.pots ?? 0} max={cap} label={`${cur?.pots ?? 0} of ${cap} pots booked on ${dayLabel(day)}`} tone={(cur?.pots ?? 0) >= cap ? "accent" : "fg"} className="-mt-3" /> : null}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Prep list" description={`What to cook for ${dayLabel(day)}.`}>
            {cur?.prep.length ? (
              <RowList label="Prep list">
                {cur.prep.map((p) => (
                  <Row key={`${p.catalogItemId}-${p.name}`} title={p.name} meta={p.serves ? `Serves ${p.serves} in all` : undefined} trailing={<span className="text-title font-semibold">× {p.quantity}</span>} />
                ))}
              </RowList>
            ) : (
              <EmptyState title="Nothing to cook for this day" description="Pre-orders for this day will show up here as customers book." />
            )}
          </Section>

          <Section title="Orders" description="Pickup time, deposit and what's left to pay.">
            <OrderTable orders={cur?.orders ?? []} loading={state.loading && !state.data} />
          </Section>
        </div>

        <aside className="xl:sticky xl:top-4">
          <CapForm cap={settings.data?.preorderDailyCap ?? null} loaded={!!settings.data} canEdit={role === "owner" || role === "manager"} onSaved={() => { void settings.reload(); void state.reload(); }} />
        </aside>
      </div>
    </div>
  );
}

function OrderTable({ orders, loading }: { orders: restaurantApi.PreorderOrderDto[]; loading: boolean }) {
  const cols: Column<restaurantApi.PreorderOrderDto>[] = [
    { key: "time", header: "Pickup", mobile: "trailing", sortValue: (o) => o.pickupAt, cell: (o) => <span className="font-medium tabular">{torontoHM(o.pickupAt)}</span> },
    {
      key: "who",
      header: "Order",
      mobile: "title",
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block font-medium">#{o.number} · {o.customerName ?? "Customer"}</span>
          {o.customerPhone ? <span className="block text-caption text-fg-muted">{formatPhone(o.customerPhone)}</span> : null}
        </span>
      ),
    },
    { key: "items", header: "What", mobile: "subtitle", cell: (o) => <span className="text-fg-muted">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</span> },
    { key: "total", header: "Total", align: "end", mobile: "hidden", sortValue: (o) => o.totalCents, cell: (o) => formatMoney(o.totalCents) },
    { key: "deposit", header: "Deposit", mobile: "subtitle", cell: (o) => (o.depositCents ? (o.depositPaid ? <Dot tone="positive">{formatMoney(o.depositCents)} paid</Dot> : <Dot tone="accent">{formatMoney(o.depositCents)} due</Dot>) : <span className="text-fg-subtle">None</span>) },
    { key: "balance", header: "Balance", align: "end", mobile: "hidden", sortValue: (o) => o.balanceDueCents, cell: (o) => (o.balanceDueCents ? <span className="font-medium">{formatMoney(o.balanceDueCents)}</span> : <span className="text-fg-muted">Paid</span>) },
  ];
  return <DataTable caption="Pre-orders for the day" columns={cols} rows={orders} rowKey={(o) => o.orderId} loading={loading} empty={<span className="text-meta text-fg-muted">No orders for this day yet.</span>} />;
}

function CapForm({ cap, loaded, canEdit, onSaved }: { cap: number | null; loaded: boolean; canEdit: boolean; onSaved: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [v, setV] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(cap == null ? "" : String(cap));
  }, [cap]);
  const next = v.trim() === "" ? null : Number(v);
  const bad = next !== null && (!Number.isInteger(next) || next < 1 || next > 1000);
  return (
    <Panel
      title="Daily cap"
      description="The most pots you'll cook on one day. Customers see a day as full once it's reached."
      footer={
        <div className="flex justify-end">
          <Button size="sm" disabled={!canEdit || !loaded || bad || next === cap} loading={act.busy} onClick={async () => {
            const r = await act.run(() => api.preorders.saveSettings(next));
            if (r) {
              toast({ message: r.preorderDailyCap ? `Cap set to ${r.preorderDailyCap} pots a day` : "Daily cap removed", tone: "success" });
              onSaved();
            }
          }}>
            Save cap
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <NumberField label="Pots per day" suffix="pots" value={v} onChange={setV} hint={canEdit ? "Leave empty for no cap." : "Only owners and managers can change this."} error={bad ? "Use a whole number from 1 to 1,000." : null} />
      </div>
    </Panel>
  );
}
