"use client";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useHydratedValue } from "@/lib/useHydratedValue";

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
  /** wave-q: "trade" rings the active box and the filled ones in the shop's colour (under shopColorProps); "ink" (default) is black. */
  tone?: "ink" | "trade";
}

interface OtpCredential extends Credential {
  code: string;
}

/**
 * One real input (autocomplete="one-time-code") behind 6 presentational boxes,
 * so SMS autofill and paste work (system.md "OtpField"). Uses the Web OTP API where supported.
 */
export const OtpField = forwardRef<HTMLInputElement | null, OtpFieldProps>(function OtpField(
  { value, onChange, onComplete, error, disabled, autoFocus = true, length = 6, label: labelProp, tone = "ink" },
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

  // A code typed (or autofilled) before hydration: adopt it, which also fires onComplete for a full code.
  const hydratedRef = useHydratedValue<HTMLInputElement>(value, (dom) => set(dom), inputRef);

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
          ref={hydratedRef}
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
        {/* wave-q: two groups of three (how a code is read out), the newest digit pops in, the shop's colour on the active box. */}
        <div aria-hidden dir="ltr" className="flex gap-2">
          {Array.from({ length }, (_, i) => {
            const ch = value[i] ?? "";
            const isActive = focused && i === active && value.length < length;
            const trade = tone === "trade";
            return (
              <div
                key={i}
                className={cn(
                  "flex h-14 w-11 items-center justify-center rounded-r3 border bg-card text-keypad tabular-nums text-fg shadow-[0_1px_0_0_var(--color-line)] transition-[border-color,box-shadow,background-color] duration-150 sm:w-12",
                  length === 6 && i === 3 && "ms-2.5",
                  error
                    ? "border-negative ring-1 ring-negative"
                    : isActive
                      ? trade
                        ? "border-trade ring-[3px] ring-trade/25"
                        : "border-fg ring-1 ring-fg"
                      : ch
                        ? trade
                          ? "border-trade/60 bg-trade-soft"
                          : "border-line-strong/60"
                        : "border-line",
                )}
              >
                {ch ? <span key={ch + i} className={cn(i === value.length - 1 && "motion-safe:animate-stamp-pop")}>{ch}</span> : isActive ? <span className={cn("h-7 w-0.5 motion-safe:animate-pulse", trade ? "bg-trade" : "bg-fg")} /> : null}
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
