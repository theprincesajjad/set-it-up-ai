"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { CampaignList } from "@/components/dashboard/campaigns/CampaignViews";

export default function BiaCampaignsPage() {
  return <BiaGate>{(hoods, hood) => <CampaignList base="/bia/campaigns" neighbourhoods={hoods} neighbourhoodId={hood.id} isAdmin={false} />}</BiaGate>;
}
