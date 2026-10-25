import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { IS_DEV } from "../../config";
import { firstName } from "../../lib/award";
import { formatCountdown } from "../../lib/format";
import { displayPhone } from "../../lib/phone";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, OtpField, Screen, Text, useToast } from "../../ui";

/** 1.3 Code. Auto-submits on the 6th digit; dev builds auto-fill the API's devCode. */
export default function CodeStep() {
  const params = useLocalSearchParams<{ phone: string; devCode?: string; join?: string }>();
  const phone = params.phone ?? "";
  const { t } = useLocale();
  const { signIn } = useSession();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [resends, setResends] = useState(0);
  const autoResent = useRef(false);

  // Opened without a number (a stale link or a refresh): there is nothing to confirm, so go back to asking for it.
  useEffect(() => {
    if (!phone) router.replace("/phone");
  }, [phone]);

  useEffect(() => {
    const id = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const verify = async (value: string) => {
    if (verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await api.auth.otpVerify({ phone, code: value });
      await signIn(res, { mode: "customer", phone });
      if (!res.created && res.user.name) {
        toast({ message: t("auth.join.welcomeBack", { name: firstName(res.user.name) }), tone: "success" });
        if (params.join) router.replace({ pathname: "/name", params: { join: params.join, returning: "1" } });
        else router.replace("/map");
      } else {
        router.replace({ pathname: "/name", params: params.join ? { join: params.join } : {} });
      }
    } catch (e) {
      setCode("");
      if (isApiError(e) && e.status === 429) setError(t("auth.err.tooMany"));
      else if (isApiError(e) && e.code === "invalid_code") {
        const msg = e.message.toLowerCase();
        if ((msg.includes("expired") || msg.includes("used")) && !autoResent.current) {
          autoResent.current = true;
          await resend(true);
          setError(t("auth.m.code.expiredSent"));
        } else setError(t("auth.err.wrong"));
      } else setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setVerifying(false);
    }
  };

  // Dev convenience: auto-fill the code the non-production API returns.
  useEffect(() => {
    if (IS_DEV && params.devCode && /^\d{6}$/.test(params.devCode)) {
      setCode(params.devCode);
      void verify(params.devCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.devCode]);

  const resend = async (silent = false) => {
    try {
      const res = await api.auth.otpStart(phone);
      setResends((n) => n + 1);
      setResendIn(30);
      if (!silent) toast(t("auth.m.code.newSent"));
      if (IS_DEV && res.devCode) {
        setCode(res.devCode);
        void verify(res.devCode);
      }
    } catch (e) {
      setError(isApiError(e) && e.status === 429 ? t("auth.err.tooMany") : errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    }
  };

  return (
    <Screen back>
      <View style={{ gap: 8 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t("auth.m.code.title")}
        </Text>
        <Text color="fgMuted">
          {`${t("auth.m.code.sentTo", { phone: displayPhone(phone) })} `}
          <Text color="fgLink" style={{ textDecorationLine: "underline" }} onPress={() => router.back()} accessibilityRole="link">
            {t("auth.otp.change")}
          </Text>
        </Text>
      </View>
      <OtpField autoFocus value={code} onChange={setCode} onComplete={verify} error={!!error} />
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {resends >= 3 ? (
        <Text color="fgMuted">
          {t("auth.err.tooMany")}
        </Text>
      ) : (
        <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start", marginStart: -4 }} disabled={resendIn > 0} onPress={() => resend()} loading={verifying}>
          {resendIn > 0 ? t("auth.otp.resendIn", { time: formatCountdown(resendIn) }) : t("auth.otp.resend")}
        </Button>
      )}
    </Screen>
  );
}
