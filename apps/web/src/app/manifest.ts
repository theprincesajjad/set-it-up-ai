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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
