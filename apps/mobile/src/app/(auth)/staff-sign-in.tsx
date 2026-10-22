import { emailOtpStartBodySafe } from "../../features/staffAuth";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t } from "../../copy/en-CA";
import { IS_DEV } from "../../config";
import { api } from "../../state/api";
import { useSession } from "../../state/session";
import { Banner, Button, OtpField, Screen, SegmentedControl, Text, TextField } from "../../ui";

/** Staff sign-in for counter mode: email + password, or a 6-digit email code. */
export default function StaffSignIn() {
  const { signIn, prefs } = useSession();
  const [method, setMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState(prefs.lastEmail ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailOk = emailOtpStartBodySafe(email);

  const done = async (res: Awaited<ReturnType<typeof api.auth.login>>) => {
    await signIn(res, { mode: "counter", email: email.trim().toLowerCase() });
    router.replace("/counter/select");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (isApiError(e) && e.status === 401) setError(method === "password" ? "Email or password is incorrect." : t("err.otp.wrong"));
      else if (isApiError(e) && e.status === 429) setError(t("err.otp.tooMany"));
      else if (isApiError(e) && e.code === "invalid_code") setError(t("err.otp.wrong"));
      else setError(errorMessage(e, { network: t("err.network"), server: t("err.server") }));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = (value: string) => run(async () => done(await api.auth.emailOtpVerify({ email: email.trim(), code: value })));

  return (
    <Screen back>
      <Text variant="largeTitle" accessibilityRole="header">
        Sign in to your shop
      </Text>
      <SegmentedControl
        options={[
          { value: "password", label: "Password" },
          { value: "code", label: "Email me a code" },
        ]}
        value={method}
        onChange={(v) => {
          setMethod(v);
          setError(null);
        }}
      />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      {method === "password" ? (
        <>
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={() => run(async () => done(await api.auth.login({ email: email.trim(), password })))} />
          {error ? <Banner variant="danger">{error}</Banner> : null}
          <Button size="lg" fullWidth loading={busy} onPress={() => run(async () => done(await api.auth.login({ email: email.trim(), password })))}>
            Sign in
          </Button>
        </>
      ) : (
        <>
          {codeSent ? (
            <View style={{ gap: 12 }}>
              <Text color="fgMuted">{`We emailed a 6-digit code to ${email.trim()}.`}</Text>
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
            {codeSent ? "Sign in" : "Send code"}
          </Button>
        </>
      )}
      <Text variant="meta" color="fgMuted">
        Staff on a shared shop tablet: sign in once with the owner or manager account, then switch with your PIN.
      </Text>
    </Screen>
  );
}
