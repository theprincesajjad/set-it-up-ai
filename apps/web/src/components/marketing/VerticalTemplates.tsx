"use client";
import { useState } from "react";
import { VERTICAL_TEMPLATES, type Vertical } from "@ll/shared";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StampCard } from "@/components/ui/StampCard";
import { PointsRing } from "@/components/ui/PointsRing";
import { copy } from "@/copy/en-CA";
import { howYouEarn } from "@/lib/program";

const SHOWN: { v: Vertical; label: string }[] = [
  { v: "cafe", label: "cafés" },
  { v: "bakery", label: "bakeries" },
  { v: "pharmacy", label: "pharmacies" },
  { v: "repair_electronics", label: "repair" },
  { v: "repair_auto", label: "auto" },
  { v: "salon", label: "salons" },
];

/** "Built for your kind of shop": the default template per vertical, previewed with the real card. */
export function VerticalTemplates() {
  const [v, setV] = useState<Vertical>("cafe");
  const t = VERTICAL_TEMPLATES[v];
  const reward = t.rewards[0];
  return (
    <div className="flex flex-col gap-6">
      <ChipGroup label="Type of shop" className="-mx-4 px-4">
        {SHOWN.map((s) => (
          <Chip key={s.v} selected={v === s.v} onClick={() => setV(s.v)} icon={<CategoryIcon vertical={s.v} size={18} />}>
            {s.label}
          </Chip>
        ))}
      </ChipGroup>
      <div className="grid items-center gap-10 rounded-sheet border border-line p-6 md:grid-cols-[1.1fr_1fr] md:p-10" aria-live="polite">
        <div>
          <p className="text-meta text-fg-muted">Default program · {t.label}</p>
          <p className="display mt-3 text-mkt-sm md:text-mkt-md">
            {t.earnType === "stamps" ? `${t.stampGoal} stamps = ${reward?.name}` : `${howYouEarn({ ...t, minSpendCents: 0 }).replace(/\.$/, "")}. ${reward?.pointsCost} ${t.terminology} = ${reward?.name}`}
          </p>
          <p className="mt-4 text-body text-fg-muted">
            Welcome bonus: {t.welcomeBonus} {t.terminology}. Change anything in your dashboard.
          </p>
          {v === "pharmacy" ? <p className="mt-4 border-s-2 border-line ps-3 text-meta text-fg-muted">Front-store points only. {copy.misc.pharmacyRule}</p> : null}
          {t.categories.some((c) => !c.earnEligible) && v !== "pharmacy" ? (
            <p className="mt-4 text-meta text-fg-muted">
              Never earns: {t.categories.filter((c) => !c.earnEligible).map((c) => c.name).join(", ")}.
            </p>
          ) : null}
        </div>
        <div aria-hidden className="flex justify-center">
          {t.earnType === "stamps" ? (
            <StampCard stamps={Math.max(1, t.stampGoal - 3)} goal={t.stampGoal} rewardName={reward?.name ?? "reward"} vertical={v} className="w-full max-w-sm" />
          ) : (
            <PointsRing balance={Math.round((reward?.pointsCost ?? 100) * 0.68)} goal={reward?.pointsCost ?? 100} terminology={t.terminology} rewardName={reward?.name} size={200} />
          )}
        </div>
      </div>
    </div>
  );
}
