import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type commerceApi, type restaurantApi } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { PreorderView } from "@/components/restaurant/PreorderView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { addDays, todayIso } from "@/lib/restaurant/util";
import { isWeighedLine } from "@/lib/restaurant/weighed";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; itemId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `${t("wp.t.preorder")} · ${s.name}`, description: t("wp.t.preorderDesc", { shop: s.name }), robots: { index: false, follow: true } };
  } catch {
    return { title: t("wp.t.preorder") };
  }
}

/** Pre-order a degh: size, spice, add-ons, a day with pots left, a pickup window, a 30% deposit by card or Apple Pay. */
export default async function PreorderPage({ params, searchParams }: Props) {
  const [{ slug, itemId }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const here = `/shops/${encodeURIComponent(slug)}/preorder/${encodeURIComponent(itemId)}`;
  const retry = <Button variant="secondary" href={here}>{t("rc.tryAgain")}</Button>;
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
  const api = publicRestaurantApi();
  let menu: commerceApi.PublicMenuResponse;
  try {
    menu = await api.menu(slug, { lang: locale });
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404)) notFound();
    return (
      <PageFrame locale={locale} trade={shop.vertical}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  }
  const item = [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized].find((i) => i.id === itemId);
  // Pre-order-only dishes, and cuts sold by weight at a butcher counter, are booked here.
  if (!item || !(item.preorderOnly || isWeighedLine(item))) notFound();

  const today = todayIso();
  let availability: restaurantApi.PreorderAvailabilityResponse | null = null;
  let unavailable = false;
  try {
    availability = await api.availability(slug, { itemId, from: today, to: addDays(today, 13) });
    // Qurbani follows the shop's Eid plan: the API returns exactly its pick-up days. Other items that need days of notice have nothing
    // bookable in the next two weeks, so start the window where the notice ends.
    const noticeDays = Math.floor((availability.leadHours ?? 0) / 24);
    if (!availability.plan && noticeDays >= 2) availability = await api.availability(slug, { itemId, from: addDays(today, noticeDays), to: addDays(today, noticeDays + 13) });
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404)) unavailable = true;
    else
      return (
        <PageFrame locale={locale} trade={shop.vertical}>
          <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
        </PageFrame>
      );
  }
  if (unavailable || !availability)
    return (
      <PageFrame locale={locale} trade={shop.vertical}>
        <EmptyState title={t("rs.pre.unavailable")} description={t(shop.vertical === "grocery" ? "gr.pre.unavailableBody" : "rs.pre.unavailableBody")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
      </PageFrame>
    );
  const [restaurant, me] = await Promise.all([api.restaurant(slug).catch(() => null), getMe()]);
  return (
    <PageFrame locale={locale} trade={shop.vertical} className="flex flex-col gap-6 pb-10">
      <PreorderView shop={shop} menu={menu} item={item} availability={availability} restaurant={restaurant} signedIn={!!me} userName={me?.user.name ?? ""} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
    </PageFrame>
  );
}
