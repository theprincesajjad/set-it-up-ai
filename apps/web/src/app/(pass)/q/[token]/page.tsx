import type { Metadata } from "next";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { QuoteView } from "@/components/pass/QuoteView";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { publicServerApi } from "@/lib/api/server";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wp.t.quote"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /q/<token>?preview=1 is the shop's "Preview as customer": same page, but it does not count as the customer opening it. */
export default async function QuotePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const preview = sp.preview === "1";
  const data = await publicServerApi()
    .public.quote(token, { preview })
    .catch((e: unknown) => linkKind(e));
  if (data === "gone" || data === "expired")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/q/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  if (data === "error" || data === "rate")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/q/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale} trade={data.merchant.vertical}>
      <QuoteView token={token} initial={data} preview={preview} />
    </PageFrame>
  );
}
