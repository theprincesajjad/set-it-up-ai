import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { QueueJoin } from "@/components/pass/QueueJoin";
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
    return { title: `${t("q.title")} · ${s.name}`, robots: { index: false } };
  } catch {
    return { title: t("q.title") };
  }
}

/** /shops/<slug>/queue: join the walk-in line (docs/research/barbers-beauty.md, Figma M1). */
export default async function ShopQueuePage({ params, searchParams }: Props) {
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
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/queue`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  let data;
  try {
    data = await publicServerApi().public.queue(slug);
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404))
      return (
        <PageFrame locale={locale}>
          <EmptyState title={t("q.unavailable")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
        </PageFrame>
      );
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/queue`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  const me = await getMe();
  return (
    <PageFrame locale={locale}>
      <QueueJoin shop={shop} data={data} signedIn={!!me} meName={me?.user.name ?? null} />
    </PageFrame>
  );
}
