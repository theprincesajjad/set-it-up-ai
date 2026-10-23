"use client";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { restaurantWebApi, type commerceApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { allMeatHalal } from "@/lib/restaurant/halal";
import { available, buildSections, isFiltering, matches, NO_FILTERS, type Filters } from "@/lib/restaurant/menu";
import { cartCount, cartSubtotal, defaultOptionIds, priceDish, type Item } from "@/lib/restaurant/order";
import { HalalBlock } from "./HalalBlock";
import { OptionGroups } from "./OptionGroups";
import { ChiliDots, Heading, Pill, ShopHead, Stepper, useFmt } from "./ui";
import { useCart } from "./useCart";

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };

/**
 * The customer menu (frame 11): one halal banner for the whole shop, dietary chips and "Without nuts", category tabs with Degh last,
 * one price per dish, a "+" on every dish you can order, and a sticky cart bar. Halal claims are the shop's own, printed once.
 */
export function MenuBrowser({ shop, menu, restaurant, appStoreUrl, playStoreUrl }: { shop: Shop; menu: commerceApi.PublicMenuResponse; restaurant: restaurantWebApi.PublicRestaurantResponse | null; appStoreUrl: string; playStoreUrl: string }) {
  const { t, money, number, pick } = useFmt();
  const { cart, ready, add, setQty } = useCart(shop.slug);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState<Item | null>(null);
  const [active, setActive] = useState<string>("");

  const cert = menu.halalCertification ?? restaurant?.halalCertification ?? null;
  const all = useMemo(() => [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized], [menu]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i] as const)), [all]);
  const sections = useMemo(() => buildSections(menu, { more: t("rc.mn.other"), degh: t("rs.menu.degh") }), [menu, t]);
  const avail = useMemo(() => available(all), [all]);
  const filtered = sections.map((s) => ({ ...s, items: s.items.filter((i) => matches(i, filters)) })).filter((s) => s.items.length > 0);
  const shown = filtered.reduce((n, s) => n + s.items.length, 0);

  const canPickup = restaurant ? restaurant.features.pickup && restaurant.acceptingOrders : true;
  const canPreorder = !!restaurant?.features.preorder;
  const count = ready ? cartCount(cart) : 0;
  const subtotal = ready ? cartSubtotal(cart, byId) : 0;
  const toggle = (k: keyof Filters) => setFilters((f) => ({ ...f, [k]: !f[k] }));

  // Highlight the tab of the section under the sticky header while scrolling.
  useEffect(() => {
    const els = filtered.map((s) => document.getElementById(`cat-${s.id}`)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace(/^cat-/, ""));
      },
      { rootMargin: "-72px 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [filtered.map((s) => s.id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const hasOptions = (i: Item) => !!i.options?.groups.length;
  const lineQty = (id: string) => cart.lines.filter((l) => l.itemId === id).reduce((n, l) => n + l.qty, 0);
  const plainLine = (id: string) => cart.lines.find((l) => l.itemId === id && l.optionIds.length === 0);

  return (
    <div className="flex flex-col gap-5">
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2">
        <Heading>{t("menu.title")}</Heading>
        <p className="text-body text-fg-muted">{restaurant?.quotedWaitMin && canPickup ? t("rs.menu.intro", { min: restaurant.quotedWaitMin, tax: menu.tax.label }) : t("rc.mn.intro", { shop: shop.name })}</p>
      </div>

      {cert ? <HalalBlock cert={cert} variant="menu" /> : null}
      {restaurant && !restaurant.acceptingOrders && restaurant.features.pickup ? <p className="rounded-card bg-bg-subtle px-4 py-3 text-meta text-fg-muted">{t("rs.notTakingOrders")}</p> : null}

      {total === 0 ? (
        <EmptyState title={t("rc.mn.noMenu")} description={t("rc.mn.noMenuBody")} action={shop.phone ? <Button variant="secondary" href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shop.name })}</Button> : undefined} />
      ) : (
        <>
          {avail.veg || avail.vegan || avail.jain || avail.glutenFree || avail.nuts || (avail.halal && !allMeatHalal(cert)) ? (
            <div role="group" aria-label={t("rc.mn.filters")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {avail.halal && !allMeatHalal(cert) ? (
                <Chip selected={filters.halal} onClick={() => toggle("halal")}>
                  {t("rc.mn.halalOnly")}
                </Chip>
              ) : null}
              {avail.veg ? (
                <Chip selected={filters.veg} onClick={() => toggle("veg")}>
                  {t("rs.menu.veg")}
                </Chip>
              ) : null}
              {avail.vegan ? (
                <Chip selected={filters.vegan} onClick={() => toggle("vegan")}>
                  {t("diet.vegan")}
                </Chip>
              ) : null}
              {avail.jain ? (
                <Chip selected={filters.jain} onClick={() => toggle("jain")}>
                  {t("diet.jain")}
                </Chip>
              ) : null}
              {avail.glutenFree ? (
                <Chip selected={filters.glutenFree} onClick={() => toggle("glutenFree")}>
                  {t("diet.glutenFree")}
                </Chip>
              ) : null}
              {avail.nuts ? (
                <Chip selected={filters.withoutNuts} onClick={() => toggle("withoutNuts")}>
                  {t("rs.menu.withoutNuts")}
                </Chip>
              ) : null}
            </div>
          ) : null}

          {filtered.length > 1 ? (
            <nav aria-label={t("rc.mn.jump")} className="chrome no-scrollbar sticky top-0 z-raised -mx-4 flex gap-5 overflow-x-auto border-b border-line px-4">
              {filtered.map((s) => (
                <a
                  key={s.id}
                  href={`#cat-${s.id}`}
                  aria-current={(active || filtered[0]!.id) === s.id ? "true" : undefined}
                  className={cn("relative shrink-0 whitespace-nowrap py-3 text-body-strong transition-colors focus-visible:focus-ring", (active || filtered[0]!.id) === s.id ? "text-fg after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-fg" : "text-fg-muted hover:text-fg")}
                >
                  {s.name}
                </a>
              ))}
            </nav>
          ) : null}

          <p role="status" className="sr-only">
            {t("rc.mn.items", { n: shown })}
          </p>

          {shown === 0 ? (
            <EmptyState title={t("rc.mn.noMatch")} description={t("rc.mn.noMatchBody")} action={isFiltering(filters) ? <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>{t("rc.mn.clear")}</Button> : undefined} />
          ) : (
            filtered.map((s) => (
              <section key={s.id} id={`cat-${s.id}`} aria-labelledby={`h-${s.id}`} className="-mt-1 scroll-mt-14">
                <div className="flex items-baseline justify-between gap-3 pb-1">
                  <Heading level={2} className="min-w-0 break-words">
                    <span id={`h-${s.id}`}>{s.name}</span>
                  </Heading>
                  <span className="shrink-0 text-meta text-fg-muted">{t("rs.menu.dishes", { n: s.items.length })}</span>
                </div>
                <ul>
                  {s.items.map((i) => {
                    const p = pick(i);
                    const d = i.dietary ?? {};
                    // The shop-level banner already says the meat is halal; a dish only repeats it when the shop claims some dishes (or has no certificate).
                    const halalBadge = !allMeatHalal(cert) && (d.zabihah ? t("diet.zabihah") : d.halal ? t("diet.halal") : null);
                    const badges = [halalBadge || null, d.vegan ? t("diet.vegan") : d.vegetarian ? t("diet.vegetarian") : null, d.jain ? t("diet.jain") : null, d.glutenFree ? t("diet.glutenFree") : null].filter((x): x is string => !!x);
                    const allergens = restaurantWebApi.dishAllergens(d.allergens);
                    const qty = lineQty(i.id);
                    const plain = plainLine(i.id);
                    return (
                      <li key={i.id} id={`item-${i.id}`} className="flex gap-3 border-t border-line py-4 first:border-t-0">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-body-strong text-fg">{p.name}</p>
                              {i.nameEn && i.nameEn !== p.name ? <p dir="ltr" className="break-words text-meta text-fg-muted rtl:text-end">{i.nameEn}</p> : null}
                            </div>
                            <p className="shrink-0 text-body-strong tabular-nums text-fg">{money(i.priceCents)}</p>
                          </div>
                          {p.description ? <p className="text-meta text-fg-muted">{p.description}</p> : null}
                          {badges.length || allergens.length || d.spice || i.preorderOnly ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {i.preorderOnly ? <Pill tone="accent">{t("menu.preorder")}</Pill> : null}
                              {badges.map((b) => (
                                <Pill key={b}>{b}</Pill>
                              ))}
                              {allergens.length ? <Pill>{t("rc.mn.allergens", { list: allergens.map((a) => t(`allergen.${a}` as const)).join(", ") })}</Pill> : null}
                              {d.spice ? <ChiliDots level={d.spice} /> : null}
                            </div>
                          ) : null}
                          {i.preorderOnly || i.serves ? (
                            <p className="text-meta text-fg-muted">
                              {[i.preorderOnly && i.leadTimeHours ? t("menu.preorderLead", { hours: i.leadTimeHours }) : null, i.serves ? t("menu.serves", { n: number(i.serves) }) : null].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                          {/* Only a dish certified by someone other than the shop's certifier names one (the API drops the rest). */}
                          {d.halalCertifier && (d.halal || d.zabihah) ? <p className="text-meta text-fg-muted">{t("diet.certifiedBy", { certifier: d.halalCertifier })}</p> : null}
                        </div>
                        {i.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.imageUrl} alt={t("rc.mn.photo", { name: p.name })} width={76} height={76} loading="lazy" decoding="async" className="size-[76px] shrink-0 rounded-card bg-bg-subtle object-cover" />
                        ) : null}
                        <div className="flex shrink-0 flex-col items-center justify-center">
                          {i.preorderOnly ? (
                            canPreorder ? (
                              <Link href={`/shops/${encodeURIComponent(shop.slug)}/preorder/${i.id}`} aria-label={t("rs.menu.preorderItem", { name: p.name })} className={roundBtn}>
                                <Plus aria-hidden className="size-5" strokeWidth={1.75} />
                              </Link>
                            ) : null
                          ) : !canPickup ? null : plain && !hasOptions(i) ? (
                            <div className="flex flex-col items-center gap-1">
                              <button type="button" aria-label={`+ ${p.name}`} className={roundBtn} onClick={() => setQty(plain.key, plain.qty + 1)}>
                                <Plus aria-hidden className="size-5" strokeWidth={1.75} />
                              </button>
                              <span className="text-meta-strong tabular-nums text-fg" aria-live="polite">{number(plain.qty)}</span>
                              <button type="button" aria-label={`− ${p.name}`} className={roundBtn} onClick={() => setQty(plain.key, plain.qty - 1)}>
                                <Minus aria-hidden className="size-5" strokeWidth={1.75} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={qty ? t("rs.menu.addAnother", { name: p.name, n: number(qty) }) : t("rs.menu.addItem", { name: p.name })}
                              className={cn(roundBtn, qty > 0 && "border-fg")}
                              onClick={() => (hasOptions(i) ? setSheet(i) : add(i.id, []))}
                            >
                              {qty > 0 ? <span className="text-meta-strong tabular-nums">{number(qty)}</span> : <Plus aria-hidden className="size-5" strokeWidth={1.75} />}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          <div className="flex flex-col gap-1.5 pb-2 text-meta text-fg-muted">
            <p>{t("rs.menu.allergyNote")}</p>
            {menu.dualPricing ? <p>{t("rs.menu.cashNote", { pct: number(Math.round(menu.dualPricing.cashDiscountBps / 100)) })}</p> : null}
            {menu.tax ? <p>{t("rc.mn.taxNote", { tax: menu.tax.label })}</p> : null}
            <p>
              {t("rs.menu.appLine")}{" "}
              <a href={appStoreUrl} className="text-fg underline decoration-line-strong underline-offset-4">
                {t("rc.mn.appStore")}
              </a>
              {" · "}
              <a href={playStoreUrl} className="text-fg underline decoration-line-strong underline-offset-4">
                {t("rc.mn.playStore")}
              </a>
            </p>
          </div>
        </>
      )}

      {count > 0 && canPickup ? (
        <div className="chrome sticky bottom-0 z-sticky -mx-4 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-none!">
          <Button href={`/shops/${encodeURIComponent(shop.slug)}/order`} fullWidth size="lg">
            <span className="flex w-full items-center justify-between gap-3">
              <span>{t("rs.orderPickup")}</span>
              <span className="tabular-nums">{t("rs.menu.cartSummary", { n: count, total: money(subtotal) })}</span>
            </span>
          </Button>
        </div>
      ) : null}

      <OptionsSheet item={sheet} onClose={() => setSheet(null)} onAdd={(id, ids, qty) => { add(id, ids, qty); setSheet(null); }} />
    </div>
  );
}

const roundBtn = "inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg text-fg transition-colors hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring";

/** Pick a dish's options, then "Add · $x" (frame 12a's groups in a bottom sheet). */
function OptionsSheet({ item, onClose, onAdd }: { item: Item | null; onClose: () => void; onAdd: (itemId: string, optionIds: string[], qty: number) => void }) {
  return item ? <SheetBody key={item.id} item={item} onClose={onClose} onAdd={onAdd} /> : null;
}

function SheetBody({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (itemId: string, optionIds: string[], qty: number) => void }) {
  const { t, money, pick } = useFmt();
  const [ids, setIds] = useState<string[]>(() => defaultOptionIds(item));
  const [qty, setQty] = useState(1);
  const p = pick(item);
  const unit = priceDish(item, ids).unitCents;
  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={p.name}
      description={p.description ?? undefined}
      actions={
        <Button size="lg" fullWidth onClick={() => onAdd(item.id, ids, qty)}>
          {t("rs.menu.addFor", { price: money(unit * qty) })}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <OptionGroups item={item} value={ids} onChange={setIds} idPrefix={`m-${item.id}`} />
        <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
          <span className="text-meta-strong text-fg">{t("rs.qty")}</span>
          <Stepper value={qty} min={1} max={20} onChange={setQty} label={t("rs.qty")} />
        </div>
      </div>
    </Modal>
  );
}
