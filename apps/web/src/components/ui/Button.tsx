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

/**
 * v2 (foundations.md): primary is black (inverts in dark mode) and there is one per screen.
 * Secondary is a white hairline button, tonal a quiet grey fill, ghost text-only.
 * Accent is reserved for points/rewards and is a soft fill, never a loud orange slab.
 */
const variants: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:bg-brand-hover active:bg-brand-pressed",
  secondary: "bg-bg text-fg border border-line hover:bg-bg-subtle active:bg-bg-muted",
  tonal: "bg-bg-subtle text-fg hover:bg-bg-muted active:bg-bg-muted",
  ghost: "bg-transparent text-fg hover:bg-bg-subtle active:bg-bg-muted",
  danger: "bg-negative text-[#FFFFFF] hover:brightness-95 dark:text-bg",
  accent: "bg-accent-soft text-accent-text hover:brightness-[0.97]",
  /** On a black band (marketing CTA): white fill, black text. */
  inverse: "bg-bg text-fg hover:bg-bg-subtle",
};

/** 10 px radius for small buttons, a capsule for the big one, 16 for the counter key. */
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-meta-strong rounded-input gap-1.5 [--icon:16px]",
  md: "h-11 px-4 text-body-strong rounded-input gap-2 [--icon:18px]",
  lg: "h-[52px] px-6 text-body-strong rounded-full gap-2 [--icon:20px]",
  counter: "min-h-[72px] px-6 text-headline rounded-card gap-2.5 w-full [--icon:24px]",
};

export function buttonClasses({ variant = "primary", size = "md", fullWidth, disabled }: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "disabled"> = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,transform,filter,opacity] duration-150 ease-out",
    "motion-safe:active:scale-[0.98] focus-visible:focus-ring",
    size === "sm" && "relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
    disabled ? "bg-bg-muted text-fg-subtle border-transparent cursor-not-allowed active:scale-100" : variants[variant],
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
      {loading ? <Spinner className={iconCls} /> : IconStart ? <IconStart aria-hidden className={iconCls} strokeWidth={1.75} /> : null}
      <span>{children}</span>
      {IconEnd && !loading ? <IconEnd aria-hidden className={iconCls} strokeWidth={1.75} /> : null}
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
  const v = { ghost: "text-fg hover:bg-bg-subtle", secondary: "bg-bg border border-line text-fg hover:bg-bg-subtle", primary: "bg-fg text-bg hover:bg-brand-hover" }[variant];
  const s = { 40: "size-10", 48: "size-11", 64: "size-16" }[size];
  return (
    <button type={type} aria-label={label} title={label} className={cn("inline-flex items-center justify-center rounded-full transition-colors duration-150 ease-out focus-visible:focus-ring", v, s, className)} {...rest}>
      <Icon aria-hidden className={size === 64 ? "size-7" : "size-5"} strokeWidth={1.75} />
    </button>
  );
}
