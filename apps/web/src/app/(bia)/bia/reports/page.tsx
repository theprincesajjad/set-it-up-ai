"use client";
import { BiaGate } from "@/components/dashboard/campaigns/BiaGate";
import { ReportsView } from "@/components/dashboard/bia/ReportsView";

export default function BiaReportsPage() {
  return <BiaGate>{(_hoods, hood) => <ReportsView hood={hood} />}</BiaGate>;
}
