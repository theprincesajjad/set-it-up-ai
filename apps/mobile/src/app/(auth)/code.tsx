import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { IS_DEV } from "../../config";
import { firstName } from "../../lib/award";
import { formatCountdown } from "../../lib/format";
import { displayPhone } from "../../lib/phone";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, OtpField, Screen, Text, useToast } from "../../ui";

/** 1.3 Code. Auto-submits on the 6th digit; dev builds auto-fill the API's devCode. */
export default function CodeStep() {
  const params = useLocalSearchParams<{ phone: string; devCode?: string; join?: string }>();
  const phone = params.phone ?? "";
  const { signIn } = useSession();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [resends, setResends] = useState(0);
  const autoResent = useRef(false);

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
        toast({ message: t("ok.welcomeBack", { firstName: firstName(res.user.name) }), tone: "success" });
        if (params.join) router.replace({ pathname: "/name", params: { join: params.join, returning: "1" } });
        else router.replace("/home");
      } else {
        router.replace({ pathname: "/name", params: params.join ? { join: params.join } : {} });
      }
    } catch (e) {
      setCode("");
      if (isApiError(e) && e.status === 429) setError(t("err.otp.tooMany"));
      else if (isApiError(e) && e.code === "invalid_code") {
        const msg = e.message.toLowerCase();
        if ((msg.includes("expired") || msg.includes("used")) && !autoResent.current) {
          autoResent.current = true;
          await resend(true);
          setError(t("err.otp.expired"));
        } else setError(t("err.otp.wrong"));
      } else setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
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
      if (!silent) toast("We sent you a new code.");
      if (IS_DEV && res.devCode) {
        setCode(res.devCode);
        void verify(res.devCode);
      }
    } catch (e) {
      setError(isApiError(e) && e.status === 429 ? t("err.otp.tooMany") : errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    }
  };

  return (
    <Screen back>
      <View style={{ gap: 8 }}>
        <Text variant="h2" accessibilityRole="header">
          Enter the code
        </Text>
        <Text color="fgMuted">
          {`Sent to ${displayPhone(phone)}. `}
          <Text color="fgLink" style={{ textDecorationLine: "underline" }} onPress={() => router.back()} accessibilityRole="link">
            Change
          </Text>
        </Text>
      </View>
      <OtpField autoFocus value={code} onChange={setCode} onComplete={verify} error={!!error} />
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {resends >= 3 ? (
        <Text color="fgMuted" center>
          {t("err.otp.tooMany")}
        </Text>
      ) : (
        <Button variant="ghost" disabled={resendIn > 0} onPress={() => resend()} loading={verifying}>
          {resendIn > 0 ? t("action.resendIn", { time: formatCountdown(resendIn) }) : t("action.resend")}
        </Button>
      )}
    </Screen>
  );
}
