"use client";
/**
 * A grocer's shop page, above the loyalty tabs (docs/research/grocers.md, frame C2): this week's flyer with the price per 100 g and
 * the members price, then the butcher counter's pre-order items. Strings are in all four languages (gr.* keys).
 */
import type { groceryApi, restaurantWebApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Heading, Pill, useFmt } from "@/components/restaurant/ui";
import { dayDate } from "@/lib/restaurant/util";

export function GroceryBlock({ shopName, slug, flyer, preorderItems, member }: { shopName: string; slug: string; flyer: groceryApi.PublicFlyerResponse | null; preorderItems: restaurantWebApi.PublicRestaurantResponse["preorderItems"]; member: boolean }) {
  const { t, money, moneyExact, number, date, pick } = useFmt();
  const deals = flyer?.deals ?? [];
  if (!deals.length && !preorderItems.length) return null;
  const day = (d: string) => date(dayDate(d), { month: "short", day: "numeric" }, "UTC");
  const hasMemberDeal = deals.some((d) => d.memberOnly);
  return (
    <>
      {deals.length ? (
        <section aria-labelledby="gr-flyer" className="flex flex-col gap-3">
          <div>
            <Heading level={2}>
              <span id="gr-flyer">{t("gr.flyer.title", { shop: shopName })}</span>
            </Heading>
            <p className="text-meta text-fg-muted">
              {flyer?.seasonName ? `${flyer.seasonName} · ` : ""}
              {flyer?.validFrom && flyer.validTo ? t("gr.flyer.valid", { from: day(flyer.validFrom), to: day(flyer.validTo) }) : ""}
            </p>
          </div>
          <ul className="divide-y divide-line rounded-card border border-line px-4">
            {deals.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-body-strong text-fg">
                    <bdi>{d.title}</bdi>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
                    {d.per100gCents != null ? <span>{t("gr.flyer.perUnit", { price: moneyExact(Math.round(d.per100gCents)) })}</span> : null}
                    {d.limitPerCustomer ? <span>{t("gr.flyer.limit", { n: number(d.limitPerCustomer) })}</span> : null}
                    {d.memberOnly ? <Pill>{t("gr.flyer.member")}</Pill> : null}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-body-strong tabular-nums text-accent-text">
                    {moneyExact(d.priceCents)}
                    {d.priceUnit === "each" ? "" : `/${d.priceUnit}`}
                  </p>
                  {d.wasPriceCents ? <p className="text-caption tabular-nums text-fg-muted">{t("gr.flyer.was", { price: moneyExact(d.wasPriceCents) })}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          {hasMemberDeal && !member ? (
            <Button variant="secondary" fullWidth href="#join">
              {t("gr.flyer.join")}
            </Button>
          ) : null}
        </section>
      ) : null}
      {preorderItems.length ? (
        <section aria-labelledby="gr-butcher" className="flex flex-col gap-3">
          <Heading level={2}>
            <span id="gr-butcher">{t("gr.butcher.title")}</span>
          </Heading>
          <ul className="divide-y divide-line rounded-card border border-line px-4">
            {preorderItems.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-body-strong text-fg">
                    <bdi>{pick({ name: i.name }).name}</bdi>
                  </p>
                  <p className="text-meta text-fg-muted">{t("gr.butcher.estimate", { price: money(i.priceCents) })}</p>
                </div>
                <Button size="sm" variant="secondary" href={`/shops/${encodeURIComponent(slug)}/preorder/${i.id}`}>
                  {t("gr.butcher.book")}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-muted">{t("gr.butcher.scaleNote")}</p>
        </section>
      ) : null}
    </>
  );
}
