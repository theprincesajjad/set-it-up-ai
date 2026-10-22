"use client";
import { FEATURES } from "@ll/shared";
import { DensityGauge } from "@/components/ui/DensityGauge";

/** Admin rollout gauges (admin.md §1): one per gate, plus the 2+ shop customer metric. */
export function NetworkGauges({ activeMerchants, multiShopPct }: { activeMerchants: number; multiShopPct: number | null }) {
  const pro = FEATURES["service.tickets"].unlockAtMerchants;
  const plus = FEATURES["orders.order_ahead"].unlockAtMerchants;
  const ads = FEATURES["ads.sponsored_listing"].unlockAtMerchants;
  const camp = FEATURES["campaigns.neighbourhood"].unlockAtMerchants;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <DensityGauge label="Pro unlock" value={activeMerchants} target={pro} unit="merchants" />
      <DensityGauge label="Plus unlock" value={activeMerchants} target={plus} unit="merchants" />
      <DensityGauge label="Neighbourhood campaigns" value={activeMerchants} target={camp} unit="merchants" />
      <DensityGauge label="Ads & sponsored" value={activeMerchants} target={ads} unit="merchants" />
      {multiShopPct != null ? <DensityGauge label="Customers with 2+ shops" value={Math.round(multiShopPct * 100)} target={30} unit="%" format={(n) => `${n}`} /> : null}
    </div>
  );
}
