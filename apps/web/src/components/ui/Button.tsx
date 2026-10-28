import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button as ButtonPrimitive } from "@/components/primitives/button";
import { cn } from "@/lib/cn";
import { cn as merge } from "@/lib/utils";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "accent" | "inverse";
/** `counter` is the 72 px sale button on the counter tablet, `kiosk` the 88 px button on the customer-facing door tablet (strategy 8.2 E). */
export type ButtonSize = "sm" | "md" | "lg" | "counter" | "kiosk" | "quick";

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
 * v3 (docs/design/v3-strategy.md section 6, row 5): a thin wrapper over the shadcn `Button` (Base UI) in components/primitives.
 * Props and rendered output are unchanged from v2. The primitive supplies the element, focus and disabled handling; the classes
 * below (v2 variants and sizes, now on the v3 tokens) win over the primitive's own look through `merge`, and `PRIMITIVE_RESET`
 * cancels the primitive defaults that have no v2 equivalent. The link branch (`href`) still renders a real <a> / next Link, not a
 * button with role="button", so link semantics are unchanged.
 * Later: map variants onto shadcn's (default, outline, ghost, destructive), drop `accent`.
 *
 * Main Street Warm: primary is terracotta with white text and a soft glow (one per screen); secondary is a white button with a hairline;
 * tonal a quiet sand fill, ghost text-only. Buttons are pills (counter and kiosk keep their card radius).
 * Accent is reserved for points/rewards and is a soft fill, never a loud orange slab.
 */
const variants: Record<ButtonVariant, string> = {
  // Clear (audit #13, v3.2-clear.md 1): solid black primary (white in dark) with a 1px lift; secondary is the glass tint (track fill, luminous edge).
  primary: "bg-primary text-primary-foreground shadow-glow hover:bg-brand-hover active:bg-brand-pressed clear:shadow-primary clear:hover:bg-primary-hover clear:active:bg-primary-hover",
  secondary: "bg-card text-foreground border border-border hover:bg-muted active:bg-hover clear:border-0 clear:glass-tint clear:hover:bg-lg-seg-track clear:active:bg-lg-seg-track",
  tonal: "bg-hover text-foreground hover:bg-sidebar active:bg-sidebar clear:bg-lg-seg-track clear:hover:bg-lg-seg-track clear:active:bg-lg-seg-track",
  ghost: "bg-transparent text-fg hover:bg-bg-subtle active:bg-bg-muted",
  danger: "bg-negative text-[#FFFFFF] hover:bg-negative hover:brightness-95 dark:text-bg",
  accent: "bg-points-soft text-points-text hover:bg-points-soft hover:brightness-[0.97]",
  /** On a black band (marketing CTA): white fill, black text. */
  inverse: "bg-card text-foreground hover:bg-muted",
};

/** 10 px radius for small buttons, a capsule for the big one, 16 for the counter key. */
// Clear scale (audit #13): sm = slim 28 / 12, md = default 32 / 16 (44 on a phone), lg = large 48 / 20, counter = 56 / 24 r16. Labels 13 at 550.
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-meta-strong rounded-full gap-1.5 [--icon:16px] clear:h-7 clear:px-3 clear:text-body clear:font-[550] clear:after:-inset-y-2 clear:[--icon:14px]",
  md: "h-11 px-5 text-body-strong rounded-full gap-2 [--icon:18px] clear:px-4 clear:text-body clear:font-[550] clear:gap-1.5 clear:md:h-8 clear:[--icon:16px]",
  lg: "h-[52px] px-6 text-body-strong rounded-full gap-2 [--icon:20px] clear:h-12 clear:px-5 clear:text-[15px] clear:font-[550]",
  counter: "min-h-18 px-6 text-headline rounded-card gap-2.5 w-full [--icon:24px] clear:min-h-14 clear:rounded-r5 clear:text-[17px] clear:font-[650] clear:tracking-[-0.014em]",
  kiosk: "min-h-22 px-8 text-title rounded-xl gap-3 w-full [--icon:28px]",
  /** Clear quick action (audit #32): 40 / 16, r12, icon 12 from the label. Under Warm it is the md button. */
  quick: "h-11 px-5 text-body-strong rounded-full gap-2 [--icon:18px] clear:h-10 clear:px-4 clear:rounded-r4 clear:gap-3 clear:text-body clear:font-[550] clear:[--icon:16px]",
};

/** Primitive defaults with no v2 equivalent: a 1px transparent border, the 3px focus ring, the 1px press nudge, 50% disabled opacity. */
const PRIMITIVE_RESET = "border-0 bg-clip-border focus-visible:ring-0 active:not-aria-[haspopup]:translate-y-0 disabled:pointer-events-auto disabled:opacity-100";

export function buttonClasses({ variant = "primary", size = "md", fullWidth, disabled }: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "disabled"> = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,transform,filter,opacity] duration-150 ease-out",
    "motion-safe:active:scale-[0.98] focus-visible:focus-ring",
    size === "sm" && "relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
    disabled ? "bg-bg-muted text-fg-subtle border-transparent shadow-none cursor-not-allowed active:scale-100" : variants[variant],
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
    <ButtonPrimitive
      type={type}
      className={merge(PRIMITIVE_RESET, disabled && "hover:bg-bg-muted", cls)}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {content}
    </ButtonPrimitive>
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
  const v = { ghost: "text-fg hover:bg-bg-subtle", secondary: "bg-card border border-border text-foreground hover:bg-muted clear:border-0 clear:glass-tint", primary: "bg-primary text-primary-foreground shadow-glow hover:bg-brand-hover clear:shadow-primary clear:hover:bg-primary-hover" }[variant];
  const s = { 40: "size-10", 48: "size-11", 64: "size-16" }[size];
  return (
    <button type={type} aria-label={label} title={label} className={cn("inline-flex items-center justify-center rounded-full transition-colors duration-150 ease-out focus-visible:focus-ring", v, s, className)} {...rest}>
      <Icon aria-hidden className={size === 64 ? "size-7" : "size-5"} strokeWidth={1.75} />
    </button>
  );
}
