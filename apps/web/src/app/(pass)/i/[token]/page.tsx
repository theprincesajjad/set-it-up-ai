import type { Metadata } from "next";
import { InvoiceView } from "@/components/pass/InvoiceView";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { publicServerApi } from "@/lib/api/server";
import { getLocale, getT } from "@/lib/i18n/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wp.t.invoice"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InvoicePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const data = await publicServerApi()
    .public.invoice(token)
    .catch((e: unknown) => linkKind(e));
  // A link that was never issued (or was copied wrong) is a real 404, not a 200 with an apology.
  if (data === "gone") notFound();
  if (data === "expired")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/i/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  if (data === "error" || data === "rate")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/i/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale} trade={data.merchant.vertical}>
      <InvoiceView token={token} initial={data} />
    </PageFrame>
  );
}
