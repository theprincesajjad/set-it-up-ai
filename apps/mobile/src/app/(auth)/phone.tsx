import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { sanitizePhoneInput, toE164, validateNanp } from "../../lib/phone";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, PhoneField, Screen, Text } from "../../ui";

/** 1.2 Phone. "Send code" disabled until 10 valid digits (the one place we disable). */
export default function PhoneStep() {
  const { prefill, join } = useLocalSearchParams<{ prefill?: string; join?: string }>();
  const { updatePrefs } = useSession();
  const [digits, setDigits] = useState(() => sanitizePhoneInput(prefill ?? ""));
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ tone: "warning" | "danger"; text: string } | null>(null);
  const err = validateNanp(digits);
  const showErr = touched && digits.length === 10 && err === "invalid" ? t("err.phone.invalid") : null;

  const send = async () => {
    setTouched(true);
    const e164 = toE164(digits);
    if (!e164) return;
    setSending(true);
    setBanner(null);
    try {
      const res = await api.auth.otpStart(e164);
      updatePrefs({ lastPhone: e164 });
      router.push({ pathname: "/code", params: { phone: e164, devCode: res.devCode ?? "", ...(join ? { join } : {}) } });
    } catch (e) {
      if (isApiError(e) && e.status === 429) setBanner({ tone: "warning", text: t("err.otp.tooMany") });
      else if (isApiError(e) && e.status === 400) setBanner({ tone: "danger", text: t("err.phone.invalid") });
      else setBanner({ tone: "danger", text: errorMessage(e, { network: t("err.network"), server: t("err.server") }) });
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        back
        footer={
          <Button size="lg" fullWidth disabled={err !== null} loading={sending} onPress={send}>
            {t("action.sendCode")}
          </Button>
        }
        banner={banner ? <Banner variant={banner.tone} actionLabel={banner.tone === "danger" ? "Retry" : undefined} onAction={send}>{banner.text}</Banner> : null}
      >
        <View style={{ gap: 8 }}>
          <Text variant="largeTitle" accessibilityRole="header">
            What's your number?
          </Text>
          <Text color="fgMuted">We'll text you a code. Shops find your card by this number too.</Text>
        </View>
        <PhoneField autoFocus digits={digits} onChangeDigits={setDigits} error={showErr} hint="Standard message rates may apply." onSubmitEditing={send} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
