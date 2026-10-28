/**
 * "Add to Apple Wallet" (iOS) / "Add to Google Wallet" (Android): one deep-green button with the platform's
 * official wording (polish-audit M25), on My card, join success and the member shop page.
 *
 * Logic lives in the wallet team's `useAddToWallet()` (features/customer/walletPass.ts): platform, wording,
 * availability (503 wallet_not_configured → hidden) and the add flow. This file is presentation only.
 * After a successful add the button collapses to a quiet "In Apple Wallet" line. The web preview has no
 * wallet (platform null), so nothing renders there.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useLocale } from "../../lib/i18n";
import { useSession } from "../../state/session";
import { ui, useTheme } from "../../theme";
import { Check, Text, WalletPassGlyph, haptic, useToast } from "../../ui";
import { useAddToWallet } from "./walletPass";
import { useEffect } from "react";

export function WalletPassButton({ size = "lg", flex }: { size?: "md" | "lg"; /** In a row beside another button: share the width. */ flex?: boolean }) {
  const { c, r } = useTheme();
  const toast = useToast();
  const { t } = useLocale();
  const { prefs, updatePrefs } = useSession();
  const { platform, buttonText, available, add, busy, error } = useAddToWallet();
  useEffect(() => {
    if (error) toast({ tone: "error", message: error });
  }, [error, toast]);
  // null = still asking the server; false = not configured. Only a known-good platform shows the button.
  if (!platform || !buttonText || available === false) return null;
  const label = t(platform === "apple" ? "ms.wallet.addApple" : "ms.wallet.addGoogle");

  if (prefs.inWallet[platform]) {
    return (
      <View style={styles.inWallet}>
        <Check size={16} color={c.positive} strokeWidth={2.25} />
        <Text variant="meta" color="fgMuted">
          {platform === "apple" ? t("ms.wallet.inApple") : t("ms.wallet.inGoogle")}
        </Text>
      </View>
    );
  }

  // Canvas Card artboard: a 52 pt forest capsule, the wallet glyph, the platform's official wording.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("ms.wallet.hint")}
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={async () => {
        const r = await add();
        if (r === "opened") {
          haptic.success();
          updatePrefs({ inWallet: { ...prefs.inWallet, [platform]: true } });
        }
      }}
      style={({ pressed }) => [styles.btn, { height: size === "md" ? 48 : 52, paddingHorizontal: 18, flex: flex ? 1 : undefined, backgroundColor: r.forest, opacity: pressed || busy ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={r.forestForeground} /> : <WalletPassGlyph size={22} color={r.forestForeground} />}
      <Text style={ui(16, 600, 20)} rawColor={r.forestForeground} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  inWallet: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", minHeight: 44 },
});
