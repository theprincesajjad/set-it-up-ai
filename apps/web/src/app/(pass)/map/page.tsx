import type { Metadata } from "next";
import type { networkApi } from "@ll/shared";
import { ShopFinder } from "@/components/pass/ShopFinder";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { getServerApi, publicServerApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shops near you", description: "Every independent shop on the network, near you.", alternates: { canonical: "/map" } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MapPage({ searchParams }: Props) {
  const sp = await searchParams;
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
    return <ErrorState title="Can't load shops right now" description={copy.err.network} action={<Button variant="secondary" href="/map">Try again</Button>} />;
  }
  return <ShopFinder initial={shops} neighbourhoods={hoods} neighbourhood={neighbourhood} />;
}
