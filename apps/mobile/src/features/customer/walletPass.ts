/**
 * Add a card to Apple Wallet / Google Wallet (owned by the wallet team; setup: docs/engineering/wallet.md).
 * Without `merchantId`: the network member card. With it: that shop's own card (name, colour, stamps, next visit).
 *
 *   const { platform, buttonText, available, add, busy, error } = useAddToWallet({ merchantId });
 *   // platform: "apple" (iOS) | "google" (Android) | null (web)
 *   // buttonText: official wording ("Add to Apple Wallet" / "Add to Google Wallet")
 *   <Button onPress={() => add()} loading={busy}>{buttonText}</Button>
 *
 * iOS: a 10-minute signed .pkpass URL (GET /v1/me/wallet/apple/link, or the shop's from GET /v1/me/wallet/shops/:id).
 *   - in a build with the local PassKit module (modules/ll-passkit): PKAddPassesViewController in the app (Apple's guideline).
 *   - method "link" (default otherwise, e.g. Expo Go): open it with Linking; iOS hands the .pkpass to Wallet's
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
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { LlPassKit } from "../../../modules/ll-passkit/src";
import { addMethodFor, passKitErrorKind } from "./walletAddMethod";

export type WalletPlatform = "apple" | "google";
export type AddResult = "opened" | "cancelled" | "unavailable" | "failed";

export function walletPlatform(os: string = Platform.OS): WalletPlatform | null {
  return os === "ios" ? "apple" : os === "android" ? "google" : null;
}

export const PKPASS_MIME = "application/vnd.apple.pkpass";
export const PKPASS_UTI = "com.apple.pkpass";

async function appleUrl(merchantId?: string): Promise<string> {
  if (merchantId) {
    const s = await api.wallet.shop(merchantId);
    if (!s.apple.available || !s.apple.url) throw Object.assign(new Error("unavailable"), { code: "wallet_not_configured" });
    return s.apple.url;
  }
  return (await api.wallet.appleLink()).url;
}

async function googleUrl(merchantId?: string): Promise<string> {
  if (merchantId) {
    const s = await api.wallet.shop(merchantId);
    if (!s.google.available || !s.google.url) throw Object.assign(new Error("unavailable"), { code: "wallet_not_configured" });
    return s.google.url;
  }
  return (await api.wallet.google()).saveUrl;
}

async function addApple(method: "link" | "download", merchantId?: string): Promise<AddResult> {
  const url = await appleUrl(merchantId);
  if (addMethodFor(Platform.OS, !!LlPassKit) === "passkit" && LlPassKit) {
    try {
      const r = await LlPassKit.addPassFromUrl(url);
      return r === "added" ? "opened" : "cancelled";
    } catch (e) {
      return passKitErrorKind((e as { code?: string }).code) === "unavailable" ? "unavailable" : "failed";
    }
  }
  if (method === "download" && (await Sharing.isAvailableAsync())) {
    const dest = new File(Paths.cache, "card.pkpass");
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(url, dest);
    await Sharing.shareAsync(file.uri, { mimeType: PKPASS_MIME, UTI: PKPASS_UTI, dialogTitle: walletApi.WALLET_BUTTON_TEXT.apple });
    return "opened";
  }
  await Linking.openURL(url);
  return "opened";
}

/** Imperative version (no React). */
export async function addToWallet(opts: { method?: "link" | "download"; merchantId?: string } = {}): Promise<AddResult> {
  const p = walletPlatform();
  if (!p) return "unavailable";
  try {
    if (p === "apple") return await addApple(opts.method ?? "link", opts.merchantId);
    await Linking.openURL(await googleUrl(opts.merchantId));
    return "opened";
  } catch (e) {
    if ((isApiError(e) && e.code === "wallet_not_configured") || (e as { code?: string }).code === "wallet_not_configured") return "unavailable";
    return "failed";
  }
}

export function useAddToWallet(opts: { method?: "link" | "download"; merchantId?: string } = {}) {
  const { t } = useLocale();
  const platform = walletPlatform();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(platform ? null : false);
  const [added, setAdded] = useState(false);
  const { merchantId, method } = opts;

  // Ask the server once whether this platform's card can be issued (and whether it is already in the wallet).
  useEffect(() => {
    if (!platform) return;
    let alive = true;
    (merchantId ? api.wallet.shop(merchantId).then((s) => ({ available: s[platform].available, added: s[platform].added })) : api.wallet.status().then((s) => ({ available: s[platform].available, added: false })))
      .then((r) => {
        if (!alive) return;
        setAvailable(r.available);
        setAdded(r.added);
      })
      .catch(() => alive && setAvailable(null));
    return () => {
      alive = false;
    };
  }, [platform, merchantId]);

  const add = useCallback(async (): Promise<AddResult> => {
    setBusy(true);
    setError(null);
    const r = await addToWallet({ method, merchantId });
    if (r === "unavailable") {
      setAvailable(false);
      setError(t("ms.wallet.off"));
    } else if (r === "failed") setError(t("ms.wallet.openFail"));
    else if (r === "opened" && platform === "apple" && LlPassKit) setAdded(true);
    setBusy(false);
    return r;
  }, [method, merchantId, platform, t]);

  return { platform, buttonText: platform ? walletApi.WALLET_BUTTON_TEXT[platform] : null, available, added, add, busy, error, nativeAppleButton: platform === "apple" && !!LlPassKit };
}
