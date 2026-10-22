import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { translator } from "@ll/shared";
import { SplitView } from "@/components/pass/SplitView";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { LanguageSwitcher, LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your share of the bill", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /pay/split/<token>: one guest's share of a split bill (restaurant.split_bills). Shown in the guest's language. */
export default async function SplitPayPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const t = translator(locale);
  const data = await publicServerApi()
    .public.split(token)
    .catch((e: unknown) => (isApiError(e) && [402, 404].includes(e.status) ? ("gone" as const) : ("error" as const)));
  return (
    <LocaleScope locale={locale}>
      <div className="flex flex-col gap-4 pb-8">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        {data === "gone" ? (
          <EmptyState icon={Link2Off} title={t("split.gone")} description={t("split.goneBody")} />
        ) : data === "error" ? (
          <ErrorState title={t("split.title")} description={t("split.loadError")} />
        ) : (
          <SplitView token={token} initial={data} />
        )}
      </div>
    </LocaleScope>
  );
}
