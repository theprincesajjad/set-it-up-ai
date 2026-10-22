import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type commerceApi } from "@ll/shared";
import { MenuBrowser } from "@/components/restaurant/MenuBrowser";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `Menu · ${s.name}`, description: `See the menu at ${s.name}. Halal, vegetarian and spice levels shown.`, alternates: { canonical: `/shops/${slug}/menu` } };
  } catch {
    return { title: "Menu" };
  }
}

/** Web menu. Ordering stays in the mobile app; this page is for looking, filtering and finding the app. */
export default async function ShopMenuPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  let shop;
  try {
    shop = await loadShopBrief(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/menu`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  let menu: commerceApi.PublicMenuResponse | "none" | "error";
  try {
    menu = await publicRestaurantApi().menu(slug, { lang: locale });
  } catch (e) {
    menu = isApiError(e) && (e.status === 402 || e.status === 404) ? "none" : "error";
  }
  return (
    <PageFrame locale={locale}>
      {menu === "error" ? (
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/menu`}>{t("rc.tryAgain")}</Button>} />
      ) : menu === "none" ? (
        <EmptyState title={t("rc.mn.noMenu")} description={t("rc.mn.noMenuBody")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
      ) : (
        <MenuBrowser shop={shop} menu={menu} appStoreUrl={env.appStoreUrl} playStoreUrl={env.playStoreUrl} />
      )}
    </PageFrame>
  );
}
