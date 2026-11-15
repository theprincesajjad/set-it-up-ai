import { notFound } from "next/navigation";
import { CampaignPage } from "./CampaignPage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A campaign id that is not an id at all (a mistyped link) is a 404 before any request goes to the API, which would answer 400 and light the console. */
export default async function BiaCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  if (!UUID.test(campaignId)) notFound();
  return <CampaignPage id={campaignId} />;
}
