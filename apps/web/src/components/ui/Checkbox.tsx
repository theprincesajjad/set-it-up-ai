"use client";
import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  caption?: ReactNode;
  disabled?: boolean;
  name?: string;
  id?: string;
}

/** 22px box, 48px hit area, black fill when checked (v2). */
export function Checkbox({ checked, onChange, label, caption, disabled, name, id: idProp }: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className="flex items-start gap-3">
      <span className="relative mt-0 inline-flex size-12 shrink-0 items-center justify-center -m-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={caption ? `${id}-caption` : undefined}
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "flex size-[22px] items-center justify-center rounded-[6px] border-[1.5px] transition-colors duration-150 ease-out peer-focus-visible:focus-ring",
            checked ? "border-fg bg-fg text-bg" : "border-line-strong/70 bg-bg",
            disabled && "opacity-60",
          )}
        >
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </span>
      <div className="flex flex-col gap-1 pt-px">
        <label htmlFor={id} className="cursor-pointer text-body text-fg">
          {label}
        </label>
        {caption ? (
          <p id={`${id}-caption`} className="text-meta text-fg-muted">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * CASL consent: never pre-checked, the full sentence is the label, and the exact
 * text (plus its version key) is what the caller sends to the API.
 */
export function ConsentCheckbox(props: Omit<CheckboxProps, "label"> & { text: string; version: string }) {
  const { text, version, ...rest } = props;
  return (
    <div data-consent-version={version}>
      <Checkbox {...rest} label={text} />
    </div>
  );
}
