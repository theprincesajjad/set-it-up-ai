import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "accent" | "inverse";
export type ButtonSize = "sm" | "md" | "lg" | "counter";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  iconStart?: LucideIcon;
  iconEnd?: LucideIcon;
  /** Renders a link styled as a button. External links (http…) get rel="noopener". */
  href?: string;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-pressed",
  secondary: "bg-surface text-fg border border-border-strong hover:bg-surface-sunken",
  tonal: "bg-brand-subtle text-on-brand-subtle hover:brightness-[0.96]",
  ghost: "bg-transparent text-fg-brand hover:bg-brand-subtle",
  danger: "bg-danger text-on-danger hover:bg-danger-hover",
  accent: "bg-accent text-on-accent hover:bg-accent-hover",
  /** On pine bands (marketing CTA): surface fill with brand text. */
  inverse: "bg-surface text-fg-brand hover:bg-surface-sunken",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-label rounded-sm gap-1.5 [--icon:16px]",
  md: "min-h-12 px-4 text-body-strong rounded-md gap-2 [--icon:20px]",
  lg: "min-h-14 px-5 text-body-strong text-[17px] rounded-md gap-2 [--icon:20px]",
  counter: "min-h-16 px-6 text-title text-[20px] font-bold rounded-lg gap-2.5 w-full [--icon:24px]",
};

export function buttonClasses({ variant = "primary", size = "md", fullWidth, disabled }: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "disabled"> = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,transform,filter] duration-150 ease-standard",
    "motion-safe:active:scale-[0.98] focus-visible:focus-ring",
    size === "sm" && "relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
    disabled ? "bg-disabled-bg text-on-disabled border-transparent cursor-not-allowed hover:bg-disabled-bg active:scale-100" : variants[variant],
    sizes[size],
    fullWidth && "w-full",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth,
  iconStart: IconStart,
  iconEnd: IconEnd,
  href,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  const iconCls = "size-[var(--icon)] shrink-0";
  const content = (
    <>
      {loading ? <Spinner className={iconCls} /> : IconStart ? <IconStart aria-hidden className={iconCls} strokeWidth={2} /> : null}
      <span>{children}</span>
      {IconEnd && !loading ? <IconEnd aria-hidden className={iconCls} strokeWidth={2} /> : null}
    </>
  );
  const cls = cn(buttonClasses({ variant, size, fullWidth, disabled }), className);

  if (href && !disabled) {
    const external = /^https?:\/\//.test(href);
    return external ? (
      <a href={href} className={cls} rel="noopener noreferrer" target={rest.formTarget ?? undefined}>
        {content}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {content}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** Required: aria-label + tooltip. */
  label: string;
  variant?: "ghost" | "secondary" | "primary";
  size?: 40 | 48 | 64;
}

export function IconButton({ icon: Icon, label, variant = "ghost", size = 48, className, type = "button", ...rest }: IconButtonProps) {
  const v = { ghost: "text-fg hover:bg-surface-sunken", secondary: "bg-surface border border-border-strong text-fg hover:bg-surface-sunken", primary: "bg-brand text-on-brand hover:bg-brand-hover" }[variant];
  const s = { 40: "size-10", 48: "size-12", 64: "size-16" }[size];
  return (
    <button type={type} aria-label={label} title={label} className={cn("inline-flex items-center justify-center rounded-full transition-colors focus-visible:focus-ring", v, s, className)} {...rest}>
      <Icon aria-hidden className={size === 64 ? "size-7" : "size-5"} />
    </button>
  );
}
