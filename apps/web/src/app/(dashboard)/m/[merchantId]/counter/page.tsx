"use client";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CounterNotice } from "@/components/dashboard/counter/CounterNotice";
import { Button } from "@/components/ui/Button";
import { PickupReady } from "@/components/dashboard/pharmacy/PickupReady";
import { staffApi } from "@ll/shared";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** Web counter for shops with a laptop / tablet browser at the till (same API as the app's counter mode). */
export default function CounterPage() {
  const { api, detail, base, role, me, enabled } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const program = detail.program;
  const pharmacy = detail.merchant.vertical === "pharmacy";
  // Grocers: "Not counted" (tobacco, lottery, alcohol, gift cards) and the bulk-item chips that feed restock texts.
  const groceryShop = detail.merchant.vertical === "grocery";
  const pantry = useApi(groceryShop && enabled("grocery.pantry_reminders") ? () => api.grocery.counterPantryItems() : null, [api, groceryShop]);
  // A pharmacy cannot give points until its pharmacist-owner has confirmed the rules (the server refuses too).
  const rules = useApi(pharmacy ? () => api.pharmacy.rules() : null, [api, pharmacy]);
  const unconfirmed = pharmacy && !!rules.data && !rules.data.confirmation;
  const grocery = groceryShop ? { pantryItems: (pantry.data?.items ?? []).map((i) => ({ id: i.id, name: i.name })), askText: pantry.data?.askText ?? "" } : null;
  if (!program)
    return (
      <div className="p-4">
        <h1 className="sr-only">{t("counter.title")}</h1>
        <CounterNotice action={<Button size="sm" variant="ghost" href={`${base}/program`}>{t("counter.setup.cta")}</Button>}>
        {t("counter.setup.body")}
        </CounterNotice>
      </div>
    );
  return (
    <div>
      {unconfirmed ? (
        <div className="px-4 pt-4" data-testid="pharmacy-unconfirmed">
          <CounterNotice action={<Button size="sm" variant="ghost" href={`${base}/pharmacy`}>{t("counter.pharm.cta")}</Button>}>
            {t("counter.pharm.off")}
          </CounterNotice>
        </div>
      ) : null}
      <CounterApp vertical={detail.merchant.vertical} undoNote={role === "staff" ? t("counter.undoNote", { n: staffApi.UNDO_WINDOW_MINUTES }) : undefined} exitHref={base} frontStoreRule={pharmacy} grocery={grocery} signedInName={me.user.name} pin={{ verify: api.verifyStaffPin, apiAs: api.counterAs }} queueKey={`ll.counter.queue.${detail.merchant.id}`} api={api.counter} program={program} shopName={detail.merchant.name} locations={detail.locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name }))} />
      {pharmacy ? (
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-10">
          <PickupReady />
        </div>
      ) : null}
    </div>
  );
}
