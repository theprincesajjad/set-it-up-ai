import { redirect } from "next/navigation";

/** Campaign links from before the console had an overview: /bia/<id> now lives at /bia/campaigns/<id>. */
export default async function LegacyCampaignRedirect({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  redirect(`/bia/campaigns/${encodeURIComponent(campaignId)}`);
}
