import type { Metadata } from "next";
import { formatDate, translator } from "@ll/shared";
import { ReportCardPage } from "@/components/pass/ReportCardPage";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { LinkProblem, linkKind } from "@/components/errors/server";
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
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={linkKind(e)} retryHref={`/visit/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  }
  const shop = await loadShopBrief(v.shop.slug).catch(() => null);
  return (
    <PageFrame locale={locale} trade={shop?.vertical} brandColor={shop?.brandColor}>
      <ReportCardPage v={v} t={t} brand={{ logoUrl: shop?.logoUrl ?? null, brandColor: shop?.brandColor ?? null }} when={formatDate(locale, v.at, { weekday: "long", month: "short", day: "numeric" })} />
    </PageFrame>
  );
}
