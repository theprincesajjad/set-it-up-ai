"use client";
import type { ReactNode } from "react";
import type { FeatureKey } from "@ll/shared";
import { FeatureTeaser } from "./FeatureTeaser";
import { useMerchant } from "./MerchantContext";

/** Phase 2/3 pages: render children only when one of `keys` is enabled, else the Coming soon card. */
export function FeatureGate({ keys, children, title }: { keys: FeatureKey[]; children: ReactNode; title?: string }) {
  const { enabled } = useMerchant();
  if (keys.some(enabled)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-[640px] py-6">
      <FeatureTeaser featureKey={keys[0]!} title={title} />
    </div>
  );
}
