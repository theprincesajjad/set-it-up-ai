/**
 * "Add to Apple Wallet" (iOS) / "Save to Google Wallet" (Android): one black button, the exact wording each
 * platform's brand rules require (polish-audit M25). Used on My card, the shop page (members) and join success.
 *
 * Talks to the wallet API (GET /v1/me/wallet → signed Apple link / Google save URL). When the pass is already
 * in the wallet it collapses to a quiet "In your Wallet" line. Hidden on a phone when the server says passes
 * aren't available; the web QA preview always shows it so the layout can be reviewed.
 */
import { useQuery } from "@tanstack/react-query";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { t } from "../../copy/en-CA";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Button, Check, Text, Wallet, haptic, useToast } from "../../ui";
import { useState } from "react";

export type WalletPlatform = "apple" | "google";

/** iOS → Apple, Android → Google; the web preview follows the browser (iPhone / Mac → Apple). */
export function walletPlatform(): WalletPlatform {
  if (Platform.OS === "ios") return "apple";
  if (Platform.OS === "android") return "google";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /android/i.test(ua) ? "google" : "apple";
}

export function useWalletPass() {
  const online = useOnline();
  return useQuery({ queryKey: qk.walletPass, queryFn: api.wallet.status, enabled: online, retry: false, staleTime: 10 * 60_000 });
}

export function WalletPassButton({ size = "lg" }: { size?: "md" | "lg" }) {
  const { c } = useTheme();
  const online = useOnline();
  const toast = useToast();
  const { prefs, updatePrefs } = useSession();
  const pass = useWalletPass();
  const [busy, setBusy] = useState(false);
  const which = walletPlatform();
  const available = pass.data ? pass.data[which].available : Platform.OS === "web";
  if (!available && Platform.OS !== "web") return null;

  if (prefs.inWallet[which]) {
    return (
      <View style={styles.inWallet} accessibilityRole="text">
        <Check size={16} color={c.positive} strokeWidth={2.25} />
        <Text variant="meta" color="fgMuted">
          {which === "apple" ? "In Apple Wallet" : "In Google Wallet"}
        </Text>
      </View>
    );
  }

  const add = async () => {
    setBusy(true);
    try {
      const url = which === "apple" ? (pass.data?.apple.downloadUrl ?? (await api.wallet.appleLink()).url) : (pass.data?.google.saveUrl ?? (await api.wallet.google()).saveUrl);
      if (!url) throw new Error("no url");
      await Linking.openURL(url);
      haptic.success();
      updatePrefs({ inWallet: { ...prefs.inWallet, [which]: true } });
    } catch (e) {
      toast({ tone: "error", message: errorMessage(e, { network: t("err.network"), server: "Wallet passes aren't ready yet. Your card here works the same." }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size={size} fullWidth iconStart={Wallet} loading={busy} disabled={!online} onPress={add} accessibilityHint="Opens your phone's wallet app">
      {which === "apple" ? "Add to Apple Wallet" : "Save to Google Wallet"}
    </Button>
  );
}

const styles = StyleSheet.create({
  inWallet: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", minHeight: 44 },
});
