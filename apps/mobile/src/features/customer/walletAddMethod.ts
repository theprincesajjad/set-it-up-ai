/**
 * How this phone adds a wallet card (pure, unit-tested; docs/engineering/wallet.md "Mobile app").
 *
 *   iOS with the PassKit module (a dev or store build)  → "passkit": PKAddPassesViewController in the app, PKAddPassButton
 *   iOS without it (Expo Go)                             → "link": open the signed .pkpass URL; iOS shows the same Add sheet
 *   Android                                              → "google-link": open the Google save URL (Google Wallet takes it)
 *   anything else (web preview)                          → null: no button
 *
 * Google: the Android Pay SDK's savePasses() needs a JWT signed for the app's SHA-1 and Google Play services; the save URL
 * opens the same Google Wallet flow with no native code, so the app uses the URL.
 */
export type AddMethod = "passkit" | "link" | "google-link";

export function addMethodFor(os: string, nativePassKit: boolean): AddMethod | null {
  if (os === "ios") return nativePassKit ? "passkit" : "link";
  if (os === "android") return "google-link";
  return null;
}

/** Native PassKit error codes → what to tell the customer. */
export function passKitErrorKind(code: string | undefined): "unavailable" | "failed" {
  return code === "ERR_NOT_CONFIGURED" || code === "ERR_CANNOT_ADD" ? "unavailable" : "failed";
}
