"use client";
/**
 * Kit (wave Q): a number with minus and plus buttons (points to a reward, stamps on a card, party size, quantity). The ReUI NumberField
 * (Base UI NumberField underneath: arrow keys, Page Up/Down, Home/End, press-and-hold to repeat, scrub, min/max clamping, the
 * spinbutton role) themed to Clear: 48px round buttons on a hairline card, a big tabular number, 56px on `size="lg"`.
 *
 *   <NumberStepper label="How many points?" value={goal} onChange={setGoal} min={10} max={500} step={10} hint="10 points each visit." />
 *   <NumberStepper label="Guests" value={n} onChange={setN} min={1} max={12} size="md" />
 *
 * Errors: pass `error` (shown under, aria-invalid). RTL: minus stays on the inline start and the digits stay LTR. 44px+ targets.
 */
import { Minus, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from "@/components/primitives/number-field";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface NumberStepperProps {
  label: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  error?: ReactNode;
  /** md 48 (default), lg 56. */
  size?: "md" | "lg";
  name?: string;
  id?: string;
  disabled?: boolean;
  /** Intl options for the number (currency, percent). */
  format?: Intl.NumberFormatOptions;
  className?: string;
}

export function NumberStepper({ label, value, onChange, min, max, step = 1, hint, error, size = "md", name, id, disabled, format, className }: NumberStepperProps) {
  const { t, info } = useLocaleOrEnglish();
  const auto = useId();
  const fieldId = id ?? `ns-${auto}`;
  const big = size === "lg";
  const btn = cn(
    "rounded-full border border-border bg-card text-foreground shadow-xs transition-[background-color,transform] hover:bg-hover active:scale-95 motion-reduce:active:scale-100 focus-visible:focus-ring data-disabled:opacity-40 [&_svg]:size-5",
    big ? "size-14" : "size-12",
  );
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-body font-[550] text-foreground">
        {label}
      </label>
      <NumberField
        id={fieldId}
        name={name}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        locale={info.bcp47}
        format={format}
        onValueChange={(v) => {
          if (v != null && Number.isFinite(v)) onChange(v);
        }}
        className="w-auto"
      >
        <NumberFieldGroup className={cn("h-auto w-auto items-center gap-3 rounded-none border-0 bg-transparent focus-within:ring-0 dark:bg-transparent")}>
          <NumberFieldDecrement aria-label={t("kit.decrease")} className={cn(btn, "rounded-full border-e")}>
            <Minus aria-hidden strokeWidth={2} />
          </NumberFieldDecrement>
          <NumberFieldInput
            dir="ltr"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
            className={cn(
              "rounded-r3 border border-border bg-card px-2 text-center font-[650] tabular-nums text-foreground transition-colors focus:border-foreground focus:ring-1 focus:ring-foreground aria-[invalid=true]:border-destructive",
              big ? "h-14 w-28 text-large-title" : "h-12 w-24 text-title",
            )}
          />
          <NumberFieldIncrement aria-label={t("kit.increase")} className={cn(btn, "rounded-full border-s")}>
            <Plus aria-hidden strokeWidth={2} />
          </NumberFieldIncrement>
        </NumberFieldGroup>
      </NumberField>
      {error ? (
        <p id={`${fieldId}-error`} className="text-meta font-medium text-destructive-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-meta text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
