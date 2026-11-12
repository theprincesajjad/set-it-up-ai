import { env } from "@/lib/env";

/**
 * Where the QR codes drawn on the sample cards lead. They are real, scannable codes, and pointing a phone at a wallet-card demo is
 * the natural thing to do, so a scan must land somewhere that works, on our own site (env.siteUrl), never on a made-up card link:
 * a shop owner's scan opens the sign-up, a shopper's scan opens the map of shops. `src=demo-qr` lets the funnel count them.
 */
export function demoQrUrl(audience: "owner" | "shopper" = "owner"): string {
  return `${env.siteUrl}${audience === "shopper" ? "/map" : "/signup"}?src=demo-qr`;
}
