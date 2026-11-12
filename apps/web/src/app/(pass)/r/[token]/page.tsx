import { loadShopBrief } from "@/lib/restaurant/server";
import type { Metadata } from "next";
import { ReviewView } from "@/components/pass/ReviewView";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { publicServerApi } from "@/lib/api/server";
import { PassTopBar } from "@/components/pass/PassChrome";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wp.t.review"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /r/<token>: the review link a customer gets after an order (docs/engineering/restaurant-endpoints.md, Reviews). */
export default async function ReviewPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const data = await publicServerApi()
    .public.review(token)
    .catch((e: unknown) => linkKind(e));
  const shop = typeof data === "object" ? await loadShopBrief(data.merchant.slug).catch(() => null) : null;
  return (
    <LocaleScope locale={locale} trade={shop?.vertical ?? "other"} className="flex flex-col gap-6 pt-2">
      <PassTopBar className="self-stretch" />
      {typeof data === "string" ? (
        <LinkProblem kind={data} retryHref={`/r/${encodeURIComponent(token)}`} />
      ) : (
        <ReviewView token={token} initial={data} />
      )}
    </LocaleScope>
  );
}
