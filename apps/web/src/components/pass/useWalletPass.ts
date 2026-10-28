"use client";
/** The wallet-pass logic of the pass: which wallet this phone has, whether the server can issue it, and the two save actions. Shared by the "My card" block and the Add to Wallet button. */
import { useEffect, useState } from "react";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { platform } from "./JoinFlow";

export function useWalletPass() {
  const { t } = useLocaleOrEnglish();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const [available, setAvailable] = useState<{ apple?: boolean; google?: boolean }>({});
  const [loaded, setLoaded] = useState(false);
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  useEffect(() => {
    // The UA is only known on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(platform());
    browserApi.me
      .wallet()
      .then((s) => setAvailable({ apple: s.apple.available, google: s.google.available }))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  const unavailable = t("sh.card.walletOff");
  async function google() {
    setBusy("google");
    try {
      const r = await browserApi.me.googleWallet();
      window.location.href = r.saveUrl;
    } catch {
      setError(unavailable);
    } finally {
      setBusy(null);
    }
  }
  async function apple() {
    setBusy("apple");
    try {
      const s = await browserApi.me.wallet();
      if (s.apple.available && s.apple.downloadUrl) window.location.href = s.apple.downloadUrl;
      else setError(unavailable);
    } catch {
      setError(unavailable);
    } finally {
      setBusy(null);
    }
  }
  /** At least one wallet this phone can use and the server can issue (undetermined counts as yes until the server says otherwise). */
  const canAdd = loaded ? (os !== "android" && available.apple !== false) || (os !== "ios" && available.google !== false) : true;
  return { os, available, busy, error, setError, apple, google, canAdd };
}
