"use client";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { staffApi } from "@ll/shared";

/** Web counter for shops with a laptop / tablet browser at the till (same API as the app's counter mode). */
export default function CounterPage() {
  const { api, detail, base, role } = useMerchant();
  const program = detail.program;
  if (!program)
    return (
      <Banner tone="warning" action={<Button size="sm" variant="ghost" href={`${base}/program`}>Set up program</Button>}>
        Set up your program before awarding points.
      </Banner>
    );
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Counter" description={`${detail.merchant.name}${role === "staff" ? ` · Undo your own awards within ${staffApi.UNDO_WINDOW_MINUTES} minutes` : ""}`} />
      <CounterApp api={api.counter} program={program} shopName={detail.merchant.name} locations={detail.locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name }))} />
    </div>
  );
}
