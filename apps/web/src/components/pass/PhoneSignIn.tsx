"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { copy } from "@/copy/en-CA";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { PHONE_ERRORS, toE164, validateNanp } from "@/lib/phone";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { OtpField } from "@/components/ui/OtpField";
import { PhoneField } from "@/components/ui/PhoneField";

/** Customer sign-in by phone + OTP. Sets the httpOnly session, then navigates (or refreshes). */
export function PhoneSignIn({ next, devAutofill, title = "Sign in with your phone", heading = "h1" }: { next?: string; devAutofill?: boolean; title?: string; heading?: "h1" | "h2" }) {
  const H = heading;
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const e164 = toE164(digits);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setBanner(null);
    if (!e164) return setError(PHONE_ERRORS[validateNanp(digits) === "invalid" ? "invalid" : "incomplete"]);
    setBusy(true);
    try {
      const r = await browserApi.auth.otpStart(e164);
      setDevCode(r.devCode ?? null);
      setCode(devAutofill && r.devCode ? r.devCode : "");
      setStep("code");
    } catch (err) {
      setBanner(isApiError(err) && err.status === 429 ? copy.err.otpTooMany : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(c = code) {
    if (busy) return;
    if (!/^\d{6}$/.test(c)) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    try {
      await sessionApi.verifyOtp({ phone: e164!, code: c });
      if (next) router.push(next);
      router.refresh();
    } catch (err) {
      setCode("");
      setError(isApiError(err) && err.status === 429 ? copy.err.otpTooMany : isApiError(err) && err.code === "invalid_code" ? copy.err.otpWrong : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <H className={heading === "h1" ? "text-h1 text-fg" : "text-h2 text-fg"}>{title}</H>
      {banner ? <Banner tone="warning">{banner}</Banner> : null}
      {step === "phone" ? (
        <form onSubmit={send} noValidate className="flex flex-col gap-4">
          <PhoneField autoFocus value={digits} onChangeDigits={setDigits} error={error} />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            {copy.action.sendCode}
          </Button>
          <p className="text-caption text-fg-muted">We&apos;ll text you a 6-digit code.</p>
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
          <OtpField value={code} onChange={setCode} onComplete={(c) => void verify(c)} error={error} disabled={busy} />
          {devCode && devAutofill ? <p className="text-caption text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Sign in
          </Button>
          <Button variant="ghost" size="sm" onClick={() => send()} className="-ms-3 self-start">
            {copy.action.resend}
          </Button>
        </form>
      )}
    </div>
  );
}
