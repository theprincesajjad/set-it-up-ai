import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { ReviewView } from "@/components/pass/ReviewView";
import { COPY } from "@/components/pass/restaurantCopy";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { LanguageSwitcher, LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How was your visit?", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /r/<token>: the review link a customer gets after an order (docs/engineering/restaurant-endpoints.md, Reviews). */
export default async function ReviewPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const c = COPY[locale];
  const data = await publicServerApi()
    .public.review(token)
    .catch((e: unknown) => (isApiError(e) && (e.status === 404 || e.status === 400) ? ("gone" as const) : ("error" as const)));
  return (
    <LocaleScope locale={locale} className="flex flex-col gap-6 pt-2">
      <LanguageSwitcher className="self-start" />
      {data === "gone" ? (
        <EmptyState icon={Link2Off} title={c.reviewGoneTitle} description={c.reviewGoneBody} />
      ) : data === "error" ? (
        <ErrorState title={c.loadError} description="" action={<Button variant="secondary" href={`/r/${encodeURIComponent(token)}`}>{c.tryAgain}</Button>} />
      ) : (
        <ReviewView token={token} initial={data} />
      )}
    </LocaleScope>
  );
}
