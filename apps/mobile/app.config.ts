import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config. The product name comes from packages/shared/src/brand.ts
 * (BRAND.name) so renaming the product never needs an edit here.
 *
 * Env (all optional, read at build/start time):
 *   EXPO_PUBLIC_API_URL      API base URL (default http://localhost:4000; see src/config.ts)
 *   APP_VARIANT              "development" | "preview" | "production" (set by eas.json profiles)
 *   EAS_PROJECT_ID           EAS project id (needed for Expo push tokens)
 *   GOOGLE_MAPS_API_KEY      Android Google Maps key. Without it the Map tab uses the list view on Android.
 */
function brandName(): string {
  try {
    const src = readFileSync(join(__dirname, "../../packages/shared/src/brand.ts"), "utf8");
    return /name:\s*"([^"]+)"/.exec(src)?.[1] ?? "Loyalty";
  } catch {
    return "Loyalty";
  }
}

const variant = process.env.APP_VARIANT ?? "development";
const suffix = variant === "production" ? "" : variant === "preview" ? ".preview" : ".dev";
const name = brandName() + (variant === "production" ? "" : variant === "preview" ? " (Preview)" : " (Dev)");
const bundleId = `ca.localloyalty.app${suffix}`;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const projectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name,
  slug: "local-loyalty",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "ll",
  userInterfaceStyle: "automatic",
  backgroundColor: "#FAF6EF",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    associatedDomains: ["applinks:local.example"],
    infoPlist: {
      NSCameraUsageDescription: "Scan a customer's card or reward code at the counter.",
      NSLocationWhenInUseUsageDescription: "See shops near you on the map.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#1F6A50" },
    permissions: ["CAMERA", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "local.example", pathPrefix: "/s/" },
          { scheme: "https", host: "local.example", pathPrefix: "/q/" },
          { scheme: "https", host: "local.example", pathPrefix: "/i/" },
          { scheme: "https", host: "local.example", pathPrefix: "/j/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-splash-screen",
      { backgroundColor: "#FAF6EF", image: "./assets/splash-icon.png", imageWidth: 120 },
    ],
    [
      "expo-camera",
      { cameraPermission: "Scan a customer's card or reward code at the counter.", recordAudioAndroid: false },
    ],
    ["expo-location", { locationWhenInUsePermission: "See shops near you on the map." }],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#1F6A50" }],
  ],
  // Expo web is a QA/preview target (screenshots in e2e/); the customer web pass is apps/web.
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  experiments: { typedRoutes: false },
  extra: {
    appVariant: variant,
    mapsEnabledAndroid: Boolean(googleMapsApiKey),
    ...(projectId ? { eas: { projectId } } : {}),
  },
};

export default config;
