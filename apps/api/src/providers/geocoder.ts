/**
 * Address to map pin (latitude and longitude) for a new shop's street address. One lookup per signup, so the public OpenStreetMap
 * Nominatim service is enough (its usage policy: an identifying User-Agent, at most one request a second). A lookup that fails or
 * finds nothing is not an error: the shop simply has no pin yet and the owner is told.
 */
import type { Config } from "../config.js";

export interface GeocodeQuery {
  address: string;
  city?: string | null;
  postalCode?: string | null;
}
export interface GeocodeHit {
  lat: number;
  lng: number;
}
export interface Geocoder {
  name: string;
  geocode(q: GeocodeQuery): Promise<GeocodeHit | null>;
}

export const noGeocoder: Geocoder = { name: "none", geocode: async () => null };

export function nominatimGeocoder(cfg: { url: string; userAgent: string }, f: typeof fetch = fetch): Geocoder {
  return {
    name: "nominatim",
    async geocode(q) {
      const text = [q.address, q.city, q.postalCode, "Canada"].filter(Boolean).join(", ");
      const url = `${cfg.url}?${new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "ca", q: text }).toString()}`;
      try {
        const res = await f(url, { headers: { "User-Agent": cfg.userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const rows = (await res.json()) as { lat?: string; lon?: string }[];
        const lat = Number(rows[0]?.lat);
        const lng = Number(rows[0]?.lon);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      } catch {
        return null;
      }
    },
  };
}

export function geocoderFromConfig(config: Config["geocoder"], f?: typeof fetch): Geocoder {
  return config.provider === "nominatim" ? nominatimGeocoder(config, f) : noGeocoder;
}
