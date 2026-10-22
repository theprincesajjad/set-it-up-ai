"use client";
import { useState } from "react";
import { VERTICAL_TEMPLATES, type Vertical } from "@ll/shared";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { StampCard } from "@/components/ui/StampCard";
import { PointsRing } from "@/components/ui/PointsRing";
import { verticalIcon } from "@/components/ui/VerticalIcon";
import { copy } from "@/copy/en-CA";
import { howYouEarn } from "@/lib/program";

const SHOWN: { v: Vertical; label: string }[] = [
  { v: "cafe", label: "Cafés" },
  { v: "bakery", label: "Bakeries" },
  { v: "pharmacy", label: "Pharmacies" },
  { v: "repair_electronics", label: "Repair" },
  { v: "repair_auto", label: "Auto" },
  { v: "salon", label: "Salons" },
];

/** "Built for your kind of shop": default template per vertical. */
export function VerticalTemplates() {
  const [v, setV] = useState<Vertical>("cafe");
  const t = VERTICAL_TEMPLATES[v];
  const reward = t.rewards[0];
  return (
    <div className="flex flex-col gap-6">
      <ChipGroup label="Type of shop">
        {SHOWN.map((s) => {
          const Icon = verticalIcon(s.v);
          return (
            <Chip key={s.v} selected={v === s.v} onClick={() => setV(s.v)} icon={<Icon aria-hidden className="size-4" />}>
              {s.label}
            </Chip>
          );
        })}
      </ChipGroup>
      <div className="grid items-center gap-6 rounded-xl bg-surface p-6 shadow-sm md:grid-cols-2 md:p-8" aria-live="polite">
        <div>
          <p className="text-overline uppercase text-fg-muted">Default program · {t.label}</p>
          <p className="mt-2 text-h2 text-fg">
            {t.earnType === "stamps" ? `${t.stampGoal} stamps = ${reward?.name}` : `${howYouEarn({ ...t, minSpendCents: 0 }).replace(/\.$/, "")}. ${reward?.pointsCost} ${t.terminology} = ${reward?.name}`}
          </p>
          <p className="mt-2 text-body text-fg-muted">
            Welcome bonus: {t.welcomeBonus} {t.terminology}. Change anything in your dashboard.
          </p>
          {v === "pharmacy" ? <p className="mt-3 rounded-md bg-info-subtle px-3 py-2 text-body-sm text-on-info-subtle">Front-store points only. {copy.misc.pharmacyRule}</p> : null}
          {t.categories.some((c) => !c.earnEligible) && v !== "pharmacy" ? (
            <p className="mt-3 text-body-sm text-fg-muted">
              Never earns: {t.categories.filter((c) => !c.earnEligible).map((c) => c.name).join(", ")}.
            </p>
          ) : null}
        </div>
        <div className="flex justify-center">
          {t.earnType === "stamps" ? (
            <StampCard stamps={Math.max(1, t.stampGoal - 2)} goal={t.stampGoal} rewardName={reward?.name ?? "reward"} vertical={v} className="w-full max-w-xs" />
          ) : (
            <PointsRing balance={Math.round((reward?.pointsCost ?? 100) * 0.68)} goal={reward?.pointsCost ?? 100} terminology={t.terminology} rewardName={reward?.name} size={200} />
          )}
        </div>
      </div>
    </div>
  );
}
