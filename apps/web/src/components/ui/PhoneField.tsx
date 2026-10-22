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
  /** "lg": the join page field (canvas Join): 52 px, radius 12, borderless +1 tile, 18 px tabular digits, ink outline. */
  size?: "md" | "lg";
}

/** NANP phone input: displays (416) 555-0123, emits digits and E.164 (system.md "PhoneField"). */
export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(function PhoneField(
  { label = "Mobile number", hint, value, defaultValue = "", onChangeDigits, onChangeE164, error, forceValidate, autoFocus, disabled, name, id: idProp, showCountryPrefix = true, onEnter, size = "md" },
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
    <FieldShell id={id} label={label} hint={hint} error={message} gapClass={size === "lg" ? "gap-2" : undefined}>
      <div className="flex items-stretch gap-2">
        {showCountryPrefix ? (
          <span aria-hidden className={size === "lg" ? "inline-flex h-[52px] items-center rounded-[12px] bg-bg-subtle px-3.5 text-[16px] text-fg-muted" : "inline-flex h-12 items-center rounded-input border border-line bg-bg-subtle px-3.5 text-body text-fg-muted"}>
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
          className={size === "lg" ? cn(inputBase, "h-[52px] min-w-0 flex-1 rounded-[12px] border-[1.5px] border-fg text-[18px] tabular-nums hover:border-fg focus:ring-0") : cn(inputBase, "h-12")}
        />
      </div>
    </FieldShell>
  );
});
