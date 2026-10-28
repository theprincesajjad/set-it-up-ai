import type { Metadata } from "next";
import type { networkApi } from "@ll/shared";
import { PassTopBar } from "@/components/pass/PassChrome";
import { ShopFinder } from "@/components/pass/ShopFinder";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("wp.t.mapTitle"), description: t("wp.t.mapDesc"), alternates: { canonical: "/map" } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MapPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  const neighbourhood = typeof sp.neighbourhood === "string" ? sp.neighbourhood : null;
  let shops: networkApi.ShopListItemDto[];
  let hoods: networkApi.NeighbourhoodDto[] = [];
  try {
    const api = await getServerApi(); // personalised (balances) when signed in
    [shops, hoods] = await Promise.all([
      api.network
        .shops({ neighbourhood: neighbourhood ?? undefined, limit: 100 })
        .catch(() => publicServerApi().network.shops({ neighbourhood: neighbourhood ?? undefined, limit: 100 }))
        .then((r) => r.items),
      publicServerApi().network.neighbourhoods().then((r) => r.items).catch(() => []),
    ]);
  } catch {
    return <ErrorState title={t("wp.err.shops")} description={t("auth.err.network")} action={<Button variant="secondary" href="/map">{t("rc.tryAgain")}</Button>} />;
  }
  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
      <PassTopBar className="mb-2" />
      <ShopFinder initial={shops} neighbourhoods={hoods} neighbourhood={neighbourhood} />
    </LocaleScope>
  );
}
