"use client";
import { Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChiliDots, FieldLabel, Heading, Pill, ShopHead, useFmt } from "./ui";

type Item = commerceApi.CatalogItemDto;
type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };

/** Same rules as the API's matchesDiet: halal includes zabihah, vegetarian includes vegan and Jain, untagged spice counts as mild. */
function passes(i: Item, f: { halal: boolean; veg: boolean; maxSpice: number | null }) {
  const d = i.dietary ?? {};
  if (f.halal && !(d.halal || d.zabihah)) return false;
  if (f.veg && !(d.vegetarian || d.vegan || d.jain)) return false;
  if (f.maxSpice !== null && (d.spice ?? 0) > f.maxSpice) return false;
  return true;
}

const SPICE_OPTIONS = [null, 0, 1, 2, 3] as const;

export function MenuBrowser({ shop, menu, appStoreUrl, playStoreUrl }: { shop: Shop; menu: commerceApi.PublicMenuResponse; appStoreUrl: string; playStoreUrl: string }) {
  const { t, money, number, pick } = useFmt();
  const [halal, setHalal] = useState(false);
  const [veg, setVeg] = useState(false);
  const [maxSpice, setMaxSpice] = useState<number | null>(null);

  const sections = useMemo(() => {
    const all = [...menu.categories.map((c) => ({ id: c.id, name: c.name, items: c.items })), ...(menu.uncategorized.length ? [{ id: "more", name: "", items: menu.uncategorized }] : [])];
    return all;
  }, [menu]);
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const hasDiet = sections.some((s) => s.items.some((i) => i.dietary && Object.keys(i.dietary).length > 0));
  const filtered = sections.map((s) => ({ ...s, items: s.items.filter((i) => passes(i, { halal, veg, maxSpice })) })).filter((s) => s.items.length > 0);
  const shown = filtered.reduce((n, s) => n + s.items.length, 0);
  const filtering = halal || veg || maxSpice !== null;
  const spiceLabel = (v: number | null) => (v === null ? t("rc.mn.spiceAny") : v === 0 ? t("spice.mild") : [t("spice.mild"), t("spice.medium"), t("spice.hot"), t("spice.extraHot")][v]!);

  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2">
        <Heading>{t("menu.title")}</Heading>
        <p className="text-body text-fg-muted">{t("rc.mn.intro", { shop: shop.name })}</p>
      </div>

      <section aria-label={t("shop.orderAheadInApp")} className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-4">
        <div className="flex items-start gap-3">
          <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-fg" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-body-strong text-fg">{t("shop.orderAheadInApp")}</p>
            <p className="text-meta text-fg-muted">{t("rc.mn.orderAheadBody")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" href={appStoreUrl}>
            {t("rc.mn.appStore")}
          </Button>
          <Button size="sm" variant="secondary" href={playStoreUrl}>
            {t("rc.mn.playStore")}
          </Button>
        </div>
      </section>

      {total === 0 ? (
        <EmptyState title={t("rc.mn.noMenu")} description={t("rc.mn.noMenuBody")} action={shop.phone ? <Button variant="secondary" href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shop.name })}</Button> : undefined} />
      ) : (
        <>
          {hasDiet ? (
            <div className="flex flex-col gap-3" role="group" aria-label={t("rc.mn.filters")}>
              <div className="flex flex-wrap gap-2">
                <Chip selected={halal} onClick={() => setHalal((v) => !v)}>
                  {t("rc.mn.halalOnly")}
                </Chip>
                <Chip selected={veg} onClick={() => setVeg((v) => !v)}>
                  {t("rc.mn.vegOnly")}
                </Chip>
              </div>
              <div className="flex flex-col gap-2">
                <FieldLabel id="mn-spice">{t("rc.mn.maxSpice")}</FieldLabel>
                <div role="radiogroup" aria-labelledby="mn-spice" className="flex flex-wrap gap-2">
                  {SPICE_OPTIONS.map((v) => (
                    <Chip key={String(v)} selected={maxSpice === v} onClick={() => setMaxSpice(v)}>
                      {spiceLabel(v)}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {filtered.length > 1 ? (
            <nav aria-label={t("rc.mn.jump")} className="flex flex-wrap gap-x-4 gap-y-1 text-meta-strong">
              {filtered.map((s) => (
                <a key={s.id} href={`#cat-${s.id}`} className="rounded-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:focus-ring">
                  {s.name || t("rc.mn.other")}
                </a>
              ))}
            </nav>
          ) : null}

          <p role="status" className="sr-only">
            {t("rc.mn.items", { n: shown })}
          </p>

          {shown === 0 ? (
            <EmptyState
              title={t("rc.mn.noMatch")}
              description={t("rc.mn.noMatchBody")}
              action={
                filtering ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setHalal(false);
                      setVeg(false);
                      setMaxSpice(null);
                    }}
                  >
                    {t("rc.mn.clear")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            filtered.map((s) => (
              <section key={s.id} id={`cat-${s.id}`} aria-labelledby={`h-${s.id}`} className="scroll-mt-4">
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <Heading level={2} className="min-w-0 break-words">
                    <span id={`h-${s.id}`}>{s.name || t("rc.mn.other")}</span>
                  </Heading>
                  <span className="shrink-0 text-meta text-fg-muted">{t("rc.mn.items", { n: s.items.length })}</span>
                </div>
                <ul>
                  {s.items.map((i) => {
                    const p = pick(i);
                    const d = i.dietary ?? {};
                    const badges = [d.halal && !d.zabihah ? t("diet.halal") : null, d.zabihah ? t("diet.zabihah") : null, d.vegan ? t("diet.vegan") : d.vegetarian ? t("diet.vegetarian") : null, d.jain ? t("diet.jain") : null, d.glutenFree ? t("diet.glutenFree") : null].filter((x): x is string => !!x);
                    return (
                      <li key={i.id} className="flex gap-3 border-b border-line py-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-body-strong text-fg">{p.name}</p>
                            <div className="shrink-0 text-end">
                              {menu.dualPricing && i.cashPriceCents != null ? (
                                <>
                                  <p className="text-body-strong tabular-nums text-fg">{t("rc.mn.cash", { price: money(i.cashPriceCents) })}</p>
                                  <p className="text-meta tabular-nums text-fg-muted">{t("rc.mn.card", { price: money(i.priceCents) })}</p>
                                </>
                              ) : (
                                <p className="text-body-strong tabular-nums text-fg">{money(i.priceCents)}</p>
                              )}
                            </div>
                          </div>
                          {p.description ? <p className="text-meta text-fg-muted">{p.description}</p> : null}
                          {badges.length || d.spice || i.preorderOnly || i.serves ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {i.preorderOnly ? <Pill tone="accent">{t("menu.preorder")}</Pill> : null}
                              {badges.map((b) => (
                                <Pill key={b}>{b}</Pill>
                              ))}
                              {d.spice ? <ChiliDots level={d.spice} /> : null}
                            </div>
                          ) : null}
                          {i.preorderOnly || i.serves ? (
                            <p className="text-meta text-fg-muted">
                              {[i.preorderOnly && i.leadTimeHours ? t("menu.preorderLead", { hours: i.leadTimeHours }) : null, i.serves ? t("menu.serves", { n: number(i.serves) }) : null].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                          {d.halalCertifier && (d.halal || d.zabihah) ? <p className="text-meta text-fg-muted">{t("diet.certifiedBy", { certifier: d.halalCertifier })}</p> : null}
                          {d.allergens?.length ? <p className="text-meta text-fg-muted">{t("rc.mn.allergens", { list: d.allergens.join(", ") })}</p> : null}
                        </div>
                        {i.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.imageUrl} alt={t("rc.mn.photo", { name: p.name })} width={76} height={76} loading="lazy" decoding="async" className="size-[76px] shrink-0 rounded-card bg-bg-subtle object-cover" />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
          {menu.tax ? <p className="text-meta text-fg-muted">{t("rc.mn.taxNote", { tax: menu.tax.label })}</p> : null}
        </>
      )}
    </div>
  );
}
