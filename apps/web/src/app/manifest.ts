import type { MetadataRoute } from "next";
import { BRAND } from "@ll/shared";

/** The web pass as an installable app (phase solo, workstream D): iPhone allows web push reminders only from the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    start_url: "/me",
    scope: "/",
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: "#F2F2F7",
    // PNGs beside the SVG: Android and iOS install prompts need raster sizes, and the maskable one fills the launcher's own shape
    // (scripts/brand-icons/build.mjs draws them from the same mark).
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
