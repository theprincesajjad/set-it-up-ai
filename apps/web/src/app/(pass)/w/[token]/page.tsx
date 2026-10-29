import type { Metadata } from "next";
import type { waitlistApi } from "@ll/shared";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { TakeOffer } from "@/components/pass/TakeOffer";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { createApiClient } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { publicWaitlistEndpoints } from "@/lib/api/waitlist";
import { serverApiUrl } from "@/lib/env";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wl.take.meta"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * /w/<token>: the one-tap "Take it" from a waitlist offer (phase-pro P2). The link came to the client by push, email or text; it books
 * the held slot for them. A used or lapsed link says "That spot was taken" and points back to the booking page.
 */
export default async function TakePage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  const api = publicWaitlistEndpoints(createApiClient({ baseUrl: serverApiUrl() }));
  const data: waitlistApi.OfferDto | "gone" | "error" = await api.offer(token).catch((e: unknown) => (isApiError(e) && (e.status === 410 || e.status === 404) ? "gone" : "error"));
  if (data === "error")
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/w/${encodeURIComponent(token)}`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale} trade={data === "gone" ? undefined : (data.merchant.vertical ?? undefined)}>
      <TakeOffer token={token} initial={data === "gone" ? null : data} />
    </PageFrame>
  );
}
