import { CalendarDays, ChevronRight, Soup, UtensilsCrossed, Warehouse } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@ll/shared";
import { translator } from "@ll/shared";
import { publicRestaurantApi } from "@/lib/restaurant/server";

/**
 * Which restaurant pages this shop offers, judged from the public endpoints (each answers 402/404 when the feature is off).
 * Catering has no public read endpoint, so it shows when the shop shows any other restaurant-pack signal or the shop DTO says so.
 */
export async function restaurantOfferings(slug: string, features?: object | null) {
  const api = publicRestaurantApi();
  const [menu, tiffin, banquet] = await Promise.all([api.menu(slug).catch(() => null), api.tiffin.plans(slug, { menuDays: 0 }).catch(() => null), api.banquet.halls(slug).catch(() => null)]);
  const hasMenu = !!menu && menu.categories.length + menu.uncategorized.length > 0;
  const items = menu ? [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized] : [];
  const restaurantMenu = !!menu && (!!menu.languages || items.some((i) => (i.dietary && Object.keys(i.dietary).length > 0) || i.preorderOnly || i.serves));
  const hasTiffin = !!tiffin && tiffin.plans.length > 0;
  const hasBanquet = !!banquet && banquet.items.length > 0;
  const flag = (features as { catering?: boolean } | null | undefined)?.catering;
  return { menu: hasMenu, tiffin: hasTiffin, banquet: hasBanquet, catering: flag ?? (restaurantMenu || hasTiffin || hasBanquet) };
}

/** Rows on the shop page that link to Menu, Tiffin, Catering and Banquet. Renders nothing for shops without them. */
export async function RestaurantLinks({ slug, locale, features }: { slug: string; locale: Locale; features?: object | null }) {
  const t = translator(locale);
  const o = await restaurantOfferings(slug, features).catch(() => null);
  if (!o) return null;
  const base = `/shops/${encodeURIComponent(slug)}`;
  const rows = [
    o.menu ? { href: `${base}/menu`, icon: UtensilsCrossed, title: t("rc.links.menu"), sub: t("rc.links.menuSub") } : null,
    o.tiffin ? { href: `${base}/tiffin`, icon: Soup, title: t("rc.links.tiffin"), sub: t("rc.links.tiffinSub") } : null,
    o.catering ? { href: `${base}/catering`, icon: CalendarDays, title: t("rc.links.catering"), sub: t("rc.links.cateringSub") } : null,
    o.banquet ? { href: `${base}/banquet`, icon: Warehouse, title: t("rc.links.banquet"), sub: t("rc.links.banquetSub") } : null,
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return null;
  return (
    <section aria-label={t("rc.links.title")} className="flex flex-col gap-2">
      <h2 className="text-meta-strong text-fg-muted">{t("rc.links.title")}</h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-bg px-4">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="-mx-4 flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring">
              <r.icon aria-hidden className="size-5 shrink-0 text-fg" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-strong text-fg">{r.title}</span>
                <span className="block truncate text-meta text-fg-muted">{r.sub}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
