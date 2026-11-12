import type { Metadata } from "next";
import { OrderPayView } from "@/components/pass/OrderPayView";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { PassTopBar } from "@/components/pass/PassChrome";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("rs.order.payTitle"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /pay/order/<orderId>?t=<token>: the pay link a customer gets in WhatsApp. The token proves the link is theirs. */
export default async function PayOrderPage({ params, searchParams }: Props) {
  const [{ orderId }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const tok = typeof sp.t === "string" ? sp.t : "";
  const data = tok
    ? await publicServerApi()
        .public.whatsappPay(orderId, tok)
        .catch((e: unknown) => (isApiError(e) && e.status === 403 ? ("gone" as const) : linkKind(e)))
    : ("gone" as const);
  return (
    <LocaleScope locale={locale} trade="other" className="flex flex-col gap-6 pt-2">
      <PassTopBar className="self-stretch" />
      {typeof data === "string" ? (
        <LinkProblem kind={data} retryHref={`/pay/order/${encodeURIComponent(orderId)}?t=${encodeURIComponent(tok)}`} />
      ) : (
        <OrderPayView orderId={orderId} token={tok} initial={data} />
      )}
    </LocaleScope>
  );
}
