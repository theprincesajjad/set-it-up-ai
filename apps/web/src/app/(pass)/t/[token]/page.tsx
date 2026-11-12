import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { TICKET_LINK_DAYS_AFTER_CLOSE, translator } from "@ll/shared";
import { TicketStatusView } from "@/components/pass/TicketStatusView";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sv.t.title"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The shop named in a 410 body (name and phone are already public on the shop page). */
function expiredShop(details: unknown): { name: string | null; phone: string | null } {
  const d = (details ?? {}) as { shopName?: unknown; shopPhone?: unknown };
  return { name: typeof d.shopName === "string" ? d.shopName : null, phone: typeof d.shopPhone === "string" ? d.shopPhone : null };
}

/** /t/<token>: the public repair status page. The link in the "ready" text opens here. */
export default async function TicketStatusPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const data = await publicServerApi()
    .public.ticketStatus(token)
    .catch((e: unknown) => {
      if (isApiError(e) && e.status === 410) return { expired: expiredShop(e.details) };
      return linkKind(e);
    });
  if (typeof data === "object" && "expired" in data) {
    const shop = data.expired;
    return (
      <PageFrame locale={locale}>
        <EmptyState
          icon={Link2Off}
          headingLevel={1}
          title={t("sv.t.expiredTitle")}
          description={t("sv.t.expiredBody", { days: TICKET_LINK_DAYS_AFTER_CLOSE, shop: shop.name ?? t("sh.priv.m.theShop") })}
          action={shop.phone ? <Button variant="secondary" href={`tel:${shop.phone}`}>{`${t("shop.call")} ${shop.name ?? ""}`.trim()}</Button> : <Button variant="secondary" href="/map">{t("rc.findShop")}</Button>}
        />
      </PageFrame>
    );
  }
  if (data === "gone")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind="gone" retryHref={`/t/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  if (data === "error" || data === "rate" || data === "expired")
    return (
      <PageFrame locale={locale}>
        <LinkProblem kind={data} retryHref={`/t/${encodeURIComponent(token)}`} />
      </PageFrame>
    );
  return (
    <PageFrame locale={locale} trade={data.merchant.vertical}>
      <TicketStatusView token={token} initial={data} />
    </PageFrame>
  );
}
