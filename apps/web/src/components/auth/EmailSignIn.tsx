"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { authApi } from "@ll/shared";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { staffHome } from "@/lib/auth/home";
import { otpErrorMessage } from "@/lib/auth/otpErrors";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { OtpField } from "@/components/ui/OtpField";
import { TextField } from "@/components/ui/TextField";

export { staffHome };

const RESEND_SECONDS = 30;

/**
 * Merchants, reps, admins and BIA managers: email + password, or a one-time email code, or "Forgot password?" (wave P): the emailed
 * code plus a new password, which signs them in. `initialMode="reset"` opens on the reset (/login?reset=1); `initialMode="code"` with
 * `initialEmail` opens on the emailed code (the link in a team invite, /login?mode=code&email=...).
 */
export function EmailSignIn({
  next,
  devAutofill,
  initialMode = "password",
  initialEmail = "",
}: {
  next?: string | null;
  devAutofill?: boolean;
  initialMode?: "password" | "code" | "reset";
  initialEmail?: string;
}) {
  const router = useRouter();
  const { t, locale } = useLocaleOrEnglish();
  const [mode, setMode] = useState<"password" | "code" | "reset">(initialMode);
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function done() {
    let me: authApi.MeResponse | null = null;
    try {
      me = await browserApi.auth.me();
    } catch {
      me = null;
    }
    router.push(staffHome(me, next));
    router.refresh();
  }

  async function sendCode(resend: boolean) {
    const r = await browserApi.auth.emailOtpStart(email);
    setCodeSent(true);
    setDevCode(r.devCode ?? null);
    setCode(devAutofill && r.devCode ? r.devCode : "");
    setCooldown(RESEND_SECONDS);
    setStatus(resend ? t("auth.otp.sent") : null);
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setError(null);
    setBusy(true);
    try {
      await sendCode(true);
    } catch (err) {
      setError(otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNoAccount(false);
    setStatus(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t("auth.shop.enterEmail"));
    setBusy(true);
    try {
      if (mode === "password") {
        if (!password) throw new Error(t("auth.shop.enterPassword"));
        await sessionApi.login({ email, password });
        await done();
      } else if (mode === "reset" && codeSent) {
        if (code.length < 6) throw new Error(t("auth.shop.enterCode"));
        if (newPassword.length < 8) throw new Error(t("auth.shop.passwordShort"));
        await sessionApi.resetPassword({ email, code, password: newPassword });
        await done();
      } else if (!codeSent) {
        await sendCode(false);
        setBusy(false);
      } else {
        await sessionApi.verifyEmailOtp({ email, code });
        await done();
      }
    } catch (err) {
      if (isApiError(err) && err.code === "no_account") {
        setNoAccount(true);
      } else if (!isApiError(err)) {
        setError(err instanceof Error ? err.message : t("auth.err.generic"));
      } else if (mode === "password") {
        setError(err.status === 401 ? t("auth.shop.badLogin") : err.status === 429 ? t("auth.shop.rateLimited") : otpErrorMessage(err, t, locale));
      } else {
        setCode("");
        setError(otpErrorMessage(err, t, locale));
      }
      setBusy(false);
    }
  }

  const switchTo = (m: "password" | "code" | "reset") => {
    setMode(m);
    setCodeSent(false);
    setCode("");
    setError(null);
    setNoAccount(false);
    setStatus(null);
  };

  const changeEmail = () => {
    setCodeSent(false);
    setCode("");
    setError(null);
    setNoAccount(false);
    setStatus(null);
  };

  const resendLabel = cooldown > 0 ? t("auth.otp.resendIn", { time: `0:${String(cooldown).padStart(2, "0")}` }) : t("auth.otp.resend");
  const banners = (
    <>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {noAccount ? (
        <Banner tone="danger">
          {t("auth.shop.noAccount", { email })}{" "}
          <Link href="/signup" className="font-semibold underline underline-offset-2">
            {t("auth.shop.noAccountLink")}
          </Link>
          .
        </Banner>
      ) : null}
    </>
  );
  const sentLine = (
    <p className="text-body text-fg-muted">
      {t("auth.shop.codeSentTo", { email })}{" "}
      <button type="button" className="font-semibold text-fg underline underline-offset-2" onClick={changeEmail}>
        {t("auth.shop.changeEmail")}
      </button>
    </p>
  );
  const resendRow = (
    <>
      <Button variant="ghost" size="sm" className="-ms-3 self-start" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
        {resendLabel}
      </Button>
      <p role="status" aria-live="polite" className="text-meta text-fg-muted empty:hidden">
        {status}
      </p>
    </>
  );

  if (mode === "reset") {
    return (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="password-reset">
        <div>
          <h2 className="text-headline text-foreground">{t("auth.shop.resetTitle")}</h2>
          <p className="mt-1 text-meta text-muted-foreground">{codeSent ? t("auth.shop.resetSent", { email }) : t("auth.shop.resetIntro")}</p>
        </div>
        {banners}
        {codeSent ? (
          <>
            <OtpField value={code} onChange={setCode} label={t("auth.shop.codeLabel")} />
            {/* l10n-ok: development builds only */}
            {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
            <TextField label={t("auth.shop.newPassword")} type="password" autoComplete="new-password" hint={t("auth.shop.passwordHint")} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </>
        ) : (
          <TextField label={t("auth.shop.email")} type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          {codeSent ? t("auth.shop.setPassword") : t("auth.shop.emailCode")}
        </Button>
        {codeSent ? resendRow : null}
        <div className="flex flex-wrap gap-x-4">
          {codeSent ? (
            <Button variant="ghost" size="sm" className="-ms-3" onClick={() => switchTo("reset")}>
              {t("auth.shop.differentEmail")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className={codeSent ? undefined : "-ms-3"} onClick={() => switchTo("password")}>
            {t("auth.shop.backToSignIn")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {banners}
      {mode === "code" && codeSent ? (
        sentLine
      ) : (
        <TextField label={t("auth.shop.email")} type="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
      )}
      {mode === "password" ? (
        <div className="flex flex-col gap-1">
          <TextField label={t("auth.shop.password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button variant="ghost" size="sm" className="self-end -me-3" onClick={() => switchTo("reset")}>
            {t("auth.shop.forgot")}
          </Button>
        </div>
      ) : codeSent ? (
        <>
          <OtpField value={code} onChange={setCode} label={t("auth.shop.codeLabel")} />
          {/* l10n-ok: development builds only */}
          {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {mode === "password" ? t("auth.otp.signIn") : codeSent ? t("auth.otp.signIn") : t("auth.shop.emailCode")}
      </Button>
      {mode === "code" && codeSent ? resendRow : null}
      <Button variant="ghost" size="sm" className="self-start -ms-3" onClick={() => switchTo(mode === "password" ? "code" : "password")}>
        {mode === "password" ? t("auth.shop.emailCodeInstead") : t("auth.shop.usePassword")}
      </Button>
    </form>
  );
}
