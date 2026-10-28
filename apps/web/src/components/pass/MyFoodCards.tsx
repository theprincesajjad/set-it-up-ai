"use client";
/**
 * /me/food (docs/research/pet-care.md, Figma M2): each food card (brand and bag size) with the bags counted, the next free bag, and
 * the run-out text the customer controls. Switching it off is one tap; switching on needs the shop's text consent (the server says so).
 */
import { useEffect, useState } from "react";
import { Heading, useFmt } from "@/components/restaurant/ui";
import type { petApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

export function MyFoodCards() {
  const { t, date } = useFmt();
  const [items, setItems] = useState<petApi.FoodCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grams, setGrams] = useState<Record<string, string>>({});
  useEffect(() => {
    void browserApi.me.myFoodCards().then((r) => setItems(r.items)).catch((e) => setError(errorMessage(e)));
  }, []);
  const day = (ymd: string) => date(ymd, { month: "short", day: "numeric" }, "UTC");
  async function toggle(c: petApi.FoodCardDto, remind: boolean) {
    setBusy(c.id);
    setError(null);
    try {
      const g = grams[c.id] ? Number(grams[c.id]) : undefined;
      const r = await browserApi.me.setFoodReminder(c.id, { remind, ...(g ? { dailyGrams: g } : {}) });
      setItems((xs) => (xs ?? []).map((x) => (x.id === c.id ? { ...r, shop: x.shop } : x)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <Heading plain>{t("pet.food.title")}</Heading>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {items && items.length === 0 ? <p className="text-body text-fg-muted">{t("pet.food.none")}</p> : null}
      <ul className="flex flex-col gap-4">
        {(items ?? []).map((c) => {
          const total = c.buyCount;
          const filled = c.canRedeem ? total : c.counted;
          return (
            <li key={c.id} className="flex flex-col gap-3.5 rounded-card border border-line px-4 py-4">
              <div>
                <p className="text-meta text-fg-muted"><bdi>{c.shop?.name}</bdi></p>
                <p className="text-headline text-fg"><bdi>{c.brand} {c.skuName}</bdi></p>
              </div>
              <div className="flex flex-wrap gap-2" role="img" aria-label={t("pet.food.progress", { n: filled, total })}>
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={cn("flex size-9 items-center justify-center rounded-full border text-meta-strong tabular-nums", i < filled ? "border-points bg-points text-points-foreground" : "border-line text-fg-subtle")}>{i + 1}</span>
                ))}
              </div>
              <p className="text-body text-fg" aria-live="polite">{c.expired ? t("pet.food.expired") : c.canRedeem ? t("pet.food.free") : t("pet.food.toGo", { n: c.toGo })}</p>
              <div className="flex flex-col gap-3 border-t border-line pt-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-strong text-fg">{t("pet.food.remind")}</p>
                    {c.runOutOn ? <p className="text-meta text-fg-muted">{t("pet.food.runOut", { date: day(c.runOutOn) })}{c.petName ? ` · ${c.petName}` : ""}</p> : null}
                  </div>
                  <SwitchControl checked={c.remind} disabled={busy === c.id || (!c.dailyGrams && !grams[c.id])} ariaLabel={`${t("pet.food.remind")}: ${c.brand} ${c.skuName}`} onChange={(v) => void toggle(c, v)} />
                </div>
                <p className="text-caption text-fg-muted">{t("pet.food.consent", { shop: c.shop?.name ?? "" })}</p>
                {!c.dailyGrams ? <TextField label={t("pet.food.daily")} type="number" min={10} value={grams[c.id] ?? ""} onChange={(e) => setGrams((g) => ({ ...g, [c.id]: e.target.value }))} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" href="/me">{t("pet.back")}</Button>
    </div>
  );
}
