import type { petApi } from "@ll/shared";
import { formatCurrency, translator, type Locale } from "@ll/shared";

/** On a pet shop's page: the food card deal and the daycare packs, in the visitor's language, so the real hook is visible before they join. */
export function PetShopBlock({ info, locale }: { info: petApi.PublicPetInfoResponse; locale: Locale }) {
  const t = translator(locale);
  if (!info.food.length && !info.packs.length) return null;
  const money = (c: number) => formatCurrency(locale, c, "CAD");
  return (
    <section aria-label={t("pet.shop.title")} data-testid="pet-shop-block" className="flex flex-col gap-2 rounded-card border border-line p-4">
      <h2 className="text-body-strong text-fg">{t("pet.shop.title")}</h2>
      {info.food.map((f) => (
        <p key={f.brand} className="text-body text-fg">{t("pet.shop.food", { n: f.buyCount, brand: f.brand })}</p>
      ))}
      {info.food.length ? <p className="text-meta text-fg-muted">{t("pet.shop.askCard")}</p> : null}
      {info.packs.length ? (
        <p className="text-body text-fg">{t("pet.shop.packs", { packs: info.packs.map((p) => `${p.days} ${t("pet.shop.days")} ${money(p.priceCents)}`).join(", "), dropIn: info.dropInCents ? money(info.dropInCents) : "" })}</p>
      ) : null}
    </section>
  );
}
