"use client";
import type { ReactNode } from "react";
import type { FeatureKey } from "@ll/shared";
import { FeatureTeaser } from "./FeatureTeaser";
import { useMerchant } from "./MerchantContext";

/** Paid pages: render children only when one of `keys` is enabled, else a quiet coming-soon notice. */
export function FeatureGate({ keys, children, title }: { keys: FeatureKey[]; children: ReactNode; title?: string }) {
  const { enabled } = useMerchant();
  if (keys.some(enabled)) return <>{children}</>;
  return <FeatureTeaser featureKey={keys[0]!} title={title} />;
}
