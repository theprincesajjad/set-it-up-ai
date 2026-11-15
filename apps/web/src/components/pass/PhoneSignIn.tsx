"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { roleHome } from "@/lib/auth/home";
import { otpErrorMessage } from "@/lib/auth/otpErrors";
import { isApiError } from "@/lib/api/errors";
import { rememberLocale, saveProfileLocale, useLocaleOrEnglish } from "@/lib/i18n/client";
import { withLang } from "@/lib/i18n/url";
import { formatNanp, toE164, validateNanp } from "@/lib/phone";
import { useHydrated } from "@/lib/useHydrated";
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
  const hydrated = useHydrated();
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
      // Asked again while the first code is still good (a refresh on the code step): go to the code box, not a "too fast" error.
      const d = isApiError(err) && err.status === 429 ? (err.details as { reason?: string; codeStillValid?: boolean } | undefined) : undefined;
      if (d?.reason === "otp_cooldown" && d.codeStillValid) {
        setStep("code");
        setCode("");
        setCooldown(Math.max(1, Math.ceil((isApiError(err) && err.retryAfter) || RESEND_SECONDS)));
        setStatus(t("auth.otp.alreadySent"));
      } else setBanner(otpErrorMessage(err, t, locale));
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
      // Only a wrong, used or locked code is cleared; a server fault, a rate limit or no signal keeps what they typed.
      const theirs = isApiError(err) && err.status >= 400 && err.status < 500 && err.status !== 429;
      const closed = isApiError(err) && ((err.status === 429 && ((err.details as { reason?: string } | undefined)?.reason === "otp_locked" || /wrong codes|new one/i.test(err.message))) || (err.code === "invalid_code" && /expire|used/i.test(err.message)));
      if (theirs || closed) setCode("");
      if (closed) setCooldown(0);
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
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!hydrated} variant={tone === "trade" ? "shop" : undefined}>
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
              className="inline-flex min-h-11 items-center font-semibold text-fg underline underline-offset-2 focus-visible:focus-ring"
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
          {devCode && devAutofill ? <p dir="ltr" className="text-meta text-fg-muted text-start">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!hydrated} variant={tone === "trade" ? "shop" : undefined}>
            {t("auth.otp.signIn")}
          </Button>
          <Button variant="ghost" size="sm" disabled={cooldown > 0 || busy} onClick={() => void send(undefined, true)} className="min-h-11 self-start">
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
