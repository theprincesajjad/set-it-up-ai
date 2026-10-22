"use client";
import { forwardRef, useId, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/cn";
import { PHONE_ERRORS, digitsAfterEdit, formatNanp, normalizeDigits, toE164, validateNanp } from "@/lib/phone";
import { FieldShell, describedBy, inputBase } from "./TextField";

export interface PhoneFieldProps {
  label?: string;
  hint?: string;
  /** Controlled digits (0-10). Omit for uncontrolled. */
  value?: string;
  defaultValue?: string;
  /** Raw digits on every change. */
  onChangeDigits?: (digits: string) => void;
  /** E.164 (+14165550123) when the number is valid, else null. */
  onChangeE164?: (e164: string | null) => void;
  /** External error (e.g. from the API). Overrides validation messages. */
  error?: string | null;
  /** Show validation errors now (e.g. after a submit attempt). */
  forceValidate?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  showCountryPrefix?: boolean;
  onEnter?: () => void;
}

/** NANP phone input: displays (416) 555-0123, emits digits and E.164 (system.md "PhoneField"). */
export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(function PhoneField(
  { label = "Mobile number", hint, value, defaultValue = "", onChangeDigits, onChangeE164, error, forceValidate, autoFocus, disabled, name, id: idProp, showCountryPrefix = true, onEnter },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [inner, setInner] = useState(() => normalizeDigits(defaultValue));
  const [blurred, setBlurred] = useState(false);
  const digits = value !== undefined ? normalizeDigits(value) : inner;
  const display = formatNanp(digits);

  const validation = validateNanp(digits);
  const showValidation = ((blurred && digits.length > 0) || !!forceValidate) && validation !== "ok";
  const message = error ?? (showValidation ? PHONE_ERRORS[validation === "invalid" ? "invalid" : "incomplete"] : null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const next = digitsAfterEdit(display, e.target.value, e.target.selectionStart);
    if (value === undefined) setInner(next);
    onChangeDigits?.(next);
    onChangeE164?.(toE164(next));
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={message}>
      <div className="flex items-stretch gap-2">
        {showCountryPrefix ? (
          <span aria-hidden className="inline-flex min-h-12 items-center rounded-input bg-bg-subtle px-3.5 text-body tabular-nums text-fg-muted">
            +1
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          name={name}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(416) 555-0123"
          value={display}
          onChange={onChange}
          onBlur={() => setBlurred(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy(id, message, hint)}
          className={cn(inputBase, "tabular-nums")}
        />
      </div>
    </FieldShell>
  );
});
