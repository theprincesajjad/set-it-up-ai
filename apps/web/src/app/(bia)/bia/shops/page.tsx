"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { ShopsView } from "@/components/dashboard/bia/ShopsView";

export default function BiaShopsPage() {
  return <BiaGate>{(_hoods, hood) => <ShopsView hood={hood} />}</BiaGate>;
}
