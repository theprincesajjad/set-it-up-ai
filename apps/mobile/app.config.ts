import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";
import { APP_LINK_PREFIXES, assertConfig, linkHost, variantOf } from "./config/envConfig.cjs";

/**
 * Dynamic Expo config. The product name comes from packages/shared/src/brand.ts
 * (BRAND.name) so renaming the product never needs an edit here.
 *
 * Env (all optional, read at build/start time):
 *   EXPO_PUBLIC_API_URL      API base URL. Development defaults to http://localhost:4000; preview and production builds fail without a real https host.
 *   EXPO_PUBLIC_WEB_URL      Public web origin (terms, privacy, share links, universal links). Same rule.
 *   EXPO_PUBLIC_SUPPORT_EMAIL  Monitored support address (Help, suggest a street). Same rule.
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

const variant = variantOf(process.env.APP_VARIANT);
// A preview or production build with a missing or placeholder host stops here, not in a store review.
assertConfig(process.env, variant);
const webHost = linkHost(process.env);
const suffix = variant === "production" ? "" : variant === "preview" ? ".preview" : ".dev";
const name = brandName() + (variant === "production" ? "" : variant === "preview" ? " (Preview)" : " (Dev)");
const bundleId = `ca.localloyalty.app${suffix}`;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const projectId = process.env.EAS_PROJECT_ID;

/** Permission prompts the OS shows. English here; hi, ur and pa live in locales/*.json (the OS picks by device language). The camera text is honest for customers too. */
const CAMERA_PERMISSION = { en: "Scan a QR code to join a shop, collect points, or check in a customer at the counter." };
const LOCATION_PERMISSION = { en: "See shops near you on the map." };

const config: ExpoConfig = {
  name,
  slug: "local-loyalty",
  version: "0.1.0",
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "ll",
  locales: { hi: "./locales/hi.json", ur: "./locales/ur.json", pa: "./locales/pa.json" },
  userInterfaceStyle: "automatic",
  backgroundColor: "#FFFFFF",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    ...(webHost ? { associatedDomains: [`applinks:${webHost}`] } : {}),
    infoPlist: {
      NSCameraUsageDescription: CAMERA_PERMISSION.en,
      NSLocationWhenInUseUsageDescription: LOCATION_PERMISSION.en,
      CFBundleLocalizations: ["en", "hi", "ur", "pa"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#0B0B0C" },
    permissions: ["CAMERA", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    ...(webHost
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: APP_LINK_PREFIXES.map((pathPrefix) => ({ scheme: "https", host: webHost, pathPrefix })),
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-splash-screen",
      { backgroundColor: "#FFFFFF", image: "./assets/splash-icon.png", imageWidth: 88, dark: { backgroundColor: "#0B0B0C", image: "./assets/splash-icon-dark.png" } },
    ],
    [
      "expo-camera",
      { cameraPermission: CAMERA_PERMISSION.en, recordAudioAndroid: false },
    ],
    ["expo-location", { locationWhenInUsePermission: LOCATION_PERMISSION.en }],
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#0B0B0C" }],
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
