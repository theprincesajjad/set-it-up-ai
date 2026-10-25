import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { CateringApproval } from "@/components/restaurant/CateringApproval";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getLocale, getT } from "@/lib/i18n/server";
import { publicRestaurantApi } from "@/lib/restaurant/server";

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
  const t = translator(locale);
  const data = await publicRestaurantApi()
    .catering.view(token)
    .catch((e: unknown) => (isApiError(e) && (e.status === 404 || e.status === 402) ? ("gone" as const) : ("error" as const)));
  if (data === "gone")
    return (
      <PageFrame locale={locale}>
        <EmptyState icon={Link2Off} title={t("rc.ca.goneTitle")} description={t("rc.ca.goneBody")} action={<Button variant="secondary" href="/map">{t("rc.findShop")}</Button>} />
      </PageFrame>
    );
  if (data === "error")
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/e/${encodeURIComponent(token)}`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale}>
      <CateringApproval token={token} initial={data} />
    </PageFrame>
  );
}
