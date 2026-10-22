"use client";
import { useParams } from "next/navigation";
import { CampaignDetail } from "@/components/dashboard/campaigns/CampaignViews";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

export default function AdminCampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const hoods = useNeighbourhoods();
  if (!hoods) return <PageSkeleton />;
  return <CampaignDetail id={campaignId} base="/admin/campaigns" neighbourhoods={hoods} isAdmin />;
}
