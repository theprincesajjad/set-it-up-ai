import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { ClassSchedule } from "@/components/pass/ClassSchedule";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `${t("cl.ui.title")} · ${s.name}`, alternates: { canonical: `/shops/${slug}/classes` } };
  } catch {
    return { title: t("cl.ui.title") };
  }
}

/** Class schedule, packs and memberships for a studio: book, join the waitlist, buy, sign up with the agreement. */
export default async function ShopClassesPage({ params, searchParams }: Props) {
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
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/classes`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  let data;
  try {
    data = await publicServerApi().public.studioClasses(slug);
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404))
      return (
        <PageFrame locale={locale}>
          <EmptyState title={t("cl.ui.unavailable")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
        </PageFrame>
      );
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/classes`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  const me = await getMe();
  return (
    <PageFrame locale={locale}>
      <ClassSchedule shop={shop} data={data} signedIn={!!me} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
    </PageFrame>
  );
}
