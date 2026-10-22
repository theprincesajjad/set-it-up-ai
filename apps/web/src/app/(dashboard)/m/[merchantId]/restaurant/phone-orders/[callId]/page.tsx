"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { RestaurantGate, TierTeaser, formatPhone, whenTor } from "@/components/dashboard/restaurant/shared";
import { useApi } from "@/lib/dashboard/useApi";
import { CallStatus, languageName } from "../CallStatus";
import { CallEditor } from "./CallEditor";

export default function CallPage() {
  return (
    <RestaurantGate featureKey="restaurant.phone_ai" title="Phone orders">
      <Call />
    </RestaurantGate>
  );
}

function Call() {
  const { callId } = useParams<{ callId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.phone.call(callId), [api, callId]);
  const catalog = useApi(() => api.catalog(), [api]);
  if (state.status === 402) return <TierTeaser featureKey="restaurant.phone_ai" title="Phone orders" />;
  return (
    <div className="flex flex-col gap-6">
      <Async state={state} skeleton={<div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4"><div className="skeleton h-7 w-64 rounded-sm" /><div className="skeleton h-4 w-80 max-w-full rounded-sm" /><div className="grid gap-6 lg:grid-cols-2"><div className="skeleton h-64 rounded-card" /><div className="skeleton h-64 rounded-card" /></div></div>}>
        {(call) => (
          <>
            <PageHeader
              flush
              back={{ href: `${base}/restaurant/phone-orders`, label: "Phone orders" }}
              title={`Call from ${formatPhone(call.fromPhone)}`}
              description={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CallStatus status={call.status} />
                  <span>{whenTor(call.createdAt)}</span>
                  <span>{languageName(call.language)}</span>
                </span>
              }
            />
            <CallEditor key={`${call.id}-${call.status}`} call={call} catalog={catalog.data?.items ?? null} catalogError={catalog.error} onChanged={(c) => state.setData(c)} />
          </>
        )}
      </Async>
    </div>
  );
}
