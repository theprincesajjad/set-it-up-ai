import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator, type tiffinApi } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { TiffinPlans } from "@/components/restaurant/TiffinPlans";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getMe } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `Tiffin plans · ${s.name}`, description: `Home-style meals on a weekly or monthly plan from ${s.name}.`, alternates: { canonical: `/shops/${slug}/tiffin` } };
  } catch {
    return { title: "Tiffin plans" };
  }
}

/** Tiffin plans: browse signed out; subscribing needs the customer to sign in (the login page returns here). */
export default async function ShopTiffinPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const retry = <Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/tiffin`}>{t("rc.tryAgain")}</Button>;
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
  let data: tiffinApi.PublicPlansResponse | "none" | "error";
  try {
    data = await publicRestaurantApi().tiffin.plans(slug, { lang: locale, menuDays: 7 });
  } catch (e) {
    data = isApiError(e) && (e.status === 402 || e.status === 404) ? "none" : "error";
  }
  if (data === "error")
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  if (data === "none")
    return (
      <PageFrame locale={locale}>
        <EmptyState title={t("rc.tf.noPlans")} description={t("rc.tf.noPlansBody")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
      </PageFrame>
    );
  const me = await getMe();
  const plan = typeof sp.plan === "string" ? sp.plan : undefined;
  const servings = typeof sp.servings === "string" ? Number.parseInt(sp.servings, 10) : undefined;
  return (
    <PageFrame locale={locale}>
      <TiffinPlans shop={shop} data={data} signedIn={!!me} initialPlanId={plan} initialServings={Number.isFinite(servings) ? servings : undefined} />
    </PageFrame>
  );
}
