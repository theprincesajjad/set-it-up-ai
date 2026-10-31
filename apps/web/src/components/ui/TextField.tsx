"use client";
import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { adoptedChangeEvent, useHydratedValue } from "@/lib/useHydratedValue";

export interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optionalLabel?: boolean;
  required?: boolean;
  count?: string;
  children: ReactNode;
  hideLabel?: boolean;
  /** Label → input spacing (default gap-1.5). */
  gapClass?: string;
}

/** Label above, hint/error below, wired with aria-describedby. Shared by every input. */
export function FieldShell({ id, label, hint, error, optionalLabel, required, count, children, hideLabel, gapClass }: FieldShellProps) {
  const { t } = useLocaleOrEnglish();
  return (
    <div className={cn("flex flex-col", gapClass ?? "gap-1.5")}>
      <label htmlFor={id} className={cn("text-meta-strong text-fg clear:text-body clear:font-[550]", hideLabel && "sr-only")}>
        {label}
        {optionalLabel && !required ? <span className="font-normal text-fg-muted"> {t("auth.m.name.optional")}</span> : null}
      </label>
      {children}
      <div className="flex items-start justify-between gap-3">
        {error ? (
          <p id={`${id}-error`} className="flex items-start gap-1.5 text-meta font-medium text-negative">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={1.75} />
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-meta text-fg-muted">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {count ? <span className="text-caption tabular-nums text-fg-muted">{count}</span> : null}
      </div>
    </div>
  );
}

export function describedBy(id: string, error?: string | null, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export const inputBase =
  "w-full min-h-11 rounded-md border bg-bg px-3.5 text-body text-fg placeholder:text-fg-muted outline-none transition-[border-color,box-shadow] duration-150 ease-out " +
  "border-line hover:border-line-strong/50 focus:border-fg focus:ring-1 focus:ring-fg disabled:bg-bg-subtle disabled:text-fg-muted " +
  "aria-[invalid=true]:border-negative aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-negative " +
  // Clear (Polaris field, audit 2.4 control scale): 32 on desktop, 44 under a finger, r8, a 3:1 outline, white fill, the 2px blue focus ring.
  "clear:min-h-11 clear:md:min-h-8 clear:rounded-r2 clear:border-input clear:bg-card clear:px-3 clear:hover:border-input clear:focus:border-input clear:focus:ring-0 clear:focus:outline-2 clear:focus:outline-offset-1 clear:focus:outline-ring clear:aria-[invalid=true]:bg-destructive-soft";

type BaseProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optionalLabel?: boolean;
  prefix?: string;
  suffix?: string;
  showCount?: boolean;
  hideLabel?: boolean;
};

export type TextFieldProps = BaseProps &
  (
    | ({ type?: "text" | "email" | "number" | "search" | "password" | "tel" | "url" | "date" | "datetime-local" | "time" | "color" } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "prefix">)
    | ({ type: "textarea" } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  );

export function TextField(props: TextFieldProps) {
  const autoId = useId();
  const { label, hint, error, optionalLabel, prefix, suffix, showCount, hideLabel, ...rest } = props;
  const id = rest.id ?? autoId;
  // The input is padded past its prefix ("$", "@", "localloyalty.ca/") by the prefix's measured width (an estimate in ch until then),
  // at least the old 2rem. Inline, so the theme's own padding classes (clear:px-3) cannot win over it.
  const hasPrefix = !!prefix;
  const prefixRef = useRef<HTMLSpanElement>(null);
  const [prefixWidth, setPrefixWidth] = useState<number | null>(null);
  useEffect(() => {
    if (hasPrefix && prefixRef.current) setPrefixWidth(prefixRef.current.offsetWidth);
  }, [hasPrefix, prefix]);
  const len = typeof rest.value === "string" ? rest.value.length : 0;
  const count = showCount && rest.maxLength ? `${len}/${rest.maxLength}` : undefined;
  const aria = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy(id, error, hint) };
  // Text typed before hydration is adopted into the parent's state (see useHydratedValue). Uncontrolled fields keep their DOM value anyway.
  const { ref: forwardedRef, ...fieldProps } = rest as typeof rest & { ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement> };
  const fieldRef = useHydratedValue<HTMLInputElement | HTMLTextAreaElement>(
    typeof rest.value === "string" ? rest.value : "",
    (_dom, el) => {
      if (typeof rest.value === "string") (rest.onChange as ((e: unknown) => void) | undefined)?.(adoptedChangeEvent(el));
    },
    forwardedRef,
  );

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optionalLabel={optionalLabel} required={rest.required} count={count} hideLabel={hideLabel}>
      {rest.type === "textarea" ? (
        <textarea {...(fieldProps as TextareaHTMLAttributes<HTMLTextAreaElement>)} ref={fieldRef as React.Ref<HTMLTextAreaElement>} id={id} {...aria} className={cn(inputBase, "min-h-28 py-3 clear:md:min-h-28 clear:py-1.5", rest.className)} />
      ) : (
        // A field forced to dir="ltr" (a link, a phone) keeps its prefix on the same side as its text in a right-to-left page.
        <div className="relative flex items-center" dir={(fieldProps as InputHTMLAttributes<HTMLInputElement>).dir}>
          {prefix ? <span ref={prefixRef} className="pointer-events-none absolute start-3 text-body text-fg-muted">{prefix}</span> : null}
          <input
            {...(fieldProps as InputHTMLAttributes<HTMLInputElement>)}
            ref={fieldRef as React.Ref<HTMLInputElement>}
            id={id}
            {...aria}
            className={cn(inputBase, suffix && (suffix.length > 4 ? "pe-[4.5rem]" : "pe-12"), rest.className)}
            style={hasPrefix ? { ...(fieldProps as InputHTMLAttributes<HTMLInputElement>).style, paddingInlineStart: prefixWidth != null ? `${Math.max(32, prefixWidth + 14)}px` : `max(2rem, calc(${prefix!.length}ch + 0.875rem))` } : (fieldProps as InputHTMLAttributes<HTMLInputElement>).style}
          />
          {suffix ? <span className="pointer-events-none absolute end-3 text-body text-fg-muted">{suffix}</span> : null}
        </div>
      )}
    </FieldShell>
  );
}
