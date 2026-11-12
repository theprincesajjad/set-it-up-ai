import type { Metadata } from "next";
import { CateringApproval } from "@/components/restaurant/CateringApproval";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadShopBrief, publicRestaurantApi } from "@/lib/restaurant/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("rc.ca.title"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /e/<token>: catering quote approval (restaurant-endpoints.md "Catering"). Not /c, which is campaigns. */
export default async function CateringQuotePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const data = await publicRestaurantApi()
    .catering.view(token)
    .catch((e: unknown) => linkKind(e));
  if (data === "gone" || data === "expired")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/e/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  if (data === "error" || data === "rate")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/e/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  const shop = await loadShopBrief(data.merchant.slug).catch(() => null);
  return (
    <PageFrame locale={locale} trade={shop?.vertical} brandColor={shop?.brandColor}>
      <CateringApproval token={token} initial={data} />
    </PageFrame>
  );
}
