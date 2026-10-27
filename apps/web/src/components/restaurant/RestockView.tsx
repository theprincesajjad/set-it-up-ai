"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { commerceApi, groceryApi } from "@ll/shared";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { browserApi, browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { restockEveryWeeks, type RestockWindow } from "@/lib/grocery";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { idempotencyKeyFor, type Item } from "@/lib/restaurant/order";
import { dayDate } from "@/lib/restaurant/util";
import { Heading, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };

/**
 * /shops/<slug>/restock/<pantryItemId> (grocers frame 12): the page a restock text opens. One staple, prefilled, a pick-up window
 * and Reserve; the order is an ordinary pickup order for one unit, paid at the counter. A signed-in household that asked for
 * these texts sees the reminder switch and a quiet way to turn the item off.
 */
export function RestockView({ shop, menu, item, pantry, windows, signedIn, userName, devAutofill }: { shop: Shop; menu: commerceApi.PublicMenuResponse; item: Item; pantry: groceryApi.PublicPantryItemResponse["item"]; windows: RestockWindow[]; signedIn: boolean; userName: string; devAutofill?: boolean }) {
  const { t, money, number, date, pick } = useFmt();
  const router = useRouter();
  const p = pick(item);
  const [win, setWin] = useState<string>(windows[0]?.iso ?? "");
  const [name, setName] = useState(userName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<groceryApi.MyPantryResponse["items"][number] | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindError, setRemindError] = useState<string | null>(null);
  const location = menu.locations[0];
  const chosen = windows.find((w) => w.iso === win) ?? null;
  const first = windows[0] ?? null;
  const day = (d: string, o: Intl.DateTimeFormatOptions) => date(dayDate(d), o, "UTC");
  /** The end of a window is the hour alone ("12"): the start already says am or pm. */
  const hourOnly = (hhmm: string) => number(Number(hhmm.slice(0, 2)) % 12 || 12);
  const clock = (hhmm: string) => date(new Date(Date.UTC(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)))), { hour: "numeric", ...(hhmm.slice(3, 5) === "00" ? {} : { minute: "2-digit" }) }, "UTC");
  const dayLong = (d: string) => day(d, { weekday: "long" });

  // The household's own reminder for this staple, if they asked for it at the counter.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    browserApi.me
      .pantry()
      .then((r) => {
        if (live) setEntry(r.items.find((i) => i.itemId === pantry.id && i.shop.slug === shop.slug) ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [signedIn, pantry.id, shop.slug]);

  async function setRemind(on: boolean) {
    if (!entry) return;
    setRemindBusy(true);
    setRemindError(null);
    try {
      setEntry(await browserApi.me.setPantry(entry.entryId, on));
    } catch (e) {
      setRemindError(errorMessage(e));
    } finally {
      setRemindBusy(false);
    }
  }

  async function reserve() {
    if (!chosen || !location || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() && name.trim() !== userName.trim()) await browserApi.me.updateProfile({ name: name.trim() });
      const res = await api.placeOrder(
        { merchantId: menu.merchant.id, locationId: location.id, items: [{ catalogItemId: item.id, quantity: 1, modifiers: [] }], pickupAt: chosen.iso, paymentMethod: "at_pickup", kind: "pickup", channel: "web", tipCents: 0 },
        idempotencyKeyFor(shop.slug, JSON.stringify(["restock", item.id, chosen.iso])),
      );
      router.push(`/o/${res.order.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <Heading className="break-words" plain>{p.name}</Heading>
        <p className="text-body text-fg-muted">
          {first ? t("gr.restock.ready", { price: money(item.priceCents), day: dayLong(first.date), time: clock(first.start) }) : money(item.priceCents)}
        </p>
      </div>

      {windows.length ? (
        <div role="radiogroup" aria-label={t("gr.restock.when")} className="flex flex-wrap gap-2">
          {windows.map((w) => (
            <button
              key={w.iso}
              type="button"
              role="radio"
              aria-checked={w.iso === win}
              onClick={() => setWin(w.iso)}
              className={cn("h-11 rounded-full border px-4 text-body transition-colors focus-visible:focus-ring", w.iso === win ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
            >
              {t("gr.restock.window", { day: day(w.date, { weekday: "short" }), from: clock(w.start), to: hourOnly(w.end) })}
            </button>
          ))}
        </div>
      ) : (
        <Banner tone="info">{t("gr.restock.noTimes", { shop: shop.name })}</Banner>
      )}

      {signedIn ? (
        <TextField label={t("rs.order.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
      ) : (
        <PhoneSignIn heading="h3" title={t("rs.order.signInTitle")} intro={t("rs.order.signInIntro")} devAutofill={devAutofill} />
      )}

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {signedIn ? (
        <Button size="lg" fullWidth loading={busy} disabled={!chosen} onClick={() => void reserve()}>
          {t("gr.restock.reserve")}
        </Button>
      ) : (
        <p className="text-center text-meta text-fg-muted">{t("rs.order.signInFirst")}</p>
      )}
      <p className="-mt-2 text-meta text-fg-muted">{t("gr.restock.payNote")}</p>

      {entry ? (
        <section aria-label={t("gr.pantry.title")} className="flex flex-col gap-3 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-body text-fg">{t("gr.restock.remind", { weeks: number(restockEveryWeeks(entry.intervalDays)) })}</p>
            <SwitchControl checked={entry.remind} disabled={remindBusy} ariaLabel={t("gr.restock.remind", { weeks: number(restockEveryWeeks(entry.intervalDays)) })} onChange={(v) => void setRemind(v)} />
          </div>
          {entry.remind ? (
            <button type="button" onClick={() => void setRemind(false)} disabled={remindBusy} className="self-start text-body text-accent-text focus-visible:focus-ring disabled:opacity-50">
              {t("gr.restock.turnOff")}
            </button>
          ) : (
            <p className="text-meta text-fg-muted">{t("gr.restock.offDone")}</p>
          )}
          {remindError ? <p role="alert" className="text-meta font-medium text-negative">{remindError}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
