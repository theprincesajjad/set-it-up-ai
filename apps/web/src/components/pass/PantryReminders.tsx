"use client";
/**
 * "Your pantry" on the web pass (docs/research/grocers.md, frame C1): the bulk staples a shop will text about before they run
 * out, each with a switch the customer controls. Shown only when a shop has set one up for them. Switching off is one tap;
 * switching on needs the shop's text consent (the server says so). Replying STOP to any text ends them all.
 */
import { useState } from "react";
import type { groceryApi } from "@ll/shared";
import { SwitchControl } from "@/components/ui/Switch";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { PANTRY_LEAD_DAYS } from "@ll/shared";
import { useFmt } from "@/components/restaurant/ui";

export function PantryReminders({ items: initial }: { items: groceryApi.MyPantryResponse["items"] }) {
  const { t } = useFmt();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;
  async function toggle(entryId: string, remind: boolean) {
    setBusy(entryId);
    setError(null);
    try {
      const r = await browserApi.me.setPantry(entryId, remind);
      setItems((xs) => xs.map((x) => (x.entryId === entryId ? r : x)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section aria-labelledby="pantry-h" className="flex flex-col gap-3">
      <h2 id="pantry-h" className="display text-title text-fg">{t("gr.pantry.title")}</h2>
      <ul className="divide-y divide-border rounded-card border border-border bg-card px-4">
        {items.map((i) => (
          <li key={i.entryId} className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <p className="text-body-strong text-fg"><bdi>{i.itemName}</bdi></p>
              <p className="text-meta text-fg-muted"><bdi>{i.shop.name}</bdi> · {t("gr.pantry.remind", { days: PANTRY_LEAD_DAYS })}</p>
            </div>
            <SwitchControl checked={i.remind} disabled={busy === i.entryId} ariaLabel={`${i.itemName}, ${i.shop.name}`} onChange={(v) => void toggle(i.entryId, v)} />
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="text-meta font-medium text-negative">{error}</p> : null}
      <p className="text-caption text-fg-muted">{t("gr.pantry.stopNote")}</p>
    </section>
  );
}
