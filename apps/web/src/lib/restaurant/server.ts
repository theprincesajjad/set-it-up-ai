import { createApiClient } from "@/lib/api/client";
import { getServerClient, publicServerApi } from "@/lib/api/server";
import { serverApiUrl } from "@/lib/env";
import { restaurantCustomerApi, type RestaurantCustomerApi } from "./api";

/** Anonymous server-side client (server components). */
export function publicRestaurantApi(): RestaurantCustomerApi {
  return restaurantCustomerApi(createApiClient({ baseUrl: serverApiUrl() }));
}

/** Server-side client that carries the signed-in customer's cookie. */
export async function serverRestaurantApi(): Promise<RestaurantCustomerApi> {
  return restaurantCustomerApi(await getServerClient());
}

export interface ShopBrief {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
  phone: string | null;
  vertical: string;
  /** Show the "Powered by" line (Free shops only; the API computes it with showsPoweredBy). */
  poweredBy: boolean;
  /** The loyalty program's word ("stamps", "points"): the wallet card line says "Your stamps update…". */
  terminology?: string;
}

/** The shop header every restaurant page needs. Throws ApiError (404) for unknown shops. */
export async function loadShopBrief(slug: string): Promise<ShopBrief> {
  const s = await publicServerApi().public.shop(slug);
  const m = s.merchant;
  return { id: m.id, name: m.name, slug: m.slug, logoUrl: m.logoUrl ?? null, brandColor: m.brandColor ?? null, phone: m.phone ?? s.locations[0]?.phone ?? null, vertical: m.vertical, poweredBy: s.poweredBy !== false, terminology: s.program?.terminology ?? undefined };
}
