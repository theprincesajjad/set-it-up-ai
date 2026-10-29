"use client";
import type { FormEventHandler, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon3d, type Icon3dProps } from "@/components/ui/Icon3d";
import { cn } from "@/lib/cn";

export interface StepAction {
  label: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  /** "submit" submits the card's form when `onSubmit` is set. */
  type?: "button" | "submit";
}

export interface StepCardProps {
  /** The 3D object (64 px). */
  icon: Icon3dProps["name"];
  trade?: Icon3dProps["trade"];
  title: ReactNode;
  /** 13/20 muted, at most 60 words. */
  body?: ReactNode;
  /** The form region. */
  children?: ReactNode;
  /** The black button on the end edge. */
  primary?: StepAction;
  /** The text link on the start edge ("Skip", "I'll do this later"). */
  secondary?: StepAction;
  /** Renders the card as a form. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  headingId?: string;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

export const STEP_BODY_MAX_WORDS = 60;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Onboarding step card (docs/design/onboarding-v1.md section 5): white, radius 12, 1 px hairline, the card shadow. Header: a 64 px 3D object,
 * the title 20/26 at 650 and the body 13/20 muted. Footer: black primary 40 px (44 on phones) on the end edge, a 40 px text link on the start edge.
 * Enters with a 120 ms fade and an 8 px rise; reduced motion: instant.
 */
export function StepCard({ icon, trade, title, body, children, primary, secondary, onSubmit, headingId, headingLevel = 2, className }: StepCardProps) {
  if (process.env.NODE_ENV !== "production" && typeof body === "string" && wordCount(body) > STEP_BODY_MAX_WORDS) console.warn(`StepCard body is ${wordCount(body)} words; the limit is ${STEP_BODY_MAX_WORDS}.`);
  const H = `h${headingLevel}` as "h1" | "h2" | "h3";
  const Root = onSubmit ? "form" : "section";
  const hid = headingId ?? undefined;
  const hasFooter = primary || secondary;
  return (
    <Root
      aria-labelledby={hid}
      onSubmit={onSubmit}
      data-step-card
      className={cn("animate-in fade-in-0 slide-in-from-bottom-2 rounded-r4 border border-border bg-card text-card-foreground shadow-card duration-[120ms] motion-reduce:animate-none", className)}
    >
      <header className="flex items-start gap-4 p-4">
        <Icon3d name={icon} size={64} trade={trade} />
        <div className="min-w-0 flex-1 pt-1">
          <H id={hid} className="text-[20px] font-[650] leading-[26px] tracking-[-0.01em] text-foreground">{title}</H>
          {body ? <p className="mt-1 text-body text-muted-foreground">{body}</p> : null}
        </div>
      </header>
      {children ? <div className="px-4 pb-4">{children}</div> : null}
      {hasFooter ? (
        <footer className="flex items-center justify-between gap-3 border-t border-border p-4">
          {secondary ? (
            <ActionLink action={secondary} />
          ) : (
            <span />
          )}
          {primary ? (
            <Button
              size="quick"
              type={primary.type ?? (onSubmit ? "submit" : "button")}
              onClick={primary.onClick}
              href={primary.href}
              disabled={primary.disabled}
              loading={primary.loading}
              className="relative clear:max-md:h-11 after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']"
            >
              {primary.label}
            </Button>
          ) : null}
        </footer>
      ) : null}
    </Root>
  );
}

function ActionLink({ action }: { action: StepAction }) {
  const cls = "relative inline-flex h-10 items-center rounded-r2 px-1 text-body-strong font-[550] text-link hover:underline focus-visible:focus-ring after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] disabled:text-subtle-foreground";
  if (action.href && !action.disabled) {
    return (
      <a href={action.href} className={cls}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} disabled={action.disabled} className={cls}>
      {action.label}
    </button>
  );
}
