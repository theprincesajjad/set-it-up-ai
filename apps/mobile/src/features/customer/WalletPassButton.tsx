/**
 * "Add to Apple Wallet" (iOS) / "Add to Google Wallet" (Android): one black button with the platform's
 * official wording (polish-audit M25), on My card, join success and the member shop page.
 *
 * Logic lives in the wallet team's `useAddToWallet()` (features/customer/walletPass.ts): platform, wording,
 * availability (503 wallet_not_configured → hidden) and the add flow. This file is presentation only.
 * After a successful add the button collapses to a quiet "In Apple Wallet" line. The web preview has no
 * wallet (platform null), so nothing renders there.
 */
import { StyleSheet, View } from "react-native";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Button, Check, Text, Wallet, haptic, useToast } from "../../ui";
import { useAddToWallet } from "./walletPass";
import { useEffect } from "react";

export function WalletPassButton({ size = "lg" }: { size?: "md" | "lg" }) {
  const { c } = useTheme();
  const toast = useToast();
  const { prefs, updatePrefs } = useSession();
  const { platform, buttonText, available, add, busy, error } = useAddToWallet();
  useEffect(() => {
    if (error) toast({ tone: "error", message: error });
  }, [error, toast]);
  // null = still asking the server; false = not configured. Only a known-good platform shows the button.
  if (!platform || !buttonText || available === false) return null;

  if (prefs.inWallet[platform]) {
    return (
      <View style={styles.inWallet}>
        <Check size={16} color={c.positive} strokeWidth={2.25} />
        <Text variant="meta" color="fgMuted">
          {platform === "apple" ? "In Apple Wallet" : "In Google Wallet"}
        </Text>
      </View>
    );
  }

  return (
    <Button
      size={size}
      fullWidth
      iconStart={Wallet}
      loading={busy}
      onPress={async () => {
        const r = await add();
        if (r === "opened") {
          haptic.success();
          updatePrefs({ inWallet: { ...prefs.inWallet, [platform]: true } });
        }
      }}
      accessibilityHint="Opens your phone's wallet"
    >
      {buttonText}
    </Button>
  );
}

const styles = StyleSheet.create({
  inWallet: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", minHeight: 44 },
});
