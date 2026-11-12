import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** SITE_NOINDEX=1 on a staging or preview host (it also sends X-Robots-Tag, see next.config.ts): nothing there may be indexed. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_NOINDEX === "1") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/me", "/q/", "/i/", "/t/", "/o/", "/j/", "/join/", "/m/", "/rep", "/admin", "/bia", "/dev", "/e/", "/pay", "/w/"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
