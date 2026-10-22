"use client";
import type { ReactNode } from "react";
import type { networkApi } from "@ll/shared";
import { NoAccess, PageSkeleton } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

/**
 * BIA managers see only their neighbourhoods. There's no "my neighbourhoods" endpoint, so the
 * list comes from the campaigns they can see (falls back to all public neighbourhoods; the API
 * refuses other neighbourhoods with 403).
 */
export function BiaGate({ children }: { children: (hoods: networkApi.NeighbourhoodDto[]) => ReactNode }) {
  const probe = useApi(() => browserApi.campaigns.list({ limit: 100 }), []);
  const hoods = useNeighbourhoods();
  if (probe.status === 403 || probe.status === 401)
    return <NoAccess title="This area is for BIA managers." body="Ask the Local Loyalty team to add you as the manager for your neighbourhood." action={<Button href="/for-bias">About campaigns</Button>} />;
  if (probe.status === 402) return <NoAccess title="Neighbourhood campaigns are coming soon" body="We'll let you know as soon as your street can run one." />;
  if (!probe.data || !hoods) return <PageSkeleton />;
  const mine = new Set(probe.data.items.map((c) => c.neighbourhoodId));
  const list = mine.size ? hoods.filter((h) => mine.has(h.id)) : hoods;
  return <>{children(list)}</>;
}
