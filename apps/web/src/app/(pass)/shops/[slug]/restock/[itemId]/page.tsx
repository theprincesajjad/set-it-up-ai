import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type commerceApi, type groceryApi } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { RestockView } from "@/components/restaurant/RestockView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { publicServerApi } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { restockWindows } from "@/lib/grocery";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; itemId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, itemId }, sp] = await Promise.all([params, searchParams]);
  const t = translator(await getLocale(sp));
  try {
    const r = await publicServerApi().public.pantryItem(slug, itemId);
    return { title: t("gr.restock.meta", { item: r.item.name, shop: r.shop.name }), robots: { index: false, follow: false } };
  } catch {
    return { title: t("gr.restock.reserve"), robots: { index: false, follow: false } };
  }
}

/**
 * Where a restock text lands (docs/research/grocers.md, frame 12): the one staple, prefilled, a pick-up window and Reserve.
 * It is the pickup-order flow with one line already in the cart, not the shop's generic order page.
 */
export default async function RestockPage({ params, searchParams }: Props) {
  const [{ slug, itemId }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const here = `/shops/${encodeURIComponent(slug)}/restock/${encodeURIComponent(itemId)}`;
  const retry = <Button variant="secondary" href={here}>{t("rc.tryAgain")}</Button>;
  const failed = (
    <PageFrame locale={locale}>
      <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
    </PageFrame>
  );
  let shop;
  let pantry: groceryApi.PublicPantryItemResponse;
  try {
    [shop, pantry] = await Promise.all([loadShopBrief(slug), publicServerApi().public.pantryItem(slug, itemId)]);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return failed;
  }
  let menu: commerceApi.PublicMenuResponse | null = null;
  try {
    menu = await publicRestaurantApi().menu(slug, { lang: locale });
  } catch (e) {
    if (!(isApiError(e) && (e.status === 402 || e.status === 404))) return failed;
  }
  const item = menu ? [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized].find((i) => i.id === pantry.item.catalogItemId) : undefined;
  if (!menu || !item || item.preorderOnly)
    return (
      <PageFrame locale={locale}>
        <EmptyState title={t("gr.restock.goneTitle")} description={t("gr.restock.goneBody", { shop: shop.name })} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
      </PageFrame>
    );
  const me = await getMe();
  return (
    <PageFrame locale={locale} className="flex flex-col gap-6 pb-10">
      <RestockView shop={shop} menu={menu} item={item} pantry={pantry.item} windows={restockWindows(menu.locations[0]?.hours, new Date())} signedIn={!!me} userName={me?.user.name ?? ""} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
    </PageFrame>
  );
}
