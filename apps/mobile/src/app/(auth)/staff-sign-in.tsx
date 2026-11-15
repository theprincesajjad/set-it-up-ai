import { emailOtpStartBodySafe } from "../../features/staffAuth";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { IS_DEV } from "../../config";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, OtpField, Screen, SegmentedControl, Text, TextField } from "../../ui";

/** Staff sign-in for counter mode: email + password, or a 6-digit email code. */
export default function StaffSignIn() {
  const { signIn, prefs } = useSession();
  const { t } = useLocale();
  const [method, setMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState(prefs.lastEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailOk = emailOtpStartBodySafe(email);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const done = async (res: Awaited<ReturnType<typeof api.auth.login>>) => {
    await signIn(res, { mode: "counter", email: email.trim().toLowerCase() });
    router.replace("/counter/select");
  };

  /** Name the field, say how to fix it and focus it, before anything is sent. */
  const signInWithPassword = () => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = t("auth.err.required", { field: t("mc.si.email") });
    else if (!emailOk) next.email = t("mf.field.email");
    if (!password) next.password = t("auth.err.required", { field: t("mc.si.password") });
    setFieldError(next);
    if (next.email) return void emailRef.current?.focus();
    if (next.password) return void passwordRef.current?.focus();
    return run(async () => done(await api.auth.login({ email: email.trim(), password })));
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (isApiError(e) && e.status === 401) setError(method === "password" ? t("mc.si.badLogin") : t("auth.err.wrong"));
      else if (isApiError(e) && e.status === 429) setError(t("auth.err.tooMany"));
      else if (isApiError(e) && e.code === "invalid_code") setError(t("auth.err.wrong"));
      else setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = (value: string) => run(async () => done(await api.auth.emailOtpVerify({ email: email.trim(), code: value })));

  return (
    <Screen back>
      <Text variant="largeTitle" accessibilityRole="header">
        {t("mc.si.title")}
      </Text>
      <SegmentedControl
        options={[
          { value: "password", label: t("mc.si.password") },
          { value: "code", label: t("mc.si.emailCode") },
        ]}
        value={method}
        onChange={(v) => {
          setMethod(v);
          setError(null);
          setFieldError({});
        }}
      />
      <TextField ref={emailRef} label={t("mc.si.email")} value={email} onChangeText={(v) => { setEmail(v); setFieldError((x) => ({ ...x, email: undefined })); }} error={fieldError.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      {method === "password" ? (
        <>
          <TextField ref={passwordRef} label={t("mc.si.password")} value={password} onChangeText={(v) => { setPassword(v); setFieldError((x) => ({ ...x, password: undefined })); }} error={fieldError.password} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={signInWithPassword} />
          {error ? <Banner variant="danger">{error}</Banner> : null}
          <Button size="lg" fullWidth loading={busy} onPress={signInWithPassword}>
            {t("mc.si.signIn")}
          </Button>
        </>
      ) : (
        <>
          {codeSent ? (
            <View style={{ gap: 12 }}>
              <Text color="fgMuted">{t("mc.si.sentTo", { email: email.trim() })}</Text>
              <OtpField autoFocus value={code} onChange={setCode} onComplete={verifyCode} error={!!error} />
            </View>
          ) : null}
          {error ? <Banner variant="danger">{error}</Banner> : null}
          <Button
            size="lg"
            fullWidth
            loading={busy}
            disabled={!emailOk}
            onPress={() =>
              codeSent
                ? verifyCode(code)
                : run(async () => {
                    const res = await api.auth.emailOtpStart(email.trim());
                    setCodeSent(true);
                    if (IS_DEV && res.devCode) {
                      setCode(res.devCode);
                      await done(await api.auth.emailOtpVerify({ email: email.trim(), code: res.devCode }));
                    }
                  })
            }
          >
            {codeSent ? t("mc.si.signIn") : t("mc.si.sendCode")}
          </Button>
        </>
      )}
      <Text variant="meta" color="fgMuted">
        {t("mc.si.hint")}
      </Text>
    </Screen>
  );
}
