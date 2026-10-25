import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type commerceApi } from "@ll/shared";
import { OrderView } from "@/components/restaurant/OrderView";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `${t("rs.orderPickup")} · ${s.name}`, robots: { index: false, follow: false } };
  } catch {
    return { title: t("rs.orderPickup"), robots: { index: false, follow: false } };
  }
}

/** Pickup checkout: your cart, a pickup time, your phone (a text code, no password), then pay now or at the counter. */
export default async function ShopOrderPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const retry = <Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/order`}>{t("rc.tryAgain")}</Button>;
  let shop;
  try {
    shop = await loadShopBrief(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  }
  let menu: commerceApi.PublicMenuResponse | "none" | "error";
  try {
    menu = await publicRestaurantApi().menu(slug, { lang: locale });
  } catch (e) {
    menu = isApiError(e) && (e.status === 402 || e.status === 404) ? "none" : "error";
  }
  if (menu === "error")
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  if (menu === "none")
    return (
      <PageFrame locale={locale}>
        <EmptyState title={t("rs.order.noOnline")} description={t("rs.order.noOnlineBody")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
      </PageFrame>
    );
  const [restaurant, me] = await Promise.all([publicRestaurantApi().restaurant(slug).catch(() => null), getMe()]);
  return (
    <PageFrame locale={locale}>
      <OrderView shop={shop} menu={menu} restaurant={restaurant} signedIn={!!me} userName={me?.user.name ?? ""} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
    </PageFrame>
  );
}
