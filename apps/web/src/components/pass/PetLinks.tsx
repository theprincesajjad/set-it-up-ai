"use client";
import Link from "next/link";
import { useFmt } from "@/components/restaurant/ui";

/** Links from the card to My pets and My food cards, shown only to people who have a pet or a card (pet shops set them up at the counter). */
export function PetLinks({ pets, cards }: { pets: number; cards: number }) {
  const { t } = useFmt();
  if (!pets && !cards) return null;
  return (
    <nav aria-label={t("pet.my.title")} className="mt-6 flex flex-col divide-y divide-line rounded-card border border-line px-4">
      {pets ? <Link href="/me/pets" className="flex items-center justify-between py-3.5 text-body-strong text-fg">{t("pet.my.title")}<span aria-hidden className="text-fg-muted">{pets}</span></Link> : null}
      {cards ? <Link href="/me/food" className="flex items-center justify-between py-3.5 text-body-strong text-fg">{t("pet.food.title")}<span aria-hidden className="text-fg-muted">{cards}</span></Link> : null}
    </nav>
  );
}
