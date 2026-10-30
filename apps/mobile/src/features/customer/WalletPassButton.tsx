/**
 * "Add to Apple Wallet" (iOS) / "Add to Google Wallet" (Android), on My card, join success and the member shop page.
 * Brand rules (docs/engineering/wallet.md): iOS in a build with the PassKit module shows Apple's own PKAddPassButton; Android
 * shows Google's official button artwork. Expo Go on iOS (no native module) keeps the stand-in capsule with the official wording.
 * `merchantId` = that shop's own card; without it, the network card.
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
import { useEffect } from "react";
import { SvgXml } from "react-native-svg";
import { NativeAddPassButton } from "../../../modules/ll-passkit/src";
import { GOOGLE_WALLET_BUTTON } from "../../ui/googleWalletButton";
import { useAddToWallet } from "./walletPass";

export function WalletPassButton({ size = "lg", flex, merchantId }: { size?: "md" | "lg"; /** In a row beside another button: share the width. */ flex?: boolean; /** That shop's own card. */ merchantId?: string }) {
  const { c, r } = useTheme();
  const toast = useToast();
  const { t, locale } = useLocale();
  const { prefs, updatePrefs } = useSession();
  const { platform, buttonText, available, added, add, busy, error, nativeAppleButton } = useAddToWallet({ merchantId });
  useEffect(() => {
    if (error) toast({ tone: "error", message: error });
  }, [error, toast]);
  // null = still asking the server; false = not configured. Only a known-good platform shows the button.
  if (!platform || !buttonText || available === false) return null;
  const label = t(platform === "apple" ? "ms.wallet.addApple" : "ms.wallet.addGoogle");

  const onPress = async () => {
    const r = await add();
    if (r === "opened") {
      haptic.success();
      if (!merchantId) updatePrefs({ inWallet: { ...prefs.inWallet, [platform]: true } });
    }
  };

  if (merchantId ? added : prefs.inWallet[platform]) {
    return (
      <View style={styles.inWallet}>
        <Check size={16} color={c.positive} strokeWidth={2.25} />
        <Text variant="meta" color="fgMuted">
          {platform === "apple" ? t("ms.wallet.inApple") : t("ms.wallet.inGoogle")}
        </Text>
      </View>
    );
  }

  // Apple's own button (a build with modules/ll-passkit): the system draws the artwork and language.
  if (platform === "apple" && nativeAppleButton && NativeAddPassButton) {
    return <NativeAddPassButton accessibilityLabel={label} onPress={() => void onPress()} style={{ height: 48, alignSelf: "stretch", flex: flex ? 1 : undefined, opacity: busy ? 0.6 : 1 }} />;
  }
  // Google's official artwork: never recoloured, at least 48 dp tall, the aspect ratio kept.
  if (platform === "google") {
    const art = locale === "ur" ? GOOGLE_WALLET_BUTTON.ur : GOOGLE_WALLET_BUTTON.en;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy }} disabled={busy} onPress={() => void onPress()} style={({ pressed }) => [styles.google, { opacity: pressed || busy ? 0.85 : 1 }]}>
        <SvgXml xml={art.svg} height={52} width={(52 * art.width) / art.height} />
        {busy ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFFFFF" /> : null}
      </Pressable>
    );
  }

  // Expo Go on iOS: the stand-in capsule with the official wording.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("ms.wallet.hint")}
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={() => void onPress()}
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
  google: { alignSelf: "center", minHeight: 52, justifyContent: "center", margin: 8 },
});
