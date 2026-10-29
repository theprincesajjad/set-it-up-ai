"use client";
import { PLANS, serviceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { cn } from "@/lib/cn";
import { REMIND_BEFORE_DAYS, resultsMoney } from "@/lib/dashboard/rebooking";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

const MODES = serviceApi.REBOOKING_MODES;
const LABEL = { auto: "rb.mode.auto", review: "rb.mode.review", off: "rb.mode.off" } as const;
const HINT = { auto: "rb.mode.autoHint", review: "rb.mode.reviewHint", off: "rb.mode.offHint" } as const;

/**
 * How reminders go: "Remind them for me" (automatic, on Pro), "I'll send them myself" (the due list) or off. On Free the first one is locked and
 * a quiet plan line says what it costs. Hit areas are 44px; the group reads as radios.
 */
export function RebookMode({ settings, onChange, canEdit, billingHref }: { settings: serviceApi.RebookingSettings; onChange: (m: serviceApi.RebookingMode) => void; canEdit: boolean; billingHref: string }) {
  const { t } = useLocaleOrEnglish();
  const plan = PLANS.plus;
  return (
    <Panel title={t("rb.mode.title")}>
      <div role="radiogroup" aria-label={t("rb.mode.title")} className="flex flex-wrap gap-2">
        {MODES.map((m) => {
          const locked = m === "auto" && !settings.canAuto;
          const on = settings.mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={locked || !canEdit}
              data-testid={`rebook-mode-${m}`}
              onClick={() => {
                if (locked || !canEdit || on) return;
                onChange(m);
              }}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 text-meta focus-visible:focus-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "border-line text-fg hover:bg-bg-subtle",
                (locked || !canEdit) && !on && "text-fg-muted hover:bg-transparent",
              )}
            >
              {t(LABEL[m])}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-meta text-fg-muted">{t(HINT[settings.mode], { days: REMIND_BEFORE_DAYS })}</p>
      {settings.canAuto ? null : (
        <PlanLine className="mt-3" href={billingHref} linkLabel={t("rb.planCta", { plan: plan.name })}>
          {t("rb.mode.planLine", { plan: plan.name, price: resultsMoney(plan.priceCents) })}
        </PlanLine>
      )}
    </Panel>
  );
}
