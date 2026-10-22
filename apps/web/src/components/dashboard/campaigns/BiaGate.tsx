"use client";
import type { ReactNode } from "react";
import type { networkApi } from "@ll/shared";
import { NoAccess, PageSkeleton } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";

/**
 * BIA managers see only their neighbourhoods: `GET /v1/me/neighbourhoods-managed` (admins get all).
 * The campaigns probe still decides the rollout state (402 while campaigns are hidden).
 */
export function BiaGate({ children }: { children: (hoods: networkApi.NeighbourhoodDto[]) => ReactNode }) {
  const managed = useApi(() => browserApi.campaigns.managedNeighbourhoods(), []);
  const probe = useApi(() => browserApi.campaigns.list({ limit: 1 }), []);
  const noAccess = <NoAccess title="This area is for BIA managers." body="Ask the Local Loyalty team to add you as the manager for your neighbourhood." action={<Button href="/for-bias">About campaigns</Button>} />;
  if (managed.status === 401 || probe.status === 401 || probe.status === 403) return noAccess;
  if (probe.status === 402) return <NoAccess title="Neighbourhood campaigns are coming soon" body="We'll let you know as soon as your street can run one." />;
  if (managed.error && !managed.data) return <NoAccess title="We couldn't load your neighbourhoods" body={managed.error} action={<Button onClick={() => void managed.reload()}>Try again</Button>} />;
  if (!managed.data || (!probe.data && !probe.error)) return <PageSkeleton />;
  if (!managed.data.items.length) return noAccess;
  return <>{children(managed.data.items)}</>;
}
