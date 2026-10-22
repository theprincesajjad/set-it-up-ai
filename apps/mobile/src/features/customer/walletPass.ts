/**
 * Add the network member card to Apple Wallet / Google Wallet (owned by the wallet team).
 *
 *   const { platform, buttonText, available, add, busy, error } = useAddToWallet();
 *   // platform: "apple" (iOS) | "google" (Android) | null (web)
 *   // buttonText: official wording ("Add to Apple Wallet" / "Add to Google Wallet")
 *   <Button onPress={() => add()} loading={busy}>{buttonText}</Button>
 *
 * iOS: GET /v1/me/wallet/apple/link → a 10-minute signed .pkpass URL.
 *   - method "link" (default): open it with Linking; iOS hands the .pkpass to Wallet's
 *     "Add" sheet (no native PassKit module needed).
 *   - method "download": download the .pkpass to the cache and present it with expo-sharing
 *     (UTI com.apple.pkpass), for when Safari isn't wanted.
 * Android: GET /v1/me/wallet/google → open the "Save to Google Wallet" URL (Wallet app or browser).
 * 503 wallet_not_configured → `available: false` (show the in-app card instead).
 */
import { walletApi } from "@ll/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import { isApiError } from "../../api/client";
import { api } from "../../state/api";

export type WalletPlatform = "apple" | "google";
export type AddResult = "opened" | "unavailable" | "failed";

export function walletPlatform(os: string = Platform.OS): WalletPlatform | null {
  return os === "ios" ? "apple" : os === "android" ? "google" : null;
}

export const PKPASS_MIME = "application/vnd.apple.pkpass";
export const PKPASS_UTI = "com.apple.pkpass";

async function addApple(method: "link" | "download"): Promise<void> {
  const { url } = await api.wallet.appleLink();
  if (method === "download" && (await Sharing.isAvailableAsync())) {
    const dest = new File(Paths.cache, "member-card.pkpass");
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(url, dest);
    await Sharing.shareAsync(file.uri, { mimeType: PKPASS_MIME, UTI: PKPASS_UTI, dialogTitle: walletApi.WALLET_BUTTON_TEXT.apple });
    return;
  }
  await Linking.openURL(url);
}

async function addGoogle(): Promise<void> {
  const { saveUrl } = await api.wallet.google();
  await Linking.openURL(saveUrl);
}

/** Imperative version (no React). */
export async function addToWallet(opts: { method?: "link" | "download" } = {}): Promise<AddResult> {
  const p = walletPlatform();
  if (!p) return "unavailable";
  try {
    if (p === "apple") await addApple(opts.method ?? "link");
    else await addGoogle();
    return "opened";
  } catch (e) {
    if (isApiError(e) && e.code === "wallet_not_configured") return "unavailable";
    return "failed";
  }
}

export function useAddToWallet(opts: { method?: "link" | "download" } = {}) {
  const platform = walletPlatform();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(platform ? null : false);

  // Ask the server once whether this platform's pass is configured (GET /v1/me/wallet).
  useEffect(() => {
    if (!platform) return;
    let alive = true;
    api.wallet
      .status()
      .then((s) => alive && setAvailable(s[platform].available))
      .catch(() => alive && setAvailable(null));
    return () => {
      alive = false;
    };
  }, [platform]);

  const add = useCallback(async (): Promise<AddResult> => {
    setBusy(true);
    setError(null);
    const r = await addToWallet({ method: opts.method });
    if (r === "unavailable") {
      setAvailable(false);
      setError("Wallet passes aren't available right now. Your card in the app works at the counter.");
    } else if (r === "failed") setError("Couldn't open your wallet. Check your connection and try again.");
    setBusy(false);
    return r;
  }, [opts.method]);

  return { platform, buttonText: platform ? walletApi.WALLET_BUTTON_TEXT[platform] : null, available, add, busy, error };
}
