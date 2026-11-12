"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { roleHome } from "@/lib/auth/home";
import { otpErrorMessage } from "@/lib/auth/otpErrors";
import { rememberLocale, saveProfileLocale, useLocaleOrEnglish } from "@/lib/i18n/client";
import { withLang } from "@/lib/i18n/url";
import { formatNanp, toE164, validateNanp } from "@/lib/phone";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { OtpField } from "@/components/ui/OtpField";
import { PhoneField } from "@/components/ui/PhoneField";

/**
 * Customer sign-in by phone + OTP, in the language of the surrounding LocaleScope (English without one).
 * Sets the httpOnly session, then navigates to `next` (carrying `lang`) or, with no `next`, refreshes in place so an
 * inline sign-in on a shop page just reveals the signed-in view.
 */
const RESEND_SECONDS = 30;

export function PhoneSignIn({ next, devAutofill, title, heading = "h1", intro, tone = "ink", homeByRole = false }: { next?: string; devAutofill?: boolean; /** With no `next`: send people to their dashboard or console when they have one (shop staff invited by phone), else to /me. */ homeByRole?: boolean; /** Already-localized title; defaults to "Sign in with your phone". */ title?: string; heading?: "h1" | "h2" | "h3"; /** One sentence under the title (replaces the "6-digit code" line). */ intro?: string; /** wave-q: "trade" uses the shop's colour for the buttons and the code boxes (inside a shop's booking flow). */ tone?: "ink" | "trade" }) {
  const H = heading;
  const { t, locale } = useLocaleOrEnglish();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const e164 = toE164(digits);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function send(e?: FormEvent, resend = false) {
    e?.preventDefault();
    if (resend && cooldown > 0) return;
    setError(null);
    setBanner(null);
    setStatus(null);
    if (!e164) return setError(t(validateNanp(digits) === "invalid" ? "auth.phone.invalid" : "auth.phone.incomplete"));
    setBusy(true);
    try {
      const r = await browserApi.auth.otpStart(e164);
      setDevCode(r.devCode ?? null);
      setCode(devAutofill && r.devCode ? r.devCode : "");
      setStep("code");
      setCooldown(RESEND_SECONDS);
      if (resend) setStatus(t("auth.otp.sent"));
    } catch (err) {
      setBanner(otpErrorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  async function verify(c = code) {
    if (busy) return;
    if (!/^\d{6}$/.test(c)) return setError(t("auth.otp.enter"));
    setBusy(true);
    setError(null);
    try {
      await sessionApi.verifyOtp({ phone: e164!, code: c });
      rememberLocale(locale);
      void saveProfileLocale(locale);
      if (next) router.push(withLang(next, locale));
      else if (homeByRole) {
        const me = await browserApi.auth.me().catch(() => null);
        router.push(withLang(roleHome(me) ?? "/me", locale));
      }
      router.refresh();
    } catch (err) {
      setCode("");
      setError(otpErrorMessage(err, t, locale));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <H className={heading === "h1" ? "display text-large-title text-fg" : "display text-title text-fg"}>{title ?? t("auth.phone.title")}</H>
        {intro ? <p className="text-body text-fg-muted">{intro}</p> : null}
      </div>
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      {step === "phone" ? (
        <form onSubmit={send} noValidate className="flex flex-col gap-4">
          <PhoneField autoFocus value={digits} onChangeDigits={setDigits} error={error} />
          <Button type="submit" size="lg" fullWidth loading={busy} variant={tone === "trade" ? "shop" : undefined}>
            {t("auth.phone.sendCode")}
          </Button>
          {intro ? null : <p className="text-meta text-fg-muted">{t("auth.phone.hint")}</p>}
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <p className="text-body text-fg-muted">
            {t("auth.otp.sentTo", { phone: formatNanp(digits) })}{" "}
            <button
              type="button"
              className="font-semibold text-fg underline underline-offset-2"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
                setStatus(null);
              }}
            >
              {t("auth.otp.change")}
            </button>
          </p>
          <OtpField tone={tone} value={code} onChange={setCode} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {/* l10n-ok: development builds only (the API sends a devCode only outside production) */}
          {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" size="lg" fullWidth loading={busy} variant={tone === "trade" ? "shop" : undefined}>
            {t("auth.otp.signIn")}
          </Button>
          <Button variant="ghost" size="sm" disabled={cooldown > 0 || busy} onClick={() => void send(undefined, true)} className="-ms-3 self-start">
            {cooldown > 0 ? t("auth.otp.resendIn", { time: `0:${String(cooldown).padStart(2, "0")}` }) : t("auth.otp.resend")}
          </Button>
          <p role="status" aria-live="polite" className="text-meta text-fg-muted empty:hidden">
            {status}
          </p>
        </form>
      )}
    </div>
  );
}
