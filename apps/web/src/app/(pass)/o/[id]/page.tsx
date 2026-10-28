import { PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import { OrderStatus } from "@/components/pass/OrderStatus";
import { ReservedView } from "@/components/restaurant/ReservedView";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { PassTopBar } from "@/components/pass/PassChrome";
import { PageFrame, URDU_LEADING } from "@/components/restaurant/PageFrame";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("orderPay.yourOrder"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Order status. The API has no public (token) order tracking, so this is for the signed-in customer (GET /v1/me/orders/:id). */
export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) {
    const sp = await searchParams;
    const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
    return (
      <PageFrame locale={locale}>
        <PhoneSignIn title={t("auth.phone.orderTitle")} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
      </PageFrame>
    );
  }
  const sp = await searchParams;
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  const order = await (await getServerApi()).me.order(id).catch((e: unknown) => (isApiError(e) && e.status === 404 ? ("gone" as const) : ("error" as const)));
  if (order === "gone") return <EmptyState icon={PackageSearch} title={t("wp.order.goneTitle")} description={t("wp.order.goneBody")} action={<Button variant="secondary" href="/me">{t("sh.fs.ctaCard")}</Button>} />;
  if (order === "error") return <ErrorState title={t("wp.err.order")} description={t("auth.err.network")} action={<Button variant="secondary" href={`/o/${encodeURIComponent(id)}`}>{t("rc.tryAgain")}</Button>} />;
  // A degh pre-order gets the reservation page: pickup code, share with the family, calendar, cancel rule.
  if (order.kind === "preorder") {
    return (
      <PageFrame locale={locale}>
        <ReservedView initial={order} />
      </PageFrame>
    );
  }
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <PassTopBar className="mb-2" />
      <OrderStatus initial={order} />
    </LocaleScope>
  );
}
