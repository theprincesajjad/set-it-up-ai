import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate, translator } from "@ll/shared";
import { ReportCardPage } from "@/components/pass/ReportCardPage";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("pet.visit.bookNext"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** /visit/<token>: one visit's report card (Figma M3). The link is the only key, so it is not indexed and the photo is a short-lived signed link. */
export default async function VisitPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  let v;
  try {
    v = await publicServerApi().public.visit(token);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    if (isApiError(e) && e.status === 410) {
      return (
        <PageFrame locale={locale}>
          <ErrorState title={t("pet.visit.expired")} action={<Button variant="secondary" href="/">{t("pet.back")}</Button>} />
        </PageFrame>
      );
    }
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/visit/${encodeURIComponent(token)}`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  const shop = await loadShopBrief(v.shop.slug).catch(() => null);
  return (
    <PageFrame locale={locale} trade={shop?.vertical}>
      <ReportCardPage v={v} t={t} brand={{ logoUrl: shop?.logoUrl ?? null, brandColor: shop?.brandColor ?? null }} when={formatDate(locale, v.at, { weekday: "long", month: "short", day: "numeric" })} />
    </PageFrame>
  );
}
