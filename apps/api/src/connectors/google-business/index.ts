/**
 * Google Business Profile: link the merchant's listing (place id / maps URL)
 * and generate a "Join our rewards" link to add to the profile (Website /
 * Offers / Updates). No OAuth needed; if GOOGLE_PLACES_API_KEY is set we look
 * up the listing name and address via Places API (New).
 */
import type { Config } from "../../config.js";
import type { Connector, Fetch } from "../types.js";
import { requestJson } from "../util.js";

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

/** Extract a place id from a pasted Maps URL (…?q=place_id:XYZ or …!1sChIJ…). */
export function placeIdFromInput(input: { placeId?: unknown; listingUrl?: unknown }): string | null {
  if (typeof input.placeId === "string" && PLACE_ID_RE.test(input.placeId.trim())) return input.placeId.trim();
  if (typeof input.listingUrl === "string") {
    const m = /place_id[:=]([A-Za-z0-9_-]+)/.exec(input.listingUrl) ?? /!1s(ChIJ[A-Za-z0-9_-]+)/.exec(input.listingUrl);
    if (m?.[1]) return m[1];
  }
  return null;
}

export async function lookupPlace(config: Config, placeId: string, fetch: Fetch) {
  if (!config.google.placesApiKey) return null;
  const r = await requestJson(fetch, `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "x-goog-api-key": config.google.placesApiKey, "x-goog-fieldmask": "id,displayName,formattedAddress,googleMapsUri" },
  });
  return { name: r.displayName?.text ?? null, address: r.formattedAddress ?? null, mapsUrl: r.googleMapsUri ?? null };
}

export function googleBusinessLinks(config: Config, merchant: { slug: string }, settings: Record<string, unknown>) {
  const placeId = (settings.placeId as string) ?? null;
  const joinUrl = `${config.publicWebUrl}/join/${encodeURIComponent(merchant.slug)}?utm_source=google&utm_medium=business_profile`;
  return {
    joinUrl,
    reviewUrl: placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null,
    listingUrl: (settings.listingUrl as string) ?? (placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}` : null),
    suggestedPost: `Join our free rewards! Earn points every visit, no app needed: ${joinUrl}`,
  };
}

export const googleBusiness: Connector = {
  id: "google_business",
  name: "Google Business Profile",
  category: "marketing",
  description: "Link your Google listing and add a 'Join our rewards' link customers see in Search and Maps.",
  auth: "link",
  configured: () => true,
  connectFields: [
    { key: "placeId", label: "Google place ID", required: false },
    { key: "listingUrl", label: "Google Maps link to your business", required: false },
  ],
  setup: { envVars: ["GOOGLE_PLACES_API_KEY (optional)"] },
  async connectDirect(config, body, fetch) {
    const placeId = placeIdFromInput(body);
    const listingUrl = typeof body.listingUrl === "string" && /^https:\/\/(www\.)?(google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.page)\//.test(body.listingUrl) ? body.listingUrl : null;
    if (!placeId && !listingUrl) throw new Error("Provide your Google place ID or a Google Maps link to your business");
    let place: Awaited<ReturnType<typeof lookupPlace>> = null;
    if (placeId) {
      try {
        place = await lookupPlace(config, placeId, fetch);
      } catch {
        place = null;
      }
    }
    return {
      credentials: null,
      externalAccountId: placeId ?? listingUrl!,
      settings: { placeId, listingUrl: listingUrl ?? place?.mapsUrl ?? null, placeName: place?.name ?? null, placeAddress: place?.address ?? null },
    };
  },
};
