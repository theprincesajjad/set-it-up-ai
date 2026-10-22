"use client";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { PromoEditor } from "@/components/dashboard/PromoEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { emptyPromo } from "@/lib/dashboard/promos";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function NewPromoPageGated() {
  return (
    <FeatureGate keys={["promos.basic", "promos.double_points"]} title="Promos">
      <NewPromoPage />
    </FeatureGate>
  );
}

function NewPromoPage() {
  const { base } = useMerchant();
  const initial = useMemo(() => emptyPromo(), []);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/promos`} className="self-start">
        Promos
      </Button>
      <PageHeader title="Create a promo" description="Shows on your shop page and the neighbourhood feed while it's live." />
      <PromoEditor initial={initial} />
    </div>
  );
}
