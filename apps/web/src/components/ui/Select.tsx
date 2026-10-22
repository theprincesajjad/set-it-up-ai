"use client";
import { ChevronDown } from "lucide-react";
import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { FieldShell, describedBy, inputBase } from "./TextField";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string | null;
  options: { value: string; label: string }[];
  placeholder?: string;
  hideLabel?: boolean;
}

/** Native <select> styled like TextField (system.md "Select"). */
export function Select({ label, hint, error, options, placeholder, className, hideLabel, ...rest }: SelectProps) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required} hideLabel={hideLabel}>
      <div className="relative">
        <select {...rest} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} className={cn(inputBase, "appearance-none pe-10", className)}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-fg-muted" />
      </div>
    </FieldShell>
  );
}
