"use client";
import { formatPoints, rewardInSentence } from "@/lib/format";
import { useState } from "react";
import { VERTICAL_TEMPLATES, type Vertical } from "@ll/shared";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StampCard } from "@/components/ui/StampCard";
import { PointsRing } from "@/components/ui/PointsRing";
import { copy } from "@/copy/en-CA";
import { howYouEarn } from "@/lib/program";
import { ChipLink } from "./ChipLink";

const SHOWN: { id: string; v: Vertical; label: string }[] = [
  { id: "cafe", v: "cafe", label: "cafés" },
  { id: "bakery", v: "bakery", label: "bakeries" },
  { id: "retail", v: "retail", label: "retail" },
  { id: "florist", v: "florist", label: "florists" },
  { id: "bookstore", v: "bookstore", label: "books" },
  { id: "hardware", v: "retail", label: "hardware" },
  { id: "salon", v: "salon", label: "salons" },
  { id: "barber", v: "barber", label: "barbers" },
  { id: "fitness", v: "fitness", label: "studios" },
  { id: "pet", v: "pet", label: "pet shops" },
  { id: "grocery", v: "grocery", label: "grocers" },
  { id: "repair", v: "repair_electronics", label: "repair" },
  { id: "pharmacy", v: "pharmacy", label: "pharmacies" },
];

/** "Built for your kind of shop": the default template per vertical, previewed with the real card. */
export function VerticalTemplates() {
  const [id, setId] = useState("cafe");
  const v = SHOWN.find((x) => x.id === id)?.v ?? "cafe";
  const t = VERTICAL_TEMPLATES[v];
  const reward = t.rewards[0];
  return (
    <div className="flex flex-col gap-6">
      <ChipGroup label="Type of shop" className="-mx-4 px-4">
        {SHOWN.map((s) => (
          <Chip key={s.id} selected={id === s.id} onClick={() => setId(s.id)} icon={<CategoryIcon vertical={s.v} size={18} />}>
            {s.label}
          </Chip>
        ))}
        {/* Restaurants have their own kit and plans: this chip leaves the page instead of previewing a shop template. */}
        <ChipLink href="/for-restaurants">restaurants</ChipLink>
      </ChipGroup>
      <div className="grid items-center gap-10 rounded-sheet border border-border p-6 md:grid-cols-[1.1fr_1fr] md:p-10" aria-live="polite">
        <div>
          <p className="text-meta text-muted-foreground">Default program · {id === "hardware" ? "Hardware store" : t.label}</p>
          <p className="display mt-3 text-mkt-sm md:text-mkt-md">
            {t.earnType === "stamps" ? `${t.stampGoal} stamps = ${rewardInSentence(reward?.name ?? "a reward")}` : `${howYouEarn({ ...t, minSpendCents: 0 }).replace(/\.$/, "")}. ${reward?.pointsCost} ${t.terminology} = ${rewardInSentence(reward?.name ?? "a reward")}`}
          </p>
          <p className="mt-4 text-body text-muted-foreground">
            Welcome bonus: {formatPoints(t.welcomeBonus, t.terminology, false)}. Change anything later in your dashboard. {copy.landing.verticals.restaurantsNote}
          </p>
          {v === "pharmacy" ? <p className="mt-4 border-s-2 border-border ps-3 text-meta text-muted-foreground">Front-store points only. {copy.misc.pharmacyRule}</p> : null}
          {t.categories.some((c) => !c.earnEligible) && v !== "pharmacy" ? (
            <p className="mt-4 text-meta text-muted-foreground">
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
