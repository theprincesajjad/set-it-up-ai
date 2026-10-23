"use client";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface OtpFieldProps {
  value: string;
  onChange: (code: string) => void;
  /** Called once when the 6th digit is entered. */
  onComplete?: (code: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
  label?: string;
}

interface OtpCredential extends Credential {
  code: string;
}

/**
 * One real input (autocomplete="one-time-code") behind 6 presentational boxes,
 * so SMS autofill and paste work (system.md "OtpField"). Uses the Web OTP API where supported.
 */
export const OtpField = forwardRef<HTMLInputElement | null, OtpFieldProps>(function OtpField(
  { value, onChange, onComplete, error, disabled, autoFocus = true, length = 6, label: labelProp },
  ref,
) {
  const { t } = useLocaleOrEnglish();
  const label = labelProp ?? t("auth.otp.label");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const [focused, setFocused] = useState(false);
  const completed = useRef<string | null>(null);

  const set = (raw: string) => {
    const code = raw.replace(/\D/g, "").slice(0, length);
    onChange(code);
    if (code.length === length && completed.current !== code) {
      completed.current = code;
      onComplete?.(code);
    }
    if (code.length < length) completed.current = null;
  };

  // Web OTP API (Android Chrome): fills the code from the SMS automatically.
  useEffect(() => {
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions) as Promise<OtpCredential | null>)
      .then((cred) => cred?.code && set(cred.code))
      .catch(() => undefined);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear + refocus after an error.
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  const active = Math.min(value.length, length - 1);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-meta-strong text-fg">
        {label}
      </label>
      <div dir="ltr" className={cn("relative w-fit", error && "motion-safe:animate-[ll-otp-shake_220ms_ease-in-out]")} onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => set(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d*"
          maxLength={length}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 caret-transparent"
        />
        <div aria-hidden dir="ltr" className="flex gap-2">
          {Array.from({ length }, (_, i) => {
            const ch = value[i] ?? "";
            const isActive = focused && i === active && value.length < length;
            return (
              <div
                key={i}
                className={cn(
                  "flex h-14 w-11 items-center justify-center rounded-input border bg-bg text-keypad tabular-nums text-fg transition-colors sm:w-12",
                  error ? "border-negative ring-1 ring-negative" : isActive ? "border-fg ring-1 ring-fg" : ch ? "border-line-strong/60" : "border-line",
                )}
              >
                {ch || (isActive ? <span className="h-7 w-0.5 bg-fg motion-safe:animate-pulse" /> : null)}
              </div>
            );
          })}
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-meta font-medium text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
});
