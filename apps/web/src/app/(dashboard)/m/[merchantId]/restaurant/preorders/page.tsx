"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { DataTable, Dot, ErrorLine, PageHeader, StatBlock, type Column } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { DOW_SHORT, addDaysISO, dayLabel, dowOf, todayISO, torontoHM, weekStartISO } from "@/components/dashboard/restaurant/common";
import { CopyButton, RestaurantGate, formatPhone } from "@/components/dashboard/restaurant/shared";
import { TakeOrderSheet } from "@/components/dashboard/restaurant/TakeOrderSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { cancelRuleInWords, capsInWords, channelMix, depositInWords, fireInWords, noticeInWords, pickupsInWords } from "@/lib/restaurant/preorders";
import { RecipeSheet, RulesSheet, WaitlistSheet } from "./Sheets";

export default function PreordersPage() {
  return (
    <RestaurantGate featureKey="restaurant.degh_preorders" title="Pre-orders">
      <Suspense>
        <Preorders />
      </Suspense>
    </RestaurantGate>
  );
}

const CHANNEL_LABEL: Record<string, string> = { counter: "Counter", phone: "Phone", whatsapp: "WhatsApp", web: "Web link", app: "App" };

function Preorders() {
  const { api, role } = useMerchant();
  const params = useSearchParams();
  const today = todayISO();
  const [week, setWeek] = useState(weekStartISO(params.get("from") && params.get("rules") ? (params.get("from") as string) : today));
  const [picked, setDay] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(params.get("rules") === "open");
  const [recipes, setRecipes] = useState(false);
  const [waitlist, setWaitlist] = useState(false);
  const [phoneOrder, setPhoneOrder] = useState(false);
  const from = week;
  const to = addDaysISO(week, 6);
  const state = useApi(() => api.preorders.list({ from, to }), [api, from, to], { pollMs: 30_000 });
  const catalog = useApi(() => api.catalog(), [api]);
  const cancelRule = useApi(() => api.preorders.cancelRule(), [api]);
  const canEdit = role === "owner" || role === "manager";

  const byDate = useMemo(() => new Map((state.data?.days ?? []).map((d) => [d.date, d])), [state.data]);
  const capOf = useMemo(() => new Map((state.data?.caps ?? []).map((c) => [c.date, c])), [state.data]);
  // Until a day is picked, open on today, or the first day this week that has pots when today is empty.
  const busyDays = (state.data?.days ?? []).filter((d) => d.pots > 0);
  const firstBusy = (busyDays.find((d) => d.date >= today) ?? busyDays[0])?.date;
  const day = picked ?? (byDate.get(today)?.pots ? today : firstBusy ?? (today >= from && today <= to ? today : from));
  const strip = Array.from({ length: 7 }, (_, i) => addDaysISO(week, i));
  const cur = byDate.get(day);
  const cap = cur?.cap ?? capOf.get(day)?.cap ?? null;
  const note = capOf.get(day)?.note ?? null;
  const potItems = useMemo(() => (catalog.data?.items ?? []).filter((i) => i.preorderOnly && i.available), [catalog.data]);
  const orders = cur?.orders ?? [];
  const balance = orders.reduce((a, o) => a + o.balanceDueCents, 0);
  const deposits = orders.filter((o) => o.depositPaid && o.status !== "picked_up").reduce((a, o) => a + o.depositCents, 0);
  const totals = orders.filter((o) => o.depositPaid && o.status !== "picked_up").reduce((a, o) => a + o.totalCents, 0);
  const waitingThisWeek = [...(state.data?.days ?? [])].reduce((a, d) => a + d.waitlist, 0);
  const waitingDay = [...(state.data?.days ?? [])].find((d) => d.waitlist > 0);

  const move = (n: number) => {
    setWeek(addDaysISO(week, n * 7));
    setDay(addDaysISO(week, n * 7));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Pre-orders"
        description="Pots and trays booked ahead. See what to cook, what to buy and who still owes a balance."
        actions={
          <>
            <Button size="md" variant="secondary" onClick={() => setRulesOpen(true)}>Rules and caps</Button>
            <Button size="md" onClick={() => setPhoneOrder(true)}>Take a phone pre-order</Button>
          </>
        }
      />

      <section aria-label="Pick a day" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta-strong text-fg tabular">{dayLabel(week).replace(/^\w+, /, "")} to {dayLabel(to).replace(/^\w+, /, "")}</p>
          <div className="flex items-center gap-1.5 print:hidden">
            <button type="button" aria-label="Previous week" onClick={() => move(-1)} className="inline-flex size-8 items-center justify-center rounded-input border border-line hover:bg-bg-subtle focus-visible:focus-ring">
              <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
            </button>
            <button type="button" onClick={() => { setWeek(weekStartISO(today)); setDay(today); }} className="inline-flex h-8 items-center rounded-input px-2.5 text-meta font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
              Today
            </button>
            <button type="button" aria-label="Next week" onClick={() => move(1)} className="inline-flex size-8 items-center justify-center rounded-input border border-line hover:bg-bg-subtle focus-visible:focus-ring">
              <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
        <div role="group" aria-label="Days of the week" className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {strip.map((d) => {
            const v = byDate.get(d);
            const dayCap = v?.cap ?? capOf.get(d)?.cap ?? null;
            const pots = v?.pots ?? 0;
            const sel = d === day;
            const hot = dayCap != null && pots / Math.max(1, dayCap) >= 0.85;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={sel}
                aria-label={`${dayLabel(d)}: ${pots} ${pots === 1 ? "pot" : "pots"}${dayCap != null ? ` of ${dayCap}` : ""}`}
                onClick={() => setDay(d)}
                className={cn("flex min-h-[84px] flex-col items-stretch justify-between rounded-card border p-2 text-start transition-colors focus-visible:focus-ring sm:min-h-[88px] sm:p-3", sel ? "border-primary bg-primary text-primary-foreground" : "border-line bg-card hover:bg-bg-subtle")}
              >
                <span className={cn("block text-caption", sel ? "text-primary-foreground/70" : "text-fg-muted")}>{DOW_SHORT[dowOf(d)]}</span>
                <span className="block text-headline tabular">{Number(d.slice(8))}</span>
                <span className={cn("block text-caption tabular", sel ? "text-primary-foreground/80" : hot ? "font-medium text-points-text" : "text-fg-muted")}>
                  {pots}
                  {dayCap != null ? ` of ${dayCap}` : ""}
                  <span className="hidden sm:inline"> {pots === 1 && dayCap == null ? "pot" : "pots"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {state.error && !state.data ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}

      <StatBlock
        label={`Pots on ${dayLabel(day)}`}
        loading={state.loading && !state.data}
        items={[
          { label: `Pots booked, ${dayLabel(day).replace(",", "")}`, value: cap != null ? `${cur?.pots ?? 0} of ${cap}` : cur?.pots ?? 0, caption: note ? note : cap == null ? "No daily cap" : undefined },
          { label: "Pots left", value: cap != null ? Math.max(0, cap - (cur?.pots ?? 0)) : "Open", caption: cap != null && (cur?.pots ?? 0) >= cap ? "Full" : cap != null && cap - (cur?.pots ?? 0) <= 2 ? <span className="text-points-text">Almost gone</span> : undefined },
          { label: "Orders", value: orders.length, caption: channelMix(orders) || undefined },
          { label: "Balances due at pickup", value: formatMoney(balance), caption: deposits ? `Deposits held: ${formatMoney(deposits)}${totals ? ` (${Math.round((deposits / totals) * 100)}%)` : ""}` : undefined },
        ]}
      />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <CookAndBuy day={day} plan={cur?.plan ?? []} shopping={cur?.shopping ?? null} loading={state.loading && !state.data} onRecipes={() => setRecipes(true)} />
          <OrdersForDay day={day} orders={orders} loading={state.loading && !state.data} onChanged={() => void state.reload()} />
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <RulesCard rules={state.data?.rules ?? null} cancelHours={cancelRule.data ? cancelRule.data.cancelCutoffHours : undefined} items={potItems} onEdit={() => setRulesOpen(true)} />
          <section aria-labelledby="wl-h">
            <h2 id="wl-h" className="mb-3 text-[15px] font-semibold text-fg">Wait list</h2>
            <div className="flex flex-col gap-3 rounded-card bg-card shadow-card p-5">
              <p className="text-meta text-fg-muted">When a day is full, guests join a wait list. A cancel frees a pot and we message the first in line on WhatsApp or text, once.</p>
              <button type="button" onClick={() => setWaitlist(true)} className="h-10 rounded-full border border-line px-4 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                {waitingThisWeek ? `${waitingThisWeek} ${waitingThisWeek === 1 ? "person" : "people"} waiting${waitingDay ? ` for ${dayLabel(waitingDay.date).split(",")[0]}` : ""}` : "No one is waiting this week"}
              </button>
            </div>
          </section>
        </aside>
      </div>

      {rulesOpen ? <RulesSheet rules={state.data?.rules ?? { preorderDailyCap: null, capByWeekday: {}, perHourCap: null, overrides: [] }} canEdit={canEdit} draft={params.get("rules") === "open" && params.get("from") ? { label: params.get("label") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? params.get("from") ?? "" } : null} cancelHours={cancelRule.data?.cancelCutoffHours ?? null} onClose={() => setRulesOpen(false)} onSaved={() => { void state.reload(); void cancelRule.reload(); }} /> : null}
      {recipes ? <RecipeSheet onClose={() => setRecipes(false)} onSaved={() => { void state.reload(); void catalog.reload(); }} /> : null}
      {waitlist ? <WaitlistSheet from={from} to={to} onClose={() => setWaitlist(false)} /> : null}
      <TakeOrderSheet open={phoneOrder} mode="preorder" onClose={() => setPhoneOrder(false)} onPlaced={() => void state.reload()} />
    </div>
  );
}

function CookAndBuy({ day, plan, shopping, loading, onRecipes }: { day: string; plan: restaurantApi.PreorderPlanLine[]; shopping: restaurantApi.PreorderShopping | null; loading: boolean; onRecipes: () => void }) {
  const missing = plan.filter((p) => !p.hasRecipe);
  const cols: Column<restaurantApi.PreorderPlanLine>[] = [
    { key: "dish", header: "Dish", mobile: "title", cell: (p) => <span className="font-medium">{p.name.replace(/\s*\(serves.*\)/i, "")}</span> },
    { key: "pots", header: "Pots", align: "end", mobile: "trailing", cell: (p) => <span className="tabular">{p.pots}</span> },
    { key: "fire", header: "Fire at", mobile: "subtitle", cell: (p) => <span className="tabular">{p.fireAt ? fireInWords(p.fireAt) : <span className="text-fg-muted">Set cook time</span>}</span> },
    { key: "rice", header: "Rice", mobile: "subtitle", cell: (p) => <span className="tabular">{p.riceKg != null ? `${p.riceKg} kg` : "–"}</span> },
    { key: "meat", header: "Meat", mobile: "subtitle", cell: (p) => <span className="tabular">{p.meatKg != null ? `${p.meatKg} kg${p.meatKind && !p.name.toLowerCase().includes(p.meatKind) ? ` ${p.meatKind}` : ""}` : "–"}</span> },
    { key: "pickups", header: "Pickups", mobile: "subtitle", cell: (p) => <span className="tabular">{pickupsInWords(p.firstPickupAt, p.lastPickupAt)}</span> },
  ];
  return (
    <section aria-labelledby="cook-h" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="cook-h" className="text-[15px] font-semibold text-fg">What to cook and buy</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">From your per-pot recipes. Quantities are estimates, not measured.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onRecipes}>Edit recipes</Button>
      </div>
      <DataTable
        caption={`What to cook on ${dayLabel(day)}`}
        columns={cols}
        rows={plan}
        rowKey={(p) => p.catalogItemId ?? p.name}
        loading={loading}
        empty={<span className="text-meta text-fg-muted">Nothing to cook for this day yet. Pre-orders show up here as guests book.</span>}
      />
      {plan.length && missing.length ? (
        <Banner tone="neutral" action={<Button size="sm" variant="secondary" onClick={onRecipes}>Add per-pot recipes</Button>}>
          {missing.length === plan.length ? "Add per-pot recipes to see rice, meat and the shopping list." : `No recipe yet for ${missing.map((m) => m.name.replace(/\s*\(serves.*\)/i, "")).join(", ")}.`}
        </Banner>
      ) : null}
      {shopping ? (
        <div className="flex flex-col gap-3 rounded-card bg-hover bg-bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-fg">
            <span className="font-semibold">Shopping list for {dayLabel(day).split(",")[0]} (estimate):</span> {shopping.items.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(" · ")}
          </p>
          <CopyButton text={`Order for ${dayLabel(day)} (estimate from our recipes): ${shopping.text}`} label="Copy for supplier" />
        </div>
      ) : null}
    </section>
  );
}

function OrdersForDay({ day, orders, loading, onChanged }: { day: string; orders: restaurantApi.PreorderOrderDto[]; loading: boolean; onChanged: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [working, setWorking] = useState<string | null>(null);
  const remind = async (o: restaurantApi.PreorderOrderDto) => {
    setWorking(o.orderId);
    const r = await act.run(() => api.orderTools.remindBalance(o.orderId));
    setWorking(null);
    if (!r) return;
    if (r.sent) toast({ message: `Reminder sent to ${o.customerName ?? "the guest"} on ${r.channel === "whatsapp" ? "WhatsApp" : "text"}`, tone: "success" });
    else toast({ message: r.reason === "too_soon" ? "They were reminded a few hours ago." : r.reason === "no_consent" ? "No consent to message this guest. Call them instead." : r.reason === "no_phone" ? "There is no phone number on this order." : "Nothing is due on this order.", tone: "neutral" });
    onChanged();
  };
  const handedOver = async (o: restaurantApi.PreorderOrderDto) => {
    setWorking(o.orderId);
    const r = await act.run(async () => {
      if (o.status === "pending") await api.setOrderStatus(o.orderId, { status: "accepted" });
      if (o.status !== "ready") await api.setOrderStatus(o.orderId, { status: "ready" });
      return api.setOrderStatus(o.orderId, { status: "picked_up" });
    });
    setWorking(null);
    if (r) {
      toast({ message: `#${r.number} handed over`, tone: "success" });
      onChanged();
    }
  };
  const cols: Column<restaurantApi.PreorderOrderDto>[] = [
    { key: "time", header: "Pickup", mobile: "trailing", sortValue: (o) => o.pickupAt, cell: (o) => <span className="font-medium tabular">{formatClock(o.pickupAt)}</span> },
    {
      key: "who",
      header: "Guest",
      mobile: "title",
      cell: (o) => (
        <span className="block min-w-0">
          <span className="block font-medium">{o.customerName ?? formatPhone(o.customerPhone)}</span>
          {o.allergyNote ? <span className="block text-caption font-medium text-negative">Allergy: {o.allergyNote}</span> : null}
        </span>
      ),
    },
    { key: "items", header: "What", mobile: "subtitle", cell: (o) => <span className="text-fg">{o.items.map((i) => `${i.quantity} ${i.name.replace(/\s*\(serves.*\)/i, "")}`).join(", ")}</span> },
    { key: "channel", header: "Channel", mobile: "subtitle", cell: (o) => <span className="text-fg-muted">{CHANNEL_LABEL[o.channel] ?? o.channel}</span> },
    {
      key: "balance",
      header: "Balance",
      mobile: "subtitle",
      sortValue: (o) => o.balanceDueCents,
      cell: (o) => (o.balanceDueCents ? <span className="font-medium tabular">{formatMoney(o.balanceDueCents)} due</span> : <span className="text-positive-text">Paid</span>),
    },
    {
      key: "act",
      header: "",
      align: "end",
      mobile: "hidden",
      cell: (o) =>
        o.status === "picked_up" ? (
          <Dot tone="neutral">Picked up</Dot>
        ) : o.balanceDueCents > 0 ? (
          <Button size="sm" variant="secondary" loading={working === o.orderId} onClick={() => void remind(o)}>Remind</Button>
        ) : (
          <Button size="sm" variant="secondary" loading={working === o.orderId} onClick={() => void handedOver(o)}>Handed over</Button>
        ),
    },
  ];
  return (
    <section aria-labelledby="ord-h" className="flex flex-col gap-3">
      <div>
        <h2 id="ord-h" className="text-[15px] font-semibold text-fg">Orders for {dayLabel(day).split(",")[0]}</h2>
        <p className="mt-0.5 text-[13px] text-fg-muted">Pickup time, deposit and what is left to pay</p>
      </div>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <DataTable caption="Pre-orders for the day" columns={cols} rows={orders} rowKey={(o) => o.orderId} loading={loading} empty={<span className="text-meta text-fg-muted">No orders for this day yet.</span>} />
    </section>
  );
}

const formatClock = (iso: string) => torontoHM(iso).replace(/^(\d{2}):(\d{2})$/, (_, h: string, m: string) => `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "pm" : "am"}`);

function RulesCard({ rules, cancelHours, items, onEdit }: { rules: restaurantApi.PreorderRulesResponse | null; cancelHours: number | null | undefined; items: { name: string; leadTimeHours?: number; depositBps?: number }[]; onEdit: () => void }) {
  const rows = rules
    ? [
        { label: "Daily pots", value: capsInWords(rules) },
        { label: "Pickup crowding", value: rules.perHourCap ? `Max ${rules.perHourCap} pots per hour` : "No limit per hour" },
        { label: "Notice", value: noticeInWords(items.map((i) => ({ name: i.name, leadTimeHours: i.leadTimeHours ?? 0 }))) },
        { label: "Deposit", value: depositInWords(items.map((i) => ({ depositBps: i.depositBps ?? 0 }))) },
        ...(cancelHours === undefined ? [] : [{ label: "Cancelling", value: cancelRuleInWords(cancelHours) }]),
        ...rules.overrides.map((o) => ({ label: `${o.label}, ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${o.from}T12:00:00Z`))}${o.to !== o.from ? ` to ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${o.to}T12:00:00Z`))}` : ""}`, value: `${o.cap} pots${o.leadHours != null ? `, cut-off ${o.leadHours} h` : ""}` })),
      ]
    : [];
  return (
    <section aria-labelledby="rules-h">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="rules-h" className="text-[15px] font-semibold text-fg">Rules for guests</h2>
        <button type="button" onClick={onEdit} className="text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring">Edit</button>
      </div>
      <dl className="rounded-card bg-card shadow-card">
        {rows.length ? (
          rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className={cn("px-5 py-3", i > 0 && "border-t border-line")}>
              <dt className="text-meta text-fg-muted">{r.label}</dt>
              <dd className="mt-0.5 text-body font-medium text-fg">{r.value}</dd>
            </div>
          ))
        ) : (
          <div className="skeleton m-5 h-24 rounded-sm" />
        )}
      </dl>
      <p className="mt-2 text-caption text-fg-muted">Dates follow moon sighting. Confirm Eid locally before you announce it.</p>
    </section>
  );
}
