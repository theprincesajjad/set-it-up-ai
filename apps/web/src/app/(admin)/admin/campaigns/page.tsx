"use client";
import { CampaignList } from "@/components/dashboard/campaigns/CampaignViews";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

export default function AdminCampaignsPage() {
  const hoods = useNeighbourhoods();
  if (!hoods) return <PageSkeleton />;
  return <CampaignList base="/admin/campaigns" neighbourhoods={hoods} isAdmin />;
}
