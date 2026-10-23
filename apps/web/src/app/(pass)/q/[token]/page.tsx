import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { QuoteView } from "@/components/pass/QuoteView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /q/<token>?preview=1 is the shop's "Preview as customer": same page, but it does not count as the customer opening it. */
export default async function QuotePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const preview = sp.preview === "1";
  const data = await publicServerApi()
    .public.quote(token, { preview })
    .catch((e: unknown) => (isApiError(e) && (e.status === 404 || e.status === 402) ? ("gone" as const) : ("error" as const)));
  if (data === "gone")
    return (
      <PageFrame locale={locale}>
        <EmptyState icon={Link2Off} title={t("rc.ca.goneTitle")} description={t("sv.q.goneBody")} action={<Button variant="secondary" href="/map">{t("rc.findShop")}</Button>} />
      </PageFrame>
    );
  if (data === "error")
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/q/${encodeURIComponent(token)}`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale}>
      <QuoteView token={token} initial={data} preview={preview} />
    </PageFrame>
  );
}
