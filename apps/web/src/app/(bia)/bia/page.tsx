"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { CampaignList } from "@/components/dashboard/campaigns/CampaignViews";

export default function BiaPage() {
  return <BiaGate>{(hoods) => <CampaignList base="/bia" neighbourhoods={hoods} isAdmin={false} />}</BiaGate>;
}
