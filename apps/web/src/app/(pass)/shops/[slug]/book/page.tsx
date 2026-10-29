import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { BookFlow } from "@/components/pass/BookFlow";
import { PoweredBy } from "@/components/pass/PoweredBy";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Banner } from "@/components/ui/Banner"; // phase-pro: p3
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
    return { title: `${t("bk.title")} · ${s.name}`, description: t(s.vertical === "pharmacy" ? "rx.book.desc" : "wp.t.bookDesc", { shop: s.name }), alternates: { canonical: `/shops/${slug}/book` } };
  } catch {
    return { title: t("bk.title") };
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Book a visit: stylist and services, a time, the policy and the deposit or card. ?service= and ?staff= come from a rebooking nudge. */
export default async function ShopBookPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const retry = <Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/book`}>{t("rc.tryAgain")}</Button>;
  let shop;
  try {
    shop = await loadShopBrief(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  }
  let data;
  try {
    data = await publicServerApi().public.bookingServices(slug);
  } catch (e) {
    if (isApiError(e) && (e.status === 402 || e.status === 404))
      return (
        <PageFrame locale={locale} trade={shop.vertical}>
          <EmptyState title={t("bk.unavailable")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>} />
        </PageFrame>
      );
    return (
      <PageFrame locale={locale} trade={shop.vertical}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={retry} />
      </PageFrame>
    );
  }
  const me = await getMe();
  // ---- phase-pro: p3 ---- a book-again link (?rebook=<nudge id>): the booking opens on their usual service and stylist, with "Welcome back, Ayesha".
  const rebook = one(sp.rebook);
  let welcome: { firstName: string | null; serviceId: string | null; staffId: string | null } | null = null;
  if (rebook) {
    try {
      welcome = await publicServerApi().public.rebookWelcome(slug, rebook);
      if (welcome && !welcome.firstName && !welcome.serviceId) welcome = null; // not a real link
    } catch {
      welcome = null; // a stale or mistyped link still opens the normal booking page
    }
  }
  const first = (me?.user.name ?? welcome?.firstName ?? "").trim().split(/\s+/)[0] || null;
  // ---- end phase-pro: p3 ----
  return (
    <PageFrame locale={locale} trade={shop.vertical}>
      {rebook && welcome ? (
        <Banner tone="info" title={first ? t("rb.book.welcome", { name: first }) : t("rb.book.welcomeNoName")}>
          {t("rb.book.welcomeSub")}
        </Banner>
      ) : null}
      <BookFlow shop={shop} data={data} signedIn={!!me} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} initial={{ service: one(sp.service) ?? welcome?.serviceId ?? undefined, staff: one(sp.staff) ?? welcome?.staffId ?? undefined, pet: one(sp.pet), rebook: rebook && welcome ? rebook : undefined }} meName={me?.user.name ?? null} />
      {/* slot: PoweredBy (phase-solo E): on every step of the booking flow, including the confirmation. */}
      <PoweredBy locale={locale} vertical={shop.vertical} show={shop.poweredBy} />
    </PageFrame>
  );
}
