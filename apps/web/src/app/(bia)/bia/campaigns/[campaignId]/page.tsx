"use client";
import { useParams } from "next/navigation";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { CampaignDetail } from "@/components/dashboard/campaigns/CampaignViews";

export default function BiaCampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  return <BiaGate>{(hoods) => <CampaignDetail id={campaignId} base="/bia/campaigns" neighbourhoods={hoods} isAdmin={false} />}</BiaGate>;
}
