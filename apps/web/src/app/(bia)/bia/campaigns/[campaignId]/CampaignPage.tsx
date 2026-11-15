"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { CampaignDetail } from "@/components/dashboard/campaigns/CampaignViews";

export function CampaignPage({ id }: { id: string }) {
  return <BiaGate>{(hoods) => <CampaignDetail id={id} base="/bia/campaigns" neighbourhoods={hoods} isAdmin={false} />}</BiaGate>;
}
