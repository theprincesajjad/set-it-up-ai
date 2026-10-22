import type { MetadataRoute } from "next";
import { publicServerApi } from "@/lib/api/server";
import { env } from "@/lib/env";

export const revalidate = 3600;

const STATIC = ["/", "/for-shoppers", "/for-bias", "/pricing", "/neighbourhoods", "/signup", "/login", "/map", "/accessibility"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${env.siteUrl}${p}`, lastModified: now, changeFrequency: "weekly", priority: p === "/" ? 1 : 0.7 }));
  try {
    const api = publicServerApi();
    const [hoods, shops] = await Promise.all([api.network.neighbourhoods(), api.network.shops({ limit: 200 })]);
    for (const h of hoods.items) entries.push({ url: `${env.siteUrl}/neighbourhoods/${h.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
    for (const s of shops.items) entries.push({ url: `${env.siteUrl}/shops/${s.merchant.slug}`, lastModified: now, changeFrequency: "daily", priority: 0.5 });
  } catch {
    // API unavailable (e.g. at build time): static routes only; regenerated hourly.
  }
  return entries;
}
