"use client";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { CounterNotice } from "@/components/dashboard/counter/CounterNotice";
import { Button } from "@/components/ui/Button";
import { PickupReady } from "@/components/dashboard/pharmacy/PickupReady";
import { staffApi } from "@ll/shared";
import { useApi } from "@/lib/dashboard/useApi";

/** Web counter for shops with a laptop / tablet browser at the till (same API as the app's counter mode). */
export default function CounterPage() {
  const { api, detail, base, role, me, enabled } = useMerchant();
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
      <div>
        <h1 className="sr-only">Counter</h1>
        <CounterNotice action={<Button size="sm" variant="ghost" href={`${base}/program`}>Set up program</Button>}>
        Set up your program before awarding points.
        </CounterNotice>
      </div>
    );
  return (
    <div>
      {unconfirmed ? (
        <div className="mb-4" data-testid="pharmacy-unconfirmed">
          <CounterNotice action={<Button size="sm" variant="ghost" href={`${base}/pharmacy`}>Open pharmacy rules</Button>}>
            Points are off until the pharmacist-owner confirms the pharmacy rules and gives the OCP accreditation number.
          </CounterNotice>
        </div>
      ) : null}
      <CounterApp undoNote={role === "staff" ? `Undo your own awards within ${staffApi.UNDO_WINDOW_MINUTES} minutes` : undefined} frontStoreRule={pharmacy} grocery={grocery} signedInName={me.user.name} pin={{ verify: api.verifyStaffPin, apiAs: api.counterAs }} queueKey={`ll.counter.queue.${detail.merchant.id}`} api={api.counter} program={program} shopName={detail.merchant.name} locations={detail.locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name }))} />
      {pharmacy ? (
        <div className="mx-auto mt-10 max-w-3xl">
          <PickupReady />
        </div>
      ) : null}
    </div>
  );
}
