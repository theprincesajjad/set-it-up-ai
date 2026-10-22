"use client";
import { CircleAlert } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

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
  return (
    <div className={cn("flex flex-col", gapClass ?? "gap-1.5")}>
      <label htmlFor={id} className={cn("text-meta-strong text-fg", hideLabel && "sr-only")}>
        {label}
        {optionalLabel && !required ? <span className="font-normal text-fg-muted"> (optional)</span> : null}
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
  "w-full min-h-12 rounded-input border bg-bg px-3.5 text-body text-fg placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow] duration-150 ease-out " +
  "border-line hover:border-line-strong/50 focus:border-fg focus:ring-1 focus:ring-fg disabled:bg-bg-subtle disabled:text-fg-subtle " +
  "aria-[invalid=true]:border-negative aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-negative";

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
  const len = typeof rest.value === "string" ? rest.value.length : 0;
  const count = showCount && rest.maxLength ? `${len}/${rest.maxLength}` : undefined;
  const aria = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy(id, error, hint) };

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optionalLabel={optionalLabel} required={rest.required} count={count} hideLabel={hideLabel}>
      {rest.type === "textarea" ? (
        <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} id={id} {...aria} className={cn(inputBase, "min-h-28 py-3", rest.className)} />
      ) : (
        <div className="relative flex items-center">
          {prefix ? <span className="pointer-events-none absolute start-3 text-body text-fg-muted">{prefix}</span> : null}
          <input
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
            id={id}
            {...aria}
            className={cn(inputBase, prefix && "ps-8", suffix && "pe-12", rest.className)}
          />
          {suffix ? <span className="pointer-events-none absolute end-3 text-body text-fg-muted">{suffix}</span> : null}
        </div>
      )}
    </FieldShell>
  );
}
