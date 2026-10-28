import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { ManageAppointment } from "@/components/pass/ManageAppointment";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { loadShopBrief } from "@/lib/restaurant/server";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("bk.manage.title"), robots: { index: false } };
}

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The change and cancel link in the confirmation and reminder texts. Needs the customer signed in. */
export default async function ManageAppointmentPage({ params, searchParams }: Props) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const me = await getMe();
  if (!me)
    return (
      <PageFrame locale={locale}>
        <p className="text-body text-fg-muted">{t("bk.manage.signIn")}</p>
        <PhoneSignIn next={`/shops/${encodeURIComponent(slug)}/book/${encodeURIComponent(id)}`} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
      </PageFrame>
    );
  let appointment;
  let pay: { deposit: { paymentIntentId: string; clientSecret: string; amountCents: number } | null; setup: { setupIntentId: string; clientSecret: string } | null } = { deposit: null, setup: null };
  try {
    const r = await (await getServerApi()).me.appointment(id);
    appointment = r.appointment;
    pay = { deposit: r.deposit, setup: r.setup };
  } catch (e) {
    if (isApiError(e) && (e.status === 404 || e.status === 403))
      return (
        <PageFrame locale={locale}>
          <EmptyState title={t("bk.manage.notFound")} action={<Button variant="secondary" href={`/shops/${encodeURIComponent(slug)}`}>{t("bk.back")}</Button>} />
        </PageFrame>
      );
    throw e;
  }
  const shop = await loadShopBrief(slug).catch(() => null);
  return (
    <PageFrame locale={locale} trade={shop?.vertical}>
      <ManageAppointment initial={appointment} slug={slug} pay={pay} />
    </PageFrame>
  );
}
