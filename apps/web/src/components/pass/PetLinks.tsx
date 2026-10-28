"use client";
import Link from "next/link";
import { useFmt } from "@/components/restaurant/ui";

/** Links from the card to My pets and My food cards, shown only to people who have a pet or a card (pet shops set them up at the counter). */
export function PetLinks({ pets, cards, shop }: { pets: number; cards: number; /** A pet shop the customer has joined, so a customer with no dog yet is asked to add one. */ shop?: string | null }) {
  const { t } = useFmt();
  if (!pets && !cards && shop)
    return (
      <section aria-label={t("pet.add.cta")} data-testid="add-your-dog" className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
        <p className="text-body text-fg">{t("pet.add.body", { shop })}</p>
        <Link href="/me/pets" className="self-start rounded-pill bg-primary px-4 py-2 text-meta-strong text-primary-foreground shadow-glow focus-visible:focus-ring">{t("pet.add.cta")}</Link>
      </section>
    );
  if (!pets && !cards) return null;
  return (
    <nav aria-label={t("pet.my.title")} className="flex flex-col divide-y divide-border rounded-card border border-border bg-card px-4">
      {pets ? <Link href="/me/pets" className="flex items-center justify-between py-3.5 text-body-strong text-fg">{t("pet.my.title")}<span aria-hidden className="text-fg-muted">{pets}</span></Link> : null}
      {cards ? <Link href="/me/food" className="flex items-center justify-between py-3.5 text-body-strong text-fg">{t("pet.food.title")}<span aria-hidden className="text-fg-muted">{cards}</span></Link> : null}
    </nav>
  );
}
