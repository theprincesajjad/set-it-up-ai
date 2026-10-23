"use client";
import { Suspense } from "react";
import { BackLink, PageHeader } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Composer } from "../Composer";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function ComposePageGated() {
  return (
    <FeatureGate keys={["marketing.email", "marketing.sms"]} title="Email & SMS campaigns">
      <Suspense>
        <ComposePage />
      </Suspense>
    </FeatureGate>
  );
}

/** The same composer as the Messages page, on its own page for deep links (Home's "Text the 9" lands on Messages with the audience chosen). */
function ComposePage() {
  const { base } = useMerchant();
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/messages`}>Messages</BackLink>
      <PageHeader title="New message" />
      <Composer />
    </div>
  );
}
