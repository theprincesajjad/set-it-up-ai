"use client";
import { Check, Minus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export type SetupStepState = "done" | "current" | "todo" | "skipped";
export interface SetupStep {
  id: string;
  title: string;
  /** "20 s" */
  time?: string;
  state: SetupStepState;
  /** Makes the row a link (done steps, so people can go back). */
  href?: string;
  onSelect?: () => void;
}

export interface SetupProgressProps {
  /** The group title above the track ("Set up your shop"). */
  title: ReactNode;
  steps: SetupStep[];
  className?: string;
}

/** 20 px circle: hairline ring (todo), black fill with a white check (done), black ring with the number (current). */
function Mark({ step, n }: { step: SetupStep; n: number }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-[650] leading-none tabular-nums";
  if (step.state === "done") return <span className={cn(base, "bg-primary text-primary-foreground")}><Check aria-hidden className="size-3" strokeWidth={3} /></span>;
  if (step.state === "current") return <span className={cn(base, "border-2 border-primary text-foreground")}>{n}</span>;
  if (step.state === "skipped") return <span className={cn(base, "border border-border-strong text-muted-foreground")}><Minus aria-hidden className="size-3" strokeWidth={2.5} /></span>;
  return <span className={cn(base, "border border-border-strong")} />;
}

function Track({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-0.5 w-full overflow-hidden rounded-full bg-lg-seg-track" aria-hidden>
      <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}

function Rows({ steps }: { steps: SetupStep[] }) {
  const { t } = useLocaleOrEnglish();
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const inner = (
          <>
            <Mark step={s} n={i + 1} />
            <span className={cn("min-w-0 flex-1 truncate text-body font-[550]", s.state === "todo" || s.state === "skipped" ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
            {s.time ? <bdi dir="ltr" className="shrink-0 text-meta text-muted-foreground tabular-nums">{s.time}</bdi> : null}
            <span className="sr-only">{s.state === "done" ? t("onboarding.kit.done") : s.state === "current" ? t("onboarding.kit.current") : s.state === "skipped" ? t("onboarding.kit.skipped") : ""}</span>
          </>
        );
        const cls = "relative flex h-7 w-full items-center gap-3 text-start";
        const hit = "after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:focus-ring rounded-r2";
        return (
          <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} className="py-px">
            {s.href ? (
              <a href={s.href} className={cn(cls, hit)}>{inner}</a>
            ) : s.onSelect ? (
              <button type="button" onClick={s.onSelect} className={cn(cls, hit)}>{inner}</button>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The setup rail (docs/design/onboarding-v1.md section 5): on desktop a 240 px column of 28 px step rows under a 2 px progress track; on phones a
 * top strip "2 of 6 · Services" with the track, and the rows in a panel on tap. Both are rendered; CSS shows one (md breakpoint).
 */
export function SetupProgress({ title, steps, className }: SetupProgressProps) {
  const { t } = useLocaleOrEnglish();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const done = steps.filter((s) => s.state === "done").length;
  const idx = Math.max(0, steps.findIndex((s) => s.state === "current"));
  const current = steps[idx];
  return (
    <nav aria-label={t("onboarding.kit.steps")} className={className}>
      {/* desktop rail */}
      <div className="hidden w-60 md:block" data-setup-rail>
        <h2 className="text-headline text-foreground">{title}</h2>
        <p className="sr-only">{t("onboarding.kit.progress", { done, total: steps.length })}</p>
        <div className="mb-3 mt-3"><Track done={done} total={steps.length} /></div>
        <Rows steps={steps} />
      </div>
      {/* phone strip */}
      <div className="md:hidden" data-setup-strip>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} className="relative flex min-h-11 w-full items-center justify-between gap-3 rounded-r2 text-start focus-visible:focus-ring" aria-label={`${t("onboarding.kit.stepOf", { n: idx + 1, total: steps.length })} · ${current?.title ?? ""}. ${t("onboarding.kit.showSteps")}`}>
          <span className="text-body font-[550] text-foreground tabular-nums">{t("onboarding.kit.stepOf", { n: idx + 1, total: steps.length })}<span className="text-muted-foreground"> · {current?.title}</span></span>
        </button>
        <Track done={done} total={steps.length} />
        {open ? (
          <div id={panel} className="mt-3 rounded-r4 border border-border bg-card p-4 shadow-card">
            <Rows steps={steps} />
          </div>
        ) : null}
      </div>
    </nav>
  );
}
