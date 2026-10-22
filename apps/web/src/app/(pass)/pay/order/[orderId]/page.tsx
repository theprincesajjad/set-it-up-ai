import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { OrderPayView } from "@/components/pass/OrderPayView";
import { COPY } from "@/components/pass/restaurantCopy";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { LanguageSwitcher, LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay for your order", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /pay/order/<orderId>?t=<token>: the pay link a customer gets in WhatsApp. The token proves the link is theirs. */
export default async function PayOrderPage({ params, searchParams }: Props) {
  const [{ orderId }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const c = COPY[locale];
  const t = typeof sp.t === "string" ? sp.t : "";
  const data = t
    ? await publicServerApi()
        .public.whatsappPay(orderId, t)
        .catch((e: unknown) => (isApiError(e) && [400, 402, 403, 404].includes(e.status) ? ("gone" as const) : ("error" as const)))
    : ("gone" as const);
  return (
    <LocaleScope locale={locale} className="flex flex-col gap-6 pt-2">
      <LanguageSwitcher className="self-start" />
      {data === "gone" ? (
        <EmptyState icon={Link2Off} title={c.payGoneTitle} description={c.payGoneBody} />
      ) : data === "error" ? (
        <ErrorState title={c.loadError} description="" action={<Button variant="secondary" href={`/pay/order/${encodeURIComponent(orderId)}?t=${encodeURIComponent(t)}`}>{c.tryAgain}</Button>} />
      ) : (
        <OrderPayView orderId={orderId} token={t} initial={data} />
      )}
    </LocaleScope>
  );
}
