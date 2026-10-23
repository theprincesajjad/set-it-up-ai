import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { translator } from "@ll/shared";
import { DropoffFlow } from "@/components/pass/DropoffFlow";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const s = await publicServerApi().public.shop(slug);
    return { title: `Book a drop-off · ${s.merchant.name}`, alternates: { canonical: `/shops/${slug}/dropoff` } };
  } catch {
    return { title: "Book a drop-off" };
  }
}

/** Book a drop-off time at a repair shop: a day, a time and what you are bringing. */
export default async function ShopDropoffPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  let shop;
  try {
    shop = await publicServerApi().public.shop(slug);
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return (
      <PageFrame locale={locale}>
        <ErrorState title={t("rc.error.title")} description={t("rc.error.body")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}/dropoff`}>{t("rc.tryAgain")}</Button>} />
      </PageFrame>
    );
  }
  const m = shop.merchant;
  if (!shop.features?.dropoffScheduling)
    return (
      <PageFrame locale={locale}>
        <EmptyState title={t("sv.d.unavailable")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("rc.backToShop", { shop: m.name })}</Button>} />
      </PageFrame>
    );
  const me = await getMe();
  const loc = shop.locations[0];
  return (
    <PageFrame locale={locale}>
      <DropoffFlow shop={{ name: m.name, slug: m.slug, logoUrl: m.logoUrl ?? null, brandColor: m.brandColor ?? null, phone: m.phone ?? loc?.phone ?? null }} signedIn={!!me} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} tz={m.timezone} address={loc ? `${loc.address}, ${loc.city}` : null} />
    </PageFrame>
  );
}
