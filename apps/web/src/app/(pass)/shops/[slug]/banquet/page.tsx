import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type restaurantApi } from "@ll/shared";
import { BanquetView } from "@/components/restaurant/BanquetView";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";
import { todayIso, torontoInstant } from "@/lib/restaurant/util";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `${t("rc.bq.title")} · ${s.name}`, description: t("wp.t.banquetDesc", { shop: s.name }), alternates: { canonical: `/shops/${slug}/banquet` } };
  } catch {
    return { title: t("rc.bq.title") };
  }
}

/** Halls, packages and a month availability view. Booking goes through a hold (signed in) or a catering inquiry (service=banquet). */
export default async function ShopBanquetPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const retry = <Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/banquet`}>{t("rc.tryAgain")}</Button>;
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
  const today = todayIso();
  const month = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const next = month.m === 12 ? `${month.y + 1}-01-01` : `${month.y}-${String(month.m + 1).padStart(2, "0")}-01`;
  let halls: restaurantApi.HallDto[];
  let busy: Record<string, restaurantApi.HallAvailabilityResponse["halls"][number]["busy"]> | null = {};
  try {
    halls = (await api.banquet.halls(slug)).items;
    if (halls.length) {
      const av = await api.banquet.availability(slug, { from: torontoInstant(`${today.slice(0, 7)}-01`, "00:00"), to: torontoInstant(next, "00:00") }).catch(() => null);
      busy = av ? Object.fromEntries(av.halls.map((h) => [h.hall.id, h.busy])) : null;
    }
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404))
      return (
        <PageFrame locale={locale} trade={shop.vertical}>
          <EmptyState title={t("rc.bq.noHalls")} description={t("rc.bq.noHallsBody")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
        </PageFrame>
      );
    return (
      <PageFrame locale={locale} trade={shop.vertical}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  }
  const me = await getMe();
  return (
    <PageFrame locale={locale} trade={shop.vertical}>
      <BanquetView shop={shop} halls={halls} initialBusy={busy} initialMonth={month} signedIn={!!me} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
    </PageFrame>
  );
}
