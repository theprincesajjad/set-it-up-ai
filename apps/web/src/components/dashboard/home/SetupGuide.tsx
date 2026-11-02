"use client";
/**
 * Wave P · the setup guide on Today for a shop that has only just started (Shopify admin's "Setup guide"): one card at the top with
 * the setup steps as a checklist, the next one open with a sentence and its one button, the rest one tap away. It shows while fewer
 * than half the core steps are done; after that the next step is a single row in Needs you, as before.
 */
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { STEP_COPY } from "@/components/dashboard/Checklist";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion";
import { Meter, MeterIndicator, MeterTrack } from "@/components/primitives/meter";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { setupPath } from "@/lib/dashboard/today";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** The steps the guide lists (the first-members goal is the activation card's job, not a setup step). */
export function guideSteps(c: Pick<merchantApi.OnboardingChecklist, "steps">): merchantApi.OnboardingStep[] {
  return c.steps.filter((s) => s.key !== "first_members");
}

/** Show the guide while fewer than half the steps are done. */
export function showSetupGuide(c: Pick<merchantApi.OnboardingChecklist, "steps"> | null | undefined): boolean {
  if (!c) return false;
  const steps = guideSteps(c);
  const done = steps.filter((s) => s.done).length;
  return steps.length > 0 && done * 2 < steps.length;
}

const HINTS: Partial<Record<merchantApi.OnboardingStepKey, string>> = {
  your_link: "own.setup.hint.your_link",
  services: "own.setup.hint.services",
  hours: "own.setup.hint.hours",
  privacy: "own.setup.hint.privacy",
  share: "own.setup.hint.share",
  invite: "own.setup.hint.invite",
  program: "own.setup.hint.program",
  first_stamp: "own.setup.hint.first_stamp",
  qr_kit: "own.setup.hint.qr_kit",
  staff: "own.setup.hint.staff",
  profile: "own.setup.hint.profile",
  pos: "own.setup.hint.pos",
};

export function SetupGuide({ c, base, booking }: { c: merchantApi.OnboardingChecklist; base: string; booking: boolean }) {
  const { t } = useLocaleOrEnglish();
  const steps = guideSteps(c);
  const next = steps.find((s) => !s.done) ?? null;
  const [open, setOpen] = useState<string | null>(next?.key ?? null);
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="setup-guide-h" data-testid="setup-guide" className="rounded-card bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="setup-guide-h" className="text-headline font-semibold text-fg">
          {booking ? t("own.setup.titleBooking") : t("own.setup.title")}
        </h2>
        <p className="text-meta text-fg-muted">{t("own.setup.sub")}</p>
      </div>
      {/* Wave Q: progress is a Base UI Meter (one segment per step would crowd six steps on a phone); the steps are a Base UI Accordion. */}
      <Meter value={done} max={Math.max(1, steps.length)} aria-label={t("own.setup.progress", { done, total: steps.length })} className="mt-4 flex-row items-center gap-3">
        <span className="shrink-0 text-meta tabular text-fg-muted">{t("own.setup.progress", { done, total: steps.length })}</span>
        <MeterTrack className="h-1.5 flex-1 rounded-full bg-bg-muted">
          <MeterIndicator className="rounded-full bg-trade" />
        </MeterTrack>
      </Meter>
      <Accordion value={open ? [open] : []} onValueChange={(v) => setOpen((v as string[])[0] ?? null)} className="mt-4 gap-1">
        {steps.map((s) => {
          const isOpen = open === s.key && !s.done;
          const hint = HINTS[s.key];
          const copy = STEP_COPY[s.key];
          return (
            <AccordionItem key={s.key} value={s.key} disabled={s.done} className={cn("rounded-input border-0 not-last:border-b-0 transition-colors", isOpen && "bg-bg-subtle")}>
              <AccordionTrigger className="min-h-11 items-center gap-3 rounded-input px-2 py-2 text-body font-normal hover:no-underline disabled:cursor-default aria-disabled:opacity-100 data-disabled:opacity-100">
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                    s.done ? "border-trade bg-trade text-trade-foreground" : "border-dashed border-fg-subtle",
                  )}
                >
                  {s.done ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                </span>
                <span className={cn("min-w-0 flex-1 text-body", s.done ? "text-fg-muted line-through decoration-fg-subtle" : isOpen ? "font-semibold text-fg" : "text-fg")}>
                  {s.label}
                  {s.done ? <span className="sr-only"> · {t("own.setup.done")}</span> : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col items-start gap-3 px-2 pb-3 ps-11">
                {hint ? <p className="text-meta text-fg-muted">{t(hint as "own.setup.sub")}</p> : s.detail ? <p className="text-meta text-fg-muted">{s.detail}</p> : null}
                <Link href={`${base}${setupPath(s.key)}`} className={cn(buttonClasses({ size: "sm" }), "no-underline!")} data-testid="setup-guide-go">
                  {hint ? t(hint.replace(".hint.", ".go.") as "own.setup.sub") : (copy?.action ?? t("own.setup.start"))}
                </Link>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
