import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { LineStatus } from "@/components/pass/LineStatus";
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
  return { title: t("q.title"), robots: { index: false } };
}

/** /line/<token>: your place in the walk-in line (Figma M2). The link is the only key, so it is not indexed. */
export default async function LinePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  let status;
  try {
    status = await publicServerApi().public.queueStatus(token);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/line/${encodeURIComponent(token)}`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  const shop = await loadShopBrief(status.shop.slug).catch(() => null);
  return (
    <PageFrame locale={locale} trade={shop?.vertical}>
      <LineStatus initial={status} shop={{ logoUrl: shop?.logoUrl ?? null, brandColor: shop?.brandColor ?? null }} />
    </PageFrame>
  );
}
