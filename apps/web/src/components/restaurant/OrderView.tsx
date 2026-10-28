"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { commerceApi, restaurantWebApi } from "@ll/shared";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserApi, browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { cartCount, cartSubtotal, idempotencyKeyFor, pickupDays, priceDish, pruneCart, taxOf, type CartLine, type Item, type PickupDay } from "@/lib/restaurant/order";
import { dayDate } from "@/lib/restaurant/util";
import { isWeighedLine } from "@/lib/restaurant/weighed";
import { PayPanel } from "./PayPanel";
import { ChoiceRow, Heading, ShopHead, Stepper, useFmt } from "./ui";
import { useCart } from "./useCart";

const api = restaurantCustomerApi(browserClient);

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };

/**
 * /shops/<slug>/order: pickup checkout. Cart from the menu, ASAP or a later time, the phone number as the account
 * (a text code, no password), then card or Apple Pay now, or pay at the counter. Prices are the server's; this page previews them.
 */
export function OrderView({ shop, menu, restaurant, signedIn, userName, devAutofill }: { shop: Shop; menu: commerceApi.PublicMenuResponse; restaurant: restaurantWebApi.PublicRestaurantResponse | null; signedIn: boolean; userName: string; devAutofill?: boolean }) {
  const { t, money, number, date, locale } = useFmt();
  const router = useRouter();
  const { cart, ready, setQty: setLineQty, clear, replace } = useCart(shop.slug);
  const all = useMemo(() => [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized], [menu]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i] as const)), [all]);

  const [when, setWhen] = useState<"asap" | "later">("asap");
  const [days, setDays] = useState<PickupDay[] | null>(null);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [method, setMethod] = useState<"in_app" | "at_pickup">(menu.payInApp ? "in_app" : "at_pickup");
  const [name, setName] = useState(userName);
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<commerceApi.PlaceOrderResponse | null>(null);
  const [dropped, setDropped] = useState(0);

  // A cart saved yesterday may hold a dish that is gone: drop it quietly and say so.
  useEffect(() => {
    if (!ready) return;
    const pruned = pruneCart(cart, byId);
    if (pruned.lines.length !== cart.lines.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDropped(cart.lines.length - pruned.lines.length);
      replace(pruned);
    }
  }, [ready, cart, byId, replace]);

  const quotedWait = restaurant?.quotedWaitMin ?? 20;
  const hours = menu.locations[0]?.hours ?? null;
  function chooseLater() {
    const d = pickupDays(hours, new Date(), quotedWait);
    setDays(d);
    setWhen("later");
    setDay(d[0]?.date ?? "");
    setTime(d[0]?.times[0]?.iso ?? "");
  }
  const dayTimes = days?.find((d) => d.date === day)?.times ?? [];

  const lines = cart.lines.filter((l) => byId.has(l.itemId));
  const subtotal = cartSubtotal({ lines }, byId);
  // Zero-rated groceries (raw meat, flour, rice) carry no tax: the server charges tax on the taxable lines only, so the preview does too.
  const taxableSubtotal = cartSubtotal({ lines: lines.filter((l) => byId.get(l.itemId)?.taxable !== false) }, byId);
  const tax = taxOf(taxableSubtotal, menu.tax.ratePpm);
  const anyZeroRated = lines.some((l) => byId.get(l.itemId)?.taxable === false);
  // Meat cut to order is never "ready in 20 minutes": the customer picks a time.
  const cutToOrder = lines.some((l) => isWeighedLine(byId.get(l.itemId)!));
  const laterOk = (when === "asap" && !cutToOrder) || (when === "later" && !!time && dayTimes.some((x) => x.iso === time));
  useEffect(() => {
    // Cut to order has no "as soon as possible": open the time picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cutToOrder && when === "asap") chooseLater();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutToOrder, when]);
  const total = subtotal + tax;
  const canPickup = restaurant ? restaurant.features.pickup && restaurant.acceptingOrders : true;
  const base = `/shops/${encodeURIComponent(shop.slug)}`;
  const location = menu.locations[0];

  async function place() {
    if (!location || !lines.length || !laterOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() && name.trim() !== userName.trim()) await browserApi.me.updateProfile({ name: name.trim() });
      const pickupAt = when === "later" ? time : null;
      const signature = JSON.stringify([lines.map((l) => [l.key, l.qty]), pickupAt, method]);
      const res = await api.placeOrder(
        { merchantId: menu.merchant.id, locationId: location.id, items: lines.map((l) => ({ catalogItemId: l.itemId, quantity: l.qty, modifiers: [], optionIds: l.optionIds })), pickupAt, paymentMethod: method, kind: "pickup", channel: "web", tipCents: 0 },
        idempotencyKeyFor(shop.slug, signature),
      );
      if (whatsapp && restaurant?.whatsappNumber) void api.whatsappConsent(menu.merchant.id, true, locale).catch(() => undefined);
      if (res.payment && res.order.paymentStatus !== "paid") {
        setPlaced(res);
      } else {
        clear();
        router.push(`/o/${res.order.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <>
      <ShopHead shop={shop} href={base} />
      <Heading>{t("rs.order.title")}</Heading>
    </>
  );

  if (placed?.payment) {
    return (
      <div className="flex flex-col gap-6">
        {head}
        <section aria-label={t("rs.order.payTitle")} className="flex flex-col gap-4">
          <Heading level={2}>{t("rs.order.payTitle")}</Heading>
          <p className="text-body text-fg-muted">{t("rs.order.payBody", { shop: shop.name })}</p>
          <PayPanel
            orderId={placed.order.id}
            payment={placed.payment}
            label={t("orderPay.pay", { amount: money(placed.payment.amountCents) })}
            done={(o) => o.paymentStatus === "paid"}
            onDone={() => {
              clear();
              router.push(`/o/${placed.order.id}`);
            }}
            orderHref={`/o/${placed.order.id}`}
          />
        </section>
      </div>
    );
  }

  if (!ready) return <div className="flex flex-col gap-6">{head}</div>;
  if (!lines.length)
    return (
      <div className="flex flex-col gap-6">
        {head}
        {dropped ? <Banner tone="info">{t("rs.order.dropped")}</Banner> : null}
        <EmptyState title={t("rs.order.empty")} description={t("rs.order.emptyBody")} action={<Button href={`${base}/menu`}>{t("rs.order.seeMenu")}</Button>} />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {head}
      {dropped ? <Banner tone="info">{t("rs.order.dropped")}</Banner> : null}
      {!canPickup ? <Banner tone="warning">{t("rs.notTakingOrders")}</Banner> : null}

      <section aria-labelledby="ord-items" className="flex flex-col gap-2">
        <h2 id="ord-items" className="sr-only">
          {t("rs.order.yourItems")}
        </h2>
        <ul className="divide-y divide-line rounded-card border border-line px-4">
          {lines.map((l) => (
            <Line key={l.key} line={l} item={byId.get(l.itemId)!} onQty={(q) => setLineQty(l.key, q)} />
          ))}
        </ul>
        <Button variant="ghost" size="sm" href={`${base}/menu`} className="self-start">
          {t("rs.order.addMore")}
        </Button>
      </section>

      <section aria-labelledby="ord-when" className="flex flex-col gap-3">
        <Heading level={2}>
          <span id="ord-when">{t("rs.order.when")}</span>
        </Heading>
        <ChoiceRow
          label={t("rs.order.when")}
          value={when}
          onChange={(v) => (v === "later" ? chooseLater() : setWhen("asap"))}
          options={[...(cutToOrder ? [] : [{ value: "asap" as const, label: t("rs.order.asap", { min: number(quotedWait) }) }]), { value: "later" as const, label: t("rs.order.later") }]}
        />
        {cutToOrder ? <p className="text-meta text-fg-muted">{t("gr.order.cutToOrder")}</p> : null}
        {when === "later" ? (
          days && days.length ? (
            <div className="flex flex-col gap-3">
              <div role="radiogroup" aria-label={t("rs.order.day")} className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={d.date === day}
                    onClick={() => {
                      setDay(d.date);
                      setTime(d.times[0]?.iso ?? "");
                    }}
                    className={cn("h-11 rounded-full px-4 text-body-strong transition-colors focus-visible:focus-ring", d.date === day ? "bg-trade text-trade-foreground" : "border border-line bg-bg text-fg hover:bg-bg-subtle")}
                  >
                    {date(dayDate(d.date), { weekday: "short", month: "short", day: "numeric" }, "UTC")}
                  </button>
                ))}
              </div>
              <Select label={t("rs.order.time")} value={time} onChange={(e) => setTime(e.target.value)} options={dayTimes.map((x) => ({ value: x.iso, label: date(x.iso, { hour: "numeric", minute: "2-digit" }, "America/Toronto") }))} />
            </div>
          ) : (
            <p className="text-meta text-fg-muted">{t("rs.order.noTimes")}</p>
          )
        ) : null}
      </section>

      <section aria-labelledby="ord-you" className="flex flex-col gap-3 border-t border-line pt-6">
        <Heading level={2}>
          <span id="ord-you">{t("rs.order.you")}</span>
        </Heading>
        {signedIn ? (
          <>
            <TextField label={t("rs.order.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} hint={t("rs.order.nameHint")} />
            {restaurant?.whatsappNumber ? <Checkbox checked={whatsapp} onChange={setWhatsapp} size="sm" label={t("rs.consent.whatsapp", { shop: shop.name })} caption={t("rs.consent.hint")} /> : null}
          </>
        ) : (
          <PhoneSignIn heading="h3" title={t("rs.order.signInTitle")} intro={t("rs.order.signInIntro")} devAutofill={devAutofill} />
        )}
      </section>

      {signedIn ? (
        <section aria-labelledby="ord-pay" className="flex flex-col gap-3 border-t border-line pt-6">
          <Heading level={2}>
            <span id="ord-pay">{t("rs.order.pay")}</span>
          </Heading>
          {menu.payInApp ? (
            <ChoiceRow
              label={t("rs.order.pay")}
              value={method}
              onChange={setMethod}
              options={[
                { value: "in_app", label: t("rs.order.payNow") },
                { value: "at_pickup", label: t("rs.order.payAtPickup") },
              ]}
            />
          ) : (
            <p className="text-body text-fg-muted">{t("orderPay.payAtPickup")}</p>
          )}
          <p className="text-meta text-fg-muted">{method === "in_app" ? t("rs.order.cardNote") : t("rs.order.counterNote")}</p>
        </section>
      ) : null}

      <section aria-label={t("rs.order.summary")} className="flex flex-col gap-1 border-t border-line pt-4 text-body">
        <div className="flex justify-between text-fg-muted">
          <span>{t("rs.order.subtotal")}</span>
          <span className="tabular-nums">{money(subtotal)}</span>
        </div>
        {tax > 0 || !anyZeroRated ? (
          <div className="flex justify-between text-fg-muted">
            <span>{menu.tax.label}</span>
            <span className="tabular-nums">{money(tax)}</span>
          </div>
        ) : (
          <p className="text-meta text-fg-muted">{t("gr.order.zeroRated")}</p>
        )}
        <div className="flex justify-between text-body-strong text-fg">
          <span>{t("orderPay.total")}</span>
          <span className="tabular-nums">{money(total)}</span>
        </div>
        {menu.dualPricing ? <p className="pt-1 text-meta text-fg-muted">{t("rs.menu.cashNote", { pct: number(Math.round(menu.dualPricing.cashDiscountBps / 100)) })}</p> : null}
      </section>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {signedIn ? (
        <Button size="lg" fullWidth loading={busy} disabled={!canPickup || !laterOk} onClick={() => void place()}>
          {method === "in_app" ? t("rs.order.placePay", { price: money(total), n: number(cartCount({ lines })) }) : t("rs.order.place", { price: money(total) })}
        </Button>
      ) : (
        <p className="text-center text-meta text-fg-muted">{t("rs.order.signInFirst")}</p>
      )}
      <p className="text-center text-meta text-fg-muted">{t("rc.stripe")}</p>
    </div>
  );
}

function Line({ line, item, onQty }: { line: CartLine; item: Item; onQty: (q: number) => void }) {
  const { t, money, pick } = useFmt();
  const p = pick(item);
  const { unitCents, picks } = priceDish(item, line.optionIds);
  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-body-strong text-fg">{p.name}</p>
          {picks.length ? <p className="break-words text-meta text-fg-muted">{picks.map((x) => x.option).join(" · ")}</p> : null}
        </div>
        <p className="shrink-0 text-body-strong tabular-nums text-fg">{money(unitCents * line.qty)}</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Stepper value={line.qty} min={1} max={20} onChange={onQty} label={p.name} />
        <Button variant="ghost" size="sm" onClick={() => onQty(0)}>
          {t("rs.order.remove")}
        </Button>
      </div>
    </li>
  );
}
