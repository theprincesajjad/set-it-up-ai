import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { CateringInquiryForm } from "@/components/restaurant/CateringInquiryForm";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT();
  const { slug } = await params;
  try {
    const s = await loadShopBrief(slug);
    return { title: `${t("rc.links.catering")} · ${s.name}`, description: t("wp.t.cateringDesc", { shop: s.name }), alternates: { canonical: `/shops/${slug}/catering` } };
  } catch {
    return { title: t("rc.links.catering") };
  }
}

/** Public catering inquiry: no login. Success shows a reference number. */
export default async function CateringInquiryPage({ params, searchParams }: Props) {
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
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/catering`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  // "From about $X a guest": the cheapest tray on the menu, priced per person it serves. A hint, never a quote.
  const menu = await publicRestaurantApi().menu(slug).catch(() => null);
  const perGuest = menu ? [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized].filter((i) => (i.serves ?? 0) > 1 && i.priceCents > 0).map((i) => Math.round(i.priceCents / i.serves!)) : [];
  return (
    <PageFrame locale={locale}>
      <CateringInquiryForm shop={shop} fromPerGuestCents={perGuest.length ? Math.min(...perGuest) : null} />
    </PageFrame>
  );
}
