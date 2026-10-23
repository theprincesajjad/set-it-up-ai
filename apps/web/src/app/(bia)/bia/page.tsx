"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { Overview } from "@/components/dashboard/bia/Overview";

export default function BiaOverviewPage() {
  return <BiaGate>{(_hoods, hood) => <Overview hood={hood} />}</BiaGate>;
}
