"use client";
import { BackLink, PageHeader } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { PromoEditor } from "@/components/dashboard/PromoEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { templateDraft } from "@/lib/dashboard/promos";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function NewPromoPageGated() {
  return (
    <FeatureGate keys={["promos.basic", "promos.double_points"]} title="Promos">
      <Suspense>
        <NewPromoPage />
      </Suspense>
    </FeatureGate>
  );
}

function NewPromoPage() {
  const { base, detail } = useMerchant();
  const template = useSearchParams().get("template");
  // A template pre-fills the rule, hours and weekdays; everything stays editable.
  const initial = useMemo(() => templateDraft(template, new Date(), detail.program?.terminology ?? "points"), [template, detail.program?.terminology]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/promos`}>Promos</BackLink>
      <PageHeader title="Create a promo" description="Shows on your shop page and the neighbourhood feed while it's live." />
      <PromoEditor key={template ?? "blank"} initial={initial} />
    </div>
  );
}
