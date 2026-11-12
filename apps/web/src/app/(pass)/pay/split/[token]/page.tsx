import type { Metadata } from "next";
import { SplitView } from "@/components/pass/SplitView";
import { LinkProblem, linkKind } from "@/components/errors/server";
import { publicServerApi } from "@/lib/api/server";
import { PassTopBar } from "@/components/pass/PassChrome";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wp.t.split"), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /pay/split/<token>: one guest's share of a split bill (restaurant.split_bills). Shown in the guest's language. */
export default async function SplitPayPage({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const locale = await getLocale(sp);
  const data = await publicServerApi()
    .public.split(token)
    .catch((e: unknown) => linkKind(e));
  return (
    <LocaleScope locale={locale} trade="other">
      <div className="flex flex-col gap-4 pb-8">
        <PassTopBar />
        {typeof data === "string" ? (
          <LinkProblem kind={data} retryHref={`/pay/split/${encodeURIComponent(token)}`} />
        ) : (
          <SplitView token={token} initial={data} />
        )}
      </div>
    </LocaleScope>
  );
}
