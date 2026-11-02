"use client";
/**
 * The focused signup shell: no marketing nav or footer. A slim top bar (Back, the mark, "Step 2 of 6", Exit) with segmented progress
 * (StepProgress) in the shop's colour once it is known; one question per screen under a large heading; the primary button sticks to the bottom on
 * phones. At lg and up the screen splits: the question on the start side, a live preview of the card on the end side.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { LogoMark } from "@/components/site/Brand";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
import type { ShopColorProps } from "@/lib/shopColor";

export interface FlowShellProps {
  /** 1-based; null hides the counter (the celebration). */
  step: number | null;
  total: number;
  onBack?: (() => void) | null;
  exitHref?: string | null;
  colors: ShopColorProps;
  /** The end-side panel at lg (the live card). */
  aside?: ReactNode;
  children: ReactNode;
}

export function FlowShell({ step, total, onBack, exitHref = "/", colors, aside, children }: FlowShellProps) {
  const { t } = useLocaleOrEnglish();
  const pct = step === null ? 100 : Math.round(((step - 1) / total) * 100);
  return (
    <div {...colors} className="flex min-h-dvh flex-col bg-bg" data-signup-flow>
      <header className="sticky top-0 z-sticky border-b border-border bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-2 md:px-6">
          <div className="flex w-24 items-center">
            {onBack ? (
              <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1.5 rounded-r2 px-2 text-body font-[550] text-fg hover:bg-bg-subtle focus-visible:focus-ring" data-flow-back>
                <ArrowLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
                <span className="max-sm:sr-only">{t("sf.back")}</span>
              </button>
            ) : (
              <Link href="/" aria-label={t("sf.home")} className="inline-flex h-11 items-center rounded-r2 px-2 focus-visible:focus-ring">
                <LogoMark size={28} />
              </Link>
            )}
          </div>
          <div className="flex min-w-0 flex-1 justify-center">
            {step !== null ? (
              <p className="text-meta font-[550] tabular-nums text-fg-muted" data-flow-progress aria-live="polite">
                {t("sf.progress", { n: step, total })}
              </p>
            ) : null}
          </div>
          <div className="flex w-24 justify-end">
            {exitHref ? (
              <Link href={exitHref} className="inline-flex h-11 items-center rounded-r2 px-2 text-body font-[550] text-fg-muted hover:text-fg focus-visible:focus-ring" data-flow-exit>
                {t("sf.exit")}
              </Link>
            ) : null}
          </div>
        </div>
        {/* Kit (wave Q): one segment per step in the shop's colour (StepProgress on the ReUI Stepper). The "Step 2 of 6" text above is
            what assistive tech reads, so the segments are hidden from it. */}
        <div aria-hidden className="mx-auto max-w-[1200px] px-4 pb-2.5 md:px-6" data-flow-bar data-pct={pct}>
          <StepProgress step={step} total={total} />
        </div>
      </header>
      <main id="main" className={cn("mx-auto grid w-full max-w-[1200px] flex-1", !!aside && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 lg:px-6")}>
        <div className="min-w-0">{children}</div>
        {aside ? (
          <aside className="hidden lg:block" data-flow-aside>
            <div className="sticky top-[88px] my-10 flex min-h-[560px] flex-col items-center justify-center rounded-[28px] bg-trade-soft p-10">{aside}</div>
          </aside>
        ) : null}
      </main>
    </div>
  );
}

export interface StepFrameProps {
  /** Distinct per step so the enter animation runs on every change. */
  id: string;
  title: ReactNode;
  body?: ReactNode;
  onSubmit: () => void;
  primary: ReactNode;
  busy?: boolean;
  /** A text button under the primary one ("Skip", "Try another link"). */
  secondary?: { label: ReactNode; onClick: () => void } | null;
  /** Small print under the buttons (terms). */
  note?: ReactNode;
  children?: ReactNode;
  /** Above the heading (the 3D object or a badge). */
  eyebrow?: ReactNode;
  /** Below the buttons, not sticky (the language switcher on the first step). */
  after?: ReactNode;
}

/**
 * One question: the heading (focus target when the step has no field), a helper line, the fields, then the primary button. Enter in any
 * field continues (it is a form); Enter on a tile picks it and continues. Focus moves to the first field when the step appears.
 */
export function StepFrame({ id, title, body, onSubmit, primary, busy, secondary, note, children, eyebrow, after }: StepFrameProps) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const target =
      root.querySelector<HTMLElement>("[data-autofocus]") ??
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      root.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea, [role=radio][aria-checked="true"]') ??
      root.querySelector<HTMLElement>("h1");
    target?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [id]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const el = e.target as HTMLElement;
    if (e.key === "Enter" && el.getAttribute("role") === "radio") {
      e.preventDefault();
      el.click();
      requestAnimationFrame(() => ref.current?.requestSubmit());
    }
  };
  return (
    <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} noValidate aria-labelledby={`${id}-title`} data-step={id} className="mx-auto flex w-full max-w-[560px] flex-col px-4 pb-36 pt-8 md:px-6 md:pb-16 md:pt-14">
      <div key={id} className="flex flex-col animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none">
        {eyebrow ? <div className="mb-4">{eyebrow}</div> : null}
        <h1 id={`${id}-title`} tabIndex={-1} className="text-balance text-[28px] font-[700] leading-8.5 tracking-[-0.02em] text-fg outline-none md:text-[34px] md:leading-10">
          {title}
        </h1>
        {body ? <p className="mt-3 text-pretty text-[15px] leading-5.5 text-fg-muted">{body}</p> : null}
        {children ? <div className="mt-8 flex flex-col gap-5">{children}</div> : null}
      </div>
      <div className="z-sticky mt-8 flex flex-col gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:mt-0 max-md:border-t max-md:border-border max-md:bg-bg/95 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur-md" data-flow-footer>
        <Button type="submit" size="lg" fullWidth loading={busy}>
          {primary}
        </Button>
        {secondary ? (
          <button type="button" onClick={secondary.onClick} className="inline-flex h-11 items-center justify-center rounded-r2 px-3 text-body font-[550] text-link hover:underline focus-visible:focus-ring" data-flow-secondary>
            {secondary.label}
          </button>
        ) : null}
        {note ? <div className="text-center text-meta text-fg-muted max-md:text-caption">{note}</div> : null}
      </div>
      {after ? <div className="mt-8 flex justify-center">{after}</div> : null}
    </form>
  );
}
