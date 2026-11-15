import { notFound, redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Campaign links from before the console had an overview: /bia/<id> now lives at /bia/campaigns/<id>.
 * Anything under /bia that is not a campaign id (a mistyped page name) is a plain 404 in the console's own shell, not a campaign screen asking the API about it.
 */
export default async function LegacyCampaignRedirect({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  if (!UUID.test(campaignId)) notFound();
  redirect(`/bia/campaigns/${encodeURIComponent(campaignId)}`);
}
