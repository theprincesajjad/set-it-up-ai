"use client";
import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useHydratedChecked } from "@/lib/useHydratedValue";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  caption?: ReactNode;
  disabled?: boolean;
  name?: string;
  id?: string;
  /** "sm": 20 px box and a 13 px muted label (canvas Join consent). */
  size?: "md" | "sm";
}

/** 22px box, 48px hit area, black fill when checked (v2). */
export function Checkbox({ checked, onChange, label, caption, disabled, name, id: idProp, size = "md" }: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const boxRef = useHydratedChecked(checked, onChange);
  return (
    <div className="flex items-start gap-3">
      <span className={cn("relative mt-0 inline-flex size-12 shrink-0 items-center justify-center", size === "sm" ? "-m-[14px]" : "-m-3")}>
        <input
          ref={boxRef}
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
            "flex items-center justify-center rounded-[6px] border-[1.5px] transition-colors duration-150 ease-out peer-focus-visible:focus-ring",
            size === "sm" ? "size-5 rounded-[5px]" : "size-[22px]",
            checked ? "border-fg bg-fg text-bg" : "border-line-strong/70 bg-bg",
            disabled && "opacity-60",
          )}
        >
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </span>
      <div className={cn("flex flex-col gap-1", size === "sm" ? "pt-0" : "pt-px")}>
        <label htmlFor={id} className={cn("cursor-pointer", size === "sm" ? "text-[13px] leading-[18px] text-fg-muted" : "text-body text-fg")}>
          {label}
        </label>
        {caption ? (
          <p id={`${id}-caption`} className={size === "sm" ? "text-[12px] leading-[16px] text-fg-subtle" : "text-meta text-fg-muted"}>
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
