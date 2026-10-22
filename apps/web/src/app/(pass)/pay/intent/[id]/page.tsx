import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { IntentPayView } from "@/components/pass/IntentPayView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { LanguageSwitcher, LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
// The client secret is in the query: keep it out of referrers and search indexes.
export const metadata: Metadata = { title: "Pay", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /pay/intent/<paymentIntentId>?cs=<clientSecret>: where the mobile app (no Stripe SDK) sends tiffin, hall and catering payments. */
export default async function PayIntentPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const cs = typeof sp.cs === "string" ? sp.cs : "";
  const data = cs
    ? await publicServerApi()
        .public.paymentIntent(id, cs)
        .catch((e: unknown) => (isApiError(e) && [400, 403, 404].includes(e.status) ? ("gone" as const) : ("error" as const)))
    : ("gone" as const);
  return (
    <LocaleScope locale={locale} className="flex flex-col gap-6 pt-2">
      <LanguageSwitcher className="self-start" />
      {data === "gone" ? (
        <EmptyState icon={Link2Off} title={t("payIntent.gone")} description={t("payIntent.goneBody")} />
      ) : data === "error" ? (
        <ErrorState title={t("payIntent.loadError")} description="" action={<Button variant="secondary" href={`/pay/intent/${encodeURIComponent(id)}?cs=${encodeURIComponent(cs)}`}>{t("payIntent.tryAgain")}</Button>} />
      ) : (
        <IntentPayView paymentIntentId={id} clientSecret={cs} initial={data} />
      )}
    </LocaleScope>
  );
}
